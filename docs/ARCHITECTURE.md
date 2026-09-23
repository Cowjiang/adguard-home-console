# 架构与请求路径

## 交付线

| 端 | 入口 | 请求 AGH 的路径 |
| --- | --- | --- |
| Web/PWA | `src/` + `server/` | 浏览器请求同源 `/api/agh/*`；Express 转发到目标 AGH 的 `/control/*` |
| Tauri 2 | `src/` + `src-tauri/` | `src/lib/api.ts` 在壳内调用 Rust 命令 `agh_fetch`，由 Rust 发起上游请求 |
| 纯 SwiftUI iOS | `ios/` | `URLSession` 直连 AGH `/control/*` |

AGH 不提供浏览器所需的 CORS 响应头，Web/PWA 需要同源代理。原生 URLSession 不受浏览器 CORS 限制。Tauri WebView 与 Web 端共用 React 页面，代理语义由 Rust 实现。

## Web/PWA

- `server/index.mjs` 默认监听 8787，托管 `dist/`，并处理 SPA 路由回退。`npm run dev:all` 同时运行 Vite 5173 与代理服务。
- `/api/agh/*` 映射为 `/control/*`。目标由 `X-AGH-Target` 头指定，Basic Auth 经 `Authorization` 头透传。
- 代理最多跟随三次 301/302/307/308 重定向；普通请求超时 25 秒，`/filtering/refresh` 超时 120 秒；连接和超时错误映射为 502。
- `HOSTS` 可限制监听地址，支持 IP 或网卡名；网卡地址变化时服务端重新绑定。
- 服务器配置来自环境变量及可选的根目录 `.env`。实例地址和凭据不写入仓库文档。

## 前端边界

- 请求统一通过 `src/lib/api.ts` 的 `api()`；SWR 统一使用 `swrFetcher`，参数是只读三元组 `[name, cfg, path]`。
- `api()` 在 `window.__TAURI_INTERNALS__` 存在时走 `agh_fetch`，否则走同源 `fetch`；两条路径向调用方返回同样的 JSON 或 `ApiError`。
- `src/lib/auth.tsx` 管理连接配置；Web/Tauri 的连接信息使用本地 `localStorage` 键 `agh.console.cfg.v1`。
- 路由总表在 `src/App.tsx`；未登录访问受保护页面会跳到 `/login`。顶级页面包括概览、统计、过滤器、日志、客户端和设置。

## 当前目录职责

- `src/`：React 页面、组件、API 客户端及路由工具。
- `server/`：Express 代理与静态托管。
- `src-tauri/`：Tauri 壳、Rust 代理、平台资源。
- `ios/`：独立的 SwiftUI 应用。
- `scripts/mock-agh.mjs`：本地 AGH v0.107.79 契约模拟。
