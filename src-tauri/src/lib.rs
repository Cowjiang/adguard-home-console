//! Tauri shell entry: command registration + mobile entry point
mod proxy;

/// Debug builds only: reads the auto-login config from environment variables
/// (`SIMCTL_CHILD_AGH_*` from `simctl launch` lands in the process environment
/// as `AGH_*`).
/// Never logged, never surfaced in error messages; always None in release builds.
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

/// WKWebView system swipe-back is **disabled**; the frontend's own edge-swipe
/// gesture takes over. Reason: for same-document (pushState) swipes WebKit's
/// underlying snapshot is blank — during the gesture only a blank layer shows,
/// and the frontend only renders after the commit, so it looks like "old page
/// goes blank → content suddenly appears" (frame-by-frame evidence in
/// .agents/logs/tauri-ios.md). The frontend useEdgeSwipe in
/// src/lib/routeTransition.tsx redraws the same transition from a real
/// snapshot, so the native gesture must be turned off to avoid double
/// triggering.
#[cfg(target_os = "ios")]
fn disable_back_forward_gestures(app: &tauri::AppHandle) {
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
        let _: () = objc2::msg_send![&*wk, setAllowsBackForwardNavigationGestures: false];
        eprintln!("[SWIPE-BACK] allowsBackForwardNavigationGestures = false (custom edge swipe)");
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
            disable_back_forward_gestures(_app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
