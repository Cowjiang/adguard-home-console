# React 前端

`src/` 是 Web 与 Tauri 两条线共用的界面层，只通过 `src/lib/api.ts` 访问 AGH：浏览器里走同源 `/api/agh`，壳内走 Rust 命令 `agh_fetch`，两条路径返回同样的数据与错误形态。

代码入口：`src/main.tsx`、`src/App.tsx`、`src/lib/api.ts`、`src/lib/auth.tsx`、`src/components/ui.tsx`、`src/index.css`。

## 启动与 Provider

- `src/main.tsx` 把 `App` 挂到 `#root`（StrictMode），`src/index.css` 在入口导入。
- Provider 嵌套顺序：`AuthProvider` → `SheetProvider`（内含 `MenuHost`）→ `BrowserRouter` → 调试自动登录 + 路由表 + Toast 宿主。
- `index.html` 在首帧前写主题，避免闪白；`DebugAutoLogin` 仅在壳内 debug 构建拿到连接信息，成功后跳到 `AGH_ROUTE`。

## 路由

- `/login` 公开；其余路由挂在 `<Protected><Layout/></Protected>` 下，未配置连接时重定向登录页。
- 顶级页：`/`（概览）、`/stats`、`/top/:kind`、`/log`、`/log/detail`、`/protection` 及其子页、`/rewrites`、`/clients`、`/clients/detail`、`/clients/form`、`/settings` 及九个子页；`*` 兜底回概览。
- 顶级路由白名单在 `src/lib/routes.ts`；Tab 语义、返回入口与转场见 `docs/WEB_INTERACTION.md`。
- 移动端的详情与表单是独立子页（状态经 `location.state` 传递），桌面端在同一入口渲染居中弹层；缺少 `location.state` 时渲染空态。

## 状态与配置

- 会话状态集中在 `src/lib/auth.tsx` 的 context：`cfg`、`status`、`connecting`、`error`、`theme`；`SvrConfig` 为 `{url, username, password}`。
- localStorage 键：`agh.console.cfg.v1`（连接配置）、`agh.console.theme.v1`（主题）、`agh.services.v1`（拦截服务目录缓存）。
- `connect` 去掉尾部斜杠后 `GET /status` 探测，校验 `version` 才落盘；401/403 归一到固定文案；启动时若有已存配置自动探测一次。
- 未配置连接时受保护路由跳登录页，页面把 SWR key 传 `null` 表示不请求。

## API 客户端

- `api(cfg, path, {method, body, signal})` 是唯一出口，默认 GET。
- 壳内判据是 `window.__TAURI_INTERNALS__`，命中则 `invoke('agh_fetch', …)`，IPC 层失败映射为 502。
- 浏览器分支请求 `/api/agh<path>`，带 `X-AGH-Target` 与 Basic `Authorization`。
- 非 2xx 抛 `ApiError`，正文按 `error`、`message`、前 200 字节、`HTTP <n>` 依次取。
- SWR 统一 fetcher 是 `swrFetcher`，key 形态 `['<简称>', cfg, '<agh path>']`；`qs()` 生成 query，数组值重复追加、空值跳过。
- AGH 响应类型集中在 `src/lib/api.ts`，字段契约见 `docs/AGH_API.md`。

## 页面

| 页面 | 职责 | 主要接口 |
| --- | --- | --- |
| `src/pages/Dashboard.tsx` | 概览：防护卡、指标、趋势、构成、排行 | `/stats`、`/clients`、`POST /protection` |
| `src/pages/StatsPage.tsx`、`src/pages/TopListPage.tsx` | 完整统计与榜单全量 | `/stats` |
| `src/pages/QueryLog.tsx`、`src/pages/LogDetailPage.tsx` | 实时日志、翻页、单条详情与一键加规则 | `/querylog`、`/filtering/status`、`POST /filtering/set_rules` |
| `src/pages/Protection.tsx` | 过滤功能总览：开关、刷新、重写与服务拦截入口 | `/filtering/status`、`POST /filtering/config`、`POST /filtering/refresh` |
| `src/pages/FiltersPages.tsx` | 过滤器与白名单 CRUD、自定义规则、服务拦截、DNS 重写、规则检测 | `/filtering/*`、`/blocked_services/*`、`/rewrite/*` |
| `src/pages/Clients.tsx`、`src/pages/ClientDetailPage.tsx`、`src/pages/ClientFormPage.tsx` | 客户端列表、详情与增删改 | `/clients`、`/stats`、`/clients/{add,update,delete}` |
| `src/pages/Settings.tsx`、`src/pages/AdvancedSettings.tsx` | 设置分组及其子页：查询日志与统计、系统、外观、连接、DNS、访问、加密、DHCP | `/querylog/config`、`/stats/config`、`/dns_info`、`/access/*`、`/tls/*`、`/dhcp/*` |

## 组件与样式

- `src/components/` 只有六个文件：`ui.tsx`（基础控件与浮层）、`Layout.tsx`（全局布局与导航）、`charts.tsx`（纯 SVG 图表）、`ProtectionCard.tsx`、`LogDetail.tsx`、`ClientDetail.tsx`。
- 弹层一律屏幕居中：底部上滑会被原生 TabBar 遮挡；开启用双 `requestAnimationFrame` 触发过渡，关闭延时 260ms，期间锁 `body` 滚动。
- 苹果移动端的单选项渲染真实 `<select>` 覆盖层（`src/lib/nativePickers.ts`），其余设备用锚定菜单。
- 样式是 Tailwind 4 单行入口加 `@theme inline` 变量映射；深浅主题各自定义一组 CSS 变量；材质、动效与路由转场都是 `src/index.css` 里的具名类。

## 平台分支

- 判壳统一看 `__TAURI_INTERNALS__`；iOS 壳另用 `isAppleMobile()`（UA 加 Apple vendor），桌面断点固定 `(min-width: 1024px)`。
- 壳内启用原生 TabBar（成功后置 `data-native-tabbar`，失败回退 CSS 标签栏）与原生玻璃返回按钮；自研边缘侧滑只在 iOS 壳且非桌面时生效，实现在 `src/lib/routeTransition.tsx`。
- 移动端与桌面端的分叉集中在三处：详情与表单进子页还是弹层、列表用卡片还是表格分页、导航用 TabBar 还是侧边栏。

## 契约归一化

- `KVMap` 兼容字典与单键对象数组两种形态；`top_*` 的归一在概览、统计、榜单三处各自实现。
- `top_clients` 的键可能是 `name`、`IP` 或 `name|IP`，由 `src/components/ClientDetail.tsx` 按候选键求和。
- duration 与 interval 单位不统一：`POST /protection` 提交前把秒换成毫秒，`querylog`/`stats` 配置是毫秒，`filtering.interval` 直接按小时；`elapsedMs` 是字符串，用前先 `Number()`。
- `/rewrite/list` 兼容裸数组与 `{total}`；`/clients` 的 `clients`/`auto_clients` 可空，统一按空数组处理；DHCP `lease_duration` 按秒展示与编辑。
- 拦截服务目录失败时回退 localStorage 缓存；日志的 reason 元数据与筛选分组集中在 `src/lib/constants.ts`。
