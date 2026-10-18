# 在 release 工作流里构建并附带 Windows 安装包

**Class:** process
**Status:** proposed
**Date:** 2026-10-18
**Source:** 用户要求「你加入 release 流程」（此前刚在本地打通并验收了 Windows 打包路径，见 `2026-10-18-windows-desktop-package`）

## Goal

`release.yml` 一次构建喂四个消费者（Release tarball、npm 包、GHCR 镜像、iOS ipa），Windows 桌面的 MSI 与 NSIS 只能在本地 `pnpm tauri build` 得到，Release 里没有任何 Windows 产物——发一版稳定版，Windows 用户拿不到安装包。

目标：发版时由 GitHub Actions 在 Windows runner 上产出两件安装包，挂进 Release 资产与工作流产物，构建走的仍是本地已验收的那条路径。

## Decision

1. **在 `release.yml` 新增 `windows` job（`windows-latest`），不新开工作流**。安装包是「一次构建、多消费者」里的又一个消费者，挂在同一个 `prepare` 算出的版本与 ref 之下，才能与 tarball / tgz / 镜像 / ipa 同源同 ref。
2. **构建命令复用本机验收过的那条**：`pnpm tauri build`，不带额外参数。前端由 tauri-cli 的 `beforeBuildCommand`（`pnpm build`）自己构建并编进 Rust 二进制（`tauri/custom-protocol`），不另加步骤；NSIS 与 WiX 工具链由 tauri-cli 首次使用时自行下载。
3. **不签名**：仓库没有 Windows 代码签名证书，`bundle.windows` 也没有签名配置，安装包首次运行会有 SmartScreen 提示。将来要签就接 `bundle.windows.certificateThumbprint` / `signCommand`（或 `TAURI_SIGNING_*`），本提案不预留空分支。
4. **何时构建**：stable（tag `vX.Y.Z`）恒构建；nightly 只在**仓库公开**或**手动 `workflow_dispatch`** 时构建——与 `ios` 同一道闸、同一理由（私有仓库的 Windows runner 按 2× 计费，每天一次会啃掉免费额度并最终阻塞整条发布线；公开后 `github.event.repository.private == false` 自动为真）。手动派发本身即有意为之，与 `prepare` 的 `force` 同逻辑。
5. **Windows 失败不阻断其余渠道**：`release` 的 `needs` 加上 `windows`（不加就会与构建抢跑，导致资产时有时无），`!cancelled()` 让 Windows 失败/跳过时 tarball、npm、镜像照常发布；挂载是单独一步，只在 `needs.windows.result == 'success'` 时执行——缺安装包时运行页是红的，不会静默发出半份 Release。
6. **资产名固定 `agh-console-setup.exe`（NSIS 安装器）与 `agh-console.msi`（WiX/MSI）**，与固定名 `agh-console.tar.gz`、`agh-console.ipa` 同风格：nightly 的 Release 原地 upsert，带版本名会逐日堆积；版本追溯落在 tag、Release 名与说明正文上。
7. **安装包只带核心版本**：`release-plan.mjs --set-version` 已把核心版本写进 `src-tauri/tauri.conf.json`，MSI/NSIS 的版本字段取自它（理由与 iOS plist 相同：非数字段会被版本字段拒绝，nightly 的 `<版本>-nightly.<日期>.<sha>` 塞不进去）；完整 nightly 串仍在 `package.json`，即应用界面与 npm 报的那个。本提案**不改** `release-plan.mjs` 与其自测。
8. **两件都发**：MSI 便于组策略/企业分发，NSIS 便于普通用户双击安装，与本地 `bundle.targets: "all"` 的口径一致，增量成本只是一次 bundling。
9. **不给 PR 加 Windows 构建门**：`ci.yml` 不动，与 iOS 同口径——PR 阶段用一次平台构建换信号的性价比不成立。

## Accept

- [ ] `release.yml` 新增 `windows` job（`windows-latest`），构建命令与本地一致（`pnpm tauri build`），并在构建前用 `release-plan.mjs --set-version` 盖上与其它渠道同源的版本
- [ ] `release` job 以 `needs: [prepare, build, ios, windows]` + `!cancelled()` 接收安装包，挂载步骤用 `gh release upload --clobber` 单独执行，缺安装包不影响 Release upsert
- [ ] actionlint（v1.7.12）对 `release.yml` 零告警；`node .github/scripts/release-plan.mjs --self-test` 与 `node scripts/verify-proposals.mjs` 通过
- [ ] 逐条推演 job 条件：stable 恒为真；private + 定时 nightly 为假；public 为真；`workflow_dispatch` 为真；`skip=true` 的空转 nightly 为假
- [ ] 真实运行取证：`workflow_dispatch`（`publish=false`）下 `windows` job 跑通并上传 `windows-installers`；产物下载后在本机安装/卸载验证
- [ ] 合进 `main` 后核对 stable 的 Release 里带 `agh-console-setup.exe` 与 `agh-console.msi`，nightly 亦同

## Note

**与本地验收的关系**：安装包本身已在本机验收（`2026-10-18-windows-desktop-package`：MSI/NSIS 产出、NSIS 安装 → 运行 → 卸载干净、Rust 代理五页无错、桌面视口 1280×800）。本提案只负责把它接进 CI，不重复验证应用行为。

**沿用 `2026-10-15-release-ipa-artifact` 的全部结构**：同工作流加 job、固定资产名、平台失败不阻断其它渠道、平台闸与原因、不动 `ci.yml`。差别只有一处——Windows runner 在**本机可复现**，所以这次能做真实运行取证，而 ipa 那次只能推演。
