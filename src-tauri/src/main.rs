// 桌面平台入口(iOS/Android 走 lib.rs 的 mobile_entry_point)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    adguard_home_console_lib::run()
}
