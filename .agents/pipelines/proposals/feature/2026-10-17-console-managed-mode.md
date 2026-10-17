# 引入托管模式：直连 / 托管双形态与快照归属

**Class:** feature
**Status:** proposed
**Date:** 2026-10-17
**Source:** 用户 2026-10-17 讨论：快照存储在哪 → 服务端安装场景下多浏览器/多设备割裂 → 提出登录双形态（直连 AGH / 填写远程 AGH Console 地址）

## Goal

现状（本分支已核实）：

- 快照只存在浏览器本地 IndexedDB（`agh_console_snapshots`），按 origin 隔离 —— 换端口、换域名、换浏览器、清站点数据都会"丢失"（旧数据仍在原 origin 下，只是看不见）；
- console 服务端刻意无状态（Dockerfile `Stateless by design: no volumes, no local writes`），不持有任何状态；
- `pre_sync` 保护快照抓的是**目标实例**的配置，却存在**操作者设备**上 —— 团队/多设备场景下别人无法回滚，是功能性缺口而非体验问题；
- 连接形态只有一种：填 AGH 地址 + 凭据，状态全在本机浏览器。换一个浏览器打开 = 重新登录 + 看不到任何历史档案。

目标：把「数据归属」变成用户在连接时显式做的选择，闭合跨设备共享缺口，同时不改变项目"凭据不出本机、无账号、无第三方"的卖点性质。

## Decision

### 1. 两种连接形态（连接页显式选择）

- **直连**（默认，即今天的行为）：填 AGH 地址 + 凭据，状态存本机浏览器。
- **托管**：填一个已部署的 AGH Console 地址，实例清单与快照档案来自该服务端；iOS / 桌面壳与各浏览器共用同一份。

「传输」与「归属」分开，托管模式**不接管 AGH 流量**：壳里仍走进程内 Rust 代理（`agh_fetch`，`src-tauri/src/proxy.rs`），Web/PWA 里仍走本机 console 服务。服务端不可达时失去的只是档案共享，不是管理能力 —— 避免服务器成为手机访问 AGH 的单点故障。

Web/PWA 形态下「托管」即「托管到本服务器」；壳形态下才是「填写远程 console 地址」。不在 Web 形态里支持链式代理（console 再代理到另一台 console）。

### 2. 归属单位是「实例」，不是浏览器

托管库按 AGH 实例分区（实例身份取规范化 URL）。`Instance.endpoints[]` 在 `src/lib/session/instances.ts` 注释为 Away Connection 预留，托管来源即该预留位的第一个消费者。

### 3. 托管范围（第一刀）

实例清单（label / url / username，**不含密码**）、快照库、一次性迁移入口、离线 outbox。不含：AGH 凭据、主题/偏好、多 console 服务器。

### 4. 红线：凭据永不上服务器

服务端不存 AGH 密码；每台新设备第一次仍需输入一次（之后与今天相同，留在本机）。若将来要托管凭据，必须按"有状态产品"重新评审（静态加密、解锁会话、账号体系），不在本提案范围。

### 5. 授权

托管库接口要求携带目标实例的有效 AGH 凭据，服务端向 AGH 探测验证后放行。零新增账号体系。前提：**面向内网 / VPN 部署** —— 公网暴露时"能改 AGH 的人本来就能改它"这一等价关系不成立；公网暴露面的独立加固工作另立登记，不属于本提案。

### 6. 离线语义

服务端不可达时：实例与快照按只读缓存工作；保护快照（`pre_sync` / `pre_rollback`）必须永远可写 —— 写本地并标记"待上传"，恢复连接后按 UUID 幂等补传（outbox）。这条必须进实现验收，否则"同步前的安全网"会因服务器断连而消失。

### 7. 前置的文案口径修正（尚未实施）

托管模式落地前，现有文案不能承诺"备份"语义（跨设备持久）。以下三处与托管模式无依赖，可先行落地，也可随第一刀一起做：

- 设置项「配置快照与备份」→「配置快照」（英文侧本就是 `Snapshots`）；`itemSnapshots` / `snapshotRollbackHint` 等引用旧名的词条同步；
- 快照列表页底部加一句存储说明：快照只在本浏览器，换设备 / 清站点数据前先导出；
- 导出文件名 `agh-cluster-bundle-*.json` → `agh-snapshots-*.json`，类型 `ClusterSnapshotBundle` → `SnapshotBundle`（`clusterName` → `instanceLabel`）。导入侧只认 `bundleVersion: '1.0'`，旧文件保持兼容。

`scheduled` 触发类型目前无生产者（只有 badge 渲染与 schema 值）：本提案不实现，按"要么落地为危险页保存前自动抓一份、要么下一轮删除"处理。

### 8. 分刀

- 第一刀（本提案主体）：双形态连接 + 实例清单托管 + 快照库托管 + outbox + 一次性迁移。
- 第二刀：主题/偏好同步、多 console 服务器；凭据托管须重新评审。

## Accept

- [ ] 文案不再承诺跨设备持久：标题、空态、存储说明三处
- [ ] 导出的 bundle 文件名与类型名不再使用「集群」措辞，旧文件仍可导入
- [ ] 连接页可显式选择「直连」与「托管」；切回直连后本机状态不丢
- [ ] 托管下任一设备创建的实例与快照，在其它登录同一 console 的设备可见
- [ ] 服务端存储与日志中都不出现 AGH 密码
- [ ] 无凭据或不带目标实例有效凭据的请求无法读写托管库
- [ ] 服务端不可达时：实例/快照只读缓存可用；保护快照可写且标记待上传，恢复后自动补传且不重复
- [ ] 首次开启托管提供「把本机已有快照迁移到托管库」入口，迁移后本机副本的去留对用户可见
- [ ] `pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server`、`cd src-tauri && cargo test`、`node scripts/verify-proposals.mjs` 通过

## Note

- 上游提案：`.agents/pipelines/proposals/feature/2026-10-13-configuration-snapshots-and-rollback.md`（快照功能立项；本提案修正其"本地版本库"的定位口径）
- 事实页：`docs/architecture/frontend.md`（实例模型与存储键）、`docs/web-interaction.md`（快照页行为）
- 相关口径：`.agents/pipelines/proposals/bug-fix/2026-10-17-withdraw-multi-instance-aggregation.md`（dev 已收敛为"只看活动实例"；托管库按实例分区与该口径一致）
- 依据：本机探针确认快照库按 origin 隔离、服务端无落盘；`Instance.endpoints[]` 的 Away Connection 预留注释在 `src/lib/session/instances.ts`
