# 架构

**Status:** current
**Updated:** 2026-09-23

本目录是 `docs/` 的架构分册，记录当前代码库的结构与接缝：系统由哪几条交付线组成、请求怎么走、模块怎么分工、产物怎么构建与部署。本页只作这一层的入口，说明范围与页面去向。

| 页 | 内容 |
| --- | --- |
| [Web/PWA 运行时](web-runtime.md) | Express 进程、路由、AGH 代理语义、开发与生产形态 |
| [React 前端](frontend.md) | 入口、路由表、状态与配置、API 客户端、页面与组件划分 |
| [Tauri 壳](tauri-shell.md) | Rust 命令面、权限、平台插件、与 Web 前端的接缝 |
| [SwiftUI iOS 应用](ios-app.md) | 原生应用结构、网络层、状态与工程生成 |
| [构建与发布](build-and-release.md) | 构建产物、release 工作流、部署与回滚 |

## 交付线

| 端 | 代码 | 传输层 | 访问 AGH 的路径 |
| --- | --- | --- | --- |
| Web/PWA | `src/` + `server/` | Node 进程 | 浏览器请求同源 `/api/agh/*`，Express 转发到 AGH `/control/*` |
| Tauri 2 | `src/` + `src-tauri/` | Rust | 前端调用 `agh_fetch`，Rust 直接请求 AGH |
| 纯 SwiftUI iOS | `ios/` | URLSession | 原生直接请求 AGH `/control/*` |

AGH 不返回浏览器需要的 CORS 头，Web/PWA 的同源代理是必需品；两条原生线不受此限制。Web 与 Tauri 共用同一个 React 前端，差异集中在传输层：`src/lib/api.ts` 按运行环境选择同源 `fetch` 或 Rust 命令。

## 状态与数据归属

- AGH 是唯一数据源：本仓没有自建数据库、没有服务端会话，读写都落到 AGH。
- 浏览器与壳内只存连接配置与外观偏好，服务器端只读环境变量与仓库根 `.env`。
- 连接配置的存储键、登录流程与首帧主题引导见 [React 前端](frontend.md)。

本目录只写结构与接缝，随代码更新；实现细节的取舍与踩坑留在对应主题页，不在这里重复。
