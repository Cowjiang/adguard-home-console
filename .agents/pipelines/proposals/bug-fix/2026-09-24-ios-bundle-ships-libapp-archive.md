# 把 Rust 静态库从 app 包的资源阶段摘掉

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户要求（「那个 .a 是干嘛的」「你可以按你的想法修改，但需要验证 app 在模拟器启动成功」）

## Goal

`libapp.a` 是 Rust 内核的静态库，只该作为链接输入；当前它还被当资源拷进 app 包，让 ipa 从 ~16 MB 涨到 22 MB、装到设备上白占 63 MB。把它从资源阶段摘掉，同时证明链接、启动、图标都不受影响。

## Decision

- 根因：`src-tauri/gen/apple/project.yml` 的 `sources:` 列了 `- path: Externals`，xcodegen 把该目录下的文件收作 target 源；`.a` 不是可编译源文件，就落到 Resources 阶段被原样拷贝。链接本身走的是 `dependencies: - framework: libapp.a, embed: false`（`PBXFrameworksBuildPhase`），与 sources 无关。
- 修法：给该 source 加 `excludes: ["**/*.a"]`。只排除静态库，保留该目录其余文件将来的可能性（若上游模板往 `Externals` 放需要随包分发的东西，仍会正常进包）。
- 不放宽的是链接：`dependencies` 那条保持原样。

## Accept

- [x] 重新生成工程后，pbxproj 的 Resources 阶段不再有 `libapp.a`，Frameworks 阶段仍在
- [x] 设备包 `AGH Console.ipa` 内不再有 `Payload/AGH Console.app/libapp.a`，体积 22.1 MB → **3.16 MB**，且 `Assets.car`、`AppIcon60x60@2x.png`、`CFBundleIcons` 不变
- [x] app 可执行文件仍含 Rust 侧代码（`wry` 路径字符串 14 处）与内嵌前端产物（JS 资源名命中），说明内核确实被链接进去
- [x] 模拟器构建安装后**能正常启动**：进程存活、界面渲染、无崩溃报告

## Note

- 实施前取证：`Externals/arm64/release/libapp.a` 62 871 424 B、1088 个目标文件；同一构建的可执行文件 7 907 008 B——静态库只作链接输入，未引用的目标文件不进产物。pbxproj 里两条引用分别落在 `PBXFrameworksBuildPhase`（`libapp.a in Frameworks`）与 `PBXResourcesBuildPhase`（`libapp.a in Resources`）。
- 体积为何远超原先估计：静态库在 zip 里压缩得很好，但它此前给 ipa 贡献了约 19 MB（22.1 → 3.16 MB），远大于「剩下 ~16 MB」的粗估；包内未压缩的 app 目录也从 ~70 MB 降到 8 MB。
- 风险与回归口径：链接失败会在构建期立刻暴露；启动失败会在模拟器启动验证里暴露。两者都在本提案验收里跑过。
- 与 `process/2026-09-24-ios-project-generation-gate.md` 的关系：那条门禁保证「图标一类必在的设置不会静默丢」，本条修的是「不该在包里的东西别在」。实施与验收细节见 `.agents/logs/tauri-ios.md` §19。
