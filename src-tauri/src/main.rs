// Desktop entry point (iOS/Android go through lib.rs's mobile_entry_point)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    adguard_home_console_lib::run()
}
