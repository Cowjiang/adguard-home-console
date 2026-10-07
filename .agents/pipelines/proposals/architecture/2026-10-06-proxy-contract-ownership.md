# 上移 AGH 代理契约为前端持有的接口，Express/Rust 作为可替换实现

**Class:** architecture
**Status:** implemented
**Date:** 2026-10-06
**Updated:** 2026-10-06（实现落地于分支 refactor/proxy-contract：夹具 14 场景、双 runner、kind 信封、D1 修正；原 testing 草稿并入本提案）
**Source:** 用户方向（2026-10-06 会话）；架构审核发现 W1「双 Adapter 契约只靠镜像注释维持」

## Goal

`proxyAGH`（Express）与 `agh_fetch_impl`（Rust）是同一 AGH 代理 Interface 的两个 Adapter，今天契约靠两侧镜像注释维持，且 Express 侧零测试。目标：把契约**上移为前端边界持有的显式接口**——`src/lib/api.ts` 是契约的所有者与定义处，两个 Adapter 是该接口的可替换实现，行为由同一份场景夹具在两端验收。附带把硬编码在 Adapter 里的 4 条中文错误文案收进前端 i18n（修复英文用户看到中文错误的语言缺陷）。

不可上移的部分（先说清楚边界）：重定向跟随、凭据同主机钉死、backstop 超时必须留在 Adapter 内——前者受同源约束（浏览器自行跟随重定向会把请求发去 AGH 主机，CORS 拦死响应），后两者是安全与资源语义。因此「前端持有」指**定义权 + 验收权**在前端边界，不是运行时执行在前端。

## Decision

1. **接口的形态：类型信封 + 行为夹具，不做 IDL/codegen。** 跨语言边界上能固定的只有两种物：
   - 类型信封：`api.ts` 定义 `AghProxyRequest`（method/target/auth/path/body 的构造规则）与 `AghProxyResult`（`{status, contentType, bodyText}`）；Adapter 头注释指向该定义，不再各自复述语义。
   - 行为夹具：一份声明式场景文件，两个薄 runner（node:test / cargo test）各自解释执行，两端必须对同一场景全绿。
   否决 IDL/codegen：契约的本质是行为（重定向、超时、错误形状），codegen 只能钉形状且引入构建依赖；否决运行时鸭子类型：跨语言不可行。
2. **结果信封加机器可读错误 `kind`。** Adapter 生成的错误 body 从 `{error: "中文文案"}` 改为 `{error, kind}`，`kind ∈ missing_target | invalid_target | timeout | cross_host_redirect | invalid_redirect | network`。4 条镜像中文文案（目标地址必须是…/缺少 X-AGH-Target 头/上游重定向到其他主机…/连接超时…）从两个 Adapter 中删除，迁为 i18n key；`api.ts` 按 kind 映射本地化文案（`ApiError` 增加 `kind` 字段）。上游透传的错误（AGH 自己的 4xx/5xx body）不做映射，原样透出。
3. **行为夹具单一来源：`contract/agh-proxy.contract.json`。** 仓库根新增 `contract/`（三端共享的测试资产，与 docs/ 同级），场景声明式描述：请求（method/path/target/auth）+ origin 脚本（每个 origin 按命中次序的应答序列）+ 期望（status/kind/origin 所见的 path+auth+body）。占位符 `{originA}/{originB}` 由 runner 启动时解析为临时端口。两个 runner 各约百行解释器：`server/proxy.test.mjs`（node --test，Node 24 内建，零新依赖）与 `proxy.rs` tests 内的 tokio 版。场景 id 稳定（s01…），测试输出可交叉对照。
4. **D1 修正作为对齐前提。** 超时档位键控统一为「剥除 query 后的路径段」（Express `req.path` 现状为准，Rust `timeout_for` 改）：`timeoutFor` 两端各为纯函数并配单测（含「marker 只在 query」反例）；25s/120s 级别不做端到端夹具（太慢），超时→502/kind=timeout 的端到端行为用可注入 backstop 超时验证。
5. **Express 侧抽出 `server/proxy.mjs`。** 导出工厂（可注入 backstop 超时，默认 25s/120s），`index.mjs` 只留 env/绑定/静态托管——依赖注入而非创建，测试才能起随机端口。
6. **允许差异显式记录（不进夹具）**：Express 的 `express.json` 4mb 上限（超限 413、坏 JSON 400，Express 独有错误面，Express 侧测试单独钉住）；`AghFetchResult.content_type` 为死字段（保留、注明前端未消费）；上游错误文本透传不映射。写入两侧实现头注释与 `docs/architecture/web-runtime.md`。
7. **不做的**：IDL/codegen（决策 1）；body 上限统一；运行时多态；`content_type` 删除。

## 契约项 → 验收方式对照

2026-10-06 深入分析的差异矩阵（15 项）收敛为三类验收：

| 契约项（矩阵 #） | 验收方式 |
| --- | --- |
| 路径归一化(1)、scheme 校验(2)、缺 target(3)、同主机重定向跟随/路径重放/凭据重放(4)、相对 Location(5)、跨主机拒绝(6)、3 跳上限(7)、303 透传(8)、错误形状(11)、头白名单/GET-HEAD 无 body/每跳独立超时(14,15) | 夹具场景，两端同文件驱动 |
| 超时分档(9, D1)、超时→502 映射(10) | `timeoutFor` 纯函数单测（两端）+ 可注入超时的端到端场景 |
| body 上限与 413/400(12)、content_type 死字段(13) | 允许差异：Express 侧单独断言 / 注释标注 |
| 4 条镜像中文文案 | 从 Adapter 删除，i18n key + api.ts kind 映射（中英双语断言） |

## Accept

- [x] `contract/agh-proxy.contract.json` 场景 ≥12 条覆盖上表第一行全部契约项；`npm run test:server` 与 `cargo test`（无需 mock-agh）各自加载**同一文件**全绿
- [x] 两个 Adapter 源码中不再出现镜像文案与镜像语义注释（头注释改为指向 `api.ts` 契约段与夹具路径）
- [x] `kind` 枚举落地：`ApiError.kind`、zh/en i18n key、`api.ts` 映射；离线/跨主机重定向/坏地址三类场景的错误 toast 输出与界面语言一致
- [x] D1 落地：两端 `timeoutFor` 按剥 query 路径判定，「marker 只在 query」反例单测存在
- [x] `server/proxy.mjs` 抽出后 `index.mjs` 行为不变（`pnpm build` + `pnpm start` 代理与静态托管冒烟）
- [x] 允许差异写入两侧头注释与 `docs/architecture/web-runtime.md`；`cargo test`、`pnpm check`、`pnpm test`、`pnpm build` 全绿

## Note

- **差异矩阵（分析证据，2026-10-06）**：
  | # | 契约点 | Express (`server/index.mjs`) | Rust (`src-tauri/src/proxy.rs`) | 状态 |
  | --- | --- | --- | --- | --- |
  | 1 | 路径归一化 | `originalUrl.replace(/^\/api\/agh/)`（:69） | `normalize_path`（:50-63，多接受裸 `/status`/`/control`/空，前端不使用） | 镜像 |
  | 2 | target scheme 校验 → 400 | :64-66 | :67-75 | 镜像 |
  | 3 | 缺 target → 400 | 头缺失（:112） | 空串（:119-121） | 镜像 |
  | 4 | 同主机重定向：换 origin、重放原路径、重放 Authorization | :94-99 | :80-92 + 循环 | 镜像 |
  | 5 | 相对 Location 解析 | `new URL(loc, upstream)` | `Url::parse or join` | 镜像 |
  | 6 | 跨主机拒绝 → 502 | :96-98 | `redirect_target` | 镜像 |
  | 7 | 3 跳上限后透传 | `redirects < 3` | 同 | 镜像 |
  | 8 | 303/304 原样透传 | `[301,302,307,308]` | `REDIRECT_CODES` | 镜像 |
  | 9 | 超时分档 25s/120s | 键控 `req.path` **不含 query**（:88） | 键控 `path_with_query` **含 query**（:95-101） | **D1** |
  | 10 | 超时 → 502 + 文案 | `TimeoutError`（:105） | `e.is_timeout()`（:162-164） | 镜像 |
  | 11 | 错误形状 `{error}` | catch-all 502（:104-107） | `AghFetchResult::error` | 形状镜像；文案仅 4 条镜像，其余漂移 |
  | 12 | body | `express.json 4mb`，超限 413、坏 JSON 400 | 原样转发，无上限 | Express 独有错误面 |
  | 13 | 响应 Content-Type | `res.type(ct)` 透传 | 返回 `content_type` 但 `api.ts` 未消费（api.ts:49-62） | 观察等价，死字段 |
  | 14 | 转发头白名单 | :71-74 | :147-155 | 镜像 |
  | 15 | GET/HEAD 无 body、每跳独立超时、其余头不透传 | ✓ | ✓ | 镜像 |
- **实证探针**：`_probe/proxy-contract-probe.mjs`（本机专用）。实测：重定向落地路径=原路径且 Authorization 重放、相对 Location 可解析、跨主机 502、303 透传、`req.path` 剥 query、JSON 解析→重序列化字节等价、>4mb→413 `entity.too.large`、坏 JSON→400 `entity.parse.failed`、ftp target→400。探针还暴露隐含前提：**重定向上游必须对同一路径给出 200**（AGH http→https 即此形态；mock 的 `MOCK_REDIRECT_TO`+`__redirect-test` 缝按此设计，scripts/mock-agh.mjs:505-515），夹具的 origin 脚本需按「同路径首击 302、再击 200」建模。
- **Rust 侧既有测试**（proxy.rs:242-437）：normalize/origin/redirect_target/timeout 单测 + mock smoke + 端到端重定向 3 例 + 黑洞路由超时；改写为夹具 runner 后这些用例并入场景文件，纯函数单测（timeoutFor 等）保留原生形态。
- 实施时的文档同步：`docs/architecture/web-runtime.md`（代理语义与允许差异）、`docs/architecture/tauri-shell.md`（若提及 agh_fetch 语义）、根 `AGENTS.md`（新增 `contract/` 目录一行）；`AGH_ROUTE`/mock 缝不动。
- 提案于 2026-10-06 由本机草稿升格入库；差异矩阵、实证探针结果与「契约作为前端接口」的方案取舍同日产出。实施分支 `refactor/proxy-contract`。
