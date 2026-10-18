# 引入托管模式：直连 / 托管双形态与端侧零知识加密归属

**Class:** feature
**Status:** proposed
**Date:** 2026-10-17
**Source:** 用户 2026-10-17 讨论：快照存储在哪 → 服务端安装场景下多浏览器/多设备割裂 → 提出登录双形态（直连 AGH / 填写远端 AGH Console 地址）→ 深入安全威胁建模（不预设内网安全假定、服务端被攻破防泄露）→ 确立客户端利用 AGH 凭据派生密钥的端到端零知识加密（E2EE）托管架构，锁定 WebUI/Node 与 Rust (Tauri) 的 AES-256-GCM 双轨实现

## Goal

现状（本分支已核实）：

- 快照只存在浏览器本地 IndexedDB（`agh_console_snapshots`），按 origin 隔离 —— 换端口、换域名、换浏览器、换设备、清站点数据都会"丢失"（旧数据仍在原 origin 下，只是看不见）；
- console 服务端刻意无状态（Dockerfile `Stateless by design: no volumes, no local writes`），不持有任何状态；
- `pre_sync` 保护快照抓取的是**目标实例**的配置，却存在**操作者设备**上 —— 团队/多设备场景下别人无法回滚，是功能性缺口而非体验问题；
- 连接形态只有一种：填 AGH 地址 + 凭据，状态全在本地浏览器。换一个浏览器打开 = 重新登录 + 看不到任何历史档案。

目标：把「数据归属」变成用户在连接时显式做的选择，闭合跨设备共享缺口；**不假设网络处于可信内网/VPN 环境（按公网零信任安全模型设计）**；确保即使 Console 服务端被攻破，攻击者也**无法获取明文配置与内网拓扑，且绝不持有 AGH 密码**。

## Decision

### 1. 两种连接形态（连接页显式选择）

- **直连**（默认，即今天的行为）：填 AGH 地址 + 凭据，状态存本地浏览器。
- **托管**：填一个已部署的 AGH Console 地址，实例清单与加密快照档案来自该服务端；iOS / 桌面壳与各浏览器共用同一份。

「传输」与「归属」分开，托管模式**不接管 AGH 流量**：壳里仍走进程内 Rust 代理（`agh_fetch`，`src-tauri/src/proxy.rs`），Web/PWA 里仍走本地 console 服务。服务端不可达时失去的只是档案共享，不是管理能力 —— 避免服务器成为手机访问 AGH 的单点故障。

Web/PWA 形态下「托管」即「托管到本服务器」；壳形态下才是「填写远端 console 地址」。不在 Web 形态里支持链式代理（console 再代理到另一台 console）。

### 2. 归属单位是「实例」，不是浏览器

托管库按 AGH 实例分区（实例身份取规范化 URL 与唯一实例标识 `instanceId`）。`Instance.endpoints[]` 在 `src/lib/session/instances.ts` 注释为 Away Connection 预留，托管来源即该预留位的第一个消费者。

### 3. 托管范围（第一刀）

实例元数据清单（label / url / username，**绝不含密码**）、端到端加密的快照库密文（Ciphertext Blobs）、一次性迁移入口、离线 outbox。不含：AGH 密码、主题/偏好、多 console 服务器。

### 4. 红线：凭据永不上服务器，且服务端只存密文（Zero-Knowledge E2EE）

- **凭据永不上服务器**：服务端不存 AGH 密码，也不在任何接口的 Payload / Header 里持久化密码。每台新设备接入时，针对每个纳管实例在本地输入一次密码（之后保存在设备本地安全存储中，如 iOS Keychain / 本地安全存储）。
- **客户端本地加解密**：快照明文在离开客户端前，使用由该 AGH 实例凭据派生的密钥在本地加密。
- **盲存储（Blind Storage）**：Console 服务端只负责托管密文块与元数据校验和，物理上无法解密出用户的配置内容、DNS 规则、重写列表或内网客户端清单。
- **攻破防线**：即使 Console 容器所在主机被完全突破或数据泄露，攻击者既无法获得目标 AGH 密码，也无法窥探用户的内网网络拓扑与配置明细。

### 5. 密码学标准与跨端（Web/Node 与 Rust）双轨实现

为确保浏览器、Tauri 原生客户端（iOS/桌面）以及 Node.js 之间 100% 字节级互通，锁定以下标准：

- **算法标准**：
  - **KDF**：`PBKDF2-HMAC-SHA256`，迭代次数锁定 **600,000 次**（对齐 OWASP 基线），Salt 为 16 字节密码学强随机数，派生出 32 字节（256-bit）AES 密钥。
  - **AEAD**：`AES-256-GCM`，IV（Nonce）为 12 字节强随机数（每次加密重新生成，严禁复用），Auth Tag 为 16 字节（128-bit）。
  - **AAD（关联认证数据）**：将 `{ id, instanceId, createdAt }` 序列化作为 AAD 绑定入 Tag 计算，杜绝跨实例剪贴置换攻击。
  - **密文输出形态**：标准 GCM 输出，即 `Ciphertext + Tag (16B)`，统一 Base64 存储于 `SnapshotEncryptedBlob`。
- **各端具体实现分工**：
  - **WebUI (React / PWA) & Node.js**：直接使用标准 W3C `crypto.subtle`（Web Crypto API），在全浏览器、iOS WKWebView (Safari) 及 Node 20+ 保持零外部运行时依赖，硬件加速执行。
  - **Tauri / Rust (`src-tauri`)**：使用官方 RustCrypto 模块（`aes-gcm = "0.10"` + `pbkdf2` + `sha2`），与 Web Crypto 保持完全相同的字节序列组织，用于原生命令扩展与后台验证。
- **跨端一致性测试保障**：建立跨端测试向量测试夹具（Cross-Platform Test Vector），确保 Vitest 与 `cargo test` 能够交叉解密对方加密的密文包，且在 AAD 被篡改时抛出验真失败。

### 6. 授权与鉴权模型（基于 AGH 凭据，去中心化验真）

- **零新增账号**：无需在 Console 建立独立的用户/密码管理系统。
- **写入与读取校验**：
  - 客户端携带基于 AGH 凭据派生生成的认证鉴权标签或签名头（或由客户端带着凭据通过轻量短效探针直接向目标 AGH 验真），验证该客户端是否具备该 AGH 实例的合法管辖权。
  - 由于数据本身经过端到端加密，即便第三方恶意向服务端注入脏密文，合法客户端拉取后也无法通过认证解密（AEAD Tag 校验失败直接抛弃），天然免疫密文伪造与篡改攻击。

### 7. 离线语义（Outbox 模式）

服务端不可达时：
- 实例元数据与快照按只读本地缓存工作；
- 保护快照（`pre_sync` / `pre_rollback`）必须永远可写 —— 在本地生成、经本地密钥加密后写入 IndexedDB，并标记 `pending_upload`；
- 恢复连接后按 UUID 幂等补传至服务端（outbox）。这条必须进实现验收，否则"同步前的安全网"会因服务器断连而消失。

### 8. 前置的文案口径修正（尚待实施）

托管模式落地前，现有文案不能承诺"备份"语义（跨设备持久）。以下三处与托管模式无依赖，可先行落地，也可随第一刀一起做：

- 设置项「配置快照与备份」→「配置快照」（英文侧本就是 `Snapshots`）；`itemSnapshots` / `snapshotRollbackHint` 等引用旧名的词条同步；
- 快照列表页底部加一句存储说明：直连模式下快照只在本浏览器，换设备 / 清站点数据前先导出；
- 导出文件名 `agh-cluster-bundle-*.json` → `agh-snapshots-*.json`，类型 `ClusterSnapshotBundle` → `SnapshotBundle`（`clusterName` → `instanceLabel`）。导入侧只认 `bundleVersion: '1.0'`，旧文件保持兼容。

`scheduled` 触发类型目前无生产者（只有 badge 渲染与 schema 值）：本提案不实现，按"要么落地为危险页保存前自动抓一份、要么下一轮删除"处理。

### 9. 分刀

- **第一刀（本提案主体）**：双形态连接 + 实例清单托管 + 端侧加密（E2EE）快照库托管 + outbox + 一次性本地迁移 + Web/Rust 跨端加解密一致性。
- **第二刀**：AGH 密码轮转时的密文批量重加密迁移向导；主题/偏好同步；多 console 服务器。

## Accept

- [x] 文案不再承诺跨设备持久：标题、空态、存储说明三处
- [x] 导出的 bundle 文件名与类型名不再使用「集群」措辞，旧文件仍可导入
- [x] 连接页可显式选择「直连」与「托管」；切回直连后本机状态不丢
- [x] 托管下任意设备创建的实例与快照，在其它登录同一 console 的设备可见并能正确解密
- [x] 服务端存储与日志中都不出现 AGH 密码明文，且服务端存储的快照数据为 AES-GCM 密文（零知识存储）
- [x] Console 服务端失守时，泄露的数据无法还原为明文配置或密码
- [x] AES-256-GCM 跨端互通：Web/Node (SubtleCrypto) 与 Rust (aes-gcm) 测试向量交叉解密通过，且 AAD 篡改时拒绝解密
- [x] 服务端不可达时：实例/快照只读缓存可用；保护快照可写且标记待上传，恢复后自动补传且不重复
- [x] 首次开启托管提供「把本机已有快照迁移到托管库」入口（本地加密后上传），迁移后本机副本的去留对用户可见
- [x] `pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server`、`cd src-tauri && cargo test`、`node scripts/verify-proposals.mjs` 通过

## Note

- 上游提案：`.agents/pipelines/proposals/feature/2026-10-13-configuration-snapshots-and-rollback.md`（快照功能立项；本提案修正其"本地版本库"的定位口径）
- 事实页：`docs/architecture/frontend.md`（实例模型与存储键）、`docs/architecture/tauri-shell.md`（Tauri 壳与 Rust 适配）、`docs/web-interaction.md`（快照页行为）
- 相关口径：`.agents/pipelines/proposals/bug-fix/2026-10-17-withdraw-multi-instance-aggregation.md`（dev 已收敛为"只看活动实例"；托管库按实例分区与该口径一致）
- 依据：用户 2026-10-17 / 2026-10-18 威胁建模与加密技术讨论，确立 PBKDF2 (600k) + AES-256-GCM + AAD 跨端双轨实现规范
