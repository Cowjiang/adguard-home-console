# 修掉 iOS 工程生成在全新克隆上的失败，并保住 xcodegen 的报错输出

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-15
**Source:** 用户查看 2026-10-14 nightly（run `38647093327`）的 iOS 失败；该 job 由 `2026-10-15-release-ipa-artifact.md` 新增，首次运行即红

## Goal

`release.yml` 的 `ios` job 在 2026-10-14 的 nightly 上首次运行就失败在第 12 步 `Build the IPA`，其余 job（`build` / `docker` / `npm` / `release`）全部成功，nightly 照常发布但 Release 里没有 ipa。日志正文只有 `Process completed with exit code 1.`。

根因是**全新克隆**上 `xcodegen generate` 直接拒绝生成：`src-tauri/gen/apple/project.yml` 的 `adguard-home-console_iOS` target 把两个「由构建产出、git 带不过来」的目录声明为 source——

- `Externals`：被入库的 `src-tauri/gen/apple/.gitignore` 排除，只由本地构建写出 `arm64|aarch64/<配置>/libapp.a`
- `assets`：本机是**空目录**，git 不跟踪空目录，所以从未入库

xcodegen 对缺目录只校验存在性、不要求非空，缺了就以 `2 Spec validations errors: … missing source directory` 退出 1。本机因为更早的 iOS 构建已经落下这两个目录，一直没暴露；CI 从干净 clone 开始必然命中。

第二个缺陷让这次失败无法定位：`generate_project` 写的是 `out=$(xcodegen generate 2>&1)`，在 `set -euo pipefail` 下赋值失败会**立刻退出**，紧接着的 `printf '%s\n' "$out"` 根本执行不到，捕获到的报错连同原因一起被丢掉。

## Decision

1. **在 `generate_project` 里、`xcodegen generate` 之前 `mkdir -p Externals assets`**，两个目录继续由构建填充。修在脚本而不是入库占位文件：`Externals/` 已被 ignore 规则排除，补 `.gitkeep` 还要配否定规则；`assets` 是空目录，git 根本带不动。
2. **不从 `project.yml` 删 `assets`**：它是 `tauri ios init` 脚手架留下的 `type: folder` 资源引用，会原样进 app 包（实测 `AGH Console.app/assets`，空的，没有任何东西写入）。删掉会改变产物结构，与本提案「让生成在干净环境可复现」无关。
3. **接住 `xcodegen` 的失败输出**：改成 `if ! out=$(xcodegen generate 2>&1); then printf '%s\n' "$out"; exit 1; fi`。这次排查的成本几乎全在「日志里没有原因」上；这一步保证下次同类失败直接给出原因行。

## Accept

- [ ] 干净环境（无 `Externals`、无 `assets`、无 `.xcodeproj`）下 `./scripts/ios-signing.sh generate tauri` 退出码 0，并通过既有工程校验
- [ ] `xcodegen` 失败时脚本打印它的原始输出，而不是只留一个退出码
- [ ] 注入未入库 source 之外的 xcodegen 失败仍能中止构建（校验门不被绕过）
- [ ] `release.yml` 的 `ios` job 真实跑通并上传 `agh-console.ipa`（补 `2026-10-15-release-ipa-artifact.md` 尚未取证的 Accept 项）

## Note

**复现与验证**（本机 macOS 26 / Xcode 27.0 / XcodeGen 2.46.0；按 CI 的提交 `00490b7` 建临时 worktree，未改动工作区，验证后已 `git worktree remove`）：

- 复现：在 worktree 里按 CI 落 `.env.signing`（`AGH_APPLE_TEAM=unsigned`、`AGH_BUNDLE_ID=com.cowjiang.aghconsole`）后跑 `./scripts/ios-signing.sh generate tauri`，退出 1 且**没有任何 xcodegen 输出**——即 `set -e` 吞报错这一条。
- 直接跑 `xcodegen generate`，拿到被吞掉的原文：`2 Spec validations errors: Target "adguard-home-console_iOS" has a missing source directory "<…>/gen/apple/Externals"` 与 `… "<…>/gen/apple/assets"`。
- 修法验证：同目录 `mkdir -p Externals assets` 后再跑 `generate tauri`，`xcodegen` 正常生成并**通过全部工程校验**（图标设置、`DEVELOPMENT_TEAM`、bundle id、部署目标、`CLANG_ENABLE_OBJC_ARC` 预设哨兵），退出 0。说明 CI 侧 xcodegen 版本与 brew 提供的 SettingPresets 都没问题，障碍只有这两个目录。
- 本机取证：仓库里 `src-tauri/gen/apple/assets` 为 0 项空目录；`AGH Console.app/assets` 同样为空；`Externals/` 在 `git status --ignored` 下为 `!!`（已忽略）。
- `tauri-cli 2.12.1` 的 `tauri ios build --help`：`-t, --target` 的 possible values 为 `aarch64 | aarch64-sim | x86_64`，且存在 `--no-sign`，因此 job 里的参数合法，修掉生成障碍后的下一道关卡不是参数问题。
- **拉取日志的边界**：本机 remote 走 SSH、无 GitHub API token、未装 `gh`，而公开仓库的 Actions 日志下载同样要求登录（`/actions/jobs/<id>/logs` 返回 403，网页版需 Sign in），注解接口只给 `Process completed with exit code 1.`。因此本次结论由本地复现取得，未读到 CI 原始日志；上面的报错原文来自本机同一命令、同一提交。

**影响与后续**
- 这次失败不阻断其他渠道（`release` job 对 iOS 容错），但 nightly 的 Release 会缺 `agh-console.ipa`；修复后下一天的 nightly 应自动带 ipa，仍需按 Accept 第 4 项在真实运行里取证。
- 用户本机的 `.env.signing` 当时仍是旧 bundle id `com.adguardhome.console`（与 `docs/native-platforms.md` 记的规范值 `com.cowjiang.aghconsole` 不一致），已同步；该文件被忽略，不入库。
- 仓库变量 `AGH_BUNDLE_ID` 若被设成旧值，CI 仍会用错 bundle id；未设置时兜底取 `tauri.conf.json#identifier`（已是规范值）。本机无凭据读取该变量，留作核对项。
