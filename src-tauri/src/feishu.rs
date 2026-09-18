/*
 * feishu.rs —— 飞书 HTTP 传输层（Tauri 命令入口）
 * -----------------------------------------------------------------------------
 * 职责边界（对应 T3 设计决策 1）：Rust **只做脏活**——HTTP 传输、token 注入、multipart 上传、
 * 二进制版本流下载；业务编排（docx 清空重写、版本化上传顺序等）留在 js/store/native-bridge.js。
 *
 * 对外命令（与前端 invoke 名严格一致）：
 *   feishu_request(req)       —— 通用 JSON 转发，自动注入 tenant_access_token
 *   feishu_upload(req)        —— multipart 上传（upload_all / upload_part）
 *   feishu_restore_data(version_id) —— 下载某个版本的 resume.json 并在 Rust 内 JSON.parse
 *
 * 注意：所有命令参数统一用「单个结构体」承载（避免 Tauri camelCase 转换带来的命名歧义），
 * 结构体字段名使用 snake_case，前端必须以同样的键名传递（file_b64 / file_field）。
 */
use base64::Engine;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::AppHandle;

use crate::config;

pub(crate) const BASE: &str = "https://open.feishu.cn/open-apis";

/* ============ 请求参数结构体 ============ */
#[derive(Debug, Deserialize)]
pub struct ApiReq {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UploadReq {
    pub method: String,
    pub path: String,
    /// multipart 的文本字段（如 upload_id / block_index / file_name）
    pub fields: HashMap<String, String>,
    /// resume.json 原始字节的 base64（标准字母表，可含换行）
    pub file_b64: String,
    /// 文件字段名（飞书固定为 "file"）
    pub file_field: String,
}

/* ============ 共享 HTTP 客户端（rustls，无 openssl） ============ */
pub fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .build()
            .expect("初始化 HTTP 客户端失败")
    })
}

/* ============ 通用响应处理 ============ */
fn parse_method(raw: &str) -> Result<reqwest::Method, String> {
    raw.parse::<reqwest::Method>()
        .map_err(|_| format!("不支持的 HTTP 方法：{}", raw))
}

/// 飞书统一校验：code != 0 即视为失败
fn ensure_ok(j: &Value) -> Result<(), String> {
    let code = j.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = j.get("msg").and_then(|v| v.as_str()).unwrap_or("未知错误");
        return Err(format!("飞书接口错误 {}: {}", code, msg));
    }
    Ok(())
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// 解析响应体，返回 data 字段（与 tools/feishu-sync.js 的 req() 语义一致）
fn unwrap_data(text: &str, ctx: &str) -> Result<Value, String> {
    let j: Value = serde_json::from_str(text)
        .map_err(|_| format!("{}：响应不是合法 JSON —— {}", ctx, clip(text, 200)))?;
    ensure_ok(&j)?;
    Ok(j.get("data").cloned().unwrap_or(Value::Null))
}

async fn check_response(res: reqwest::Response, ctx: &str) -> Result<String, String> {
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("{}：读取响应失败：{}", ctx, e))?;
    if !status.is_success() {
        return Err(format!("{} → HTTP {} {}", ctx, status, clip(&text, 200)));
    }
    Ok(text)
}

/* ============ 命令 1：通用 JSON 转发 ============ */
#[tauri::command]
pub async fn feishu_request(app: AppHandle, req: ApiReq) -> Result<Value, String> {
    let ApiReq { method, path, body } = req;
    let token = config::tenant_access_token(&app).await?;
    let method = parse_method(&method)?;
    let url = format!("{}{}", BASE, path);
    let ctx = format!("飞书 {} {}", method, path);

    let mut rb = http_client()
        .request(method, url.as_str())
        .bearer_auth(&token)
        .header("Content-Type", "application/json; charset=utf-8");
    if let Some(b) = body.as_ref() {
        rb = rb.json(b);
    }
    let res = rb
        .send()
        .await
        .map_err(|e| format!("{}：请求失败：{}", ctx, e))?;
    let text = check_response(res, &ctx).await?;
    unwrap_data(&text, &ctx)
}

/* ============ 命令 2：multipart 上传（resume.json） ============ */
#[tauri::command]
pub async fn feishu_upload(app: AppHandle, req: UploadReq) -> Result<Value, String> {
    let UploadReq {
        method,
        path,
        fields,
        file_b64,
        file_field,
    } = req;
    let token = config::tenant_access_token(&app).await?;
    let method = parse_method(&method)?;
    let url = format!("{}{}", BASE, path);
    let ctx = format!("飞书 multipart {}", path);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(file_b64.trim())
        .map_err(|e| format!("{}：上传内容 base64 解码失败：{}", ctx, e))?;

    let mut form = reqwest::multipart::Form::new();
    for (k, v) in fields {
        form = form.text(k, v);
    }
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("resume.json")
        .mime_str("application/json")
        .map_err(|e| format!("{}：构造文件分片失败：{}", ctx, e))?;
    let field = if file_field.trim().is_empty() {
        "file".to_string()
    } else {
        file_field
    };
    form = form.part(field, part);

    let res = http_client()
        .request(method, url.as_str())
        .bearer_auth(&token)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("{}：上传失败：{}", ctx, e))?;
    let text = check_response(res, &ctx).await?;
    unwrap_data(&text, &ctx)
}

/* ============ 命令 3：下载某个版本并在此处 JSON.parse（避免二进制穿过 IPC） ============ */
async fn download_bytes(http: reqwest::RequestBuilder) -> Result<Vec<u8>, String> {
    let res = http.send().await.map_err(|e| format!("下载失败：{}", e))?;
    let status = res.status();
    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("读取下载内容失败：{}", e))?
        .to_vec();
    if !status.is_success() {
        return Err(format!(
            "下载失败 → HTTP {} {}",
            status,
            clip(&String::from_utf8_lossy(&bytes), 200)
        ));
    }
    Ok(bytes)
}

fn parse_payload(bytes: &[u8]) -> Result<Value, String> {
    let text = String::from_utf8(bytes.to_vec())
        .map_err(|_| "版本内容不是合法 UTF-8 JSON".to_string())?;
    serde_json::from_str::<Value>(&text)
        .map_err(|e| format!("版本内容 JSON 解析失败：{}", e))
}

#[tauri::command]
pub async fn feishu_restore_data(app: AppHandle, version_id: String) -> Result<Value, String> {
    let token_id = version_id.trim();
    if token_id.is_empty() || token_id.contains('/') || token_id.contains(char::is_whitespace) {
        return Err("非法的版本 ID".to_string());
    }
    let state = config::read_state(&app)?
        .ok_or_else(|| "尚未上报过，飞书中没有可用版本".to_string())?;
    let file_token = state
        .get("file_token")
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .filter(|s| !s.is_empty() && !s.contains('/'))
        .ok_or_else(|| "尚未上报过，飞书中没有可用版本".to_string())?;

    let token = config::tenant_access_token(&app).await?;
    let path = format!(
        "/drive/v1/files/{}/versions/{}/download",
        file_token, token_id
    );
    let url = format!("{}{}", BASE, path);
    let bytes = download_bytes(http_client().get(url.as_str()).bearer_auth(&token)).await?;

    // 情况一：返回的是 JSON 壳且带 data.url（预签名地址）→ 再取一次真实文件流
    if let Ok(j) = serde_json::from_slice::<Value>(&bytes) {
        if j.get("code").and_then(|v| v.as_i64()) == Some(0) {
            if let Some(u) = j
                .get("data")
                .and_then(|d| d.get("url"))
                .and_then(|u| u.as_str())
            {
                let inner = download_bytes(http_client().get(u)).await?;
                return parse_payload(&inner);
            }
        }
        return Err("飞书版本下载失败：返回体不是文件流".to_string());
    }
    // 情况二：直接就是 resume.json 文件体
    parse_payload(&bytes)
}
