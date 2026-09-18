/*
 * config.rs —— 凭证与同步状态的本机持久化 + tenant_access_token 缓存
 * -----------------------------------------------------------------------------
 * 设计要点（对应 T3/AC2、AC8）：
 *  1. 配置文件放在 Tauri 的 app_config_dir()（各平台应用数据目录），
 *     文件名与 tools/feishu-sync.js 保持一致：sync.config.json；
 *     同步状态（file_token / document_id）放在同目录的 sync.state.json。
 *  2. 字段兼容两处来源：tools/feishu-sync.js 的 readConfig() 与 sync.config.json.example
 *     —— app_id / app_secret / domain / doc_title / file_name / folder_token /
 *        fileUploadMode / dryRun。
 *  3. app_secret 只在本模块内被读取用于换取 token，
 *     feishu_config_load 走 public_view() 剥离后返回，**绝不出现在任何对外返回值里**。
 *  4. token 缓存在进程内存（Mutex），按 expire 提前 5 分钟过期；凭证一改立即失效。
 */
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::feishu::http_client;

pub(crate) const CONFIG_FILE: &str = "sync.config.json";
pub(crate) const STATE_FILE: &str = "sync.state.json";
const TOKEN_URL: &str = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
/// 提前多少秒判定 token 过期（契约：提前 5 分钟）
const TOKEN_EXPIRE_MARGIN_SECS: u64 = 300;

/* ============ 路径 ============ */
fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法定位应用配置目录：{}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建应用配置目录失败：{}", e))?;
    Ok(dir)
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(CONFIG_FILE))
}

pub fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join(STATE_FILE))
}

/* ============ 通用读写 ============ */
fn read_json(path: &Path) -> Result<Option<Value>, String> {
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("读取 {} 失败：{}", path.display(), e)),
    };
    if raw.trim().is_empty() {
        return Ok(None);
    }
    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 {} 失败：{}", path.display(), e))?;
    Ok(Some(v))
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("创建目录失败：{}", e))?;
    }
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| format!("序列化失败：{}", e))?;
    fs::write(path, text + "\n").map_err(|e| format!("写入 {} 失败：{}", path.display(), e))
}

/* ============ 配置 ============ */
pub fn read_config(app: &AppHandle) -> Result<Option<Value>, String> {
    let path = config_path(app)?;
    let raw = read_json(&path)?;
    Ok(raw.filter(|v| v.is_object()))
}

fn str_field(cfg: &Value, key: &str) -> Option<String> {
    let s = cfg.get(key).and_then(|v| v.as_str())?.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

/* 合并写回：null / 空字符串表示「不修改」，避免表单留空误清已有值 */
pub fn write_config(app: &AppHandle, patch: &Value) -> Result<Value, String> {
    let path = config_path(app)?;
    let mut next = read_config(app)?.unwrap_or_else(|| json!({}));
    if !next.is_object() {
        next = json!({});
    }
    {
        let obj = next.as_object_mut().expect("just checked is_object");
        if let Some(patch_obj) = patch.as_object() {
            for (k, v) in patch_obj {
                let blank = v.is_null()
                    || v.as_str().map(|s| s.trim().is_empty()).unwrap_or(false);
                if blank && obj.get(k).is_some() {
                    continue;
                }
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    write_json(&path, &next)?;
    Ok(next)
}

/* 对外可见的配置视图：剥离 app_secret，只给出非敏感字段 + 标志位 */
pub fn public_view(cfg: &Value) -> Value {
    let app_id = str_field(cfg, "app_id");
    let has_secret = str_field(cfg, "app_secret").is_some();
    let configured = app_id.is_some() && has_secret;
    json!({
        "configured": configured,
        "hasSecret": has_secret,
        "app_id": app_id.unwrap_or_default(),
        "domain": str_field(cfg, "domain").unwrap_or_else(|| "feishu.cn".to_string()),
        "doc_title": str_field(cfg, "doc_title").unwrap_or_else(|| "简历数据备份".to_string()),
        "file_name": str_field(cfg, "file_name").unwrap_or_else(|| "resume.json".to_string()),
        "folder_token": str_field(cfg, "folder_token").unwrap_or_else(|| "0".to_string()),
        "fileUploadMode": str_field(cfg, "fileUploadMode").unwrap_or_else(|| "versioned".to_string()),
        "dryRun": cfg.get("dryRun").and_then(|v| v.as_bool()).unwrap_or(false)
    })
}

/* ============ 同步状态（file_token / document_id） ============ */
pub fn read_state(app: &AppHandle) -> Result<Option<Value>, String> {
    let path = state_path(app)?;
    let raw = read_json(&path)?;
    Ok(raw.filter(|v| v.is_object()))
}

pub fn write_state(app: &AppHandle, patch: &Value) -> Result<Value, String> {
    let path = state_path(app)?;
    let mut next = read_state(app)?.unwrap_or_else(|| json!({}));
    if !next.is_object() {
        next = json!({});
    }
    {
        let obj = next.as_object_mut().expect("just checked is_object");
        if let Some(patch_obj) = patch.as_object() {
            for (k, v) in patch_obj {
                if v.is_null() {
                    obj.remove(k);
                    continue;
                }
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    write_json(&path, &next)?;
    Ok(next)
}

/* ============ tenant_access_token 缓存（进程内存） ============ */
fn token_slot() -> &'static Mutex<Option<(String, Instant)>> {
    static SLOT: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
    SLOT.get_or_init(|| Mutex::new(None))
}

fn cached_token() -> Option<String> {
    let guard = token_slot().lock().ok()?;
    let (token, expire_at) = guard.as_ref()?;
    if Instant::now() < *expire_at {
        Some(token.clone())
    } else {
        None
    }
}

fn store_token(token: String, expire_secs: u64) {
    let ttl = expire_secs.saturating_sub(TOKEN_EXPIRE_MARGIN_SECS).max(60);
    if let Ok(mut guard) = token_slot().lock() {
        *guard = Some((token, Instant::now() + Duration::from_secs(ttl)));
    }
}

fn invalidate_token() {
    if let Ok(mut guard) = token_slot().lock() {
        *guard = None;
    }
}

/* 取 token：命中缓存直接返回，否则用 app_id/app_secret 换（secret 不出本函数） */
pub async fn tenant_access_token(app: &AppHandle) -> Result<String, String> {
    if let Some(t) = cached_token() {
        return Ok(t);
    }
    let cfg = read_config(app)?
        .ok_or_else(|| "飞书未配置：请先在「同步配置…」中填写 App ID / App Secret".to_string())?;
    let app_id = str_field(&cfg, "app_id").ok_or_else(|| "飞书未配置：缺少 app_id".to_string())?;
    let app_secret =
        str_field(&cfg, "app_secret").ok_or_else(|| "飞书未配置：缺少 app_secret".to_string())?;

    let res = http_client()
        .post(TOKEN_URL)
        .json(&json!({ "app_id": app_id, "app_secret": app_secret }))
        .send()
        .await
        .map_err(|e| format!("换取 tenant_access_token 失败：{}", e))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("读取 tenant_access_token 响应失败：{}", e))?;
    if !status.is_success() {
        return Err(format!("换取 tenant_access_token 失败：HTTP {}", status));
    }
    let j: Value = serde_json::from_str(&text)
        .map_err(|_| "换取 tenant_access_token 失败：响应不是合法 JSON".to_string())?;
    let code = j.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = j.get("msg").and_then(|v| v.as_str()).unwrap_or("未知错误");
        return Err(format!("飞书接口错误 {}: {}", code, msg));
    }
    let token = j
        .get("tenant_access_token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "换取 tenant_access_token 失败：响应缺少 tenant_access_token".to_string())?
        .to_string();
    let expire = j.get("expire").and_then(|v| v.as_i64()).unwrap_or(7200).max(600) as u64;
    store_token(token.clone(), expire);
    Ok(token)
}

/* ============ Tauri 命令 ============ */
/// 读取对前端可见的配置（已剥离 app_secret）；未配置时返回 null
#[tauri::command]
pub async fn feishu_config_load(app: AppHandle) -> Result<Option<Value>, String> {
    Ok(read_config(&app)?.map(|c| public_view(&c)))
}

/// 合并保存配置，返回 {"configured": bool}；凭证变更会立即作废 token 缓存
#[tauri::command]
pub async fn feishu_config_save(app: AppHandle, cfg: Value) -> Result<Value, String> {
    let next = write_config(&app, &cfg)?;
    invalidate_token();
    let configured = str_field(&next, "app_id").is_some() && str_field(&next, "app_secret").is_some();
    Ok(json!({ "configured": configured }))
}

/// 读取同步状态（file_token / document_id）；不存在时返回 null
#[tauri::command]
pub async fn state_load(app: AppHandle) -> Result<Option<Value>, String> {
    read_state(&app)
}

/// 合并写入同步状态，返回完整状态对象
#[tauri::command]
pub async fn state_save(app: AppHandle, state: Value) -> Result<Value, String> {
    write_state(&app, &state)
}
