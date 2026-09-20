/*
 * export.rs —— App 内导出落盘 + 原生打印
 * -----------------------------------------------------------------------------
 * 背景：打包成桌面/安卓 App 后，前端导出全走浏览器时代的 Blob + <a download>，
 *       而 macOS WKWebView 不支持 blob: URL 配 download（WebKit bug 216918），
 *       导致「导出 PDF/长图/单文件 HTML/数据 JSON 不产生任何文件、且点 PDF 会把界面顶掉」。
 *       完整根因与实测证据见 docs/App导出不落盘问题-根因与改造方案.md。
 *
 * 方案：自建两个命令，绕过浏览器下载 / window.print() 的死路：
 *   · save_file   —— 弹系统保存对话框 + 写盘（桌面三端）
 *   · print_page  —— 原生打印（WebView.print()，弥补 window.print() 在 WKWebView 里静默空操作）
 *
 * 关于 ACL：自建命令（无 plugin: 前缀）在本地 origin 下不受 ACL 拦（见 lib.rs 现有 7 个
 *   飞书命令无需 capabilities 同理）。但 save_file 依赖 tauri-plugin-dialog，而 dialog 是
 *   插件命令、必须授权 —— 故需新建 capabilities/default.json 给 dialog:allow-save。
 *
 * 平台边界（如实标注）：一期只覆盖桌面三端（macOS/Windows/Linux）。
 *   Android 的 SAF 保存对话框返回 content:// URI（FilePath::Url），std::fs::write 写不了，
 *   需另立专项（存应用私有目录 + 分享 intent），本文件对这种情况返回明确错误、绝不假成功。
 */
use base64::Engine;
use std::fs;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

/* ============ save_file：弹保存对话框 + 写盘 ============ */
/// 参数：file_name 建议文件名（含中文）、bytes_b64 文件内容（base64，前端已能算）。
/// 返回 Some(路径) 表示已保存；用户取消对话框 → Ok(None)，前端静默不报错。
/// 注意：命令是 async（Tauri 会把 async 命令调度到非主线程），故这里用 blocking_save_file
///       不会卡住事件循环；若改用同步命令 + 主线程则必须换回调式 save_file。
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    file_name: String,
    bytes_b64: String,
) -> Result<Option<String>, String> {
    // 1) base64 解码（用已引入的 base64 0.22 crate，与 feishu.rs 同版本）
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(bytes_b64.as_bytes())
        .map_err(|e| format!("文件内容解码失败：{}", e))?;

    // 2) 弹系统保存对话框
    let picked = app
        .dialog()
        .file()
        .set_file_name(file_name)
        .blocking_save_file();

    let picked = match picked {
        Some(p) => p,
        None => return Ok(None), // 用户取消：不报错、不写盘
    };

    // 3) 解析路径：桌面三端返回 FilePath::Path；Android content:// 返回 FilePath::Url，
    //    into_path 对 content:// 会失败 —— 此时明确报错，不假成功。
    let path = match picked {
        FilePath::Path(p) => p,
        FilePath::Url(_u) => {
            return Err(
                "当前平台（Android）返回的是 content:// 地址，暂不支持直接写盘；请改用浏览器版导出。"
                    .to_string(),
            )
        }
    };

    // 4) 写盘
    fs::write(&path, &bytes).map_err(|e| format!("写入 {} 失败：{}", path.display(), e))?;

    Ok(Some(path.to_string_lossy().to_string()))
}

/* ============ print_page：原生打印 ============ */
/// 弥补 window.print() 在 WKWebView 里静默空操作的问题（实测证据见根因文档 §3.4）。
/// tauri::Webview::print() 在 macOS 走 printOperationWithPrintInfo:，可真正弹出打印面板。
#[tauri::command]
pub fn print_page(webview: tauri::Webview) -> Result<(), String> {
    webview.print().map_err(|e| e.to_string())
}
