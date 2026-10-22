# Web/PWA 运行时

**Status:** current
**Updated:** 2026-10-21

生产形态只有一个 Node 进程：`server/index.mjs` 托管 `dist/`、把 `/api/agh/*` 反代到目标 AGH，并在托管模式下提供 `/api/managed/*` 零知识盲存储。开发形态是 Vite dev server 加同一个进程。

代码入口：`server/index.mjs`、`server/managed.mjs`、`vite.config.ts`、`index.html`、`package.json`。

## 进程与监听

- 默认端口 8787，由 `PORT` 覆盖；`pnpm start` 与 `pnpm dev:server` 都是 `node server/index.mjs`。
- `HOSTS` 是逗号分隔的绑定地址，既接受 IPv4 字面量也接受网卡名（如 `tailscale0`）；为空时监听全部网卡。
- 网卡名条目经 `os.networkInterfaces()` 解析；地址变化时每 60 秒轮询并重新绑定，网卡暂无 IPv4 或端口占用时 10 秒后重试。
- 启动前加载仓库根 `.env`，不覆盖已存在的环境变量；`AGH_DEFAULT_URL` 经 `GET /api/config` 作为默认实例地址下发给前端。
- 托管模式盲存储数据目录按优先级解析：`options.dataDir > env.AGH_DATA_DIR > env.DATA_DIR > <ROOT>/data`（Docker 镜像默认为 `/app/data` 并暴露为数据卷）。直连模式下服务端不产生任何磁盘写入。
- 更新渠道与升级状态使用 `AGH_STATE_DIR`（回退 `AGH_DATA_DIR`、`/var/lib/agh-console`、用户状态目录），与更新检查、自升级共用，详见 `docs/architecture/build-and-release.md`。

## 路由

| 路由 | 行为 |
| --- | --- |
| `GET /api/health` | `{ok, name, time}` |
| `GET /api/config` | `{defaultUrl}` |
| `GET /api/system/version` | 版本清单检查；渠道来自查询参数、持久化状态或环境默认值 |
| `POST /api/system/channel` | 持久化目标更新渠道（需 `AGH_ENABLE_SELF_UPGRADE`） |
| `POST /api/system/upgrade`、`GET /api/system/upgrade/status` | 自升级触发与状态（同一开关），详见 `docs/architecture/build-and-release.md` |
| `app.use('/api/managed', …)` | 托管模式零知识盲存储（实例清单与端侧 E2EE 密文快照），持久化至 `AGH_DATA_DIR`（默认 `<ROOT>/data`） |
| `app.use('/api/agh', …)` | AGH 代理，见下节 |
| `express.static(dist, {maxAge:'1h', index:false})` | 静态资源缓存 1 小时 |
| SPA 回退 | 非 GET 或 `/api/` 前缀放行；其余返回 `dist/index.html`，文件缺失时 503 |

全局中间件：`express.json({limit:'4mb'})`；CORS 允许任意来源、`Content-Type`/`Authorization`/`X-AGH-Target` 三个头，OPTIONS 直接 204。

## AGH 代理

代理逻辑在 `server/proxy.mjs`（`createAghProxy()`），是前端契约（`src/lib/api.ts`，场景夹具 `contract/agh-proxy.contract.json`）的两个 Adapter 之一；`index.mjs` 只负责装配。

- 目标实例由请求头 `X-AGH-Target` 指定；缺失或不是 http(s) 时直接 400，不猜默认值。
- 路径映射为 `<origin>/control/<path>`，query 原样保留。
- 只向 AGH 转发 `Authorization` 与 `Content-Type`；非 GET/HEAD 且客户端未给 Content-Type 时补 `application/json`。
- 请求体经 `express.json` 解析后重新序列化，响应体全量读取后透传——两端都不是流式。
- 上游 301/302/307/308 手动跟随，最多 3 次；跟随只取 `location` 的 origin（原 path 与 query 丢弃），且**仅限同主机**：每次跟随都会重放 `Authorization`，跳到别的主机等于把管理密码交给对方，因此跨主机重定向直接 502。
- 超时 25 秒，按剥除 query 后的路径段判定；路径含 `/filtering/refresh` 时放宽到 120 秒。
- 代理自身生成的失败统一为 `{error, kind}` JSON（400/502）：`kind` 是机器可读枚举（`missing_target`/`invalid_target`/`timeout`/`cross_host_redirect`/`invalid_redirect`/`network`），用户文案由前端 `api.ts` 按 kind 走 i18n（`proxy.*` 词域），适配器不携带文案；上游响应（含其错误）原样透传。密码与 `Authorization` 不写日志。
- 与 Rust Adapter 的允许差异：请求体经 `express.json({limit:'4mb'})`，超限 413、坏 JSON 400（Rust 侧走本地 IPC 无上限）。
- 契约由 `npm run test:server` 驱动同一份场景夹具验收（Rust 侧在 `cargo test` 里加载同一文件）。

## 开发与生产

| 场景 | 命令 | 组成 |
| --- | --- | --- |
| 开发 | `pnpm dev:all` | Vite 5173 + 后端 8787；Vite 把 `/api` 代理到 `127.0.0.1:8787` |
| 只调前端 | `pnpm dev` | 只有 5173，没有 API 代理 |
| 生产 | `pnpm build` + `pnpm start` | 8787 托管 `dist/` 并代理 `/api/agh` |

- `TAURI_DEV_HOST` 让 Vite 监听局域网地址供真机壳调试，并把 HMR 指向 5174。
- 仓库没有 Web App Manifest、service worker 或离线缓存；`index.html` 在首帧前读 `agh.console.theme.v1` 写入主题，并挂了启动错误面板。
- 前端构建目标 `es2020`，产物落在 `dist/`。
