/*
 * lib.rs —— 桌面壳入口
 * -----------------------------------------------------------------------------
 * withGlobalTauri = true（见 tauri.conf.json），前端用 window.__TAURI__.core.invoke 直呼，
 * 因此这里不引入任何 Tauri 插件、也不生成 TS 绑定，前端保持零 npm 依赖。
 */
mod config;
mod feishu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            feishu::feishu_request,
            feishu::feishu_upload,
            feishu::feishu_restore_data,
            config::feishu_config_load,
            config::feishu_config_save,
            config::state_load,
            config::state_save
        ])
        .run(tauri::generate_context!())
        .expect("启动 Resume Studio 桌面壳失败");
}
