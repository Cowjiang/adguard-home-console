# 修回 iOS 工程的 pre-build 脚本调用方式，让 Xcode 阶段不再 panic

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-07
**Source:** 2026-10-07 外部故障修复调查第 (2) 项；与同目录 `2026-10-07-tauri-version-align.md` 同批（两者都源自 `950fbd8`）

## Goal

`950fbd8`（pnpm 12 迁移）把 `src-tauri/gen/apple/project.yml` 的 pre-build 脚本从 `npm run -- tauri ios xcode-script …` 改成了 `pnpm exec …`。`pnpm exec` 会把 `PNPM_PACKAGE_NAME` 传给子进程且**不改变 CWD**，而 tauri-cli 在检测到包管理器时会跳过自己"上跳两级到 src-tauri"的兜底 chdir，只从 CWD **向下**找 `tauri.conf.json`；于是从 Xcode 给的项目目录 `gen/apple` 找不到配置文件，脚本阶段直接 panic（`app_paths.rs:140`），构建失败。本项把它改回包管理器 `run` 形式，恢复脚本阶段的可用性。

## Decision

1. **改回 `pnpm run -- tauri ios xcode-script …`**（不是 `npm run --`，因为仓库已迁到 pnpm）。`pnpm run` 会把 CWD 放到包根（仓库根），tauri-cli 的早期查找即在 `<包根>/src-tauri` 命中配置——已实测：日志出现 `Found Tauri project inside …/src-tauri on early lookup`。
2. **保留 `pnpm`**：另一种可行修法是保留 `pnpm exec` 并前置 `TAURI_APP_PATH=$SRCROOT/../..`（同样实测有效），但它把"项目在哪"这一已有事实重复写进脚本；`pnpm run` 只是回到迁移前的形状，改动面更小。
3. **在 `project.yml` 写清约束**：脚本上方加注释说明为什么必须是 `pnpm run --` 而不是 `pnpm exec`（Xcode 的 CWD + tauri-cli 只向下查找 + 检测到包管理器就跳过兜底），避免下次"顺手现代化"又改回去。
4. 改的是被跟踪文件，改后必须 `./scripts/ios-signing.sh generate tauri` 重生成工程（脚本内容被烤进 pbxproj，工程不重生成等于没改）。

## Accept

- [x] `project.yml` 与生成的 pbxproj 中脚本行均为 `pnpm run -- tauri ios xcode-script …`（`grep` 校验）。
- [x] `./scripts/ios-signing.sh generate tauri` 通过（工程校验：图标设置、DEVELOPMENT_TEAM、bundle id、部署目标、XcodeGen 预设）。
- [x] 模拟器构建全链路通过并产出 bundle（`build/arm64-sim/AGH Console.app`）——脚本阶段不再 panic，日志显示其已连上 CLI 的选项服务。
- [x] `pnpm ios:build` 全链路通过并产出 ipa：`build/arm64/AGH Console.ipa`（3,414,883 字节，已装到真机）。另需 release 链接配置的修复，见同目录 `2026-10-07-ios-release-swift-link.md`。
- [x] 运行时确认 iOS 场景生命周期与原生控件正常（按用户指示改用模拟器：iOS 27 / iPhone 18 Pro，release 包 3 次冷启动正常渲染；debug 包自动登录后原生 tabbar、返回按钮与 header action 齐备，深浅外观正常）。真机复跑待设备信任证书后补，与版本对齐提案共用同一次回归。

## Note

- 实测链路（按时间顺序）：`pnpm exec` 形式 panic → 改回 `pnpm run --` → 模拟器构建产出 bundle → 设备构建越过签名后暴露 release 链接的 Swift 符号问题 → 修掉后出 ipa。

- 机制证据（均为实测）：`cd gen/apple && pnpm exec node -e '…'` 显示 `PNPM_PACKAGE_NAME=adguard-home-console`、`cwd=…/gen/apple`（即 `pnpm exec` 既设变量也不改目录）；`pnpm exec tauri ios xcode-script …` 从 `gen/apple` 运行 = panic；`pnpm run -- tauri ios xcode-script …` 运行 = 解析成功、只因缺 `cli-options-server.json`（真实构建时才存在）而停在预期位置；`TAURI_APP_PATH=$PWD/../..` 前缀亦成功。tauri-cli 2.11.5 与 2.12.1 的 `xcode_script.rs` 兜底逻辑一致，故这不是 CLI 版本回归，而是同一提交改脚本行引入的。
- 该行在被更早的故障挡住时不可见：版本门在编译前中止；设备路径又先失败在签名，所以只有模拟器构建能看到 panic。修完版本门后设备路径同样会撞上，因此本项与版本对齐是成对落地的。
