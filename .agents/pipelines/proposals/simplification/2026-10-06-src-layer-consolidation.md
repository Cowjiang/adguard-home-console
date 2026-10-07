# 收敛 src/ 页面层的重复编排、探测状态机与超载文件

**Class:** simplification
**Status:** implemented
**Date:** 2026-10-06
**Updated:** 2026-10-07（实施完成并验收：runMutation、probe engine、useDraftForm、乐观习语文档；落地签名与基线的实测差异见 Note 的实施记录）
**Source:** 2026-10-06 整体架构审核（web 端部分）建议 1/2/3/4；用户方向（同日会话，含组件与 lib 散落观察）

## Goal

消除 `src/pages` 最大的一类重复（42 处 try→api→mutate→toast 编排，基线见 Note），把 `auth.tsx` 内嵌的探测状态机变为可测模块，拆分三个超载文件，把散落的组件与 lib 平铺文件按域/关注簇归位，并把 draft 表单的共享行为收敛为 hook。**不改变任何用户可见行为**（draft 不变式补齐除外，见决策 5）。完成后的可观察收益：新页面写 mutation 只学一个 helper；探测退避逻辑进 vitest；页面文件回归"数据编排 + 组装"；`components/` 按域可检索；`lib/` 的壳接缝、会话、导航三簇有明确扩展位。

## Decision

1. **`runMutation()` helper（`src/lib/mutation.ts`）**：统一 mutation 编排——`action()` 执行、成功后 `invalidate()`（scoped mutate）+ 成功 toast、失败按现状取 `e.message`（kind 体系下已本地化）渲染失败 toast。落地签名 `{ action, invalidate?, okKey?, okVars?(result), failKey?, setBusy? }`：`failKey` 默认 `common.saveFailed`（各页 delete/add/op/update 文案原样传入）、`okVars` 从 action 结果取值（唯一带变量的成功 toast 是 `protection.refreshedToast` 的 n）、`setBusy` 承接 `setSaving`/`setRefreshing`。迁移是逐处等价替换，各页现有 toast 文案保持不变，返回布尔值供调用方决定关 Sheet/跳转。**不纳入**乐观更新习语（决策 6）与纯请求无 toast 的场景。
2. **probe engine 抽出（`src/lib/session/probe.ts`）**：从 `auth.tsx` 抽出探测状态机为独立模块，依赖注入 `fetchStatus` 与时钟；`AuthProvider` 只做 React 接线（状态订阅 ↔ useState）。接口保持最小：创建引擎（注入依赖）、`probe(instance, ep, isActive)`、`probeAll(..., force)`；内部保留 per-instance `{inFlight, failures, nextAt}` 状态与退避曲线。行为不变：非活动失败退避 15/30/60s 封顶、成功复位、活动实例永不退避、恢复触发 scoped revalidate、移除实例丢弃在途结果。
3. **机械拆分（零行为变化，路由不变）**：
   | 现文件 | 拆出 |
   | --- | --- |
   | `pages/AdvancedSettings.tsx`（1057 行） | `pages/settings/DnsSettings.tsx`、`AccessSettings.tsx`、`EncryptionSettings.tsx`、`DhcpSettings.tsx`，原文件删除 |
   | `pages/Settings.tsx`（653 行） | 索引页留 `pages/Settings.tsx`；`pages/settings/GeneralSettings.tsx`、`SystemSettings.tsx`（AGH 服务器设置组）、`AppearanceSettings.tsx`、`AboutSettings.tsx`（应用设置组）、`InstanceList.tsx`、`InstanceEdit.tsx`（实例管理组），与 `docs/web-interaction.md` 声明的分组对齐 |
   | `components/ui.tsx`（970 行、30+ exports） | `components/ui/` 下行为核心（`sheet.tsx`：SheetProvider/useSheet/useConfirm；`menu.tsx`：MenuHost/usePick/PickSelect；`toast.tsx`：toast/ToastHost）、布局原语（`primitives.tsx`：Screen/PageHeader/HeaderAction/Card/Group/GroupTitle/Row/Rows/Switch/Button/Segmented/TabContent）、原子与反馈（`atoms.tsx`：Badge/StatusDot/SourceBadge/Chip/SearchBar/CopyIconButton/Pagination/Spinner/Loading/EmptyState/ErrorBox）。**不留 re-export barrel**，全量改 import，否则 fan-in 成本未降 |
4. **组件与 lib 归位（规则优先，防倾倒场）**：现状约 24 个页面私有组件/渲染 helper 散在 8 个页面文件，另有 3 处 pages→pages 跨页 import（`ClientFormPage→Clients` 的 `ClientForm`/`emptyClient`、`FiltersPages→Protection` 与 `Settings→Protection` 的 `IconBubble`）；`lib/` 有 20 个平铺文件 + i18n 目录，本提案还要新增 `mutation.ts`/`probe.ts`/`useDraftForm`，平铺将不可检索。
   - **R1 跨页消费的组件 → 必须 `src/components/`**：`IconBubble`（→ `ui/atoms.tsx`，通用原子）、`ClientForm` + `emptyClient`（→ `components/clients/`）；跨页 import 清零。
   - **R2 页面私有、体量小、所在文件不超载 → 留内联**（内联即最高局部性）：如 `OtherStats`（SWR 静默子组件，与页面逻辑强耦合）、`TopListPage` 的 `SearchIcon`/`KINDS`。
   - **R3 页面私有但构成页面主要渲染体 → `components/<domain>/`**：Dashboard 的 `DashSkeleton`/`RangePicker`/`ServerInfoCard`/`UpstreamTable`/`InfoCell`（665→约 300 行编排）；QueryLog 的 `LogRow`/`LogTable`；Clients 的 `ClientTable`/`SortTh`/`IconB`；Protection 的 `SafeSearchSheet`；Layout 的 `TopBar`/`InstanceSwitchList`/`TabBar`/`Sidebar`/`OfflineNotice`（408 行吸收的平台怪癖按域拆开）。
   - **R4 lib/ 中的渲染面留 lib**：`routeTransition.tsx` 的 `TransitionArea` 是转场引擎的渲染出口（引擎而非控件，消费方仅 Layout）；`auth.tsx` 的 Provider 是状态接线。不因"含 JSX"而搬进 components/。
   - **L1–L4 lib/ 分组规则（≥3 个文件共享同一关注点才建组，平铺是默认）**：
     - **L1 壳接缝 → `lib/native/`**：`nativeAppearance`/`nativeBackButton`/`nativeGlass`/`nativeHeaderAction`/`nativePickers`/`nativeTabbar` 六文件（562 行，同一关注点：Tauri 壳能力 + CSS 兜底），本提案实施时同步落一个 `native/shell.ts` 统一 shell/platform 探测（收敛审核 M1 发现的 5 文件 3 约定散布；既有模块改为从它取判定）。
     - **L2 会话 → `lib/session/`**：`auth.tsx`、`instances.ts` + `instances.test.ts`、决策 2 的 `probe.ts`——会话/实例/探测同簇。
     - **L3 导航小件 → `lib/nav/`**：`routes.ts`、`navMeta.ts`、`backNav.ts`、`scrollToTop.ts`（合计 113 行的同簇小件）。
     - **L4 其余留平铺**：`api.ts`（契约唯一书面定义、import 面最大，留根作为入口）、`stats.ts`、`format.ts`、`clipboard.ts`、`constants.ts`、`useIsDesktop.ts`、`pullToRefresh.ts`、`routeTransition.tsx`（748 行引擎，单文件可检索）、规划中的 `mutation.ts`/`useDraftForm.ts`。`i18n/` 已是目录，不动。
   - **目标目录树**：
     ```
     src/components/
       ui/            行为核心 + 布局原语 + 原子（决策 3 的 ui.tsx 拆分落点）
       layout/        Layout、TopBar、InstanceSwitchList、TabBar、Sidebar、OfflineNotice
       dashboard/     DashSkeleton、RangePicker、ServerInfoCard、UpstreamTable、InfoCell
       log/           LogRow、LogTable、LogDetail
       clients/       ClientTable、SortTh、IconB、ClientForm、ClientDetail
       protection/    ProtectionCard、SafeSearchSheet
       charts.tsx     不动（5 个 export 的深模块）
     src/lib/
       native/        shell.ts（新，统一探测）+ nativeAppearance/BackButton/Glass/HeaderAction/Pickers/Tabbar
       session/       auth.tsx、instances.ts(+test)、probe.ts（新）
       nav/           routes、navMeta、backNav、scrollToTop
       api.ts、stats.ts、format.ts、clipboard.ts、constants.ts、useIsDesktop.ts、
       pullToRefresh.ts、routeTransition.tsx、mutation.ts（新）、useDraftForm.ts（新）
     ```
     现有 `components/ClientDetail.tsx`、`LogDetail.tsx`、`ProtectionCard.tsx` 随域目录迁移；对应的薄路由包装页（`ClientDetailPage`/`LogDetailPage`）不动。
5. **`useDraftForm` hook（`src/lib/`）**：draft 表单当前 4 份副本（DnsSettings、AccessSettings、Encryption、GeneralSettings）。落地形态 `useDraftForm(data, project?) → { draft, dirty, patch(key, value), reset(next?) }`：服务器副本是 dirty 基线（`project` 提供「服务器载荷 → 草稿形状」的投影，默认结构克隆），保存成功先 refetch 再 `reset(服务端返回值)`。hook 只收敛真正共享的部分（draft 状态、dirty 判定、保存后回填、丢弃），分歧处保留原样：访问控制的「每行一项」投影、加密页的来源单选、一般设置的双草稿各自留在页面。缺失不变式的副本随之补齐（这是本提案唯一的预期行为变化，方向是修正）。
6. **只文档化、不抽代码**：三种乐观更新习语（`ProtectionCard` 的 pending 镜像、`ClientDetail` 的 draft+回滚、`FiltersPages` ServicesPage 的 pending Set + saveQueue + latestIdsRef 防过期写）在 `docs/engineering.md` 记录适用场景与并发防护要求——统一为 options-bag 会产出浅模块，明确不做。
7. **不做的**：分页/Sheet 表单脚手架抽取；`Row` 嵌套 `button` 修法（使用面广，另行评估）；路由与 i18n key 变更；R2/L4 之外的强行外移或建组（避免 components/ 与 lib/ 变成倾倒场）。

## Accept

- [x] try→api→mutate→toast 编排收敛：实测基线 `catch (e: any)` 43 处/16 文件（提案记 42/10，拆分批次后文件数已变），**33 处**走 `runMutation`（`src/lib/mutation.ts`），保留 10 处且逐条写明理由（见 Note 实施记录）；各页成功/失败 toast 文案与回滚行为不变
- [x] `src/lib/session/probe.ts` 独立于 React 可实例化（时钟与 fetchStatus 注入），vitest 11 例覆盖退避 15/30/60s 封顶、成功复位、活动实例不退避、inFlight 去重、恢复信号（活动实例 fail→ok）、移除实例丢弃在途结果、5s deadline；`AuthProvider` 按信号做 scoped revalidate，「移除实例丢弃在途结果」由引擎的 `drop()` 独立于 store 实现；`useAuth` 返回值不变
- [x] 三个文件按决策 3 的映射拆分，`App.tsx` 路由与用户可见行为不变，`components/ui.tsx` 不存在且无 barrel
- [x] pages→pages 组件 import 清零（实测 0）；components/ 与 lib/ 按决策 4 的目录树归类（含 `native/shell.ts` 统一探测）；最大页面文件 609 行（≤700），`routeTransition.tsx` 736 行为单文件引擎（R4 保留）
- [x] 4 处 draft 表单走 `useDraftForm`，保存成功后按服务端返回值重灌草稿的行为四处一致（DnsSettings/AccessSettings 原缺该不变式，为本次唯一的预期行为修正）
- [x] 乐观更新习语约定写入 `docs/engineering.md`（含「不抽 helper」的判定与各自的并发防护要求），并补记 `runMutation`/`useDraftForm` 的适用边界
- [x] `pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server` 全绿；另做浏览器烟测（mock-agh + dev:all + Playwright）逐条断言成功/失败文案与 draft 生命周期

## Note

- 基线（2026-10-06 grep 实测）：`catch (e: any)` 42 处/10 文件（AdvancedSettings 13、FiltersPages 12、Protection 5、Settings 4、QueryLog 2、Clients 2、ClientDetailPage/LogDetailPage/ProtectionCard/ClientDetail 各 1）；`common.saveFailed` 16 处；pages→pages 组件 import 3 处；页面私有内联组件约 24 个/8 文件（Dashboard 6、Clients 4、QueryLog 2、TopListPage 2、Protection 2，及 AdvancedSettings/Settings 拆分时顺带归位的局部组件）；lib/ 平铺 20 文件 + i18n 目录（native* 六件 562 行、导航小件四件 113 行）。
- 三种乐观习语、4 份 draft 副本、`useConfirm`/Sheet portal 导航注入等证据的行号见 2026-10-06 架构审核记录（会话）；拆分决策的粒度判断：AdvancedSettings 是四个互不引用 section 的命名空间（`App.tsx` 已各自路由），拆分是零耦合操作；ui.tsx 的行为核心（portal、双 rAF、滚动锁、原生 select）是全库最深的模块之一，拆分只动文件边界不动接口。
- R4 的判断依据：`routeTransition.tsx`（748 行）四个关注点中三个是引擎（转场/手势/滚动），`TransitionArea` 只是渲染出口；把它搬进 components/ 会把引擎塞进控件层。其"引擎内聚四个关注点"的评估与改进（时序协议类型化等）属移动端专项，不在本提案范围。
- `native/shell.ts` 是审核 M1 建议的最小落地：只统一判定函数（`isTauriShell`/`isTauriIOS`/`isAppleMobile` 的唯一实现与缓存策略），不改各模块的降级行为；JS 用 UA 重推平台的全面治理（能力探针替代）属移动端专项。
- 实施顺序建议：决策 3 + 4（机械拆分、组件与 lib 归位先行，一次 import 风暴）→ 1（runMutation 替换）→ 2（probe engine）→ 5（useDraftForm）；决策 6 的文档随任一批次顺带落地。

### 实施记录（2026-10-07）

- 基线复核：`catch (e: any)` 实测 43 处/16 文件（提案记 42/10，拆分批次后文件分布已变）；`common.saveFailed` 16 处。
- 批次一（`refactor(ui)`/`refactor(layout)`/`refactor(pages)`/`refactor(src)` 四提交）：ui.tsx 拆为 `components/ui/{sheet,menu,toast,primitives,atoms}`（无 barrel）、Layout 拆入 `components/layout/`、页面私有组件落域目录、lib 分 `native/`（含 `shell.ts`）、`session/`、`nav/`；AdvancedSettings/Settings 拆为 `pages/settings/`。
- 批次二（`runMutation`）：33 处迁移——FiltersPages 10、DhcpSettings 6、Protection 5、SystemSettings 2、DnsSettings 2，QueryLog/Clients/ClientDetailPage/LogDetailPage/ClientForm/EncryptionSettings/AccessSettings/GeneralSettings 各 1。保留 10 处，理由逐条：`auth.connect`（会话层，失败写 error 状态并返回布尔，且先验证 /status 再落盘）、`ProtectionCard` / `ClientDetail` / ServicesPage 三处乐观习语（决策 6）、`CheckHostPage.check` / `QueryLog.fetchPage` / `findActive` / `testUpstreams` 四处查询结果落页面状态、`SystemSettings.checkUpdate` 三态条件文案、`EncryptionSettings.save` 两阶段 validate/configure（校验驳回有独立文案且不得下发配置）。
- 批次三（`probe`）：状态机落在 `src/lib/session/probe.ts`，接线形态 `createProbeEngine({ fetchStatus, wasProbeOk, isActive, now? })` —— 「恢复」用注入的会话 reader 在完成时刻判定（与旧代码同时刻读取），移除实例的丢弃由 `drop()` 删除引擎内状态实现（不新增 store 依赖），`createStatusFetcher` 携带 5s deadline。`probe.test.ts` 11 例；`auth.tsx` 只余接线（store/session refs、patchSession、engine 调用）。
- 批次四（`useDraftForm`）修复两处缺失不变式：DnsSettings 保存后先 `setDraft(null)` 会被 effect 用旧数据重灌（dirty 永不复位），AccessSettings 保存后从不回填（trim/去重后 dirty 常挂）；GeneralSettings / EncryptionSettings 原有行为不变。加密页的来源单选在草稿首次落地时播种（独立 effect），保存与重置后显式复位。
- 顺带修复 docs 漂移：`docs/architecture/frontend.md`、`docs/web-interaction.md` 仍引用 `src/lib/auth.tsx`、`src/components/ui.tsx`、`Layout.tsx`、`nativePickers.ts` 等拆分前路径，一并更新为现结构并补「组件、lib 与样式」的放置规则；`node scripts/verify-proposals.mjs --links` 下 docs 已无缺失路径（`.agents/reviews/` 是历史快照，按约定不改）。
- 验收证据：`pnpm check`、`pnpm test`（40 例，含 probe 11 例）、`pnpm build`、`npm run test:server`（17 例）全绿；浏览器烟测（`scripts/mock-agh.mjs` + `pnpm dev:all` + Playwright，桌面 1280×900）逐条断言：`DNS settings saved` + dirty 清除、`Access control saved` + 列表按服务端规范化内容回填、`Settings saved` + 保存入口消失、`Rewrite added`、过滤器开关成功时静默、断网后 `Failed to save: Network error. Cannot reach the upstream.` 且 dirty 保留（回滚行为不变）。
