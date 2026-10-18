# 工程约束与已知边界

**Status:** current
**Updated:** 2026-10-18（设置页草稿在未被编辑时跟随服务端副本：判据表 `draftFollow` 带单测，消掉后台校验落地后页面停在旧值并挂假未保存标记的问题；发布线新增 `windows` job，Release 多带两件 Windows 安装包）

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

- 卡片圆角只有两档：**节级表面**（`Card`，以及它的行容器 `Group`）统一 `rounded-3xl`（24px），**行内条目/统计磁贴/提示条**用 `rounded-2xl`（16px）。`Group` 在 2026-10-18 之前覆盖成 22px，是应用里唯一并存的第三档，和其它 24px 卡在设置页、过滤器子页并排时肉眼可见，已删除该覆盖；新增按层级选档，不要再引入第三种节级圆角。
- `preserveAspectRatio="none"` 会横向拉伸 SVG 的 `<text>` 和 `<circle>`；图表轴标签与 hover 数据点使用 HTML 叠层，线条使用不缩放描边。
- `.field:focus` 只改变 `background-color`，避免 `background` 简写重置选择框的背景箭头。
- `Switch` 的 knob 位移由 CSS transition 控制；给同一 `transform` 再加 keyframe animation 会抢占过渡。
- 源码里 `backdrop-filter` 只写不带前缀的一条：手写的 `-webkit-backdrop-filter` 会被构建链当同一属性去重、只留前缀那条，而现代 Chromium 已移除该别名，会让标签栏、浮层与 tab 透镜的模糊静默失效；构建产物会自动补出两条。
- 苹果端的原生 `<select>` 覆盖层（`PickSelect`）必须带 `overflow-hidden`：WebKit 会把 `<option>` 当真实盒子按文字宽度布局，长选项（客户端页的「请求数从多到少」）会溢出被压到 56pt 的控件并**撑宽整个文档**，页面因此能左右拖动。典型症状是文档 `scrollWidth` 大于视口而没有任何元素的 rect 越界。
- 首屏加载与正常内容共用稳定的根节点，避免数据抵达时重挂载并重播页面入场动画。概览骨架与内容的淡入由 `content-in` 负责。
- 相对时间按语境分两种写法：统计卡片的值用 `relTimeShort`（en `now`/`45s`/`26h`/`1d`，zh `刚刚`/`45 秒`/`26 小时`/`1 天`，不带 ago，语义由卡片标题「上次更新」承担，绝对时间在 `title` 里），句子里的相对时间用 `relTime`（`1 day ago` / `1 天前`）。英文完整写法在最坏情况下放不进卡片的值列（22px 下 `26 hours` ≈ 92px，360px 屏可用 88px），缩写是修复溢出的关键一半。
- 时长写进「每 {{interval}} …」这类框架时用不带数量的单位词（`units.hourBare`/`dayBare`）：`every day` / `every hour` 比 `every 1 day` 自然；选择器的选项仍用 `hoursLabel` 的计数写法（`1 day`）。
- 当前 `server/index.mjs` 的 `express.static` 设置了一小时资源缓存；改动 HTML 缓存策略时需单独检查 `/index.html` 是否被静态中间件先拦截。

- 顶栏原生控件与自定义按钮互斥：原生接管时 CSS 按钮只留 `visibility:hidden` 占位，转场快照克隆里也不补显（否则侧滑揭示的旧页会露出自定义胶囊）。
- 转场快照克隆会带同一批 `data-*` 属性且在 `#root` 内、文档顺序先于 portal 到 `body` 的实时节点，因此手势/转场查询实时元素必须限定 `document.body.querySelector(':scope > [data-floating-nav]')`，并在克隆上摘掉该属性。
- Tauri v2 插件新增命令除 `invoke_handler` 外必须登记插件 `build.rs` 的 `COMMANDS` 与 `permissions/default.toml`，否则 `invoke` 被静默拒绝（调用方的 `catch` 会吞掉）。

## 变更编排与乐观更新

- 常规 mutation（请求 → 成功后 scoped revalidate → toast）一律走 `src/lib/mutation.ts` 的 `runMutation`：成功 toast 的插值经 `okVars(action 结果)` 取；失败只 toast 不抛，渲染 `ApiError.message`（适配器 kind 已在 `api.ts` 本地化），`failKey` 默认 `common.saveFailed`，返回布尔值供调用方决定后续（关 Sheet、跳转）。`invalidate` 不 await，与它所替换的逐页副本一致。
- **不**走 `runMutation` 的三类：乐观更新（见下）；带结果状态的纯查询（`check_host`、`find_active_dhcp`、`test_upstreams`、日志分页拉取、版本检查——结果要落到页面状态或另有条件文案）；两阶段的 TLS validate/configure（校验驳回有独立文案，且不得下发配置）。
- 设置页的「草稿 + 保存」统一用 `src/lib/useDraftForm.ts`：服务端副本是 dirty 基线，**未编辑过的草稿跟随服务端副本**——SWR 先用缓存渲染、再后台校验，挂载瞬间的缓存可能是旧的，落地的刷新必须重投影草稿，否则页面停在旧值并挂出假的未保存标记（判据表 `draftFollow` 在同文件内导出并单测）。草稿被编辑后不再被覆盖，只在它重新与服务端副本一致时交还跟随权。保存成功后必须**先 await refetch 再回填草稿**，让服务端的规范化结果（trim/去重后的被忽略域名、访问控制名单）成为新基线，否则这些差异会把 dirty 挂在页面上。
- 乐观更新是三种各有适用场景的习语，**不抽公共 helper**（统一成 options-bag 会产出比实现更复杂的浅接口），各自的并发防护要求：
  - **pending 镜像 + 倒计时**（`src/components/protection/ProtectionCard.tsx`）：先本地镜像开关再发请求，失败丢弃镜像回到服务端状态；开关带持续时间，镜像必须能被服务端返回的 `protection_disabled_until` 覆盖。
  - **本地副本 + 回滚**（`src/components/clients/ClientDetail.tsx`）：桌面弹层不随列表重渲染，组件持有配置副本逐字段即时保存，失败回滚到上一份副本；`useEffect([c])` 把刷新结果重灌进副本，正在编辑的字段以本地为准。
  - **pending Set + 串行队列 + 防过期写**（`src/pages/FiltersPages.tsx` 的 ServicesPage）：点击立即生效（乐观 `Set`），写入串行（`saveQueue`）避免后发先至，用 `latestIdsRef` 判定本次写入是否仍是最后一次再释放 pending，失败则 revalidate 回滚。

## 发布

一条工作流、一次构建、多消费者：`.github/workflows/release.yml` 是 `prepare → build → {release, npm, docker}`，另有 `ios` 与 `windows` 两个平台 job 挂在同一个 `prepare` 之下；版本只在 `prepare` 算一次（`.github/scripts/release-plan.mjs`），写回 `package.json` 后由 Release 产物、npm 包与镜像标签共同携带。

- 两个渠道：**nightly** 由定时任务（每天 UTC 19:17，避开整点以躲开 GitHub 的 cron 拥塞）从 `dev` 构建，版本 `<package.json 的 version>-nightly.<UTC YYYYMMDD>.<短 sha>`，Release 标 prerelease 且**只占一条**（tag 固定为 `nightly`，每次强移到最新构建后原地更新），npm dist-tag `nightly`，镜像 `<版本>`/`nightly`/`sha-<短 sha>`，**不带 `latest`**；**stable** 由 tag `vX.Y.Z` 触发，版本取自 tag，npm `latest`，镜像 `<版本>`/`X.Y`/`latest`/`sha-<短 sha>`。映射由 `pnpm test:release` 的断言钉住。
- 因此 `releases/latest`（`scripts/server-pull.sh` 读的）、npm 的 `latest` dist-tag 与镜像 `:latest` 都只属于 stable，nightly 不抢这三个位置。
- 推送 `main` 不再发布任何东西：发版动作是 `dev` → `main` 合并后，在 Actions 里对 `main` 派发 **Cut Release**（`.github/workflows/cut-release.yml`：补版本 → 写 `package.json`/`tauri.conf.json`/iOS 工程/`CHANGELOG.md` → 提交 `chore(release): vX.Y.Z` + annotated tag → 推分支与 tag 并触发 `release.yml`）。手推的 tag 若不是 `vX.Y.Z`（例如手推一个 nightly tag）会被 `prepare` 直接拒绝并说明原因。
- nightly 只在 `dev` 与滚动 tag 当前指向的提交**不同**时才发；空转的日子整条跳过，不产出空版本，也不做双架构构建。nightly 的说明正文以「上一次 nightly 的提交」为基线（滚动 tag 移动前的那个 commit），列出这一晚落了什么。
- 定时任务的定义文件必须存在于默认分支（`main`）才会触发，而 `schedule` 事件报告的 ref 是默认分支——所以 workflow 显式把 nightly 的构建 ref 解析成 `dev`，三个 job 都按解析结果 checkout，Release tag 的 `target_commitish` 也指到那个 commit。
- nightly 是「只在绿码上发」的渠道：build job 在打包前跑 `pnpm check`、`pnpm test`、`npm run test:server`、`pnpm test:release`；stable 不加这道门（沿用既有发布口径）。
- `workflow_dispatch` 默认是**干跑**（`publish=false`）：只构建、校验 npm 包、构建镜像，不创建 Release、不推送；补发才把 `publish` 设为 true。另有 `force`：勾上时忽略「`dev` 未移动」的空转判定，用于手动重跑同一提交的 nightly；定时任务不受它影响。
- Release 说明由 `.github/scripts/release-notes.sh` 生成：优先列出本次推送新增的提交，`before` 不可用时回退到最近的祖先 tag（nightly 与 stable tag 都算基线），再回退到最近 20 个提交。
- Release 与 tag **不删除**，全部长期保留，既是回滚点，也是后续「相对上一版」变更列表的基线；**唯一例外是 nightly 的滚动 tag**（`nightly`）——它每跑一次就被强移到新构建，Release 原地更新（同名资产覆盖），因此 Release 列表里恒为一条 nightly。stable 仍是「一个版本一条 tag、一条 Release」，从不覆盖。
- npm 的 `latest` 由第一个 stable 发布创建（当时为 `0.2.1`），此后 nightly 只写 `nightly` dist-tag，不会抢 `latest`。
- npm 渠道走 **trusted publishing（OIDC）**，不再有任何长期 token：`agh-console` 上配置了发布者（type github、仓库 `Cowjiang/adguard-home-console`、workflow `release.yml`、permissions `createPackage`），`release.yml` 的 npm job 用 `id-token: write` 换发布授权，npm CLI 在检测到 OIDC 环境时会优先用它。因此**不要**给该 job 加 `registry-url`（它写出的 `.npmrc` 带 token 占位符，变量未设置时 npm 会报 `Failed to replace env in config`）；仓库为 public，故同时开 `--provenance`。首次发布这件事曾卡在"包不存在时配不了 TP"上：npm 的信任配置对未创建的包一律 404，所以 `agh-console@0.2.1` 是本地发布创建出来的，之后才配上发布者。
- 镜像 tag 由 `release-plan.mjs` 输出为**全限定引用**（`ghcr.io/cowjiang/agh-console:<tag>`）：buildx 把裸 tag 当成 Docker Hub 名字，会去推 `library/<tag>` 并拿到 401——首次真实 nightly 就是这么失败的。
- `release.yml` 里的 action 一律钉在 **node24 主线**（node20 的动作会被 runner 强制降级运行并逐 job 打弃用告警）；升大版本前逐个核对本流程用到的 input 在新版里是否仍然存在，本仓没有 Dependabot 兜底。
- npm 渠道发布的就是 CI 校验过的那个 tgz：`scripts/check-npm-pack.mjs` 断言包里只有 `dist/`、`server/` 与包元数据（npm 无 `.npmignore` 时回退 `.gitignore`，而 `dist` 正被忽略，没有这条断言就会发出一个没有前端产物的包）。发布前会先查该版本是否已存在，存在就跳过；失败会让 job 变红（不再有"没配 token 就告警跳过"这条退路）。
- iOS 产物由 `release.yml` 的 `ios` job（`macos-latest`）构建：`./scripts/ios-signing.sh tauri build --target aarch64 --no-sign` 出**未签名** ipa（资产名固定 `agh-console.ipa`），安装者用自己的 Apple ID 重签；签名值与本地一致，只走仓库变量，缺省兜底 `unsigned` 与 `tauri.conf.json#identifier`。stable 恒构建，nightly 只在仓库公开或手动 `workflow_dispatch` 时构建（`github.event.repository.private == false`；私有仓库的 macOS 分钟按 10× 计费，才需要这道闸——仓库已于 2026-10-15 转为 public，nightly 因此自动构建）；`release` job 用 `!cancelled()` 接住 iOS 的失败，ipa 缺失只让运行页变红，不阻断 tarball / npm / 镜像。
- Windows 桌面产物由 `release.yml` 的 `windows` job（`windows-latest`）构建：`pnpm tauri build` 直出 NSIS 与 MSI 两件安装包，资产名固定为 `agh-console-setup.exe` 与 `agh-console.msi`，同样**未签名**（无 Windows 代码签名证书，首次运行有 SmartScreen 提示）。闸与 iOS 同条件、同理由（stable 恒构建；nightly 只在仓库公开或手动派发时构建——私有仓库的 Windows runner 按 2× 计费）；安装包里的版本取自 `tauri.conf.json`（核心版本 + 本次 run number），完整 nightly 串仍只出现在应用界面与 npm 版本里。两件都发：MSI 便于组策略/脚本分发，NSIS 便于普通用户双击安装。
- 版本只有一个来源：`release-plan.mjs --set-version <版本> <build>` 把**完整版本**写进 `package.json`（前端经 `vite.config.ts` 的 `define` 编进 `dist`，也是 npm/Release 的版本），把**核心版本 + 数字 build** 写进 `src-tauri/tauri.conf.json` 与 iOS 工程的 plist 两项——tauri 从 `tauri.conf.json#version` 派生 `apple.bundle-version`，给它 nightly 串会直接中止（`apple.bundle-version can only contain numbers`），所以那两个文件只放数字版本，完整 nightly 串只出现在应用界面与 npm 版本里（Windows 安装包的版本字段同样取自 `tauri.conf.json`，因此也只有核心版本 + build 号）。镜像用 `APP_VERSION` build-arg 传入（改上下文里的 `package.json` 会让 `pnpm install` 的缓存层每次发版重跑）；仓库内三个声明值平时与 `package.json` 同值。`src-tauri/Cargo.toml` 的 crate 版本不参与（不出现在任何产物或界面里）。
- GHCR 包的可见性**不随仓库继承**，是包设置里的独立开关（现已设为 public）：未公开时 README 里的匿名 `docker run` 需要先在目标机 `docker login ghcr.io`。

## 验证入口

- 初次安装：`pnpm install`（包管理器是 pnpm，版本钉在 `package.json#packageManager`，`corepack enable` 即可；不再有 `package-lock.json`）。Web 开发使用 `pnpm dev:all`，同时启动 Vite 与 API 代理；生产模式先 `pnpm build`，再 `pnpm start`。
- 文档或提案路径、分类、状态变化：`node scripts/verify-proposals.mjs`。
- 发版计划与 npm 包内容：`pnpm test:release`（渠道/版本/tag 映射的断言）、`pnpm check:pack`（先 `pnpm build`，打 tgz 并断言包内容）。
- Web 代码：`pnpm check`、`pnpm test`、`pnpm build`。测试用 vitest（include 限定 `src/`），覆盖纯逻辑（契约归一、存储迁移等）；测试文件与被测源文件同目录（`*.test.ts`），随 `pnpm check` 一起做类型检查；组件渲染与端到端仍靠手测与 mock。
- 代理契约：`npm run test:server`（node:test，驱动 `contract/agh-proxy.contract.json` 对 Express 适配器）；同一份夹具在 `cargo test` 中驱动 Rust 适配器。
- pnpm 12 默认启用供应链策略：**发布未满 `minimumReleaseAge` 的版本会被拒绝安装**（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`）。这不是 lockfile 坏了，也不要关策略：`pnpm clean --lockfile && pnpm install` 重新解析会挑隔离期外的版本，或等窗口过去。`--frozen-lockfile`（CI 与 Docker）安装时会复检该策略。
- 同一策略还把「哪些依赖允许跑构建脚本」记在 **`pnpm-workspace.yaml`**（`allowBuilds`，目前批准 `lefthook` 的 postinstall）。凡是脱离仓库根、只拷贝部分文件去装依赖的地方都必须带上这个文件：`Dockerfile` 的两层 `pnpm install` 因此与 `package.json`、`pnpm-lock.yaml` 一起拷贝——缺了它 `--frozen-lockfile` 直接以 `ERR_PNPM_IGNORED_BUILDS` 中止（v0.2.0 的镜像构建就是挂在第一步 `pnpm install` 上，而非 buildx 推送）。
- Rust 测试：`cd src-tauri && cargo test`（契约 runner 自起临时 origin，不再依赖 mock-agh；mock 仅用于本地联调与多实例演练）。
- 多实例与代理策略验证：再起一个 `node scripts/mock-agh.mjs`，用 `PORT`/`HOST` 换监听地址（默认仍是 127.0.0.1:3990；真机访问需要显式设 `HOST`），并用 `MOCK_SCALE`、`MOCK_REVERSE`、`MOCK_AVG_TIME`、`MOCK_VERSION`、`MOCK_TIME_UNITS`、`MOCK_STATS_INTERVAL` 让第二实例的数据可区分。`MOCK_REDIRECT_TO` 配合 `GET /__redirect-test` 用于验证代理的跨主机重定向拒绝（该路径仅测试用，不属于 AGH 契约）。
- iOS 工程生成与构建使用 `scripts/ios-signing.sh`：生成后校验 pbxproj 的关键设置（图标、签名、bundle id、部署目标、XcodeGen 预设哨兵），构建前缺工程时自动重建；机器专属的构建故障与修复记录在 `.agents/reviews/`，不作为通用构建步骤。
