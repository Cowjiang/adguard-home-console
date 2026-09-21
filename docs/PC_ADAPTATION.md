# PC 端适配 — 工作清单与进度(供后续会话恢复)

> 创建:2026-09-20。配套读 `PROJECT_MEMORY.md`(项目概况/坑/用户偏好)。
> 改动原则:**只动展示层**,不碰 `api.ts`、`auth.tsx`、`server/`。

## 核心决策(用户已确认)

- **方式**:响应式单代码库,`lg`(≥1024px)为分界;移动端 390px 已定稿布局**原样保留**。
- **桌面导航**:常规侧边栏(用户在"竖向玻璃 rail vs 常规侧边栏"中选了后者)。
  - 240px(`w-60`)+ `lg:pl-60` 让位,实色 `--bg-elevated` 背景(遵守性能红线:无大面积 backdrop-filter)。
  - 导航 5 项:概览/防护/日志/客户端/设置(桌面把客户端提升为一级入口,`/rewrites` 归入客户端高亮)。
  - 侧栏底部玻璃小卡承接原 TopBar 的防护状态+版本。
- 移动端 TabBar(透镜动效)和悬浮 TopBar:仅加 `lg:hidden`,其余代码未动。

## 全部完成 ✅(2026-09-20)

1. ✅ **骨架**(`src/components/Layout.tsx` + `src/index.css`)
   - `Sidebar` 组件(桌面)、`navActive()` 带自定义 match;TabBar/TopBar `lg:hidden`。
   - `index.css`:`.page-shell`(移动 560 + 安全区 padding;≥lg 1160 + 44/56)、`@media (pointer: fine)` 恢复文本选择 + button/switch `cursor:pointer`。
   - 三个主页面容器 + `ui.tsx` 的 `Screen` 全部切到 `page-shell`。
2. ✅ **Dashboard 多列**:首行 `lg:grid-cols-[2fr_3fr]` 防护卡+统计 2×2 并排;下部 `lg:grid-cols-3`,Top 榜单占 2,右列 上游+服务器信息。
3. ✅ **日志页表格视图**:新增 `src/lib/useIsDesktop.ts`(matchMedia + useSyncExternalStore,避免双套 DOM);桌面 `LogTable`(时间/域名/客户端/结果/耗时 五列,行内滚动 `max-h-[calc(100dvh-330px)]`,行点击开同一详情浮层);搜索框与筛选 chips 桌面同行;移动端仍是卡片流。
4. ✅ **防护/客户端/重写**:防护中心桌面两列(左=过滤功能 6 项,右=安全防护+常规);客户端持久列表/过滤器列表/重写列表 `lg:grid-cols-2` 两列卡片;自动识别客户端保持 Rows 单列。
5. ✅ **设置页两列**:设置中心 `useIsDesktop` 桌面 2 列卡片(移动单卡不变,`GroupTitle` 在网格外保证顶对齐);GeneralSettings/SystemPage/AppSettings/DnsSettings(2×2)/AccessSettings/EncryptionSettings/DhcpSettings(基础+IPv4 并排)全部分组两列。
6. ✅ **图表**:charts.tsx 用 viewBox + w-full + preserveAspectRatio="none",天然自适应(2026-09-21 补充:hover 数据点改 HTML 叠加圆点,见「已修的桌面端 bug」)。
7. ✅ **回归验证**:每步 `tsc --noEmit` + `npm run build` 通过;桌面 1440×900 截图验证 概览/日志/防护/设置中心/DNS 设置;移动端 390×844 验证 概览/日志/防护/设置中心(DOM+截图)零回归;日志表格行点击详情浮层正常。

## 后续可选(未做)

- 1920+ 宽屏的 `xl:` 进一步加宽(当前 1160 封顶,够用)。
- 防护子页(过滤器/拦截服务/规则)的 chips 二级导航在桌面改为更明显的页签(现横向 chips 可用,暂不动)。
- 拦截服务页 139 项网格桌面可 3-4 列(现为滚动网格,可接受)。

## 桌面统计分析页(2026-09-21 新增)

- 用户反馈桌面页面太空,新增 `/stats` 统计分析页(`src/pages/StatsPage.tsx`),仅桌面侧边栏入口(概览和防护之间,BarChart3 图标;移动端 TabBar 保持 4 tab 不变,直接访问路由也可用)。
- **概览页移动端合并统计内容**(用户要求,三轮定稿):①指标区曾加"安全浏览""峰值小时",后按用户要求**移除**;②流量趋势图下方"请求构成"环形图卡(复用 Donut,`lg:hidden`)保留;③热门域名/拦截域名 BarList 下方加**"查看更多"按钮**(双端显示,移动端 w-full、桌面 w-auto),跳转 `/top/:kind`(queried/blocked)全量榜单子页(`src/pages/TopListPage.tsx`):RankTable 全量排行 + SearchBar 搜索 + PageHeader 副标题计数("共 N 个域名 · X 次请求",过滤时显示"已过滤")。AGH /stats 的 top 字段最多返回 100 条,子页即全量。双端 DOM 验证:入口+搜索过滤(25/100)联动。
- **路由滚动**(用户强调):`App.tsx` 加 `ScrollToTop`——前进/跳转导航(PUSH/REPLACE)回页面顶部,浏览器返回(POP)保留原滚动位置。
- **查看更多按钮**(用户定稿):双端显示、**通栏铺满**(w-full,无 lg:w-auto);概览页两个榜单 + 统计页热门/拦截域名表格下都有,均跳 `/top/:kind`。
- **badge 显示应用名**(用户要求):移动端悬浮顶栏和桌面侧边栏底部状态卡的版本号(v0.107.79)改为 `APP_NAME`("AdGuard Home Console",来自 lib/constants)。
- **返回按钮规则(用户再次强调,勿违反)**:凡不在 TabBar/侧边栏的页面(二级页)标题旁必须有返回按钮;新页面一律用 `PageHeader back` 而不是手写 h1(TopListPage 曾漏,已修)。
- **IAB 自动化坑(补充)**:`getByRole(...).click()` 对部分元素(磁贴、查看更多按钮)会因 actionability 检查卡死超时,但真实输入事件(cua 坐标点击)和程序化 `.click()` 都正常;勿把 locator 点击超时当页面 bug。另:坐标点击前必须确认目标在视口内(列表深处磁贴在 390 宽度下常在视口外)。
- 内容:5 个指标卡(总查询/已拦截/安全浏览/平均耗时/峰值小时)+ 24h 趋势面积图(复用 AreaChart)+ 请求构成环形图(`charts.tsx` 新增 `Donut`:正常放行/已拦截/安全浏览/安全搜索/家长控制)+ 4 个排行表格(`charts.tsx` 新增 `RankTable`:排名/名称/次数/占比条,前三名高亮):热门域名 Top15、拦截域名 Top15(红)、活跃客户端 Top10(解析客户端名,蓝)、上游 DNS(响应数条形+平均耗时,最快者绿色徽标)。
- 数据全部来自 `/stats`(5s 轮询)+ `/clients`(60s,客户端名解析),无新 API。桌面截图已验证。
- 统计页标题副文案已按用户要求移除。**返回按钮规则**(用户定稿):`PageHeader` 的返回按钮只属于二级页面——桌面端若当前路径是顶级路由(`/`、`/stats`、`/protection`、`/log`、`/clients`、`/settings` 精确匹配)则隐藏返回;子页(如 /settings/dhcp、/protection/filters)保留。移动端 TabBar 顶级页本来就不传 back,不受影响。

## 防护页更名过滤器(2026-09-21,用户提出)

- 用户指出防护页的 ProtectionCard 与主页重复。定稿:该页定位为 AGH 的"过滤"域,更名**过滤器**(TabBar/侧边栏 label + 页面标题,图标换 ListFilter);`ProtectionCard` 从页面移除,防护总开关/定时暂停只在概览页。
- **URL 保持 `/protection` 不变**(子页 `/protection/*` 与书签零破坏)。功能结构:过滤功能(黑/白名单/自定义规则/拦截服务/DNS 重写/规则检测)+ 安全防护(浏览安全/家长控制/安全搜索,AGH 官方亦归过滤设置下)+ 常规(启用过滤、更新间隔);"启用过滤"副文案改为"DNS 层防护的暂停/恢复在概览页"。
- 状态卡 + 快捷按钮(用户提议):页面顶部加状态卡——规则总数(启用过滤器 rules_count 之和 + 自定义规则)、过滤器列表数(黑/白分列)、上次更新(全部过滤器 last_updated 取最新,relTime)、自动更新周期 + **"立即更新"按钮**(POST /filtering/refresh,黑白名单各一次并发,toast 汇报更新条数)。
- **唯一一次动 server**:`/filtering/refresh` 全量拉取规则超过代理统一 25s 超时(19 万条规则列表),proxyAGH 对该路径单独放宽到 120s,并重启了 8787 服务器。端到端已验证:点击 → 加载 → last_updated 变"刚刚"。
- 状态卡响应式(用户反馈,定稿):移动端**两个独立 glass 小方块**,尺寸/字号与概览页 StatTile 完全一致(px-3.5 py-3、标签 12px、值 22px num bold):①规则总数(绿,副行"含 N 条自定义");②过滤器列表,值"黑X / 白Y"双色消歧(黑=danger 红、白=ok 绿),副行紧凑格式"N 分钟/小时/天前更新"(relTime 复用,无溢出,hover title 给完整时间),**圆形刷新按钮(36px)垂直居中放卡内右侧**;桌面保持长条卡。`Button` 组件为此加了 `label` props(透传 aria-label)。
- **拦截服务页改版**(用户反馈,定稿):①去掉底部保存栏,**点击磁贴立即生效**;②磁贴紧凑网格 `grid-cols-4 sm:6 lg:10 xl:12`;③列表全量渲染;④**分类**:目录数据自带 `group_id`(12 类),吸顶区加分类 chips,内容按分类分组展示(带标题和数量),无归属的进"其他";⑤吸顶区顶部空行去除:padding 改为 sticky `top` 偏移(自然位置紧贴标题,滚动吸附时才让出移动端悬浮顶栏,桌面 top-0),吸顶区加渐变背景;⑥副标题不带"点击即生效"文案;⑦chips 数字 = **该分类已选数量**(未选不显示,非总数);⑧**乐观更新防闪烁**(绿→灰→绿):保存走 Promise 队列串行化,`latestIdsRef` 保持最新选中,成功后先 `mutateCurrent(新数据,{revalidate:false})` 再清 pending——缓存先持有新值,不会再回退到旧值。端到端验证:点击→立即落库→toast→分类筛选(游戏=22 个)→chips 计数随选中增减→取消拦截。
- **拦截服务"点击不生效/刷新就没了"排查结论(2026-09-21)**:端到端实测点击→高亮→保存→服务端 `blocked_services/get` 落库→刷新页面选中保持,整条链路正常,AGH 交互无问题。真因是此前吸顶搜索栏容器拦截磁贴点击(已修):用户以为选上了实际没选上,自然"刷新就没了"。若用户再报,先查 AGH 实例是否重启、及其配置持久化。
- **拦截服务页点击失效真因**:吸顶搜索栏容器(z-10、透明、覆盖视口顶部 ~92px)会拦截滚动后经过该区域的磁贴点击。修复:容器 `pointer-events-none`,内部搜索栏 `pointer-events-auto`。整条链路(点击→高亮→保存→服务端 ids 落库)已端到端验证。另:列表渲染 slice(0,120),字母序 120 名之后(如 YouTube)需搜索才能看到,暂未改。

## 设置中心分组与应用设置拆分(2026-09-21,用户定稿)

- **分组**:设置中心分**服务器设置**(查询日志与统计/DNS/访问控制/加密/DHCP/系统管理)与**应用设置**(外观/服务器连接/关于)两组;移动端上下两组各带 GroupTitle,桌面双列(左=服务器设置,右=应用设置)。**桌面双列是定稿勿删**。
- **应用设置拆分**(用户要求):原单页拆为三个入口与路由——外观 `/settings/appearance`(主题 Segmented)、服务器连接 `/settings/server`(地址/凭据/重连/退出登录)、关于 `/settings/about`(版本+兼容性);旧 `/settings/app` 重定向回 `/settings`。

## 表单交互修复(2026-09-21)

- **iOS select 焦点绿框残留 + 快速重开闪关**(用户反馈):触屏选完下拉后 `:focus` 绿框一直挂着;初版用同步 `blur()` 修绿框,又引发"立刻重开菜单被闪关"(blur 与 iOS 焦点恢复竞态)。终版方案:触屏加 `.no-ring` 类压样式、真实 blur 移除,桌面端选完直接 blur;逻辑收敛在 `selectAfterChange()`。
- **下拉框小三角形瞬移**(用户反馈):`.field:focus` 误用 `background` 简写,重置了绘制三角形的 background-image/position,0.2s 过渡下三角形每次焦点切换都从左上角滑回右侧;改为只写 `background-color`。
- **点击表单标题聚焦输入框**(用户反馈):设置页曾用 `<label>` 包裹控件,点标题/说明文字也会聚焦;全部改为 `div + span`(仅 Login 登录表单保留 label)。排查过全部设置页:DNS(DnsSettings)、加密(EncryptionSettings)已清零,Login 按用户预期保留。
- **测试上游误报失败**(用户反馈):`/test_upstream_dns` 成功时返回 `{"223.5.5.5":"ok"}` 形式映射,旧逻辑"对象非空即失败"导致全 ok 仍显示红色;改为过滤值为 `ok`/空的条目,全部通过显示绿色成功条,红色块只列真正出错的上游。

## 图表触摸交互重构(2026-09-21)

- **移动端图表卡滚动修复(用户反馈)**:概览页流量趋势图上手指上下滑会被图表截留(该元素 `.chart-touch` 原为 `touch-action: none`,独占全部触摸手势)。修复:改 `touch-action: pan-y`——纵向滑动交还页面滚动,横向拖动保留 scrub(十字线看数据点),斜向由浏览器按主导方向判定。
- **长按唤出预览**(用户要求):触摸按下 350ms 内未移动(超 8px 即取消)则固定显示十字线+tooltip,附 10ms 震动(Android;iOS 无 vibrate API 用可选链跳过),之后可继续横向拖;抬手/滚动接管(pointercancel)即消失。实现在 `AreaChart` 的 `pressRef` + `setTimeout`,桌面鼠标 hover 行为不变。
- 顺带修:`onPointerUp/Cancel` 清 hover 态(防十字线残留)。

## 已修的桌面端 bug

- **图表轴标签拉伸**(用户反馈):`AreaChart` 的 SVG `viewBox 340 × preserveAspectRatio=none` 在桌面 ~1100px 容器下把 `<text>` 横向拉 3 倍(线条有 `non-scaling-stroke`,文字没有)。修复:x 轴标签移出 SVG,改为 HTML 绝对定位叠加在 SVG 底部 20px 留白区(`left: i/(n-1)%` + translateX 对齐),任意宽度不变形;标签层 `pointer-events-none` 不挡 hover;双端截图已验证。
- **图表 hover 数据点拉成椭圆**(用户反馈,2026-09-21):同根因(text 拉伸那条)——`preserveAspectRatio=none` 把 SVG `<circle>` 纵向 1:1、横向拉伸成椭圆;修复:两个 hover 数据点改为 HTML 绝对定位圆点叠加(查询点 8px/拦截点 7px,横向 `left:%` + 纵向像素 top,translate(-50%,-50%) 居中);十字竖线补 `vectorEffect="non-scaling-stroke"` 防宽屏拉粗。已录 PROJECT_MEMORY 坑 12。
- **主题刷新后变浅色**(用户反馈,2026-09-21,**真因已定位**):用户贴出的页面 DOM 显示 `<html data-theme="light" class="tongyi-design-pc" style="color-scheme: light !important">` + `<tongyi-web-extension>`——**浏览器的通义扩展在页面加载后把通用的 `data-theme` 属性强改为 light 并注入 `color-scheme: light !important`**,覆盖了应用主题(所以 localStorage 里是 dark、页面却是 light,刷新时黑→白闪一下)。用户随后卸载了该扩展;针对扩展的防御(专属属性 `data-app-theme` 改名 + MutationObserver 守护 + color-scheme 对冲)已按用户要求**全部撤回**,恢复原 `data-theme` 实现。**保留**了两处无条件有益的加固:`index.html` 首帧前的内联主题引导脚本(消除刷新闪烁/时序问题)和 `auth.tsx` 主题存储读写 try/catch(隐私模式容错)。教训:**勿把应用状态挂在通用命名约定的属性上**(data-theme/class:dark 等是扩展和 dark-reader 类工具的目标);若用户日后装回同类扩展,可按此思路重新加固。
- **下拉再点不关闭**(用户反馈,2026-09-21):菜单开着时再点同一触发元素,`MenuHost.open` 会重设状态等于重新打开。修复:`open()` 里判断——同一锚点再次打开时改为直接关闭(toggle),换锚点则切换菜单。已验证:开→再点触发=关;开→选其他项=生效并关闭。
- **选择器仍是移动端底部弹窗**(用户反馈,2026-09-21):桌面端点开"时间范围/暂停防护/保留时长"等选择器弹的是 iOS 底部弹窗。修复:`ui.tsx` 新增 `MenuHost`(portal + 锚点 rect 定位的下拉菜单,下方放不下自动上翻,外点/Esc/滚动即关)+ `usePick()` 钩子——桌面(≥lg)走下拉菜单,移动端原样回退底部弹窗(含标题+当前项勾选)。`Row.onClick` / `Switch.onChange` / `Button.onClick` 均放宽为带事件参数以传锚点。已改造 5 处纯单选选择器:仪表盘时间范围、防护卡暂停时长、设置页日志/统计保留时长、过滤器更新间隔、DHCP 网络接口;表单类弹窗(添加过滤器/重写/租约、安全搜索、日志详情、客户端表单)保持弹窗不动。双端截图已验证。注意:下拉菜单挂在 `SheetProvider` 内部的 `MenuHost`,App.tsx 无需改动。

## 本次会话新坑(补充到验证流程)

1. **IAB 登录自动化**:Playwright `fill()` 后 React state 可能未更新(disabled 只看 url/username);点击超时大概率是按钮 disabled。**解法**:`evaluate` 用原生 setter + `dispatchEvent(new Event('input',{bubbles:true}))` + `form.requestSubmit()`。
2. **evaluate 里不能写 TS 语法**(`as X` 会报 Unexpected identifier)。
3. **IAB 截图在轮询密集页面(日志 2s/防护 5s)频繁超时或截到中间帧**(顶栏/标题看似消失):先用 `evaluate` 查 DOM 的 rect/opacity/text 确认真实状态,再重试截图;clip 截图有双影伪影,验证一律用全页截图(与 PROJECT_MEMORY 第 9 节一致)。
4. IAB tab 的 `tabs.list().find(url)` → `tabs.get(id)` 每个新 kernel 都要重做(绑定不跨调用)。
5. `useIsDesktop` 放 `src/lib/useIsDesktop.ts`,页面在顶部调用(勿放条件 return 之后,坑 4)。
