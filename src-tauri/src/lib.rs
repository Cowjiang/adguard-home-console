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

/// 开启 WKWebView 系统侧滑返回(含悬停快照),驱动对象是 pushState 历史栈,
/// 因此前端路由约定:tab 切换一律 replace,层级下钻才 push(见 docs/IOS_SWIPE_BACK_RESEARCH.md)。
#[cfg(target_os = "ios")]
fn enable_back_forward_gestures(app: &tauri::AppHandle) {
    use objc2::runtime::AnyObject;
    use tauri::Manager;
    let Some(win) = app.get_webview_window("main") else {
        eprintln!("[SWIPE-BACK] get_webview_window(\"main\") = None");
        return;
    };
    let result = win.with_webview(move |webview| unsafe {
        let wk = webview.inner() as *mut AnyObject;
        if wk.is_null() {
            eprintln!("[SWIPE-BACK] WKWebView inner() = null");
            return;
        }
        let _: () = objc2::msg_send![&*wk, setAllowsBackForwardNavigationGestures: true];
        eprintln!("[SWIPE-BACK] allowsBackForwardNavigationGestures = true (OK)");
    });
    if let Err(e) = result {
        eprintln!("[SWIPE-BACK] with_webview failed: {e:?}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_system_components::init())
        .invoke_handler(tauri::generate_handler![proxy::agh_fetch, get_debug_login])
        .setup(|_app| {
            #[cfg(target_os = "ios")]
            enable_back_forward_gestures(_app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
