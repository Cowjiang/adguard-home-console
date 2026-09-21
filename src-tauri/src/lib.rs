//! Tauri 壳入口:命令注册 + 移动端入口点
mod proxy;

/// debug 构建专用:从环境变量读自动登录配置(`simctl launch` 的
/// `SIMCTL_CHILD_AGH_*` 会以 `AGH_*` 落进进程环境)。
/// 不写日志、不进错误消息;release 构建恒返回 None。
#[derive(serde::Serialize)]
pub struct DebugLogin {
    url: String,
    username: String,
    password: String,
    autoconnect: bool,
    route: Option<String>,
}

#[cfg(debug_assertions)]
fn debug_login() -> Option<DebugLogin> {
    let url = std::env::var("AGH_URL").ok().filter(|s| !s.is_empty());
    let username = std::env::var("AGH_USERNAME").ok().filter(|s| !s.is_empty());
    let password = std::env::var("AGH_PASSWORD").unwrap_or_default();
    let autoconnect = std::env::var("AGH_AUTOCONNECT")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let route = std::env::var("AGH_ROUTE").ok().filter(|s| s.starts_with('/'));
    if let (Some(url), Some(username)) = (url, username) {
        return Some(DebugLogin {
            url,
            username,
            password,
            autoconnect,
            route,
        });
    }
    None
}

#[cfg(not(debug_assertions))]
fn debug_login() -> Option<DebugLogin> {
    None
}

#[tauri::command]
fn get_debug_login() -> Option<DebugLogin> {
    debug_login()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_system_components::init())
        .invoke_handler(tauri::generate_handler![proxy::agh_fetch, get_debug_login])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
