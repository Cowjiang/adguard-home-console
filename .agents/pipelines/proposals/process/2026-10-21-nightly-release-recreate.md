# 让 nightly Release 每次构建重建并刷新发布日期

**Class:** process
**Status:** implemented
**Date:** 2026-10-21
**Updated:** 2026-10-21（实施完成：workflow 与 docs 已改，本地校验通过；真实 nightly 运行待推送后验证）
**Source:** 用户要求「模仿 Neovim」改造 nightly 发布；排查过程见 Note

## Goal

nightly 目前按 tag 原地更新 Release，而 GitHub 的 `published_at` 在首次发布后不再变化，Releases 页一直显示初次发布日（当前停在 2026-10-07），看起来像 nightly 已经停摆。目标：保留单条滚动 nightly、固定 tag 与下载 URL 不变，同时让 Release 的发布日期跟随每一次真实构建刷新；发布失败时不能留下半成品。

## Decision

1. **仿 Neovim：删除后重建，而不是原地 upsert**。`release` job 在全部构建产物就绪、notes / manifest / AltStore source 生成之后，删除旧 `nightly` Release 与同名 tag，再由 `softprops/action-gh-release` 以 `target_commitish = 本次 sha` 重建 tag 与 Release；`published_at` 因此等于本次发布时间。
2. **仍只有一条 nightly**。tag 固定 `nightly`，资产名不变，`/releases/tag/nightly` 与 `/releases/download/nightly/...` 保持不变。
3. **平台失败不重建**。nightly 的 `release` job 在 `ios` 或 `windows` 失败时跳过（沿用 Neovim「平台全绿才发布」的口径；stable 不受影响）。旧 nightly 保持可用；`npm` / GHCR 仍按现有设计独立发布，不被平台 job 阻塞。
4. **跳过条件补完整性校验**。`prepare` 只有在「tag 指向 dev HEAD」且 nightly Release 存在、预期资产齐全时才 skip。私有仓库的预期列表只含 web 三件；公开仓库再要求 ipa / setup.exe / msi。这样发布中途失败留下的半成品不会被永久跳过。
5. **重建前连 tag 一起删，形成自愈**。若删除后创建失败，tag 不存在，下一次定时运行会重新构建而不是因 sha 相同而跳过；代价是失败到下一晚之间 nightly 完全不可用，且下一次 Release 说明会回退到上一个 stable tag 作为基线。
6. **不改通知机制**。定时失败仍由 GitHub 原生通知发给 cron 最后修改者（当前为 `Preference-cmd`）；本提案不新增 Slack / 邮件步骤。

## Accept

- [x] `release.yml` 的 nightly 发布先删 Release 与 tag，再以 `target_commitish` 重建；旧的 `Move the rolling nightly tag` 步骤移除
- [x] nightly 在 `ios` / `windows` 任一失败时不进入 `release` job，旧 nightly 保留；stable 行为不变
- [x] `prepare` 的 skip 判定在 sha 相同之外，校验 nightly Release 资产完整（公开仓库含 ipa / setup.exe / msi）
- [x] `docs/engineering.md` 更新为「删除重建、发布日期刷新、平台失败保留旧版」的口径
- [x] `pnpm test:release`、`node scripts/verify-proposals.mjs --links` 通过；YAML / shell 语法校验通过
- [ ] 下一次真实 nightly 运行后确认 `published_at` 与 `updated_at` 均为本次构建时间，且六件资产齐全（需推送到远端后验证）

## Note

- 现场证据：nightly Release `published_at = 2026-10-07T18:36:19Z`，`updated_at = 2026-10-18T21:42:57Z`；GitHub 的 Update a release API 不接受 `published_at`，原地更新无法刷新发布日期。
- Neovim 的直接先例：`publish` job `needs: [linux, macos, windows, wasm]`，随后 `gh release delete nightly --yes || true`、删除远端 tag、`gh release create nightly --prerelease ... --target $GITHUB_SHA`；其 nightly Release 的 `published_at` 与资产时间一致且每天刷新。
- 社区其他做法：yt-dlp 用独立归档仓库 + 每晚日期 tag（Release 会累积）；GoReleaser 用每晚 tag + 定期清理；固定 tag 原地覆盖（eine/tip）不会刷新 `published_at`。
- 上次定时失败 run #42 只挂掉 iOS 的 `Build the IPA`，但 web / npm / docker / release 全部成功，说明平台失败确实会把带资产缺口的 nightly 发出去；本提案用平台 gate 把它挡在重建之前。
- 通知仍是 GitHub 原生机制：定时 run 的 actor 是 cron 最后修改者，当前为 `Preference-cmd`，不会自动发给仓库 owner。

**本地验证记录**

- `pnpm test:release`：release-plan / manifest / AltStore 三个自测通过。
- `node scripts/verify-proposals.mjs --links`：通过；32 条缺失路径告警都是既有记录，本次新增文件没有引入缺失。
- YAML：`js-yaml` 解析通过；actionlint（wasm 2.0.6）对 HEAD 与工作区版本都只报同样的 2 处既有 `vars` 解析告警，新增 0 条。
- Shell：把 `Check the rolling nightly tag` 与 `Delete the previous nightly release and tag` 的 `run` 块抽出来用 mock `gh` 跑场景（六资产 / 缺平台资产 / 缺 release / 私有仓库 / 不同 sha；release + tag 都存在 / 都不存在），全部通过；`bash -n` 通过。
- 未验证：需要推送后跑一次真实 nightly 或 `workflow_dispatch`（`publish=true` + `force=true`）才能确认 `published_at` 刷新与六件资产齐全。
