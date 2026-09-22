# AdGuard Home Console — 项目记忆(供后续会话快速恢复上下文)

> 用途:新会话先读此文件,避免重新探查。最后更新:2026-09-23

## 1. 项目概况

- **名称**:AdGuard Home Console(曾用名 AdGuard Console,已全局改名)
- **路径**:`D:\Codes\adguard-home-console`(2026-09-21 由 adguard-home-admin-mobile 改名,会话内被 ZCode 占用未能自动改,用户手动改;若本文件还在旧路径说明改名未完成)
- **定位**:AdGuard Home 移动优先管理控制台,UI = iOS 26/27 Liquid Glass × Jinx 参考
- **栈**:Vite 8 + React 19 + TS + Tailwind 4 + swr + lucide-react + Express 4(Node 24)
- **运行**:`npm run build && npm start`(8787 端口,服务器常驻后台跑的就是这个);开发 `npm run dev:all`(5173+8787)。实例地址等私有配置在 `.env`(已 gitignore,勿提交)
- **目标实例**:AdGuard Home **v0.107.79** @ 生产实例(配置见 `.env` 的 `AGH_DEFAULT_URL`/`AGH_USERNAME`/`AGH_PASSWORD`),Basic Auth 全端点可用。实例偶发重启,3990 拒连时先等
- **API 探查材料**:`_probe/openapi.yaml`(v0.107.79 官方规范)+ `all_schemas.json` + 各端点真实响应样本

## 2. 架构

```
浏览器 → Express(8787):
  /api/agh/* → 目标AGH /control/*  (X-AGH-Target 头 + Authorization Basic 透传,跟随308)
  静态 dist + SPA 回退
```
- AGH 无 CORS 头,必须走代理;凭据存本机 localStorage(`agh.console.cfg.v1`)
- 轮询:stats 5s / clients 60s / filtering 20s / 实时日志 2s
- SWR 统一 fetcher:`swrFetcher`(`src/lib/api.ts`,签名 `(args: readonly [string, SvrConfig, string])`)

## 3. v0.107.79 API 关键差异(踩过的坑)

| 项 | 事实 |
| --- | --- |
| 单位 | **毫秒**:querylog/stats config 的 interval、`/protection` 的 duration、status 的 `protection_disabled_duration` 全是 ms |
| stats | 旧 stats_history/stats_top 已 404;新 `/stats` 内嵌 `dns_queries[24]`(oldest→newest)与 top 字段,**top_* 是单键对象数组**(需 toMap 归一,见 Dashboard) |
| reason | 字符串枚举:FilteredBlackList/FilteredBlockedService/FilteredSafeBrowsing/FilteredParental/FilteredInvalid/FilteredSafeSearch/NotFilteredWhiteList/NotFilteredNotFound/NotFilteredError/Rewrite/RewriteEtcHosts/RewriteRule |
| querylog | 响应为 `{data:[...]}`;支持 search/reason[](可重复参数)/older_than/offset/limit |
| protection | `POST /control/protection {enabled, duration(ms)}`;`set_protection` 不存在 |
| 配置读写 | `GET /querylog/config` + `PUT /querylog/config/update`;stats 同构(旧 *_config POST 为天/弃用) |
| blocked_services | 目录 `GET /blocked_services/all`(139项,icon_svg=base64);当前 `GET /blocked_services/get` {ids,schedule};保存 `PUT /blocked_services/update` |
| clients | 新增 `POST clients/add`;改 `POST clients/update {name, data:Client}`;删 `POST clients/delete {name}` |
| rewrite | `PUT /rewrite/update {target, update}`;开关 `GET/PUT /rewrite/settings(/update)` |
| safesearch | `PUT /safesearch/settings` {enabled+7引擎布尔} |
| dhcp | `POST /dhcp/set_config`、`/dhcp/find_active_dhcp {interface}`、`/dhcp/add_static_lease` 等 snake_case |
| 其他 | `POST /protection`、`POST /cache_clear`、`POST /version.json {recheck_now}`、`POST /update`、`GET /filtering/check_host?name=` |

## 4. 设计系统(Jinx 式深色)

- **深色**(`[data-theme='dark']`):纯黑底 `--bg:#060608`;卡片**纯实色** `--glass:#121419`+细边框;`--glass-inset` 归零;深色下 `.specular::after` 关闭(nav 除外);环境光晕极淡
- **浅色**:未动,白色玻璃 + specular 保留
- `--glass-strong:#15171d`(弹层实色);`--glass-nav: rgba(40,42,50,0.45)` + blur(16) saturate(1.6) + brightness(1.08)(玻璃=透出内容,模糊大了就是磨砂;iOS Safari 无折射滤镜,blur 是上限)
- 模糊只存在于:标签栏、顶栏、弹层/Toast(**性能红线**:iOS 大面积 backdrop-filter+背景动画会发烫,已把卡片全部改实色,勿回退)
- **浮层红线(2026-09-23 用户定稿)**:**任何弹窗/浮层一律屏幕居中出现,严禁从底部上升**——iOS 原生 tabbar 会挡住底部浮层。全部弹窗(确认框/表单/详情等)统一走 `ui.tsx` 的 `SheetProvider`,其容器已固定 `items-center`;新增弹层组件必须居中,勿引入 `items-end`/`translateY(60px)` 类底部入场。单选不弹层:**苹果设备用页面里真实渲染的 `<select>` 覆盖层**(`ui.tsx` 的 `PickSelect`;`showPicker()` 在 WebKit 不存在,见坑 18)、其余自绘锚定下拉。另:弹窗动画靠**双 rAF** 驱动(单 rAF 初始态与首帧合并会闪现无动画),改 SheetProvider 时勿退回单层
- 长按菜单:**全局禁用**(body user-select:none + -webkit-touch-callout:none,input/textarea 恢复可编辑),复制一律走显式复制按钮
- `.chart-touch`(图表专用叠加):`touch-action: pan-y`——纵向滑动交还页面滚动(修复移动端图表卡住滚动),横向拖动留给 scrub;触摸端**长按 350ms 唤出数据预览**(震动反馈,移动超 8px 取消判定让位给滚动/scrub);桌面鼠标 hover 不受影响

## 5. 标签栏(iOS 26/27 手感,用户已定稿)

- 4 个 tab:`/`概览、`/protection`防护、`/log`日志、`/settings`设置(无客户端 tab;客户端入口=首页"客户端"方块点击)
- 栏体:胶囊(`rounded-full px-1.5 py-1.5`),`--glass-nav` 中灰磨砂
- 透镜=两层:外层 `.tab-lens-track`(inline translateX 滑动,**transition 必须挂这层**)+ 内层 `.tab-lens`(白色玻璃药丸,WAAPI 拉伸形变);未选中文字 `text-t1`(深色白字/浅色黑字),选中 `text-accent`
- 点击动效(WAAPI,当前幅度=用户认可的上一版):bar `scale(1.014,0.99)`,lens `scale(1.07,0.97)` @35%,380/440ms;**用户嫌 1.05/1.35 太夸张,勿加大**
- 再点当前 tab = 平滑回顶部(定稿 2026-09-22):CSS 栏在 Layout.tsx onClick 判 isActive;原生栏(Tauri iOS)在 nativeTabbar.ts 用 pathnameRef 判 `routeToId`,子页回点还会 navigate 回父级(对齐 iOS 回根);工具 `src/lib/scrollToTop.ts`(reduced-motion 退化瞬时)。验证记录见 `.agents/logs/tauri-ios.md` §10(随 `feat/ios-build` 合入)

## 6. 页面/路由

`/login`;布局内:`/`概览(ProtectionCard+统计块[今日查询→/log?filter=all、已拦截→filter=blocked 可点,平均耗时/客户端(→/clients)可点,安全拦截不可点]+流量趋势[6/12/24h 下拉选择在标题旁]+top 榜单+上游)、`/log`(实时 2s、LOG_FILTERS 筛选、URL ?filter= 初始化)、`/protection`+子页(filters/allowlist/rules/services/check)、`/rewrites`、`/clients`、`/settings`(general/dns/access/encryption/dhcp/system/app)

## 7. 已知坑(勿重蹈)

1. **bash 内联 `node -e` 写含反斜杠/模板串的代码必坏**(bash 吞 `\$`)→ 一律写 `_pN.cjs` 补丁文件再 `node` 执行,用后删
2. Edit 工具频繁报 "file modified" → 常见因前一步 sed/node 改过文件,先 Read 再改,或直接用 cjs 补丁
3. 新版 SWR:fetcher 参数是 readonly 元组;自定义 fetcher 返回 `Promise<unknown>` 会类型错,用共享 `swrFetcher`
4. **Hooks 不能放条件 return 之后**(Dashboard 曾因 useMemo 放在 `if(!stats)` 后白屏)
5. 渲染期算 `Date.now()+` 的截止时间会被轮询重渲染不断重置 → 用 useMemo 锁定到状态快照(ProtectionCard 到期刷新曾中招)
6. Express 4 通配路由 `app.all('/api/agh/*path')` 不匹配 → 用 `app.use('/api/agh', handler)`
7. iOS Safari:backdrop-filter 大面积=发热;长按出复制框需 `-webkit-touch-callout:none`;svg `<text>` 可被选中
8. 受控组件:iOS 自动化 fill() 对某些 textarea 不触发 React onChange → evaluate + 原生 setter + dispatchEvent('input')
9. 提示用户注意:凡单位类字段先查 openapi 再写死(ms 坑两次)
10. **ProtectionCard 开关采用乐观更新**(用户要求,勿回退):点击瞬间 `pendingEnabled` 立即设为目标值,knob 通过 CSS `transition: transform 0.28s` 丝滑滑动 + 整体 `opacity:0.55` 表 loading;API 成功后服务端状态对齐自动清除 pending(当前实现是渲染期 `queueMicrotask` 清,能跑但若重构优先改 useEffect);失败则 `setPendingEnabled(null)` 回退到服务端真实状态。关闭开关时**不弹出时间选择器**(直接关),定时暂停只走下面“定时暂停”按钮。
11. **Switch 的 knob 动画只能用 CSS transition,勿加 animation/keyframes 控 transform**——animation 会抢占 transform 属性导致 transition 滑动失效(knob 卡住不滑)。loading 态仅通过按钮整体 opacity 表达。
12. **`preserveAspectRatio="none"` 会把 SVG `<circle>` 拉成椭圆**(纵向 1:1、横向被拉伸),`vectorEffect` 只救描边不救形状——hover 数据点一律用 HTML 绝对定位圆点叠加(横向百分比定位 + 纵向像素定位,纵向缩放恒为 1);竖直 `<line>` 形状不受拉伸影响但仍需补 `vectorEffect="non-scaling-stroke"` 防止宽屏下被拉粗。
13. **触屏设备 `<select>` 的焦点样式会残留**(iOS 从原生选择器选完不自动 blur,`:focus` 绿框一直挂着);**不能在 change 里同步 blur()**——与 iOS 自身的焦点恢复竞态,会导致下一次快速打开菜单被闪关。标准方案:触屏(`hover: none`)给元素加 `.no-ring` 类压掉 `:focus` 样式、真实 blur 时移除,桌面(`hover: hover`)选完直接 `blur()`;统一走 AdvancedSettings.tsx 的 `selectAfterChange()`。配套:`.field:focus` 只准用 `background-color`,**禁用 `background` 简写**——简写会重置 background-image/position,select 的小三角形(背景图绘制)每次焦点切换都会"瞬移"。
14. **设置页表单控件不要用 `<label>` 包裹**——label 被点击时会聚焦关联输入框(点标题也触发),用户要求只有点击控件本身才聚焦;标题用 `div + span` 结构。Login 登录表单例外(点击文字聚焦账号/密码是标准登录体验)。
15. **iOS 上连续弹出系统选择器有冷却**:WebKit 对关闭后约 300ms 内的再次弹出会静默吞掉,点击事件也不会到达页面(曾据此做 `pickViaNativeSelect` 冷却回退,该方案已随坑 18 一并删除——它从未在 iOS 生效)。苹果设备上的原生选择器入口用"胶囊 + 透明 select 铺满(`absolute inset-0`)+ 免交互图标/文字/箭头"结构——select 只负责弹出,显示全靠免交互层;select 会按最宽 option 撑宽,必须限制宽度否则胶囊变形。
16. **`express.static` 会拦截 `/index.html`**:SPA 回退中间件拿不到该路径,`maxAge` 会把 index.html 缓存 1 小时导致 iOS 端测试一直跑旧 bundle——须在 static 之前显式路由 `/index.html` 并以 `no-cache` 下发(SPA 回退 `/` 同理)。
17. **判定"苹果设备"不能只看 UA**:PC 浏览器设备模拟会伪装 UA 成 iPhone/iPad,`showPicker()` 又在桌面 Chrome 上可用,结果原生选择器弹在隐藏 select(左下角 1px)上,弹层错乱。`isAppleMobile()` 必须双重判定:UA 含 iPhone/iPad(或 Macintosh+多点触控)**且** `navigator.vendor === 'Apple Computer, Inc.'`(模拟不伪装 vendor;iOS 上所有浏览器都是 WebKit,vendor 恒为 Apple)。非苹果/模拟环境一律回自绘锚定下拉。
18. **`<select>` 的 `showPicker()` 在 WebKit/iOS 上不存在**(2026-09-23 查 MDN browser-compat-data 确认:Safari/safari_ios 为 `preview` 且置于开关后;只有 Chrome 121+/Firefox 122+ 有)。所以**苹果端的原生选择器必须是页面里真实渲染的 `<select>` 覆盖层**(`ui.tsx` 的 `PickSelect`:胶囊 + `absolute inset-0` 透明 select + 免交互图标层),**不能靠 JS 唤起**。`pickViaNativeSelect` 已删除(它在 iOS 上恒返回 false,等于死代码);`usePick` 现在永远走自绘锚定菜单——**新增任何单选项,苹果分支必须自己写 `isAppleMobile() ? <PickSelect/> : usePick`**,漏写就退化成自绘下拉(客户端排序按钮即此坑)。另:同行控件高度别写死(搜索框 15px 字号 × 1.45 行高 + `py-2.5` = 43.75px,曾把排序按钮写 `h-[42px]` 导致上下各差 0.88px),用 `self-stretch` 跟随行高。

19. **Tauri iOS 包的前端是内嵌进二进制的**(2026-09-23 踩坑):WebView 的 origin 是 `tauri://localhost`,而 app bundle 里的 `assets/` 目录是**空的** —— 前端在 cargo 编译期被打进 `libapp.a`(有压缩,`strings` 搜不到页面文案)。所以**改了 `src/` 不重新构建 app,模拟器上跑的还是旧前端**;重新构建 = `rm -rf src-tauri/gen/apple/build` + `touch src-tauri/src/lib.rs`(tauri-build 不监听 dist)+ `./scripts/ios-signing.sh tauri build --debug --target aarch64-sim`(产物 `build/arm64-sim/AGH Console.app`,再用 `xcrun simctl install` 装上)。
    - **排查"先前修好的问题又复现"先查这一步**:本次实测,模拟器上装的是 04:04 构建的包,而修复提交是 04:19 —— 看到的必然是旧行为(那版里还留着早已从源码删掉的调试 HUD)。判定手法:`xcrun simctl spawn <udid> log show --last 5m --predicate 'process == "AGH Console"' | grep SWIPE-BACK` 看原生日志,或比对二进制 mtime 与提交时间。
    - 内嵌前端也意味着 `npm run build` + 刷新对 iOS 端**无效**,只有 Web/PWA(8787 托管 dist)吃 HMR/刷新。

## Git 工作流(2026-09-21 定稿)

- **日常开发一律提交到 `dev` 分支并推送**——dev 的 push **不触发** Release 构建。
- **发布 = `dev` 合并到 `main` 并推送**——main/master 的 push 触发 release.yml 打包出 release(agh-console.tar.gz)。
- **Release 命名(开发期)**:tag/name 为 `v0.1.0-dev.{YYYYMMDD}.{短SHA}`,package.json 版本 `0.1.0`,正文含 commit SHA + 最近 10 条提交 + GitHub 自动 release notes;**不要标记 prerelease**——`/releases/latest` 会跳过 prerelease,server-pull.sh 就找不到包了。正式发布时把基础版本升到 `v1.0.0` 并去掉 `-dev` 后缀。
- release.yml 每次构建后**删除其余全部 release 和 tag,只保留最新一个**(server-pull.sh 用 `/releases/latest` 且本地有回滚备份,删旧包安全)。
- **不要直接 push main**,除非确实要发布一个新包;纯 docs/**.md 的 main 推送已被 workflow 的 paths-ignore 豁免,不触发构建。
- `feat/ios-build` 是 iOS/Tauri 集成分支,跟随 dev 合并,不直接触发构建。
- 旧历史备份在 `backup/main-20260921`、`backup/ios-20260921`(git 历史重写前存档),确认稳定后可删。

## 8. 动效现状(用户口味:克制优雅,勿夸张)

- 栏体 bounce `scale(1.014,0.99)` 380ms;透镜拉伸 `scale(1.07,0.97)` 440ms(WAAPI,onClick 触发,transformOrigin bar=50% 88% / lens=50% 55%)
- 透镜滑动 0.45s `cubic-bezier(0.32,1.25,0.4,1)`
- 全局 press 按压缩放、页面 page-in、日志条目 log-flash、脉冲点用 opacity(禁 box-shadow 动画)

## 9. 验证流程

- 构建:`npm run build`(317~340ms);类型:`npx tsc --noEmit`
- 浏览器:IAB 标签 `iab-tab:cda6e548-…`(已登录态,深色 390×844);控制台服务器后台任务 `exec_1191bb48…`(8787)
- 截图 clip 有双影伪影,验证视觉用全页截图;动效验证读 getComputedStyle transform 而非抓帧
- 改完直接刷新页面即可生效(dist 静态由 express 每请求读盘)

## 10. 用户偏好

- 中文交流;不要宣传语/口号式文案(已删"玻璃质感·移动优先""优雅地管理"等,勿再加回)
- **代码里不加注释**,决策与背景一律写入 docs 的 md 维护(2026-09-21 明确要求)
- 喜欢先问"为什么"再改——先拿真实数据/复现,再解释,再动手
- 对 iOS 原生细节敏感:圆角比例、透明度、Q 弹幅度都要对齐参考;改动幅度要克制
## 11. 概览页首屏加载态(2026-09-22)

- **症状**:进入概览页先闪"加载中"再渲染正常内容,加载态挤在页面顶部无边距,且加载态 → 内容切换生硬。
- **根因**:Dashboard 用 `if (!stats) return <Loading />` 提前返回,加载态脱离 `page-shell px-4` 容器;更关键的是加载分支与内容分支是**两棵不同的树**,数据到达后整棵子树重新挂载,`page-in`(0.38s 上移淡入)从头重播,观感就是"生硬地再闪一次"。
- **修复方案**(Dashboard.tsx):
  - 三个分支(连接失败 / 首次加载 / 正常内容)的**根 div 类名完全一致**(`page-in mx-auto w-full page-shell px-4`),React 按 same-type 同位复用节点,不重播 page-in。
  - 首次加载渲染 `DashSkeleton` 骨架屏(复刻首屏结构:防护卡 + 4 指标块 + 图表卡 + 榜单/上游列,`animate-pulse`),外层套 `.content-in` 做轻微淡入;内容分支同样套 `.content-in`,骨架 → 内容只做 0.28s 淡入,无位移重播。
  - 错误且无数据时加载提示在 `min-h-[55vh]` 容器内垂直居中,不再顶在页首。
  - error 但已有 stats(SWR keepPreviousData)仍渲染内容,不闪错误页。
- **教训**:条件渲染早返回时,**各分支根节点结构必须一致**,否则动画重播;带副作用的派生计算(依赖 `stats` 的常量)必须放在类型窄化完成之后,否则 tsc 报 possibly-undefined——这也是为什么没用 JSX 内三元包全部内容。
- 新增 CSS:`index.css` 的 `content-in`(0.28s 纯 opacity 淡入),与 page-in 分工:page-in 只在路由挂载时播,content-in 负责加载态/内容切换。

## 12. iOS 签名走本地 env(2026-09-23)

- **问题**:两条 iOS 线(`src-tauri/gen/apple`、`ios/`)的 `DEVELOPMENT_TEAM` / `PRODUCT_BUNDLE_IDENTIFIER` 原先直接改在**已入库的生成产物**(`*.xcodeproj/project.pbxproj`)上——个人值入库,且随时会被重新生成覆盖。`ios/` 线更隐蔽:xcodegen 的源 `ios/project.yml` 里根本没有签名,改生成产物等于跑一次 xcodegen 就丢。
- **机制(实测)**:`tauri ios init` 写 `gen/apple/project.yml` 是**存在即字节级保留、缺失才生成**,且每次都调 XcodeGen 从 `project.yml` 重建 `.xcodeproj`;XcodeGen 支持 `${VAR}` 环境变量替换。故签名以占位符形式写进 `project.yml`,值由本地 env 提供;`tauri.conf.json` 的 `identifier` 恢复上游中立值(iOS 签名的实际来源是 XcodeGen 产出的 `PRODUCT_BUNDLE_IDENTIFIER`)。
- **坑**:XcodeGen 对**未解析**的 `${VAR}` **不报错**(exit 0),会把字面量原样写进工程,直到构建才以难懂的方式失败。故必须先校验变量再执行——这是 `scripts/ios-signing.sh` 存在的唯一理由。
- **另**:`TAURI_CONFIG` 环境变量对 `identifier` **无效**(实测未生效),要覆盖得用 `--config`。
- **约定**:
  - 签名值只放 `.env.signing`(已被 `.gitignore` 的 `.env.*` 覆盖,勿提交):`AGH_APPLE_TEAM` 团队 ID、`AGH_BUNDLE_ID` Bundle ID(不能含下划线)。
  - 生成与构建统一走 `scripts/ios-signing.sh`:`generate tauri` / `generate ios` / `tauri <参数...>`。
  - 生成产物 `*.xcodeproj` **不入库**(`.gitignore` 已忽略),克隆后先跑 `generate` 再打开 Xcode。理由:XcodeGen 每次生成都会换一个随机 `TEMP_<UUID>` 组节点,入库必然产生无意义冲突(实测:重新生成与已提交版本仅差该行加签名行);上游 XcodeGen README 也明确建议 `.xcodeproj` 不进 git。
  - **勿扩大忽略范围**:`gen/apple` 的 `project.yml` / `Podfile` / `LaunchScreen.storyboard` / `ExportOptions.plist` / `Sources/**` / `Info.plist` / `entitlements` / `Assets.xcassets`,以及 `ios/` 的全部 Swift 源码与 `Tests/Fixtures` 都是人维护内容,必须入库。
  - `ios/AdGuardConsole.xcodeproj` 在忽略前是**生成后又手改过**的(committed spec 里没有 `DEVELOPMENT_TEAM`,产物里却有),故谁跑一次 xcodegen 谁的签名就丢——现签名已收进 `project.yml`,该隐患随忽略一并消除。
  - 每位开发者需自备 `.env.signing`(含仓库所有者),否则会被脚本拦下——这是刻意的,好过静默生成坏工程。
  - `tauri ios init` 会自动 `brew install xcodegen`(前提:brew 可用)。
- **重新生成前的坑(实测)**:target sources 里含 `Externals` 目录,若 `Externals/**/libapp.a`(上次构建产物)在生成时已存在,XcodeGen 会把它当资源加进 Copy Resources,与 preBuildScript 的输出撞车 → `Multiple commands produce .../libapp.a`。故 **xcodegen generate 前必须 `find Externals -name '*.a' -delete`**;`tauri ios build` 本身不重跑 xcodegen,残留只影响"下一次重新生成"。报同错时先清 DerivedData 再试。
- **brew 不可用时的替代**(如 macOS 版本过新未获支持,任何 brew 命令都崩):XcodeGen 可从 GitHub Release 的 zip 直装二进制;Podfile 无依赖时 pod install 是空操作,可跳过 `generate tauri` 的 pod 步骤、在 `src-tauri/gen/apple` 手动 `xcodegen generate`(签名变量 source `.env.signing`)。

## 13. 路由转场与原生控件(2026-09-23,feat/ios-swipe-back → fix/ios-back-button)

- **WKWebView 对程序化 `history.back()` 无原生动画**(实测:去掉 CSS 转场后是瞬时硬切)。返回按钮的动画必须由 CSS 快照层(`routeTransition.tsx` 的退场克隆)承担,`markBackTap()` 不能省。
- **WKWebView 同文档侧滑的下层是空的(2026-09-23 逐帧实测,原生手势已被否决)**:手势进行中 WebKit 只渲染空白底(实测为纯 #E3E5EC、无任何内容),松手 commit 后才轮到我们渲染(还有约 300ms 全白窗口),观感就是"原页空白 → 内容忽然出现"。这条路径不受我们控制,**故 `src-tauri/src/lib.rs` 已把 `allowsBackForwardNavigationGestures` 置 false**,侧滑改由前端自研。
- **自研边缘侧滑(`routeTransition.tsx` 的 `useEdgeSwipe`)**:push 落地时把"来路页面"的克隆按历史条目 idx 存进 `underlays`;左缘 24pt 内起手、横向位移超 10pt 才接管(斜向/纵向让位给滚动;touchmove 里 `preventDefault` 阻止页面滚动);拖拽只改 transform(命令式写内联 style,不经 React 重渲染),下层是真实快照并按 iOS 方式以 -28% 视差跟进;松手才判定(位移 ≥50% 或速度 >0.5pt/ms 提交):
  - 提交:一次性把真实路由换上来(`consumeGestureCommit` 序号让转场层与原生按钮各读一次),转场层不播关键帧;下层快照与真实页面同像素,切换不可见,滚动位置由既有 POP 逻辑恢复;下层快照必须在这次布局效应里摘掉,否则会留在页面下方(z=0)从后续页面透明区域透出;
  - 取消:零成本(不动历史、不重挂载),把 transform 收回去即可;
  - 只对 iOS 壳生效(`__TAURI_INTERNALS__` + `isAppleMobile()`),浏览器/桌面端不被抢;
  - **`useTabJump`(replace)落地的条目没有可用快照 → 自研侧滑在该条目不接管**(不误返回跨 tab),刻意为之,与 §5 的 tab 语义一致。
- **滑动转场层必须不透明**:新页容器与旧页快照层若为透明背景,对方页面内容会整个透出(双重曝光,前进穿帮的头号来源)。`index.css` 的 `.rt-page-bg`(body 底色 + `.ambient` 光晕复制)在转场期间挂两层,结束摘除;矮内容页容器转场期加 `minHeight:100dvh`。**侧滑拖拽期间同样要给页面容器挂 `.rt-page-bg`**。
- **入场动画闩要认"方向语义"而非"CSS 转场"**:无 CSS 动画的 POP(自研侧滑提交)若闩不生效,落地页会重播入场动画(`fill-mode: both` 首帧 opacity:0 → 整页空白)。实现上 `TransitionCtx.dir` 与 `exiting`(CSS 转场进行中)解耦,闩读 dir、导航条读 exiting。
- **原生控件悬浮在 WebView 之上,不参与 CSS 平移**:转场时用 `appearOffsetX` 复刻导航条行程(前进 = +100vw,返回 = -28vw,时长 0.34s、曲线同 `rt-*`),让按钮**跟着导航条一起滑入** —— 已不再走"等转场结束再 createComponent"(那会出现 CSS 胶囊先到、原生按钮后到的二次出现,用户明确不接受)。插件侧是本地 vendor 版的 `ComponentsOverlay.swift` appearOffsetX 分支;自研侧滑期间按钮整体让位(`useGestureActive`),交给随页滑动的 CSS 胶囊。锚点公式见插件 `activateAnchorConstraints`:`safeAreaLayoutGuide + (margin=16)+dx/dy` 双轴同付,对齐 CSS 胶囊用 dx:0/dy:-8/尺寸 44(实测圆心 device 38,92)。
- **跨 tab 跳转用 `useTabJump`**(lib/navMeta.ts):replace 不进历史栈 + `markNavAnim('push')` 让转场层照常做 push 动画 —— 视觉下钻、栈上平级。
- **z 层序**:POP 退场快照层 z=50,须盖过固定导航条(body portal z-40);侧滑下层快照 z=0、页面容器 z=1;上限低于 Sheet/Toast。
- 验证技巧:`routeTransition.tsx` 的 `DURATION_MS` 临时改 3000(vite HMR 即时生效)+ 中途截图即慢动作取证;注意 `cubic-bezier(0.32,0.72,0,1)` 前载严重,40% 时间已完成约 92% 位移,截图要趁早。模拟器逐帧取证、Device Hub 坐标标定与手势合成见 `.agents/logs/tauri-ios.md` §13。
