# 移动端查询日志透视分析改子页并补回丢失的浮层形态约定

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-17
**Source:** 用户复核：「移动端不要采用弹窗展示这些内容……就像日志详情页和客户端详情页之类的，在移动端采用子页面来做」；指 2026-09-22 记录的「浏览信息型浮层必须改页」约定

## Goal

P2-2（`f0b0e19`）引入的透视分析面板在移动端是 85vh 居中弹窗，违背 2026-09-22 定下的约定：移动端「浏览信息」型内容一律用子页，浮层只承载确认框、表单输入与选择类。该约定的原始记录在文档重构（`1375432`）时随 `docs/PC_ADAPTATION.md` 删除，只以「按页面」形式留在持久文档里，实现者读到的只有「弹层必须居中」。

1. 移动端把透视分析改为 `/logs/analytics` 子页，桌面保持居中弹层；
2. 把约定按当前结构写回 docs 与 `sheet.tsx` 的注释，避免再次丢失。

## Decision

1. **形态分叉**：`openAnalytics` 按 `isDesktop` 分叉（与 `openDetail` 同构）；子页与桌面弹层共用同一份内容组件 `QueryLogAnalytics`，外壳（弹层框架 / `PageHeader back` + 页面容器）各自承担——与 `LogDetail` + `LogDetailPage` 的分法一致。
2. **样本传递**：聚合后的日志样本经 `location.state` 传给子页，与日志详情、客户端详情同款；缺少 state（直落/刷新）渲染空态并可返回。
3. **下钻回填**：点击指标先记录一次性 handoff（`src/lib/log/drillIntent.ts`），再 `navBack` POP 回日志列表；列表挂载时消费该 handoff，经既有的 replace URL 同步写入 `?q=` / `?filter=`。效果与桌面弹层「原地回填 + 关层」等价，且不在历史栈留下重复条目（遵守 `docs/web-interaction.md` 的「不得用 replace 导航到父级列表页」）。
4. **约定回写**：`docs/web-interaction.md`（弹层与选择器 + 查询日志行为）、`docs/architecture/frontend.md`（路由表与页面表）、`src/components/ui/sheet.tsx` 顶部注释三处都写明「浏览信息型内容移动端走子页、浮层只承载确认/表单/选择」及其适用面。

## Accept

- [x] 移动端日志页「透视分析」进入 `/logs/analytics` 子页（悬浮返回胶囊与侧滑返回生效），桌面仍为居中弹层
- [x] 子页内点击域名/客户端/拦截类型返回日志列表后，搜索或筛选已回填，且历史栈不新增重复条目
- [x] 直接打开 `/logs/analytics`（无样本）显示空态并可返回
- [x] 约定在 `docs/web-interaction.md`、`docs/architecture/frontend.md` 与 `sheet.tsx` 注释中可查到
- [x] `pnpm check`、`pnpm test`、`pnpm build`、`node scripts/verify-proposals.mjs` 通过（含 mock 下 390px E2E 走查）

## Note

- 关联：`src/pages/QueryLog.tsx`、`src/components/log/QueryLogAnalyticsSheet.tsx`、`src/components/log/QueryLogAnalytics.tsx`、`src/pages/LogAnalyticsPage.tsx`、`src/lib/log/drillIntent.ts`
- 同类待议（本次不动）：P3-1 的快照对比弹层（`SnapshotDiffSheet`）也是浏览型内容，移动端是否同批改页由用户定；表单/确认/选择类浮层（`SyncSheetContent`、`SafeSearchSheet`、各 CRUD 表单、`useConfirm`）按 2026-09-22 的结论保留弹层。
- 桌面弹层拿到的样本与子页一样是打开时的快照（`sheet.open` 传入的 React 元素不随列表重渲染），两端行为一致，不引入新的数据语义。
