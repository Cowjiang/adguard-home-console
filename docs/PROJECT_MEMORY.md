# AdGuard Home Console — 项目记忆(供后续会话快速恢复上下文)

> 用途:新会话先读此文件,避免重新探查。最后更新:2026-09-21

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
- 长按菜单:**全局禁用**(body user-select:none + -webkit-touch-callout:none,input/textarea 恢复可编辑),复制一律走显式复制按钮
- `.chart-touch`(图表专用叠加):`touch-action: pan-y`——纵向滑动交还页面滚动(修复移动端图表卡住滚动),横向拖动留给 scrub;触摸端**长按 350ms 唤出数据预览**(震动反馈,移动超 8px 取消判定让位给滚动/scrub);桌面鼠标 hover 不受影响

## 5. 标签栏(iOS 26/27 手感,用户已定稿)

- 4 个 tab:`/`概览、`/protection`防护、`/log`日志、`/settings`设置(无客户端 tab;客户端入口=首页"客户端"方块点击)
- 栏体:胶囊(`rounded-full px-1.5 py-1.5`),`--glass-nav` 中灰磨砂
- 透镜=两层:外层 `.tab-lens-track`(inline translateX 滑动,**transition 必须挂这层**)+ 内层 `.tab-lens`(白色玻璃药丸,WAAPI 拉伸形变);未选中文字 `text-t1`(深色白字/浅色黑字),选中 `text-accent`
- 点击动效(WAAPI,当前幅度=用户认可的上一版):bar `scale(1.014,0.99)`,lens `scale(1.07,0.97)` @35%,380/440ms;**用户嫌 1.05/1.35 太夸张,勿加大**

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