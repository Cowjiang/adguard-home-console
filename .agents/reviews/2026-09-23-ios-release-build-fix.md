# iOS Release 构建修复记录（Xcode 27 + swift-rs）

> 2026-09-23 迁移快照。本文保留当时的计划、调研或施工过程；当前事实以 docs/README.md 的主题页为准，未完成事项须重新登记提案。

2026-09-22 修复了 release 模式 iOS 构建链接失败的问题（debug 不受影响）。

## 现象

`tauri ios build`（release）在 Rust 侧链接时报：

```
Undefined symbols for architecture arm64:
  "_run_plugin_command" (Tauri.o)
  "_retain_object" / "_release_object" / "_string_from_bytes" (SwiftRs.o)
```

## 根因（两层）

1. **磁盘满**：最早一次失败实际是 `ld: write() failed, errno=28`（磁盘 100% 满），
   cargo target 12.4G + 多个 build.old.xcarchive 残留导致。`cargo clean` + 清理残留后解决。
2. **Xcode 27 SwiftPM 内部化 @_cdecl 符号**：swift-rs 1.0.8 已带对策——用 llvm-objcopy 把
   归档里被内部化的 `@_cdecl` 符号重新提升为全局（`globalize_cdecl_symbols`）。
   但本机有两个缺口：
   - `rustup component add llvm-tools` 因镜像 404 装不上，`llvm-objcopy` 缺失，全局化整体跳过；
   - 即使 objcopy 可用，其逻辑**只处理包自己名字的成员**，内嵌依赖成员
     `SwiftRs.o`（retain/release/string_from_bytes 所在）仍保持局部符号。

## 修复（均为机器本地，换环境/更新依赖后需重做）

1. `llvm-objcopy` 符号链接：
   ```
   ln -sf "$(rustc --print sysroot)/lib/rustlib/aarch64-apple-darwin/bin/rust-objcopy" \
          "$(rustc --print sysroot)/lib/rustlib/aarch64-apple-darwin/bin/llvm-objcopy"
   ```
   （rust-objcopy 与 llvm-objcopy 同源，直接可用；官方源安装 llvm-tools 亦可：
   `RUSTUP_DIST_SERVER=https://static.rust-lang.org rustup component add llvm-tools`，
   但本机 rustup 配置了 aliyun 镜像且覆盖无效。）
2. swift-rs 源码补丁（registry 内）：
   `<cargo-registry>/swift-rs-1.0.8/src-rs/build.rs`
   第 514 行左右，`in_own_member = norm(module) == pkg;` 改为：
   ```rust
   in_own_member = norm(module) == pkg
       || (norm(module) == "swiftrs" && pkg != "tauri");
   ```
   即同时提升内嵌 `SwiftRs.o` 成员的符号；排除 Tauri 主包以避免 Tauri.a 与
   插件 .a 同时导出同名全局符号造成重复定义。
3. 补丁后需强制重编（cargo 指纹跟踪不到该文件的库侧变更）：
   ```
   cargo clean --release -p swift-rs
   cargo build --release --target aarch64-apple-ios-sim --lib
   ```

## 验证

- `cargo build --release --target aarch64-apple-ios-sim --lib` ✓ 24s
- `npx tauri ios build --target aarch64-sim`（release）✓
- `npx tauri ios build --target aarch64`（release 真机）✓ 产出 `AGH Console.ipa`

## 运行验证（2026-09-22）

- release 模拟器包在 iPhone 18 Pro（iOS 27 sim）安装启动 ✓：UI 渲染、原生玻璃
  TabBar、新实心盾牌图标均正常。
- 真机 iPhone 16 Pro 的 `.ipa` 已产出；安装时设备已断开 USB（devicectl 报
  `usage assertion` 4016），重新连接后执行上面 devicectl 命令即可。
- 注意：当时 `.env` 的 `AGH_DEFAULT_URL` 指向本机测试地址，验证需
  `PORT=3990 npm run dev:server` 起 mock；mock 重启后旧会话失效（401），
  应用显示"服务离线/加载中"，重新登录即可恢复。

## 其他坑（沿用 .agents/logs/tauri-ios.md）

- 每次构建前如遇 `failed to rename app ... Directory not empty`，把
  `gen/apple/build` 改名挪开即可（本日志期间因此产生了 5 个 build.old.*，已清理）。
- release 真机包用 `devicectl` 安装：
  `xcrun devicectl device install app --device <UDID> "gen/apple/build/arm64/AGH Console.ipa"`
