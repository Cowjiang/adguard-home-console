# 在 release 工作流里构建并附带 iOS IPA

**Class:** process
**Status:** implemented
**Date:** 2026-10-15
**Source:** 用户要求「在 release 流程里加入 ipa 文件构建到产物之中」，并明确两点：由 GitHub Actions 打包；IPA 不签名，装的人用自己的 Apple ID 重签

## Goal

`release.yml` 至今只产 Web 侧产物（`agh-console.tar.gz`、npm tgz、镜像），iOS 的 ipa 只能在装了 Xcode 的 Mac 上跑 `pnpm ios:build` 得到。日常开发在 Windows 上，拿不到 ipa；Release 里也没有任何 iOS 产物。

目标：发版时由 GitHub Actions 在 macOS runner 上产出 ipa，同时挂进 Release 资产与工作流产物，且构建走的仍是本地已验收的那条路径。

## Decision

1. **在 `release.yml` 里新增 `ios` job（`macos-latest`），不新开工作流**。ipa 是「一次构建、多消费者」里的一个消费者，挂在同一个 `prepare` 算出的版本与 ref 之下，才能与 tarball / tgz / 镜像同源同 ref。
2. **构建命令复用本地路径**：`./scripts/ios-signing.sh tauri build --target aarch64 --no-sign`。脚本本身是本地验收过的那条（缺 pbxproj 时按 `project.yml` 重建，并校验图标设置、`DEVELOPMENT_TEAM`、bundle id、部署目标、XcodeGen 预设哨兵），CI 只额外补 `xcodegen` 与 `aarch64-apple-ios` target。前端构建由 tauri-cli 的 `beforeBuildCommand`（`pnpm build`）自己跑，前端资源编进 Rust 二进制，不额外加步骤。
3. **不签名**：`--no-sign` 让 xcodebuild 带上 `CODE_SIGNING_REQUIRED=NO` / `CODE_SIGNING_ALLOWED=NO` / `CODE_SIGN_IDENTITY=""` / `CODE_SIGN_ENTITLEMENTS=""` 归档，tauri-cli 再把归档里的 `.app` 按 `Payload/` 结构打成 ipa——全程不需要证书、账号或描述文件。ipa 交给使用者用 Sideloadly / AltStore / Xcode 以**自己的** Apple ID 重签后安装。若将来要直接可安装的签名 ipa，tauri-cli 已支持从环境变量读签名材料（`IOS_CERTIFICATE`、`IOS_CERTIFICATE_PASSWORD`、`IOS_MOBILE_PROVISION`，会自动把 pbxproj 切到 Manual 签名并写 ExportOptions），接上即可；本提案不预留空分支。
4. **签名值仍不入库**：`AGH_APPLE_TEAM` / `AGH_BUNDLE_ID` 继续只存在于本机 `.env.signing`。CI 侧 job 从仓库变量读（`vars.AGH_APPLE_TEAM` / `vars.AGH_BUNDLE_ID`），未设置时分别用 `unsigned` 与 `tauri.conf.json#identifier` 兜底——不签名的构建里 team 只是 XcodeGen 的占位符，不会产出「看着正常其实坏了」的产物；bundle id 想与本地一致，把仓库变量设成同一个值即可。
5. **何时构建**：stable（tag `vX.Y.Z`）每次构建；nightly 只在**仓库公开**（`github.event.repository.private == false`）、`vars.AGH_IOS_NIGHTLY == 'true'`，或是**手动 `workflow_dispatch`** 时构建。前两者之外还留手动触发，是因为一次手动派发本身就是有意为之，与 `prepare` 里 `force` 同一逻辑；否则私有仓库期间连试跑 iOS 都要先改仓库设置。限额的理由：私有仓库的 macOS runner 按 10× 计费，每天一次约 10–20 分钟的构建会吃掉 2000 分钟免费额度，超额后**整条发布线**（含 Web/npm/镜像）都会被阻塞。用户计划把仓库转为公开，转公开后 nightly 自动带 ipa。
6. **iOS 失败不阻断其余渠道**：`release` job 的 `needs` 加上 `ios`（不加就会与 iOS 构建抢跑，导致 ipa 时有时无），但容错只对 iOS 开口——`!cancelled()` 让 iOS 失败/跳过时 tarball、npm 与镜像照常发布，`needs.build.result == 'success'` 保持既有语义（`build` 里的 nightly 测试门、npm 产物校验失败时照旧不发布）。ipa 的挂载是单独一步，只在 `needs.ios.result == 'success'` 时执行——缺 ipa 时运行页是红的，不会静默发出半份 Release。
7. **资产名固定 `agh-console.ipa`**（与固定名 `agh-console.tar.gz` 同风格）：nightly 的 Release 是原地 upsert，同名资产被替换而不是逐日堆积；版本追溯落在 tag、Release 名与说明正文上。
8. **不给 ipa 塞发版版本号**：iOS 的 bundle version 来自 `gen/apple/project.yml` 的 Info.plist，cargo-mobile2 只接受纯数字段（`BundleVersionInvalid`），nightly 的 `<版本>-nightly.<日期>.<sha>` 塞不进去。`package.json` 与 `tauri.conf.json` 的版本统一仍按既有待办单独立项。
9. **不给 PR 加 iOS 构建门**：`ci.yml` 不动。一次 macOS 构建的价格是 Web 全门禁的十倍，PR 阶段用构建换信号的性价比不成立。

## Accept

- [x] `release.yml` 新增 `ios` job（`macos-latest`），构建命令与本地一致：`scripts/ios-signing.sh tauri build --target aarch64 --no-sign`；`.env.signing` 由仓库变量按第 4 条落盘。
- [x] `release` job 以 `needs: [prepare, build, ios]` + `!cancelled() && needs.build.result == 'success'` 接收 ipa，挂载步骤用 `gh release upload --clobber` 单独执行，缺 ipa 不影响 Release upsert。
- [x] actionlint（v1.7.12）对 `release.yml` 零告警；`node scripts/verify-proposals.mjs --links` 与 `node scripts/release-plan.mjs --self-test` 通过；`Write the signing file` 与 `Collect the IPA` 两段 shell 在本机正反例跑过（完整 ipa 通过、Payload 缺失报错退出 1、无 ipa 报错退出 1）。
- [x] `docs/architecture/build-and-release.md`、`docs/native-platforms.md`、`docs/engineering.md` 与根 `README.md` 已按本次改动更新，`.agents/pipelines/README.md` 登记本提案。
- [x] 本机逐条推演 job 条件：stable 恒为真；private + 未设变量（定时 nightly）为假；private + `AGH_IOS_NIGHTLY=true` 为真；public 为真；`workflow_dispatch` 为真；`skip=true` 的空转 nightly 为假；`github.event` 里没有 `repository` 的载荷退化为只认变量（`null == false` 为假）。
- [ ] 真实运行取证：`workflow_dispatch`（`publish=false`）下 `ios` job 跑通并上传 `agh-console.ipa`；下载后用 Sideloadly 以个人 Apple ID 重签安装到设备确认可启动。
- [ ] 合进 `main` 后核对 stable 的 Release 里带 `agh-console.ipa`；仓库转公开后核对 nightly 也带 ipa。

## Note

**本机验证边界**：本机是 Windows，没有 Xcode 与 macOS runner，`ios` job 无法在本地执行；也没有 `gh` CLI，因此本次没有触发远端运行。工作流侧只做了 actionlint + 每步命令的语义推演；`scripts/ios-signing.sh` 与 `pnpm ios:build` 是既有、已验收的本机路径（见 `.agents/pipelines/proposals/bug-fix/2026-10-07-ios-xcode-script-phase.md` 与 `2026-10-07-ios-release-swift-link.md`），本次未改动它们。

**列出的事实依据**
- tauri-cli 2.12.1 `crates/tauri-cli/src/mobile/ios/build.rs`：`--no-sign` 走「归档 → 直接把 `.app` 打成 `Payload/` zip」的分支，不下发 `-exportArchive`；`--ci` 的 clap 定义带 `env = "CI"`，Actions 默认 `CI=true`，无需显式传参；`Options::long_about` 明确 `beforeBuildCommand` 会被执行。
- 同 crate 的 `mobile/ios/mod.rs#signing_from_env`：签名材料只认 `IOS_CERTIFICATE` / `IOS_CERTIFICATE_PASSWORD` / `IOS_MOBILE_PROVISION` 三个环境变量（第 3 条提到的接入点）。
- cargo-mobile2 0.22.5 的 `apple/target.rs`：`skip_codesign` 展开为上面那四个 xcodebuild 参数；同 crate 的 `apple/config/mod.rs` 的 `bundle_version` 校验要求每一段都是纯数字（`BundleVersionInvalid`），这是第 8 条的依据。
- 本仓 `src-tauri/gen/apple/project.yml` 的 preBuildScripts 用 `pnpm run -- tauri ios xcode-script …`，因此 macOS 的 script phase 需要 `node` 与 `pnpm` 在 PATH 上——job 里由 `pnpm/action-setup` 与 `setup-node` 在构建步骤之前铺好。

**影响与后续**
- 私有仓库期间 nightly 默认不产 ipa；要临时打开就把仓库变量 `AGH_IOS_NIGHTLY` 设为 `true`。
- 仓库转为 public 后，`--provenance`、GHCR 匿名拉取等既有待办会一并解锁（见 `2026-10-07-multi-channel-release.md`）。
- ipa 体积约 3.4 MB（本地同配置产物的实测值），挂在 Release 上不会明显增加备份与回滚成本。
