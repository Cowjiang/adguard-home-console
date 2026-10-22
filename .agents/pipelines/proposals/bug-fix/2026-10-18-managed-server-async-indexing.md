# 盲存储服务端异步 I/O 改造、元数据轻量索引与并发互斥保护

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Source:** 2026-10-18 `$thermo-nuclear-code-quality-review` 专项架构审查；上游主提案 `.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`

## Goal

修复 Console 托管盲存储服务端（`server/managed.mjs`）中存在的事件循环冻结风险与并发写竞争漏洞：
1. **彻底消除同步 I/O 导致的 Node.js 单线程事件循环挂死**：当前文件全量使用 `readFileSync`、`writeFileSync`、`readdirSync`。特别是在 `GET /snapshots` 列表接口中，同步遍历并解析所有密文 Blob，在多快照场景下会导致主进程挂起数十到数百毫秒，阻塞所有正在轮询的 AGH 代理流量和健康检查；
2. **消灭多客户端并发写更新丢失（Race Condition）**：`POST /instances` 采用无锁的“读文件 -> 内存追加 -> 写临时文件替换”机制，高并发场景下后到达的请求会直接覆盖先前请求；
3. **建立快照元数据轻量索引**：快照列表接口不应以 $O(N \times \text{BlobSize})$ 同步读取全量大体积密文，而应以 $O(1)$ 读取轻量索引。
4. **健全请求体契约校验**：补充对 `SnapshotEncryptedBlob` 中必须字段的结构合法性校验，防止异常 Payload 污染存储目录。

## Decision

1. **服务端全面迁移至 `node:fs/promises` 异步非阻塞 I/O**：
   - 将所有同步文件读写操作替换为 `fs.promises.readFile`、`writeFile`、`readdir`、`unlink`；
   - 确保在密文读写期间，Node.js 事件循环自由调度，不影响 `/api/agh/*` 等核心网络反向代理流量。
2. **实例级快照轻量元数据索引（`snapshots_index.json`）**：
   - 每个实例目录下单独维护一个轻量索引文件，仅包含快照摘要信息（`id`, `createdAt`, `action`, `size` 等）；
   - 在 `PUT` 和 `DELETE` 快照时原子维护该索引；
   - `GET /api/managed/instances/:id/snapshots` 查询直接读取该索引返回，复杂度从 $O(N \times \text{BlobSize})$ 彻底降为 $O(1)$。
3. **引入进程内轻量异步互斥队列（Async Mutex）**：
   - 为对 `instances.json` 和 `snapshots_index.json` 的更新操作增加写锁排队机制；
   - 杜绝并发请求下的 Read-Modify-Write 丢失更新问题。
4. **强化盲存储请求契约校验**：
   - 在 `PUT /snapshots/:snapshotId` 中严格校验 `blob.ciphertext` 为非空 Base64 字符串、`blob.kdf` 存在合法 iterations 与 salt、`blob.cipher` 包含 iv 与 tagLength；
   - 结合 `path.resolve` 与基础目录比对，对路径穿越进行纵深防御。

## Accept

- [x] 服务端代码全量消除 `*Sync` 文件操作，全部基于 `node:fs/promises` 异步执行
- [x] 快照列表接口通过轻量索引响应，不再同步读取每个快照的完整密文 Blob
- [x] 并发更新实例列表与快照时不发生丢失覆盖，多用例并发测试通过
- [x] `node --test server/managed.test.mjs` 服务端测试全量通过且运行性能提升
- [x] `node scripts/verify-proposals.mjs` 校验通过

## Note

- 关联主提案：`.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`
