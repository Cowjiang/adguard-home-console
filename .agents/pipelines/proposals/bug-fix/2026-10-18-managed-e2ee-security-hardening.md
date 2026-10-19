# 修复 E2EE 密码学明文泄露、密钥可提取性与下线未消费代码

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Source:** 2026-10-18 `$thermo-nuclear-code-quality-review` 专项架构审查；上游主提案 `.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`

## Goal

修复托管模式端到端加密（E2EE）实现中的高危安全隐患与冗余架构代码：
1. **消灭明文 Checksum 泄露漏洞**：当前 `SnapshotEncryptedBlob` 中直接暴露了 `checksum: computeSha256(plaintextBytes)`。攻击者可对盲存储服务器存储的 Checksum 与常用 AdGuard 配置模板预计算字典碰撞，在不破解密文的情况下逆向用户配置明文，破坏零知识防线；
2. **修复密钥可提取性风险**：生产环境中 `deriveMasterKey` 设置了 `extractable: true`，使得任何第三方脚本或 XSS 注入点均可通过 WebCrypto API 导出 32 字节对称主密钥；
3. **消除 Salt/Key 脱节隐患**：在 `encryptSnapshotBlob` 中，当提供 `key` 时未严格绑定对应的 `salt`，随手生成随机 Salt 填入元数据，导致跨端解密失效；
4. **下线 Rust 幽灵代码与 Cargo 依赖（Code Judo）**：`src-tauri/src/crypto.rs` 实现了 536 行代码并引入 6 个 Cargo 依赖，但从未注册为 Tauri Command，前端完全通过 WebView 原生 WebCrypto 执行。直接下线该未消费模块，以标准 WebCrypto 为唯一真理来源。

## Decision

1. **彻底移除明文 Checksum 字段**：
   - 从 `SnapshotEncryptedBlob` 类型契约中彻底剔除 `checksum` 字段；
   - 依赖 AES-256-GCM 原生提供的 128-bit 认证标签（Auth Tag）和 AAD 绑定来验证数据完整性与抗篡改性；
   - 若服务器端或传输层需要做幂等去重，统一计算**密文的 Hash**（如 `computeSha256(blob.ciphertext)`），物理上杜绝明文特征外泄。
2. **锁死对称主密钥不可提取（`extractable: false`）**：
   - `deriveMasterKey` 中的 `crypto.subtle.deriveKey` 强制锁定 `extractable: false`；
   - 对外仅暴露受保护的 `CryptoKey` 对象，禁止任何直接导出原始对称密钥的行为；
   - 针对需要比对原始测试向量的测试工具，提供专用的测试辅助函数 `deriveRawKeyForTesting`，不污染生产代码逻辑。
3. **严密绑定 Key 与 Salt 契约**：
   - 改进 `EncryptSnapshotParams` 类型：当调用方传入派生后的 `key` 时，必须提供生成该 key 时对应的 `salt`；
   - 禁止在已提供 `key` 的情况下回退生成随机 Salt，避免写入不可解密的坏数据。
4. **下线 Rust 冗余实现与依赖清理**：
   - 移除 `src-tauri/src/crypto.rs` 文件；
   - 从 `src-tauri/src/lib.rs` 中移除 `pub mod crypto;`；
   - 从 `src-tauri/Cargo.toml` 中剔除 `aes-gcm`、`pbkdf2`、`hmac`、`sha2`、`base64`、`getrandom` 6 个依赖。
   - 确认 WebUI (React/PWA) 与 Tauri (iOS/Desktop) 在全平台上均由原生 `crypto.subtle`（基于底层 C++/BoringSSL/CommonCrypto 硬件加速）可靠支撑。

## Accept

- [x] `SnapshotEncryptedBlob` 中不再包含明文 `checksum` 字段，服务端快照列表不再透出明文散列
- [x] `deriveMasterKey` 派生的 `CryptoKey` 属性 `extractable === false`
- [x] 移除 `src-tauri/src/crypto.rs`，`cd src-tauri && cargo check` 顺利通过且构建体积减小
- [x] `src/lib/crypto/e2ee.test.ts` 测试全部通过，且验证在 AAD 篡改或密文损坏时拒绝解密
- [x] `node scripts/verify-proposals.mjs` 校验通过

## Note

- 关联主提案：`.agents/pipelines/proposals/architecture/2026-10-18-managed-mode-architecture-reconstruction.md`
- 事实页对齐：`docs/architecture/frontend.md`（密码学边界）、`docs/architecture/tauri-shell.md`（原生接缝）
