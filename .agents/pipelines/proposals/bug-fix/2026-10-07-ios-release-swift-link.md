# 修回 iOS release 构建的 Swift 静态链接

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-07
**Source:** 2026-10-07 修复版本对齐（方案 B）后在真机上跑 `pnpm ios:build` 时暴露；同一形态（release 链接期 Swift FFI 符号未定义）在 2026-09-21 的构建中已出现过

## Goal

`pnpm ios:build`（release + device）此前无法产出 ipa：Rust 侧编到 **cdylib 链接** 时报一串 Swift FFI 符号未定义——`_register_plugin`、`_log_stdout`、`_on_webview_created`、`_run_plugin_command`、`_retain_object`、`_release_object`、`_string_from_bytes` 以及 `_init_plugin_system_components`（插件侧）。debug 构建、模拟器构建都正常，只有 release 的设备链接失败。

## Decision

**根因（逐层实测）**：

1. 缺的符号由 swift-rs 编译出的 Swift 胶水提供（`~/.cargo/registry/.../tauri-2.12.1/mobile/ios-api` 与插件的 `ios/Sources`）。
2. `nm -m` 显示 release 的 Swift 目标文件里它们是 **`non-external (was a private external)`**，debug 里是普通 `external [no dead strip]`——private external 不进静态归档的可解析符号，链接器于是无法满足 Rust 侧的引用。
3. 为什么两配置不同：swift-rs 1.0.8 的 `build.rs` 用 `env::var("DEBUG") == "true"` 决定 Swift 的 configuration（debug / release）。release profile 下 `DEBUG=false` → Swift 走 **Release** 配置（`-O -whole-module-optimization`），而非 `public` 的 `@_cdecl` 入口在 WMO 下被降为 private external；Debug 配置（`-Onone`）保持 external。
4. 最小复现排除了"WMO 必然致此"：单文件与两文件（含内部引用）的 `@_cdecl` 在 `-O`+WMO 下仍是 external；触发条件是**模块内无人引用的非 public `@_cdecl`**，正是 tauri/插件入口的形态。

**修法**：在 `src-tauri/Cargo.toml` 加 `[profile.release] debug = true`——用 cargo 的 DEBUG 环境变量把 Swift 胶水钉在 Debug 配置（`-Onone`），Rust 侧仍是优化后的 release；Xcode 的 release strip 阶段会剥掉最终 app 二进制的调试信息，产物不受影响。代价是中间产物（`Externals/arm64/release/libapp.a`）变大。Swift 胶水是薄层（插件注册与 invoke 转发），不优化的性能影响可忽略。

**不做**：不改上游 tauri 的 Swift 源码（给那些函数加 `public` 是上游的正确修法，但需要 fork tauri 本身）；也不退回 `--debug` 打包（约 105MB、未优化的过时绕路）。

## Accept

- [x] `cargo build --package adguard-home-console --target aarch64-apple-ios --features tauri/custom-protocol --lib --release` 链接通过（1m49s）。
- [x] 验证机制：加 `[profile.release] debug = true` 后，swift-rs 的产物目录从 `Products/Release-iphoneos` 变成 `Products/Debug-iphoneos`，符号变为 `external`。
- [x] `pnpm ios:build` 产出 `src-tauri/gen/apple/build/arm64/AGH Console.ipa`：3,414,883 字节（strip 生效，与开关前同量级），bundle id `com.pref2rence.aghconsole`、图标齐备。
- [x] `scripts/ios-deploy.sh` 安装成功（设备 App 列表可见 v1.0.0）；启动被系统拒绝，原因是 Personal Team 的证书尚未在设备上信任（需在「设置 → 通用 → VPN 与设备管理」确认）——这是设备侧一次性动作，不是构建问题。
- [x] release 包运行时确认（模拟器，按用户指示）：`scripts/ios-signing.sh tauri build --target aarch64-sim --ci` 走同一 release profile 与同一 swift-rs Debug 配置，链接通过、产物可安装，连续 3 次冷启动均正常渲染；debug 包自动登录后原生控件正常。真机在信任证书后仍可复跑（与版本对齐提案共用同一次回归），不阻塞本项。

## Note

- 这与版本对齐是两件独立的事：`[profile.release] debug` 的问题与 tauri/npm 的 minor 对齐无关，2026-09-21 的构建目录里 release Swift 对象已是 private external（同一地址偏移 `0xb744`），当时也记过 release 链接失败。
- 清理路径：上游把 tauri iOS API 与插件入口的 `@_cdecl` 声明改成 `public`（或 swift-rs 不再用 WMO 编译胶水）后，这一行即可删除；届时应把中间产物的体积一并收回。
