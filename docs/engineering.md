# 工程约束与已知边界

**Status:** current
**Updated:** 2026-10-06

## 实现约束

- React Hooks 必须在条件返回之前调用。`src/lib/api.ts` 的 `swrFetcher` 接受只读三元组；新增 SWR 调用沿用它。
- 所有 AGH `duration` / `interval` 字段以毫秒为单位，见 [API 契约](agh-api.md)。`stats.top_*` 使用单键对象数组，消费前需归一。
- Express 4 的 AGH 代理注册为 `app.use('/api/agh', handler)`（handler 来自 `server/proxy.mjs` 的工厂）。`app.all('/*path')` 不匹配所需路径。
- `/filtering/refresh` 可能下载大量规则，因此 Express 与 Rust 代理都有单独的长超时分支（按剥除 query 后的路径段判定，两端共用同一条规则与单测）。
- 代理契约（Express/Rust 双 Adapter）以 `src/lib/api.ts` 为唯一书面定义，行为由 `contract/agh-proxy.contract.json` 钉住；修改代理语义必须先改夹具，再让两端变绿。适配器不携带用户文案，错误只报 `kind`。
- 密码和 `Authorization` 不写入日志。Web/Tauri 的连接配置目前在本地 `localStorage`；签名值在被忽略的本地文件。

## i18n 约定

- 词典在 `src/lib/i18n/locales/`，按域拆文件（`common`、`nav`、`agh`、`charts`、`units`、`login`、`dashboard`、`clients`、`querylog`、`filters`、`protection`、`stats`、`settings`、`advanced`、`proxy`），`zh` 是基准语言，`en` 与其类型同构（`en: typeof zh`）：**en 缺 key 会在 `pnpm check` 报错**，新增中文文案后必须同步补英文。
- 组件经 `useTranslation()` 的 `t()` 取文案；非 React 上下文（`format.ts`、`auth.tsx`）用 `src/lib/i18n` 导出的 `i18n.t()`。带变量的 key 用 `{{name}}` 插值并显式传参（如 `t('clients.deleteConfirmTitle', { name })`），不要字符串拼接。
- 语言解析链在 `src/lib/i18n` 的 `resolveLang()`：存储值 `zh|en|auto`（`agh.console.lang.v1`），`auto` 与缺省按 `navigator.languages` 顺序匹配 → **英文兜底**（浏览器跟随浏览器语言；iOS WKWebView 的 `navigator.languages` 跟随系统语言）；`index.html` 首帧引导脚本持有一份同逻辑内联副本与同值文档标题，改动语言列表、存储键或标题时**两处必须同步**。
- 数字/日期经 `src/lib/format.ts` 走 `Intl` 并跟随当前语言；单位词（天/小时/分钟/秒等）在 `units` 域，时长/相对时间复数用 i18next 的 `_one/_other` 后缀，zh 两份同值（zh 基数规则恒为 other）。
- AGH 枚举类标签（`REASON_META`、`LOG_FILTERS`）与 tab 标题存词典 key 而非文案，展示处 `t()` 翻译；Tauri 原生 TabBar 标题在语言切换后由 `useNativeTabBar` 的 `languageChanged` 副作用重新下发。
- 代码注释、`docs/`、commit message 保持中文，不属于 i18n 范围；语言名（中文 / English）在语言选择器里以各自原文展示，不翻译。

## UI 实现边界

- `preserveAspectRatio="none"` 会横向拉伸 SVG 的 `<text>` 和 `<circle>`；图表轴标签与 hover 数据点使用 HTML 叠层，线条使用不缩放描边。
- `.field:focus` 只改变 `background-color`，避免 `background` 简写重置选择框的背景箭头。
- `Switch` 的 knob 位移由 CSS transition 控制；给同一 `transform` 再加 keyframe animation 会抢占过渡。
- 源码里 `backdrop-filter` 只写不带前缀的一条：手写的 `-webkit-backdrop-filter` 会被构建链当同一属性去重、只留前缀那条，而现代 Chromium 已移除该别名，会让标签栏、浮层与 tab 透镜的模糊静默失效；构建产物会自动补出两条。
- 苹果端的原生 `<select>` 覆盖层（`PickSelect`）必须带 `overflow-hidden`：WebKit 会把 `<option>` 当真实盒子按文字宽度布局，长选项（客户端页的「请求数从多到少」）会溢出被压到 56pt 的控件并**撑宽整个文档**，页面因此能左右拖动。典型症状是文档 `scrollWidth` 大于视口而没有任何元素的 rect 越界。
- 首屏加载与正常内容共用稳定的根节点，避免数据抵达时重挂载并重播页面入场动画。概览骨架与内容的淡入由 `content-in` 负责。
- 当前 `server/index.mjs` 的 `express.static` 设置了一小时资源缓存；改动 HTML 缓存策略时需单独检查 `/index.html` 是否被静态中间件先拦截。

- 顶栏原生控件与自定义按钮互斥：原生接管时 CSS 按钮只留 `visibility:hidden` 占位，转场快照克隆里也不补显（否则侧滑揭示的旧页会露出自定义胶囊）。
- 转场快照克隆会带同一批 `data-*` 属性且在 `#root` 内、文档顺序先于 portal 到 `body` 的实时节点，因此手势/转场查询实时元素必须限定 `document.body.querySelector(':scope > [data-floating-nav]')`，并在克隆上摘掉该属性。
- Tauri v2 插件新增命令除 `invoke_handler` 外必须登记插件 `build.rs` 的 `COMMANDS` 与 `permissions/default.toml`，否则 `invoke` 被静默拒绝（调用方的 `catch` 会吞掉）。

## 发布

- 推送 `main` 触发 `.github/workflows/release.yml`：构建后把 `dist/`、`server/`、`package.json` 打包为 `agh-console.tar.gz`，发布为 tag `v0.1.0-dev.<YYYYMMDD>.<短 sha>` 的 Release。纯 `docs/**`、`.agents/**`、`**.md` 推送由 `paths-ignore` 跳过，也可用 `workflow_dispatch` 手动触发。
- Release 说明由 `scripts/release-notes.sh` 生成：优先列出本次推送新增的提交，`before` 不可用时回退到最近的祖先 tag，再回退到最近 20 个提交。
- Release 与 tag **不删除**，全部长期保留，既是回滚点，也是后续「相对上一版」变更列表的基线。同一提交重复运行会跳过创建，保持幂等。

## 验证入口

- 初次安装：`pnpm install`（包管理器是 pnpm，版本钉在 `package.json#packageManager`，`corepack enable` 即可；不再有 `package-lock.json`）。Web 开发使用 `pnpm dev:all`，同时启动 Vite 与 API 代理；生产模式先 `pnpm build`，再 `pnpm start`。
- 文档或提案路径、分类、状态变化：`node scripts/verify-proposals.mjs`。
- Web 代码：`pnpm check`、`pnpm test`、`pnpm build`。测试用 vitest（include 限定 `src/`），覆盖纯逻辑（契约归一、存储迁移等）；测试文件与被测源文件同目录（`*.test.ts`），随 `pnpm check` 一起做类型检查；组件渲染与端到端仍靠手测与 mock。
- 代理契约：`npm run test:server`（node:test，驱动 `contract/agh-proxy.contract.json` 对 Express 适配器）；同一份夹具在 `cargo test` 中驱动 Rust 适配器。
- pnpm 12 默认启用供应链策略：**发布未满 `minimumReleaseAge` 的版本会被拒绝安装**（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`）。这不是 lockfile 坏了，也不要关策略：`pnpm clean --lockfile && pnpm install` 重新解析会挑隔离期外的版本，或等窗口过去。`--frozen-lockfile`（CI 与 Docker）安装时会复检该策略。
- Rust 测试：`cd src-tauri && cargo test`（契约 runner 自起临时 origin，不再依赖 mock-agh；mock 仅用于本地联调与多实例演练）。
- 多实例与代理策略验证：再起一个 `node scripts/mock-agh.mjs`，用 `PORT`/`HOST` 换监听地址（默认仍是 127.0.0.1:3990；真机访问需要显式设 `HOST`），并用 `MOCK_SCALE`、`MOCK_REVERSE`、`MOCK_AVG_TIME`、`MOCK_VERSION`、`MOCK_TIME_UNITS`、`MOCK_STATS_INTERVAL` 让第二实例的数据可区分。`MOCK_REDIRECT_TO` 配合 `GET /__redirect-test` 用于验证代理的跨主机重定向拒绝（该路径仅测试用，不属于 AGH 契约）。
- iOS 工程生成与构建使用 `scripts/ios-signing.sh`：生成后校验 pbxproj 的关键设置（图标、签名、bundle id、部署目标、XcodeGen 预设哨兵），构建前缺工程时自动重建；机器专属的构建故障与修复记录在 `.agents/reviews/`，不作为通用构建步骤。
