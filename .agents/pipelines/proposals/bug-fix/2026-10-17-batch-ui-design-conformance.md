# 修掉同期批次（快照/更新/测速/同步/透视）页面的设计体系失配

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-17
**Source:** 用户 2026-10-17：「你去看实例快照页，以及这个页面同期的改动，设计规范都不符合本项目现有页面，例如输入框为什么白色线条，你 review 同期的所有改动」

## Goal

2026-10-13→16 落地的 P1–P3 批次（集群同步 `0b3a46e`、上游测速 `b562fc4/b9e91dc`、日志透视 `f0b0e19`、配置快照 `f5c096e`、检查更新 UI `59a21ff/8cdee7e`）按另一套 shadcn 式 Tailwind 主题书写，而本项目 `src/index.css` 的 `@theme` 只注册了 `app / elevated / glass / line / t1–t3 / accent / accent2 / danger / warn / ok / violet`。由此产生一批设计失配：

1. `border-border`（无此 token）让 `border` 的 1px 回落到 `currentColor`——深色主题下输入框/复选框出现**白色线条**（用户看到的就是这一条）；
2. `bg-card`、`bg-ok-soft`、`bg-warn-soft`、`bg-danger-soft`、`bg-accent-soft`、`divide-border`、`bg-muted` 不生成——面板没有底色、软色标签没有底、复选框边框消失；
3. `dark:` 变体跟的是系统偏好媒体查询，与本应用 `<html data-theme>` 的主题切换脱节；
4. `var(--err)` / `var(--err-soft)` 未定义（项目词是 `--danger` / `--danger-soft`），"失败"文字与色条渲染为继承色；
5. `text-sky-400` / `text-orange-400` 等默认调色板色绕过语义 token；
6. 硬编码中/英文串绕开 i18n（zh 界面混英文、en 界面混中文）。

目标：把该批次的视觉与文案拉回项目设计体系（`.field` 输入、`glass`/`Card` 面板、`Badge`/`IconBubble` 原子、`Segmented` 分段控件、语义 token 与内联 `var(--*-soft)` 底色），中英文两套语言下都符合现有页面。

## Decision

1. **不向 `@theme` 增补 shadcn 式 token**（避免扩散第二套设计体系）；逐文件改用项目原语与现有 token。
2. **快照创建表单**从页内展开卡片改为居中浮层（`useSheet`），与其它"新建"表单（加过滤器、加客户端）同构；输入用 `.field`。
3. **筛选分段控件**用 `Segmented` 原语替换手写实现；**多实例结果 tab** 用 `Chip`；**轮数选择**用 `Segmented`。
4. **状态色语义化**：失败/异常一律 `--danger`；"良好"用 `--accent-2`；"较差"归 `--danger`；慢用 `--warn`；进度条轨道用 `var(--glass-border)`（`--glass` 在玻璃卡上与底色同值不可见）。
5. **硬编码串补 i18n**（zh/en 同构，缺 key 由 tsc 拦下）；快照自动保护（pre_sync / pre_rollback）的标签与说明也走 `t()`，`restoreSnapshot` 增加可选 `guardLabel/guardDescription` 参数保留英文默认值。
6. 快照对比、测速、更新详情的**移动端形态**（红线段：浏览型内容必须子页）由同批的 [`2026-10-17-mobile-content-sheets-to-subpages.md`](2026-10-17-mobile-content-sheets-to-subpages.md) 承接处理，本提案只负责它们的设计 token / i18n 失配。

## Accept

- [x] 快照页（载入/空态/列表/创建表单/比对弹层）在 390px 与桌面、中英文下均无 `currentColor` 白线输入框、无透明面板
- [x] 更新弹层、测速弹层、同步弹层、日志透视（桌面弹层 + 移动子页）同批修正
- [x] 批次内用户可见字符串全部经 `t()` 输出，zh/en 对齐（`pnpm check` 保证 en 与 zh 同构）
- [x] `pnpm check`、`pnpm test`、`pnpm build`、`node scripts/verify-proposals.mjs` 通过
- [x] 子代理基于 _probe 截图的 zh/en 双语视觉验收通过

## Note

- 根因写法（`border-border` 等）来自批次作者惯用的 shadcn 主题；本仓 `@theme inline` 无 `--color-border` 等键，Tailwind v4 对未注册键不生成类，属"静默失效"。
- 关联文件：`src/pages/settings/SnapshotSettings.tsx`、`src/components/snapshot/SnapshotCreateSheet.tsx`（新增）、`src/components/snapshot/SnapshotDiffSheet.tsx`、`src/components/settings/AppUpdateSheet.tsx`、`src/components/dns/UpstreamBenchmarkSheet.tsx`、`src/components/protection/SyncSheetContent.tsx`、`src/components/log/QueryLogAnalytics.tsx`、`src/components/log/QueryLogAnalyticsSheet.tsx`、`src/lib/snapshot/snapshotRestore.ts`、`src/lib/i18n/locales/{zh,en}/settings.ts`。
- 截图（本机忽略材料）：`_probe/gen-shots/conformance-*.png`。
