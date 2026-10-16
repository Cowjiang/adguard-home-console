# React 前端

**Status:** current
**Updated:** 2026-10-17（路由与页面表补 `/logs/analytics`，子页/弹层形态规则对齐交互页）

`src/` 是 Web 与 Tauri 两条线共用的界面层，只通过 `src/lib/api.ts` 访问 AGH：浏览器里走同源 `/api/agh`，壳内走 Rust 命令 `agh_fetch`，两条路径返回同样的数据与错误形态。

代码入口：`src/main.tsx`、`src/App.tsx`、`src/lib/api.ts`、`src/lib/session/instances.ts`、`src/lib/session/auth.tsx`、`src/components/ui/`、`src/index.css`。

## 启动与 Provider

- `src/main.tsx` 把 `App` 挂到 `#root`（StrictMode），`src/index.css` 在入口导入。
- Provider 嵌套顺序：`AuthProvider` → `SheetProvider`（内含 `MenuHost`）→ `BrowserRouter` → 调试自动登录 + 路由表 + Toast 宿主。
- `index.html` 在首帧前写主题，避免闪白；`DebugAutoLogin` 仅在壳内 debug 构建拿到连接信息，成功后跳到 `AGH_ROUTE`。

## 路由

- `/login` 公开（首启引导，无实例时才可见）；其余路由挂在 `<Protected><Layout/></Protected>` 下，未配置任何实例时重定向登录页。
- 顶级页：`/`（概览）、`/top/:kind`、`/logs`、`/logs/detail`、`/logs/analytics`、`/protection` 及其子页、`/rewrites`、`/clients`、`/clients/detail`、`/clients/form`、`/settings` 及十个子页（实例列表 `/settings/server` 与编辑页 `/settings/server/edit`）；`*` 兜底回概览。`/stats` 重定向回概览（原统计分析页已并入概览的桌面区块）。
- 顶级路由白名单在 `src/lib/nav/routes.ts`；Tab 语义、返回入口与转场见 `docs/web-interaction.md`。
- 移动端的「浏览信息」型内容（日志详情、日志透视分析、客户端详情）与客户端表单是独立子页（状态经 `location.state` 传递），桌面端在同一入口渲染居中弹层；缺少 `location.state` 时渲染空态。浮层只承载确认 / 表单 / 选择类，其他设置页表单仍走弹层，形态规则见 `docs/web-interaction.md`。

## 多实例会话与配置

- `src/lib/session/instances.ts` 持有实例模型与存储：`Instance = {id, label, endpoints[]}`（MVP 每实例 1 个 endpoint，数组为 Away Connection 预留），运行时 `cfg` 仍是活动实例活动 endpoint 的扁平 `{url, username, password}`，页面层零改动。
- localStorage 键：`agh.console.cfg.v2`（`{instances, activeId}`）、`agh.console.cfg.v1`（迁移后保留，供旧版降级读取）、`agh.console.theme.v1`（主题）、`agh.services.v1.<instanceId>`（拦截服务目录缓存，按实例键控）。
- `AuthProvider` 持有 store 与 per-instance 会话 `{status, offline, lastProbeOk}`；对外的 `cfg`/`status`/`offline` 由活动实例派生。`connect(cfg, opts)` 先 `GET /status` 验证再落盘：带 `id` 原位编辑（不改变活动指针），否则按 `url+username` 匹配更新或新增实例（默认激活；`activate:false` 用于壳内调试自动登录第二实例）。`removeInstance` 删除后回退到列表首台，删空回到登录页（同时清掉 v1 防止迁移复活）。
- `/status` 探测逐实例并发、各自 5s deadline、15s 周期；非活动实例失败时退避（15/30/60s 封顶，成功复位），活动实例不退避（离线遮罩的自愈恢复依赖 15s 节奏）。状态机在 `src/lib/session/probe.ts`（时钟注入、vitest 覆盖退避/去重/恢复），`AuthProvider` 只做 React 状态接线。
- 恢复在线与下拉刷新只重取「活动实例的全部 SWR 键 + 全部实例 /status」，不再全局 `mutate(() => true)`。
- 未配置实例时受保护路由跳登录页，页面把 SWR key 传 `null` 表示不请求。

## API 客户端

- `api(cfg, path, {method, body, signal})` 是唯一出口，默认 GET。
- 代理契约以本文件为唯一书面定义（`AghProxyRequest`/`AghProxyResult`/`AghProxyErrorKind`），Express 与 Rust 两个 Adapter 的行为由 `contract/agh-proxy.contract.json` 钉住。
- 壳内判据是 `window.__TAURI_INTERNALS__`，命中则 `invoke('agh_fetch', …)`，IPC 层失败映射为 502（kind `network`）。
- 浏览器分支请求 `/api/agh<path>`，带 `X-AGH-Target` 与 Basic `Authorization`。
- 非 2xx 抛 `ApiError`：适配器生成的失败带 `kind`，文案按 kind 走 i18n（`proxy.*` 词域），`detail` 保留技术细节；上游透传的错误正文按 `error`、`message`、前 200 字节、`HTTP <n>` 依次取。
- SWR 统一 fetcher 是 `swrFetcher`，key 形态 `['<简称>', cfg, '<agh path>']`，同一端点只用一个键名；`qs()` 生成 query，数组值重复追加、空值跳过。
- AGH 响应类型集中在 `src/lib/api.ts`，字段契约见 `docs/agh-api.md`。

## 页面

| 页面 | 职责 | 主要接口 |
| --- | --- | --- |
| `src/pages/Dashboard.tsx` | 概览：防护卡、指标、趋势、构成、排行；桌面（≥lg）另带统计分析区块。全部数据来自活动实例 | `/stats`（5s）、`/clients`、`POST /protection` |
| `src/pages/TopListPage.tsx` | 榜单全量 | `/stats` |
| `src/pages/QueryLog.tsx`、`src/pages/LogDetailPage.tsx`、`src/pages/LogAnalyticsPage.tsx` | 实时日志、翻页、单条详情与透视分析下钻、一键加规则 | `/querylog`、`/filtering/status`、`POST /filtering/set_rules` |
| `src/pages/Protection.tsx` | 过滤功能总览：开关、刷新、重写与服务拦截入口 | `/filtering/status`、`POST /filtering/config`、`POST /filtering/refresh` |
| `src/pages/FiltersPages.tsx` | 过滤器与白名单 CRUD、自定义规则、服务拦截、DNS 重写、规则检测 | `/filtering/*`、`/blocked_services/*`、`/rewrite/*` |
| `src/pages/Clients.tsx`、`src/pages/ClientDetailPage.tsx`、`src/pages/ClientFormPage.tsx` | 客户端列表、详情与增删改 | `/clients`、`/stats`、`/clients/{add,update,delete}` |
| `src/pages/Settings.tsx`、`src/pages/settings/` | 设置分组及其子页：查询日志与统计、系统、外观、实例管理（列表 + 编辑）、DNS、访问、加密、DHCP | `/querylog/config`、`/stats/config`、`/dns_info`、`/access/*`、`/tls/*`、`/dhcp/*` |

## 组件、lib 与样式

- `src/components/` 按域分组：`ui/`（基础控件与浮层，拆为 `sheet`/`menu`/`toast`/`primitives`/`atoms` 五个文件，无 re-export barrel，逐文件导入）、`layout/`（Layout 与 TopBar/TabBar/Sidebar/InstanceSwitchList/OfflineNotice）、`dashboard/`、`log/`、`clients/`、`protection/`，另有 `charts.tsx`（纯 SVG 图表）。跨页复用的组件必须落在 `components/`；页面私有且体量小的留在页面内联。
- `src/lib/` 分组：`native/`（壳能力 + `shell.ts` 统一平台判定）、`session/`（instances/auth/probe）、`nav/`（routes/navMeta/backNav/scrollToTop）；其余平铺——`api.ts` 是代理契约的唯一书面定义、import 面最大，留根作为入口。新增文件按「≥3 个文件共享同一关注点才建组」判断，平铺是默认。
- 弹层一律屏幕居中：底部上滑会被原生 TabBar 遮挡；开启用双 `requestAnimationFrame` 触发过渡，关闭延时 260ms，期间锁 `body` 滚动。
- 苹果移动端的单选项渲染真实 `<select>` 覆盖层（`PickSelect`，见 `src/components/ui/menu.tsx` 与各页的 `isAppleMobile()` 分支），其余设备用锚定菜单。
- 样式是 Tailwind 4 单行入口加 `@theme inline` 变量映射；深浅主题各自定义一组 CSS 变量；材质、动效与路由转场都是 `src/index.css` 里的具名类。

## 平台分支

- 判壳统一看 `__TAURI_INTERNALS__`；iOS 壳另用 `isAppleMobile()`（UA 加 Apple vendor），桌面断点固定 `(min-width: 1024px)`。
- 壳内启用原生 TabBar（成功后置 `data-native-tabbar`，失败回退 CSS 标签栏）与原生玻璃返回按钮；自研边缘侧滑只在 iOS 壳且非桌面时生效，实现在 `src/lib/routeTransition.tsx`。
- 移动端与桌面端的分叉集中在三处：详情与表单进子页还是弹层、列表用卡片还是表格分页、导航用 TabBar 还是侧边栏。

## 契约归一化

- `KVMap` 兼容字典与单键对象数组两种形态；归一与候选键求和在 `src/lib/stats.ts`（`toMap`、`topEntries`、`kvCount`），概览、榜单、客户端列表与详情共用。
- `top_clients` 的键可能是 `name`、`IP` 或 `name|IP`，用 `kvCount` 按候选键求和。
- duration 与 interval 单位不统一：`POST /protection` 提交前把秒换成毫秒，`querylog`/`stats` 配置是毫秒，`filtering.interval` 直接按小时；`elapsedMs` 是字符串，用前先 `Number()`。
- `/rewrite/list` 兼容裸数组与 `{total}`；`/clients` 的 `clients`/`auto_clients` 可空，统一按空数组处理；DHCP `lease_duration` 按秒展示与编辑。
- 拦截服务目录失败时回退 localStorage 缓存（`agh.services.v1.<instanceId>`，按实例键控）；日志的 reason 元数据与筛选分组集中在 `src/lib/constants.ts`。
