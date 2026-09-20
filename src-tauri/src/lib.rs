/*
 * lib.rs —— 桌面壳入口
 * -----------------------------------------------------------------------------
 * withGlobalTauri = true（见 tauri.conf.json），前端用 window.__TAURI__.core.invoke 直呼，
 * 因此这里不引入任何 Tauri 插件、也不生成 TS 绑定，前端保持零 npm 依赖。
 */
mod config;
mod export;
mod feishu;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            feishu::feishu_request,
            feishu::feishu_upload,
            feishu::feishu_restore_data,
            feishu::feishu_probe,
            config::feishu_config_load,
            config::feishu_config_save,
            config::state_load,
            config::state_save,
            storage::resume_index_load,
            storage::resume_index_save,
            storage::resume_doc_load,
            storage::resume_doc_save,
            storage::resume_doc_remove,
            export::save_file,
            export::print_page
        ])
        .run(tauri::generate_context!())
        .expect("启动 Resume Studio 桌面壳失败");
}
