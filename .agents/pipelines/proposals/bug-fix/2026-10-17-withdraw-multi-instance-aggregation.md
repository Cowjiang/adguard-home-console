# 把多实例聚合展示从 dev 撤下、保留在分支

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-17
**Source:** 用户 2026-10-17：「先把多实例聚合的功能全部移动到一个新的分支，有重大 UI 显示问题，然后 dev 分支不要出现实例聚合相关的功能」

## Goal

概览与日志的跨实例聚合展示（P0/P1 的指标聚合、P2-2 的跨节点日志聚合、P1 的集群健康矩阵）把三种作用域混在同一屏里：同一 2×2 指标格中三个数字是「N 台汇总」、第四个「客户端」是当前实例；防护卡的状态文案取当前实例而开关默认并发下发全部实例；日志行无条件打节点标签。用户判定为重大 UI 显示问题，要求先把该功能整体从 dev 撤下、放到独立分支继续开发。

## Decision

1. **分支**：新建 `feat/multi-instance-aggregation` 指向撤下前的 dev 快照（含全部聚合功能），后续修复在该分支上做；dev 不再含该功能。
2. **dev 移除范围**：
   - 概览：跨实例汇总（`aggregateStats`、`mergeKV`、`mergeUpstreamAvg` 及其单测）、非活动实例的静默 `/stats` 轮询、合并榜单、按实例曲线选择器、聚合说明；集群健康卡 `ClusterHealthCard` 与「部分异常」徽标。
   - 日志：节点范围选择器、跨节点并发拉取与合并（`mergeQueryLogLists`、`keyOfAggregated`，行标识键归位为 `keyOf`）、`_instanceId`/`_instanceLabel` 元数据与三处节点标签渲染、透视分析里的节点徽标。
   - 防护卡：集群协同勾选框与并发下发（连同 `src/lib/session/cluster.ts` 与其单测一起移出）。
   - i18n：随之失效的 18 个词条（dashboard 11、querylog 3、protection 4）在 zh/en 双语同步删除。
3. **保留**：实例存储、实例切换（状态胶囊/侧栏）、per-instance 状态探测与退避、实例管理（增删改）、规则同步与配置快照等非聚合的多实例协同。dev 上的多实例只表现为「切到哪台，各页就只看那台」。
4. **作用域口径**：所有页面的数据与操作一律只针对活动实例，不做跨实例汇总（写进 `docs/architecture/frontend.md` 与 `docs/web-interaction.md`）。

## Accept

- [x] dev 上搜不到聚合符号（`aggregateStats` / `mergeKV` / `mergeUpstreamAvg` / `mergeQueryLogLists` / `keyOfAggregated` / `ClusterHealthCard` / `setClusterProtection` / 节点范围选择器 / 聚合 i18n 词条）
- [x] 概览页与日志页只显示活动实例数据，日志行不再出现节点标签
- [x] 防护卡的开关与定时暂停只作用于活动实例
- [x] `pnpm check`、`pnpm test`（104 例）、`pnpm build`、`node scripts/verify-proposals.mjs` 通过，mock 下双端走查正常
- [x] `feat/multi-instance-aggregation` 分支已推送，内容 = 撤下前的 dev（起点 `97fa71d`）

## Note

- 重新落地聚合时的方向（本提案不实现，由用户定）：默认只看当前实例 + 显式「全部实例」开关，并逐块标注数据作用域；日志的跨节点取样同理。
- 保留的多实例协同：规则同步、配置快照、实例切换与探测、防护并发下发之外的既有能力。
- 关联文档：`docs/architecture/frontend.md`（页面表与多实例作用域）、`docs/web-interaction.md`（日志与页面行为）。
