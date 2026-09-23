# 统一 docs 的文件名与页面元信息

**Class:** process
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户要求 `docs/` 下文档改用小写命名，并在开头标注 status、修改日期等元信息。

## Goal

让 `docs/` 的页面从文件名和开头就能自证身份与新鲜度，减少把过期事实当现行事实读取。

## Decision

- 文件名统一小写 kebab-case，目录索引保留 `README.md`。
- 每页标题下写两行元信息：`**Status:**` 与 `**Updated:**`（`YYYY-MM-DD`）。
- `Status` 取封闭值：`current`（已对照代码核实）、`stale`（已知与代码不一致，待核对）、`draft`（尚未核实）。
- 约定写进 `docs/README.md` 的维护约定一节，该页自身也遵守。
- 只改文件名、元信息与引用；页面事实内容不变。

## Accept

- [x] `docs/` 下除 `README.md` 外全部为小写 kebab-case
- [x] 每页开头都有 `Status` 与 `Updated`，取值在封闭集内
- [x] `AGENTS.md`、`docs/`、`.agents/` 与代码注释里的引用全部改指新文件名
- [x] `node scripts/verify-proposals.mjs --links` 不新增缺失路径
- [x] 相对链接检查无断链

## Note

重命名用 `git mv`，`AGH_API.md`、`ENGINEERING.md`、`NATIVE_PLATFORMS.md`、`WEB_INTERACTION.md` 与架构目录五页一并改为小写；引用分布在 `docs/`、`.agents/pipelines/`、`scripts/mock-agh.mjs`、`src/components/Layout.tsx`、`src/lib/nativeTabbar.ts`、`src/lib/navMeta.ts`，共 12 个文件。所有页面状态记为 `current`：内容来自同日按代码库重建的勘察。
