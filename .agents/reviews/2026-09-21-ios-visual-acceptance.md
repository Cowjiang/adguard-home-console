# iOS 双版本视觉验收报告(2026-09-21)

> 任务:对 **SwiftUI 原生版** 与 **Tauri 混合壳版** 与 **Web 版**(设计系统主形态=深色)做逐页视觉对照,产出验收结论 + 第二轮施工清单(仅原生版)+ 无法复刻项清单。
> 用户验收口径:"UI 变化不大,除非实现不了;实现不了的列出来"。
> 本报告只做验收,未改任何业务代码。补充取证截图存 `.agents/evidence/acceptance/`——**截图不入库**(该目录已被 gitignore),下文路径是本机留存位置,克隆后不存在,要复核需按文中方法重拍。

---

## 0. 取证材料与方法

| 端 | 材料 | 说明 |
| --- | --- | --- |
| Web 基准 | `.agents/evidence/web/01–09*.png`(390×844 深色)+ `light/01–05.png` | 8787 Express + mock AGH(127.0.0.1:3990)实拍 |
| SwiftUI 原生版 | `.agents/evidence/native/01–09*.png` + 本次补拍 `.agents/evidence/acceptance/native-10–14*.png` | iPhone 17 模拟器,app `com.adguardhome.console` |
| Tauri 壳版 | `.agents/evidence/tauri/01–04*.png` + 本次补拍 `.agents/evidence/acceptance/tauri-20/21*.png` | iPhone 18 Pro 模拟器,"AGH Console"(同一 bundle id,内嵌同一套前端 dist) |

**本次补充取证**(simctl 完成,结束后已全部还原):

- `native-10-login-dark` / `native-11-login-light`:登录页。方法:`simctl keychain reset` 清掉已存实例 → 带预填 env 冷启动(AUTOCONNECT 不置位)。**旧 `.agents/evidence/native/01-login.png` 实为一张深色概览(命名错位),且 `08-protection-paused.png` 摄于收敛前的旧构建(统计黑字、拦截线红色),均不作为本轮证据。**
- `native-12-paused-light` / `native-13-paused-dark`:防护暂停态当前构建实拍。方法:mock AGH `POST /control/protection {enabled:false,duration:3600000}` → 冷启动 app → 截图 → `enabled:true` 还原。
- `tauri-20-overview-dark`:Tauri 版深色概览(此前只有浅色)。
- `native-14-restore-check` / `tauri-21-restore-light`:收尾还原核对。
- 两台模拟器外观均已恢复 light;防护已恢复开启;未安装/卸载/改动任何文件;未 shutdown 设备。

**验证局限**(如实声明):simctl 无手势注入、宿主无辅助功能权限(已尝试 AppleScript,超时),因此**无法切 tab / 滚动**。故原生版深色下只有概览页实拍;日志/过滤器/设置的深色验收依据 = 浅色实拍 + token 源码核对(`AGStyle.swift` 全部为 `Color(light:dark:)` 动态色,深色映射与 Web 深色 token 一致,破版风险低)。Tauri 滚动性能同样无法交互验证,见 §4。

---

## 1. SwiftUI 原生版逐页验收表

评审维度:页面结构 / 信息密度 / 卡片质感(实色+细边框)/ 语义色(翡翠 #34D399、玫红 #FB7185、天蓝 #38BDF8、琥珀 #FBBF24、重写紫 #A78BFA)/ 数字排版 / 图表 / 文案。上一轮 Top5(agCard、token 色、22pt rounded 统计、双 series 图表、胶囊分段、日志卡片流、统计块+图标气泡、登录渐变)已确认落地。

### 1.1 概览页 ✅ 接近达标(两套中还原度最高的一页)

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 页面结构:防护卡→2×2 统计→趋势图→Top 榜单→上游→服务器信息 | ✅ 一致 | `native-13-paused-dark` / `.agents/evidence/native/06-dark` vs `.agents/evidence/web/02-overview`、`06-overview-bottom` |
| 卡片质感:#121419 实色 + 1pt 白 8% 边框 + 连续圆角 | ✅ | `06-dark`,与 Web 逐卡对比无肉眼差 |
| 语义色:今日查询=翡翠、已拦截=玫红、耗时/客户端=天蓝 | ✅ | `06-dark` / `native-12-paused-light`(浅色 #059669/#E11D48/#0284C7 亦正确) |
| 数字排版:22pt bold rounded + tabular | ✅(12.5k / 2,170 / 23 ms 与 Web 同构) | `06-dark` |
| 趋势图:查询=翡翠面积+描线,拦截=天蓝细线 | ✅(旧 08 截图里的红线是旧构建;当前构建已天蓝) | `06-dark`、`native-12-paused-light` |
| Top 榜单:胶囊三段 + 名称/细条/右对齐数值三列 | ✅ | `.agents/evidence/native/07-overview-bottom` |
| 上游卡:翡翠图标气泡 + 天蓝 ms 徽标 | ✅(额外多一列响应数,见下) | `07-overview-bottom` |
| 请求构成环形图 | ❌ **整块缺失**(Web 概览第三张卡) | `.agents/evidence/web/02-overview` 底部 vs `06-dark` |
| 顶部状态胶囊"防护运行中 \| AdGuard Home Console" | ❌ 缺失(Web 全页面常驻) | `.agents/evidence/web/02` 顶部 vs `06-dark` |
| 防护卡质感 | ⚠️ Web = 翡翠 20% 混入 `#15171D` 实色的 140° 渐变 + 边框;原生 = 翡翠 10% 平涂(直接叠在页面黑底上),深色下明显偏"黑绿"、比 Web 更暗更闷 | `native-13-paused-dark` vs `.agents/evidence/web/08-protection-paused` |
| 防护卡两枚按钮(定时暂停/刷新状态) | ⚠️ 原生 `.bordered` 带翡翠 tint;Web 为中性深灰胶囊白字 | `06-dark` vs `.agents/evidence/web/02-overview` |
| 趋势图坐标轴 | ⚠️ 原生有 Y 轴数字(750/500/250/0)+ 纵向网格线;Web 无 Y 轴、仅横向淡虚线;X 轴原生"11 15 19 23"小时数,Web"06:00 10:00…" | `06-dark` vs `.agents/evidence/web/02-overview` |
| Top 榜单"查看更多"按钮 | ❌ 缺失 | `.agents/evidence/web/06-overview-bottom` vs `07-overview-bottom` |
| 防护暂停态 | ✅(玫红 tint + ShieldOff + 恢复时间倒计时,语义/色 token 均对) | `native-12/13` vs `.agents/evidence/web/08` |

### 1.2 日志页 ✅ 接近达标

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 卡片流 + qtype 彩色竖条 + 彩色 qtype 小标 + "缓存"标 + 副行耗时 ms + 右侧语义徽标 | ✅ 全部落地 | `.agents/evidence/native/03-log`、`09-log-scrolled` vs `.agents/evidence/web/03-log`、`07-log-scrolled` |
| 徽标语义色(黑名单=玫红/放行=翡翠/上游错误·无效请求=琥珀/白名单=翡翠/重写=紫) | ✅(token 对齐,重写紫已纠正) | `03-log` |
| qtype 色表 | ✅ token 同源(`AGStyle.qtype` 照搬 QTYPE_COLORS;浅色 CNAME=#B45309 与 Web 浅色一致,非色差) | `AGStyle.swift:54` |
| 筛选控件 | ⚠️ 原生 AGSegmented 单胶囊容器;Web 为独立 chips(间距 8px、全部=翡翠 soft+描边)。观感接近,可接受 | `03-log` vs `.agents/evidence/web/03-log` |
| qtype 小标底色 | ⚠️ Web qtype 文本带语义色 soft 胶囊底(浅色下明显);原生为裸文本 | `.agents/evidence/web/light/03-log` vs `.agents/evidence/native/03-log` |
| 耗时格式 | ⚠️ Web 保留小数(5.65 ms / 3.80 ms);原生一律 `%.0f`(6 ms / 4 ms) | 同上 |
| "实时"胶囊(标题右,绿点脉冲) | ❌ 缺失(2s 轮询存在,仅缺指示) | `.agents/evidence/web/03-log` vs `.agents/evidence/native/03-log` |
| 搜索 | ✅ `.searchable` 保留原生(既定保留项) | — |
| 额外差异 | ℹ️ 原生多"最近 100 条 · 每 2 秒刷新"节头;Web 无。无害 | `03-log` |

### 1.3 过滤器页 ⚠️ 小差距(结构缺口是主因)

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 顶部统计块存在(规则总数翡翠 / 黑白数玫红) | ✅ 结构有 | `.agents/evidence/native/04-filters` vs `.agents/evidence/web/04-protection` |
| 规则总数口径与格式 | ⚠️ Web=178,581(分组数字,含 2 条自定义,副标题"含 2 条自定义");原生=182.8k(compact 缩写,未含 userRules,副标题"拦截 + 白名单") | 同上 |
| "过滤器列表"统计卡 | ⚠️ Web:"黑2 / 白1"黑=玫红、白=翡翠双色 + 圆形刷新钮 + "1 天前更新";原生:label"列表"、值"2 黑 · 1 白"整串玫红、无刷新钮、无更新时间 | 同上 |
| 拦截/白名单列表行:图标气泡 + 名称 + 规则数 + 已启用徽标 | ✅(已启用=翡翠 soft 胶囊) | `04-filters` |
| "过滤功能"六行图标气泡入口组(黑名单/白名单/自定义规则/拦截服务/DNS 重写/规则检测) | ❌ 缺失(原生尾部仅一行"后续版本提供"说明) | `.agents/evidence/web/04-protection` vs `04-filters` |
| "安全防护"分组(浏览安全/家长控制开关) | ❌ 缺失 | 同上 |
| 自定义规则行 | ⚠️ 原生裸 monospace 文本行(无卡片、无图标气泡);Web 收在分组卡内 | `04-filters` |

### 1.4 设置页 ⚠️ 小差距(结构缺口是主因)

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 主题三段胶囊分段(跟随系统/深色/浅色,选中=翡翠 soft+描边) | ✅ 与 Web `09-settings-app` 一致 | `.agents/evidence/native/05-settings` vs `.agents/evidence/web/09-settings-app` |
| 服务器信息行(地址/版本/运行状态/DNS 端口) | ✅ 系统行样式,数值等宽+可选中文本 | `05-settings` |
| 退出登录(红字) | ✅ | `05-settings` |
| 图标气泡功能入口组(查询日志与统计/DNS/访问控制/加密/DHCP/应用设置/系统管理,各带彩色气泡+副标题) | ❌ 缺失(原生=标准设置页,Web=七行入口卡) | `.agents/evidence/web/05-settings` vs `05-settings` |
| 标题下版本副标题("AdGuard Home 0.107.79")与底部居中版本号 | ⚠️ 原生无副标题;版本在"关于"节内 | 同上 |

### 1.5 登录页 ✅ 接近达标

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 渐变图标块(翡翠→天蓝,76px/圆角 24/投影) | ✅ | `native-10-login-dark` vs `.agents/evidence/web/01-login` |
| 标题 | ✅(原生多一行副标题"连接你的 AdGuard Home 实例",Web 无;无害) | 同上 |
| 表单卡(glass-strong 实色+边框,22px 圆角) | ✅ | `native-10` |
| 输入框质感 | ⚠️ Web 每个输入域是实色内嵌框(14px 圆角+1px 边框,聚焦翡翠描边);原生 TextField 无底无边,深色下表单卡内只有"标签+文字",输入区域边界感缺失 | `native-10-login-dark` vs `.agents/evidence/web/01-login` |
| 主按钮:翡翠→天蓝渐变胶囊 | ✅(缺 Web 的"→"箭头,可忽略) | `native-10` |
| 底部说明 | ℹ️ 原生一句"凭据保存在本机 Keychain"(Web 两行浏览器语境文案)——语义正确,保留 | 同上 |

### 1.6 全局 chrome —— 保留项(不算差距,不得要求修改)

1. **系统液态玻璃 tab bar + `tabBarMinimizeBehavior(.onScrollDown)`**:Web 的 CSS 胶囊透镜是对它的模仿,原生是参照物。
2. **系统大标题折叠 / `.searchable` / `.refreshable` / Toggle / Menu / Sheet**:系统肌肉记忆优先。
3. **tab 图标为 SF Symbols**(shield.lefthalf.filled / line.3.horizontal.decrease / list.bullet.rectangle / gearshape):与 Web lucide 线性图标不同,属原生语义,保留。
4. 动效:原生未新增夸张动效,`AGSegmented` 用 0.3s spring 滑块,符合克制要求。

---

## 2. 第二轮施工清单(仅 SwiftUI 原生版,按影响排序)

> 全部限定内容区,不碰 tab bar / 导航栏 / 系统控件。性能红线依旧:**内容卡片禁止 `.ultraThinMaterial` / `glassEffect` / 任何背板模糊**(`agCard` 实色方案保持)。落点文件均为 `ios/AdGuardConsole/` 下。

**R1 概览补"请求构成"环形图卡**(结构差最大单项)
- 文件:`Features/Overview/OverviewView.swift`(在 `TrendChart` 与 `TopListsCard` 之间插入)+ 新建 `Features/Overview/DonutCard.swift`。
- 做法:Swift Charts `SectorMark`(iOS 17+,部署目标 26 无忧).angularInset(1.5).cornerRadius(3) 做四段环:正常放行=`.agAccent`、已拦截=`.agDanger`、安全浏览=`.agWarn`、安全搜索=`.agInfo`;中心叠 `Text(Fmt.compact(numDnsQueries))` 22pt rounded + "总请求"caption。右侧图例行:色点 + 名称 + `Fmt.compact` 值 + `Fmt.pct`,数据全部取自 `AGHStats`(numDnsQueries/numBlockedFiltering/numSafeBrowsing/numSafeSearch),在 `OverviewModel` 加一个 computed 数组。外层 `.padding(16).agCard(cornerRadius: 20)`,标题"请求构成" `.headline` 对齐其他卡。

**R2 防护卡渐变底 + 中性按钮胶囊**
- 文件:`Features/Overview/ProtectionCard.swift:75-82`。
- 现状是 `(enabled ? agAccent : agDanger).opacity(0.10)` 平涂。Web 实为 `linear-gradient(140deg, mix(accent 20%, #15171D), #15171D)`(见 `src/components/ProtectionCard.tsx:85`)。SwiftUI 翻译:
  ```swift
  .background(
      RoundedRectangle(cornerRadius: 24, style: .continuous)
          .fill(.agCardBg) // 先铺实色,避免透出页面黑底
          .overlay(
              LinearGradient(colors: [(enabled ? Color.agAccent : Color.agDanger).opacity(0.18), .clear],
                             startPoint: .topLeading, endPoint: .bottomTrailing)
          )
  )
  ```
  即"实色卡底 + 语义色 18% 向右下淡出",替代平涂;`.strokeBorder` 保留但建议随状态 0.14→0.16。**纯渐变叠加,无材质,不触红线。**
- 同文件 `:50-72`:定时暂停/刷新状态两枚按钮由 `.buttonStyle(.bordered)`(翡翠 tint)改为自定义胶囊:`Label(...).font(.footnote.weight(.medium)).padding(.h12,.v7).background(Capsule().fill(Color.primary.opacity(0.06))).foregroundStyle(.primary)`,对齐 Web 中性深灰胶囊。

**R3 顶部状态胶囊(Web 标志性元素)**
- 文件:`Features/Overview/OverviewView.swift`(ScrollView 内容顶部插入;不悬浮、不做玻璃)。
- 做法:`HStack { Circle().fill(enabled ? Color.agAccent : Color.agDanger).frame(6) ; Text(enabled ? "防护运行中" : "防护已暂停").font(.footnote.weight(.medium)) ; Text("| AdGuard Home Console") }` 套 `.agCard(cornerRadius: 999).padding(.horizontal,14).padding(.vertical,8)`,水平居中,`.frame(maxWidth:.infinity)`。状态取 `session.status?.protectionEnabled`(AppSession 已有),暂停态自动切玫红——顺带补齐 G10。仅在概览页做(Web 中该胶囊属于 Layout,但原生各页都加大标题,重复出现会显乱;概览一张即可,见"无法复刻项"§3.4)。

**R4 趋势图坐标轴对齐 Web**
- 文件:`Features/Overview/TrendChart.swift:82-97`。
- X 轴:`AxisValueLabel(format: .dateTime.hour().minute(), centered: true)`(输出"06:00"式),stride 保持 `.stride(by: .hour, count: max(1, range.rawValue/6))`(24h 时=4 小时间隔,同 Web);并在该 AxisMarks 里**不放 AxisGridLine**,去掉纵向线。
- Y 轴:Web 无 Y 轴数字 → 删除 `AxisValueLabel`,仅留 `AxisGridLine().foregroundStyle(Color.agBorderColor)`;如要更像 Web,`AxisGridLine` 加 `.lineStyle(StrokeStyle(lineWidth: 0.5, dash: [3]))` 变虚线。

**R5 过滤器页:统计块口径 + "过滤功能"入口组**
- 文件:`Features/Filters/FiltersView.swift`。
- 统计块(`:75-81`):①`规则总数`改 `Fmt.num(totalRules + userRules.count)`(与 Web 口径一致,把 2 条自定义算进 178,581),副标题"含 \(rules.count) 条自定义";②第二张卡 label 改"过滤器列表",值用 `AttributedString` 分色:"黑 2 " `.agDanger` + "/ " secondary + "白 1" `.agAccent`,副标题接 `GET /filtering` 的 last_modified 相对时间("1 天前更新",`Fmt` 加 relative formatter),行尾加 32pt 圆形 `.bordered` 刷新钮。
- 补"过滤功能"入口组(视觉即可,子页未就绪也能进占位页或先 disable):六行 `NavigationLink`/行,行首 36pt 图标气泡(`RoundedRectangle(cornerRadius:10).fill(tint.opacity(0.14))` + SF Symbol):黑名单=玫红 `line.3.horizontal.decrease`、白名单=翡翠 `checkmark.circle`、自定义规则=紫 `doc.badge.gearshape`、拦截服务=琥珀 `app.badge`、DNS 重写=天蓝 `arrow.left.arrow.right`、规则检测=翡翠 `magnifyingglass`,标题+副标题+chevron,行卡 `.agCard(cornerRadius:16)`。"安全防护"分组(浏览安全/家长控制 Toggle)可先做开关行 UI,行为接 API 或暂禁用。此条同时是与 Web 结构差最大的两处之一,但因涉及子页功能节奏,排 R5;若工期紧可先做"入口组静态视觉 + 点击 Toast/占位"。

**R6 设置页:图标气泡入口组 + 版本副标题**
- 文件:`Features/Settings/SettingsView.swift`。
- 复用 R5 的"图标气泡行"组件(建议抽成 `IconBubbleRow(icon:tint:title:subtitle:)` 放 `Design/AGStyle.swift` 或独立文件,两页共用):查询日志与统计(天蓝 `doc.plaintext`)/DNS 设置(翡翠 `network`)/访问控制(紫 `wrench.and.screwdriver`)/加密设置(琥珀 `lock.shield`)/DHCP(翡翠 `wifi`)/应用设置(天蓝 `gearshape`)/系统管理(玫红 `shield.lefthalf.filled`),副标题照 Web 文案。子页未就绪者点击进占位。
- `.navigationTitle("设置")` 下加版本副标题:大标题模式下可用 `Text("AdGuard Home \(status.version)").font(.footnote).foregroundStyle(.secondary)` 放列表顶部;底部加居中 "AdGuard Home Console v\(appVersion)" caption。

**R7 日志页细节三连**
- 文件:`Features/Log/QueryLogView.swift`。
- ①qtype 小标加软胶囊底:`Text(type).font(.caption2.weight(.bold)).foregroundStyle(qtypeColor).padding(.h5,.v1).background(Capsule().fill(qtypeColor.opacity(0.14)))`(`LogRow:191-193`),对齐 Web 浅色实拍。
- ②标题旁"实时"胶囊:导航栏 `toolbar` 加 `HStack{Circle().fill(Color.agOk).frame(5);Text("实时").font(.caption)}` 套翡翠 soft 胶囊;点击暂停/恢复 `model.pollTask`(能力已有,`QueryLogModel.start/stop`),暂停时点变灰、文案"已暂停"。
- ③耗时格式:`LogRow:213` 改 `ms < 10 ? "%.2f ms" : "%.0f ms"`(与 `Fmt.ms` 同规则,可直接复用 `Fmt.ms`,注意它入参是秒,除以 1000)。

**R8 登录页输入框质感**
- 文件:`Features/Login/LoginView.swift:49-74`。
- 给三个输入框加统一 field 样式(对照 `.field`):`.padding(11,14).background(RoundedRectangle(cornerRadius:14,style:.continuous).fill(Color.agCardBg)).overlay(RoundedRectangle(...).strokeBorder(Color.agBorder))`;聚焦态可加 `.strokeBorder(Color.agAccent.opacity(0.55))`(经 `focusedField` 判断)。浅色下 agCardBg=白、表单卡=白,可改浅色用 `Color.agBg` 做输入底以保留层次(与 Web 浅色 field 白底+边框一致的观感,实现时二选一微调)。主按钮文本后补 `Image(systemName:"arrow.right")`。

**R9 概览两处小项**
- 文件:`Features/Overview/OverviewCards.swift`。
- ①`TopListsCard` 底部加全宽"查看更多"按钮:`Button("查看更多"){}.frame(maxWidth:.infinity).padding(.v8).background(Capsule().fill(Color.primary.opacity(0.05)))`,目标页可先接 TopListPage 对应的原生占位。
- ②`UpstreamCard`:Web 每行只有 ms 徽标,原生多一列响应数(48pt)。信息量更大,**建议保留但可选**:若要逐像素对齐就删 `:159-162` 的 count Text(把 count 并入 ms 徽标 tooltip/无障碍标签)。同时 URL 截断过狠(`dns.g...le`),`truncationMode(.middle)` 保留但把 Text 加 `.layoutPriority(1)`、count 列宽压缩到 40。

**R10 过滤器页自定义规则行收纳**
- 文件:`Features/Filters/FiltersView.swift:106-118`:裸 monospace 行包一层 `.agCard(cornerRadius:12)` + 行首紫色 `doc.text` 16pt 气泡,弱结构差异消除。

**落地顺序建议**:R1+R2+R4(概观三连,一次提交)→ R3 → R7 → R8 → R9+R10 → R5+R6(涉及子页节奏,可与 N4/N7 里程碑合并排期)。每步用 `.agents/evidence/acceptance/` 同角度截图对照。

---

## 3. 无法复刻项清单(实现不了或不建议复刻,每条附理由)

| # | 项 | 结论 | 理由 |
| --- | --- | --- | --- |
| 3.1 | **液态玻璃 tab bar 的透镜折射/拉伸动效**(Web `.tab-lens` backdrop blur + WAAPI `scale(1.07,0.97)` 拉伸 + `cubic-bezier(0.32,1.25,0.4,1)` 滑动) | **原生无需复刻(已更好)** | iOS 26 系统玻璃的材质、折射与 minimize 形变由系统管理,参数不可注入;Web 版本就是对它的模仿。原生还有 `tabBarMinimizeBehavior` 这种 Web 做不到的行为。**用户既定决策:保留系统 tab bar,不算差距。** |
| 3.2 | **玻璃参数级还原**(blur 半径/saturate/brightness/inset 高光 `.specular::after`) | **不复刻** | SwiftUI 端没有等效的自定义背板模糊钩子;`.ultraThinMaterial`/`glassEffect` 参数由系统定。且大面积背板模糊=发热红线(Web 版已把卡片全部改实色),任何"把卡片做成玻璃"的提议都违反 PROJECT_MEMORY §4。深色主形态下 Web 卡片本身也是实色(`--glass:#121419`),无损失。 |
| 3.3 | **Web WAAPI 弹跳动效**(标签栏点击 bar `scale(1.014,0.99)` 380ms、页面 `page-in`、`rise-in`、`log-flash` 背景闪烁) | **不建议复刻** | 系统点击反馈 + SwiftUI 隐式动画已覆盖按压态;`log-flash` 的背景色闪烁在 List 复用下实现成本高、易出复用毛刺。动效克制约法:不为对齐 Web 加码(上一轮报告 §6.6 同结论)。 |
| 3.4 | **悬浮玻璃顶栏**(Web 固定在安全区下方的胶囊"防护运行中",滚动时悬浮 + 玻璃底) | **形态不可复刻,建议用内联胶囊替代(R3)** | 原生导航栏由系统大标题折叠管理,再叠一个悬浮玻璃胶囊会与导航栏/滚动边缘效果打架,且需要材质(红线)。折中:胶囊放进滚动内容顶部,随页滚动——状态传达不丢,玻璃形态放弃。此条即"实现不了同样效果"的正式报备。 |
| 3.5 | **环境光晕背景**(`.ambient` 三个 radial-gradient,深色下 6-7% 透明度) | **可复刻但不建议** | SwiftUI 三个 `RadialGradient` 叠底完全做得到;但深色下肉眼几乎不可见(设计意图即"极淡"),收益≈0,还多一层离屏渲染。浅色若后续要,再加。 |
| 3.6 | **Web 标签栏透镜随内容的透色**(Tauri 深色截图中透镜透出环形图红色) | **原生已等价** | 系统玻璃 tab bar 天然透出下滚内容,行为一致,无需处理。列此条仅为说明"看起来不同但同源"。 |
| 3.7 | **Web `chart-touch` 十字线 tooltip** | **技术可复刻,本轮不做** | Swift Charts `chartOverlay` 可做十字线;但属功能新增非视觉收敛,且易引入滚动冲突,建议独立排期。 |
| 3.8 | **长按禁用/`-webkit-touch-callout` 等 Safari 妥协** | **不适用** | 原生无此问题;Web 版全局禁长按是 Safari 妥协,原生保留系统长按是优势,不反向对齐。 |

---

## 4. Tauri 壳版验收(单独一节)

Tauri 版与 Web 版是**同一套前端**(同 dist),验收重点是"壳"带来的差异。

| 检查点 | 结论 | 证据 |
| --- | --- | --- |
| 页面结构/信息密度/语义色/数字/图表 | ✅ 与 Web 基准逐像素同构:顶部状态胶囊、防护渐变卡、2×2 统计、面积图+天蓝拦截线、请求构成环形图全部在位 | `.agents/evidence/tauri/02-overview`(浅)vs `.agents/evidence/web/light/02-overview`;**`.agents/evidence/acceptance/tauri-20-overview-dark` vs `.agents/evidence/web/02-overview`(深)——深色下两者几乎无法区分** |
| 原生 UITabBar vs Web CSS 标签栏 | ✅ 可接受:胶囊形玻璃 bar + 选中白色透镜,观感与 Web 胶囊栏同族;图标换 SF Symbols 实心(概览=house、过滤器=shield、日志=doc、设置=gearshape),与 Web lucide 线性图标(漏斗)隐喻略不同,**建议保留(既定决策),如要逐像素对齐可后续给 UITabBar 配自定义图标资源** | `.agents/evidence/tauri/04-tabbar`、`tauri-20-overview-dark` 底部 |
| 选中态 | ✅ 透镜+翡翠文字/图标,与 Web text-accent 语义一致 | `.agents/evidence/tauri/04-tabbar` |
| TabBarInsets 安全区 | ✅ `--tabbar-space` 经 `getTabBarInsets` 注入(`src/lib/nativeTabbar.ts`):日志页最后一张卡片完整停在 bar 上方;概览页内容在玻璃 bar 下自然穿过透出(与 Web 悬浮栏行为一致,非遮挡) | `.agents/evidence/tauri/03-log` 底部、`tauri-20-overview-dark` 底部 |
| 渲染异常 | ✅ 深浅色均正常(WKWebView 跟随设备外观),无白边、无拉伸、无字体回退异常;深色实拍无渲染伪影 | `tauri-20-overview-dark` |
| 滚动性能 | ⚠️ **未能实测**:无手势注入手段,无法肉眼评估滚动帧率。风险面评估:页面模糊层只剩 tab bar 一处背板 blur(卡片全实色),与 Web 版发热改造后的状态相同,预期与 Web 相当;**建议在真机上人工滚一遍概览/日志复核**(唯一遗留验证项) | — |
| 与 Web 的其他差异 | ℹ️ 无。前端同源,Web 端后续改什么 Tauri 同步受益 | — |

**Tauri 版结论:验收通过。** 无施工需求;唯一动作是真机滚动复核(非视觉施工)。

---

## 5. 总体结论

### 相似度评分(与 Web 版,深色主形态为准)

| 端 | 评分 | 一句话 |
| --- | --- | --- |
| **Tauri 壳版** | **96 / 100** | 同一前端,深色实拍与 Web 难以区分;扣分项仅 tab 图标隐喻与玻璃透镜观感的系统级差异(既定保留) |
| **SwiftUI 原生版** | **78 / 100** | 颜色/卡片/数字/图表 token 层已对齐,概览与日志"一看就是同一套设计";扣分集中在:请求构成环形图缺失(-5)、防护卡平涂 vs 渐变(-3)、顶部状态胶囊缺失(-3)、过滤器/设置页功能入口组缺失(-6)、坐标轴/小细节(-5) |

分页评分:概览 85 / 日志 85 / 过滤器 65 / 设置 62 / 登录 88(Chrome 保留项不计差)。

### 第二轮施工优先级 Top5

1. **R1 请求构成环形图卡**(概览最大结构缺口,Swift Charts SectorMark,纯数据已有)
2. **R2 防护卡渐变底 + 中性按钮胶囊**(首页第一视觉焦点,实色底+渐变叠加,不触红线)
3. **R4 趋势图坐标轴**(去 Y 轴数字/纵线,X 轴"HH:00",一行代码级改动、观感提升明显)
4. **R3 顶部状态胶囊**(Web 标志性元素,内联实现,顺带补暂停联动)
5. **R5 过滤器页统计口径 + 入口组 / R6 设置页入口组**(两页评分 65/62 的主因;入口组可先做静态视觉,与 N4/N7 功能里程碑合并)

R7/R8/R9/R10 为半小时级小项,可穿插任意提交。

### 遗留验证项

- 原生版日志/过滤器/设置的**深色实拍**(本轮因无手势注入未能切换 tab;token 为动态色,风险低)。
- Tauri 版**真机滚动帧率**肉眼复核。
- `.agents/evidence/native/01-login.png`(实为深色概览)与 `08-protection-paused.png`(旧构建)建议下一轮重拍归档,避免误导。

### 收尾确认

- 两台模拟器外观已恢复 light;iPhone 17 app 已恢复登录运行态、iPhone 18 Pro app 已恢复浅色运行态;mock 防护已恢复开启;本会话未启动任何常驻进程,无需要清理的后台任务;未 git commit;`docs/` 下除本报告与 `.agents/evidence/acceptance/`(新增取证截图)外未动任何文件。
