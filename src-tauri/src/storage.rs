/*
 * storage.rs —— 简历数据本地文件存储（统一分文件模型）
 * -----------------------------------------------------------------------------
 * 设计目标（对应「统一存储抽象」改造）：
 *   本地保存与飞书同步保存共享同一「分文件」概念：
 *       一份简历 = 一个文档（docId = resumeId）
 *         · 本地：app_data_dir()/resumes/<id>.json（每份一个文件）
 *         · 飞书：云盘文件（file_token_<id>，versioned）+ docx（document_id_<id>）
 *   目录结构（app_data_dir()/resumes/）：
 *       index.json   → { "active": <id|null>,
 *                        "items": [{id,title,source,docId,updatedAt,tags,lastHash}] }
 *       <id>.json    → 每份简历的完整载荷 {data,fonts,spacing,v,savedAt}
 *
 *   文件名 = 简历 id（稳定锚点）：
 *       · 重命名 / 打标签只改 index.json，正文文件不动；
 *       · 与飞书按 id 分键（file_token_<id>）同构，本地与远端天然一致；
 *       · 避开标题里的特殊字符 / 重名冲突 / 路径长度问题。
 *
 *   系统配置与简历数据分离：
 *       · 系统配置 / 同步状态 → sync.config.json + sync.state.json（见 config.rs）
 *       · 简历数据 → 本文件的 resumes/ 目录
 *
 *   凭据与安全：id 只允许 [A-Za-z0-9_-]，杜绝路径穿越；
 *              简历正文文件不含任何凭证（凭证在 config.rs 侧）。
 */
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub(crate) const RESUMES_DIR: &str = "resumes";
pub(crate) const INDEX_FILE: &str = "index.json";

/* ============ 路径 ============ */
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法定位应用数据目录：{}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("创建应用数据目录失败：{}", e))?;
    Ok(dir)
}

fn resumes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join(RESUMES_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("创建简历数据目录失败：{}", e))?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resumes_dir(app)?.join(INDEX_FILE))
}

fn doc_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(resumes_dir(app)?.join(format!("{}.json", id)))
}

/* ============ id 校验：只允许字母数字与 _ -，杜绝路径穿越 ============ */
pub(crate) fn sanitize_id(id: &str) -> Result<String, String> {
    let t = id.trim();
    if t.is_empty() {
        return Err("简历 id 不能为空".to_string());
    }
    if t.len() > 128 {
        return Err("简历 id 过长".to_string());
    }
    if !t
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(format!("简历 id 含非法字符（仅允许字母/数字/_-）：{}", t));
    }
    Ok(t.to_string())
}

/* ============ 通用读写（与 config.rs 同构） ============ */
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

/* ============ 索引（清单 + 激活态） ============ */
pub(crate) fn read_index(app: &AppHandle) -> Result<Option<Value>, String> {
    let raw = read_json(&index_path(app)?)?;
    Ok(raw.filter(|v| v.is_object()))
}

fn valid_index(v: &Value) -> bool {
    if !v.is_object() {
        return false;
    }
    let obj = v.as_object().expect("just checked");
    // active：字符串或 null（缺失视为 null）
    if let Some(act) = obj.get("active") {
        if !act.is_null() && !act.is_string() {
            return false;
        }
    }
    // items：数组，元素必须含合法 id
    if let Some(items) = obj.get("items") {
        if !items.is_array() {
            return false;
        }
        for it in items.as_array().expect("just checked") {
            let id = it.get("id").and_then(|x| x.as_str());
            if id.map(|s| sanitize_id(s).is_err()).unwrap_or(true) {
                return false;
            }
        }
    }
    true
}

pub(crate) fn write_index(app: &AppHandle, index: &Value) -> Result<Value, String> {
    if !valid_index(index) {
        return Err("index.json 结构非法（需 {active, items:[{id,...}]}）".to_string());
    }
    write_json(&index_path(app)?, index)?;
    Ok(index.clone())
}

/* ============ 简历文档 ============ */
pub(crate) fn read_doc(app: &AppHandle, id: &str) -> Result<Option<Value>, String> {
    let id = sanitize_id(id)?;
    let raw = read_json(&doc_path(app, &id)?)?;
    Ok(raw.filter(|v| v.is_object()))
}

pub(crate) fn write_doc(app: &AppHandle, id: &str, payload: &Value) -> Result<Value, String> {
    let id = sanitize_id(id)?;
    if !payload.is_object() {
        return Err("简历载荷必须是对象 {data,fonts,spacing,v} ".to_string());
    }
    write_json(&doc_path(app, &id)?, payload)?;
    Ok(json!({ "id": id, "ok": true }))
}

pub(crate) fn remove_doc(app: &AppHandle, id: &str) -> Result<Value, String> {
    let id = sanitize_id(id)?;
    let path = doc_path(app, &id)?;
    match fs::remove_file(&path) {
        Ok(()) => Ok(json!({ "id": id, "ok": true })),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(json!({ "id": id, "ok": true })),
        Err(e) => Err(format!("删除 {} 失败：{}", path.display(), e)),
    }
}

/* ============ Tauri 命令 ============ */
/// 读取简历库索引（{active, items}）；不存在返回 null
#[tauri::command]
pub async fn resume_index_load(app: AppHandle) -> Result<Option<Value>, String> {
    read_index(&app)
}

/// 整体写回简历库索引（清单 + 激活态 + lastHash），返回完整索引
#[tauri::command]
pub async fn resume_index_save(app: AppHandle, index: Value) -> Result<Value, String> {
    write_index(&app, &index)
}

/// 读取某份简历正文载荷；不存在返回 null
#[tauri::command]
pub async fn resume_doc_load(app: AppHandle, id: String) -> Result<Option<Value>, String> {
    read_doc(&app, &id)
}

/// 写入某份简历正文载荷（按 id 分文件），返回 {id, ok}
#[tauri::command]
pub async fn resume_doc_save(app: AppHandle, id: String, payload: Value) -> Result<Value, String> {
    write_doc(&app, &id, &payload)
}

/// 删除某份简历正文文件，返回 {id, ok}
#[tauri::command]
pub async fn resume_doc_remove(app: AppHandle, id: String) -> Result<Value, String> {
    remove_doc(&app, &id)
}
