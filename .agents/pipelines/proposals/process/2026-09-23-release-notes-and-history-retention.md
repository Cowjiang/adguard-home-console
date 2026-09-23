# 修正 release 工作流的变更列表与历史保留策略

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求 `main` 的推送必须构建产物、release 说明要列出本次新增的提交，并指出原工作流末尾的删除步骤有问题。

## Goal

让 `.github/workflows/release.yml` 在 `main` 收到含源码变更的推送时稳定构建并发布产物，让每个 release 的说明准确描述**本次推送新增的提交**，并停止删除历史 release 与 tag。

## Decision

- **保留策略改为什么都不删**：移除末尾「删除其余 release 与 tag」的步骤。所有 release 与 tag 长期保留，作为回滚点，并充当「相对上一版列出新增提交」的基线。
- **`fetch-depth: 0`**：`actions/checkout` 默认浅克隆（只有顶端 1 个提交），既让原来的 `git log --oneline -10` 实际退化成一行，也让任何提交区间都无法计算。
- **提交区间外移到 `scripts/release-notes.sh`**：workflow 只传 `BEFORE`（`github.event.before`）、`AFTER`（`github.sha`）、`TAG`、`BRANCH`。区间按顺序选取：
  1. `before..after` —— 要求 `before` 存在、非全零、是有效提交且是 `after` 的祖先；
  2. `上一版 tag..after` —— 从新到旧取第一个**确实是 `after` 祖先**的 `v0.1.0-dev.*` tag；
  3. 最近 20 个提交。

  第 2 步只挑祖先，而不是「版本序最高的 tag」：force push 后最高的 tag 往往指向已被替换的历史，直接放弃会白白丢掉更旧的可用基线。
- **移除 `generate_release_notes`**：它在 `body_path` 之后追加一段 GitHub 自动生成的说明，与自写的提交列表重复；本仓直接推 `main`、不走 PR，自动生成的内容也不比提交列表多。
- **增加 `concurrency`**（`cancel-in-progress: false`）：原工作流没有并发保护，两次推送挨得近时，先启动的那次会在收尾阶段删掉后启动那次刚建好的 release。
- **增加 `workflow_dispatch`**：路径过滤会跳过纯文档推送，force push 后 tree 完全一致时也可能不触发，需要手动补发。
- **幂等**：创建前先用 `gh release view` 判断本次 tag 是否已存在，已存在则跳过创建，重复运行不报错。
- `docs/**`、`.agents/**`、`**.md` 继续由 `paths-ignore` 排除。

## Accept

- [x] 工作流中不再存在任何删除 release 或 tag 的步骤
- [x] 说明由本次推送的提交区间驱动，而非分支顶端固定条数
- [x] `before` 是祖先、是 force push 前的旧提交、全零、为空、无效 sha 五种输入下均能生成说明且不失败
- [x] 存在祖先 tag 时回退到「相对上一版」，且有效 `before` 优先于 tag 回退
- [x] 重复运行同一提交不会因 tag 已存在而失败（配置层面）
- [x] `main` 推送构建 tarball 并创建 release（配置层面）
- [x] `.github/workflows/release.yml` 结构校验通过，`node scripts/verify-proposals.mjs` 通过
- [x] 真实推送到 `main` 后的端到端运行成功

## Note

验证方式：

- `scripts/release-notes.sh` 以 LF 副本在 Git Bash 下运行，覆盖 7 例：`before` 是祖先、`before` 是 force push 前的旧 `main`、`before` 全零、`before` 为空、`before` 是无效 sha，以及「存在祖先 tag」和「祖先 tag 与有效 `before` 并存」两种组合。标题与提交条数均符合预期。
- `.github/workflows/release.yml` 通过结构校验：无 TAB、缩进为 2 的倍数、顶层键为 `name`/`on`/`permissions`/`concurrency`/`jobs`、`fetch-depth: 0` 与 `bash scripts/release-notes.sh` 存在、删除与自动说明相关片段已全部消失。
- 端到端已验证：把 `dev` 推到 `main`（`f6de85e`）后工作流运行成功，远端生成 tag `v0.1.0-dev.20260923.f6de85e`，而旧 tag `v0.1.0-dev.20260921.0aba843` 仍然保留，确认删除步骤确已移除。该次 `7525ed4..f6de85e` 只含 1 个提交，与「本次推送」的预期一致。

本仓 Git 配置 `core.autocrlf=true`，索引内为 LF；`scripts/release-notes.sh` 由 workflow 以 `bash` 显式调用，不依赖执行位。
