# 实现跨节点查询日志聚合与交互式下钻分析（P2-2）

**Class:** feature
**Status:** implemented
**Date:** 2026-10-13
**Source:** P2-2: 全局/跨节点查询日志聚合与下钻分析（Query Log Analytics）

## Goal
为 AdGuard Home 控制台提供多节点查询日志集中聚合（Multi-Instance Log Aggregation）与交互式下钻透视分析（Query Log Analytics）：
1. 解决多实例环境下日志孤岛问题，允许用户在单节点和「全部在线节点（跨节点聚合）」之间无缝切换，实时汇聚各节点查询流水；
2. 提供查询日志多维度分析看板（居中 Glass Sheet），对当前日志样本进行慢查询识别（Slow Queries）、缓存命中率分析、拦截原因分布以及 Top 域名/客户端透视；
3. 支持一键下钻穿透，点击分析指标项（域名、客户端、拦截类型）可即时回填至日志搜索与过滤，实现流式探查闭环。

## Decision
1. **多节点聚合与标识机制**：
   - 当检测到存在多个实例时，在日志页面头部提供实例切换器，支持选择单一实例或「跨节点聚合」。
   - 跨节点模式下仅并发探测在线节点（排除 `online === 'down'`），并将节点信息注入为日志条目元数据（`_instanceLabel`、`_instanceId`），保证列表与详情可直观识别来源节点。
   - 日志唯一键规范升级：包含 `_instanceId` 维度，避免不同节点的同时间并发查询发生合并冲突。
2. **分析计算层解耦与独立工具函数**：
   - 抽象 `src/lib/log/analytics.ts` 纯函数计算层，包括 `analyzeQueryLogs`、`extractSlowQueries` 等，配合完整单元测试确保指标计算严密性与健壮性。
3. **居中 Glass Sheet 弹窗设计**：
   - 遵循项目最高规范，使用基于 `useSheet` 的居中模态覆盖层，严禁底部 ActionSheet 遮挡移动端 iOS 原生 TabBar。
4. **双语对齐与严格类型安全**：
   - 严禁任何硬编码中文字符串，统一在 `zh/querylog.ts` 与 `en/querylog.ts` 中注册国际化词条，保持 TypeScript strict 编译零错误。

## Accept
- [x] `src/lib/log/analytics.ts` 具备纯函数分析计算能力与独立单元测试，测试覆盖慢查询排序、缓存命中率、拦截分类与 Top 域名统计。
- [x] 日志列表在多实例场景下支持切换单一实例与「全部在线实例」聚合模式，列表与详情清晰标注来源节点。
- [x] 新增 `QueryLogAnalyticsSheet` 居中 Glass Sheet，提供耗时分布、慢查询列表、缓存率与拦截占比透视。
- [x] 支持点击分析看板中的指标项（域名、客户端、拦截分类）快捷下钻，自动同步主界面搜索输入与筛选分类。
- [x] 中英双语（i18n）完整对齐，严格通过 `pnpm check`、`pnpm test`、`pnpm build` 及 `verify-proposals.mjs`。

## Note
- 关联模块：`src/pages/QueryLog.tsx`、`src/components/log/LogTable.tsx`、`src/components/log/LogRow.tsx`、`src/components/log/LogDetail.tsx`。
- 架构约束：遵循 `AGENTS.md`、`docs/engineering.md` 及居中模态弹窗规范。
