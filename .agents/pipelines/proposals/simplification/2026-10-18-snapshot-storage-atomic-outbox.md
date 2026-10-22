# 收敛快照存储层样板、原子化出件箱双写与解除循环引用

**Class:** simplification
**Status:** implemented
**Date:** 2026-10-18
**Source:** 2026-10-18 `$thermo-nuclear-code-quality-review` 专项架构审查；上游主提案 `.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`

## Goal

彻底重构快照持久化层（`src/lib/snapshot/snapshotStorage.ts`）与离线出件箱协调器（`src/lib/snapshot/outboxSync.ts`）：
1. **消灭 12 处重复的裸写 IndexedDB 事务样板**：当前文件膨胀至 700 余行，大量的 openDatabase、db.transaction、tx.objectStore、onsuccess/onerror 机械重复书写超过 300 行；
2. **解决非原子双写导致的悬挂待传状态（Hanging Pending State）**：快照落盘与 Outbox 任务写入属于不同事务，进程中断可能导致快照永久停留在 `pending_upload` 且永不同步；
3. **解除模块双向循环引用与全局副作用**：`snapshotStorage.ts` 与 `outboxSync.ts` 互相引用；`outboxSync.ts` 顶层自执行全局监听器，污染测试环境；
4. **消除队头阻塞、网络挂死与实例串扰**：Outbox 严格串行网络请求缺乏超时配置（假死连接永久挂死协调器）；全局单 Promise 锁导致多实例同步互相覆盖；
5. **解决未解密快照静默吞没**：多端拉取未解密快照时，被 `.filter(Boolean)` 静默丢弃，导致用户误认为数据完全丢失。

## Decision

1. **抽取轻量通用泛型 `IdbStore<T>` 驱动（<80 行）**：
   - 实现无状态、类型安全的键值驱动，同时支持浏览器 IndexedDB 与单元测试环境的 MemoryVault 回退；
   - 支持向方法显式传递可选的外部 `IDBTransaction`，原生支持跨 Store 复合事务操作；
   - 彻底消灭原文件中重复书写 12 次的底层样板。
2. **跨 Store 原子复合事务（Atomic Dual-Write）**：
   - 提供 `commitManagedSnapshotWithOutbox(record, task)` 单事务提交方法；
   - 在同一个 `db.transaction(['managed_snapshots', 'managed_outbox'], 'readwrite')` 事务中原子提交，要么全部落盘，要么全部回滚，彻底杜绝孤儿悬挂记录。
3. **打破循环引用，存储与网络单向流动**：
   - 存储层（`snapshotStorage.ts`）严禁反向引用上层的 `OutboxSyncCoordinator`；
   - 存储层专注纯粹的数据持久化；入库后的同步触发由应用编排层或事件监听驱动；
   - 移除 `outboxSync.ts` 顶层的全局自执行注册，改由会话生命周期或应用启动时显式挂载。
4. **Outbox 队列网络健壮性治理**：
   - 网络请求配置 `signal: AbortSignal.timeout(15_000)`，超时自动标记重试，彻底解决假死网络阻塞协调器的问题；
   - 同步锁按 `instanceId` 分区管理（`Map<instanceId, Promise>`），确保不同实例的同步任务互不干扰、独立并发调度。
5. **模型支持保留未解密快照状态**：
   - 明确状态契约：未解密的快照保留元数据并在条目上标记 `isLocked: true`；
   - 严禁通过 `.filter(Boolean)` 静默丢弃未解密条目，UI 侧展示锁定状态并引导用户输入凭据解锁。

## Accept

- [x] `snapshotStorage.ts` 消除所有裸写 IDB 样板（重复事务样板消除超 300 行，提取轻量 `IdbStore` 驱动）
- [x] 快照与 Outbox 写入通过单一事务原子提交，不再存在半写入孤立状态
- [x] 消除 `snapshotStorage.ts` 与 `outboxSync.ts` 之间的循环依赖
- [x] 网络请求具备显式超时保护，单实例同步不阻塞其他实例
- [x] 未解密的远端快照在拉取后被妥善保留，不再静默消失
- [x] `pnpm test` 中快照与 Outbox 相关的所有测试均顺利通过
- [x] `node scripts/verify-proposals.mjs` 校验通过

## Note

- 关联主提案：`.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`
