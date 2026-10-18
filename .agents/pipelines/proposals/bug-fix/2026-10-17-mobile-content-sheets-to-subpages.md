# 按「小面板可浮窗、超过半屏走子页」校准移动端面板形态

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-17
**Source:** 用户 2026-10-17 三次校准：「我想着不要在移动端出现弹窗式悬浮展示内容」「我说了不要有浮层你是没理解吗？？」→「添加过滤器这种小的可以做浮窗，但是大的不可以，例如超过屏幕高度50%的就不适合浮窗」

## Goal

最终口径（红线）：**移动端只有小面板可以浮窗，自然高度超过约半屏的内容/表单/列表必须走子页。** 判定依据是面板高度，不是内容类型。

按此把同期的面板逐个归位：

| 面板 | 自然高度 | 移动端形态 |
| --- | --- | --- |
| 快照比对（模块差异列表，可展开） | 远超半屏 | 子页 `/settings/snapshots/diff?id=` |
| 上游测速（控制条 + 结果列表） | 远超半屏 | 子页 `/settings/dns/benchmark` |
| 更新详情（发行说明 + 升级指引） | 远超半屏 | 子页 `/settings/about/update` |
| 同步目标选择（列表随实例数增长） | 半屏上下，会继续增长 | 子页 `/sync/:type` |
| 安全搜索（7 个引擎开关 + 保存） | ≈半屏以上 | 子页 `/protection/safesearch` |
| 创建快照（2 个字段） | ~30% | 浮层（表单） |
| 添加过滤器 / 添加重写 / DHCP 静态租约（2–3 个字段） | ~30% | 浮层（表单） |
| 确认框（`useConfirm`） | ~20% | 浮层（确认） |
| 实例切换（少量实例） | ~30% | 浮层（选择） |

## Decision

1. **内容/大面板子页化**：每块内容抽成共用组件，桌面浮层与移动子页各自只做外壳（与 `LogDetail` + `LogDetailPage` 同构）。新路由：`/settings/snapshots/diff`、`/settings/dns/benchmark`、`/settings/about/update`、`/sync/:type`（filters | allowlist | rules | rewrites | clients，页面按类型复用对应 SWR 缓存取数）、`/protection/safesearch`。
2. **小面板保留浮层**：创建快照、添加过滤器/重写、DHCP 静态租约、确认框（`useConfirm`）与实例切换继续走居中浮层；组件改为内容/外壳分离（`SnapshotCreateForm`、`SyncForm`），必要时同一内容可复用到桌面浮层。
3. **导航语义**：大面板子页用 `PageHeader back` + `navBack`（POP 优先，空栈 replace 到父页）；`src/lib/nav/routes.ts` 把 push 详情页列入「桌面保留返回语义」，`isSettingsNavActive` 支持子路径点亮父项。测速子页「应用」经一次性 handoff（`src/lib/dns/benchmarkIntent.ts`）在 POP 后写回 `upstream_dns` 草稿。
4. **导航标题防重叠**：`PageHeader` 浮动标题原 `max-w-[min(58vw, 240px)]` 因括号内有空格从未生成（computed `max-width: none`），长标题会压住右侧按钮。改为测量式限宽（取左右空余较小者的两倍、上限 240px、下限 64px，`ResizeObserver` 跟随），并把快照页移动端主操作收成图标钮（`lg` 起显示文字）。
5. **红线回写**：`docs/web-interaction.md` 与 `docs/architecture/frontend.md` 按「高度」口径重述规则与路由。

## Accept

- [x] 移动端：快照比对、测速、更新详情、同步目标选择、安全搜索为大面板子页；创建快照、添加过滤器/重写、DHCP 租约、确认框、实例切换为小浮层
- [x] 桌面端全部入口仍为居中浮层
- [x] 测速「应用」POP 回设置页后 `upstream_dns` 草稿回填（`benchmarkIntent` 单测）
- [x] 移动端顶部标题不再与右侧操作重叠（zh/en、快照页双按钮场景实测）
- [x] `pnpm check`、`pnpm test`（115 例）、`pnpm build`、`node scripts/verify-proposals.mjs` 通过
- [x] 子代理基于 _probe 截图的 zh/en 双语视觉验收通过

## Note

- 关联：`src/components/ui/primitives.tsx`、`src/lib/nav/routes.ts`、`src/lib/dns/benchmarkIntent.ts`、`src/pages/{SyncPage,SafeSearchPage}.tsx`、`src/pages/settings/{SnapshotDiffPage,DnsBenchmarkPage,UpdatePage}.tsx`、`src/components/{snapshot,dns,settings,protection}/`。
- 边界：同步目标选择面板高度随实例数增长（≥3 台即超过半屏），归为大面板；若未来实例上限很小可再评估。
- 代价：移动端草稿页跳去子页（测速、同步自定义规则）再返回会丢未保存草稿——草稿随页面生命周期，与全站导航语义一致；同步自定义规则时以已保存的 `user_rules` 为准。
- 截图（本机忽略材料）：`_probe/gen-shots/conformance-*.png`。
