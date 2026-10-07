# 收敛 src/ 页面层的重复编排、探测状态机与超载文件

**Class:** simplification
**Status:** proposed
**Date:** 2026-10-06
**Updated:** 2026-10-06（并入组件归位与分类：放置规则、域目录树、跨页 import 清零）
**Source:** 2026-10-06 整体架构审核（web 端部分）建议 1/2/3/4；用户方向（同日会话，含组件散落观察）

## Goal

消除 `src/pages` 最大的一类重复（42 处 try→api→mutate→toast 编排，基线见 Note），把 `auth.tsx` 内嵌的探测状态机变为可测模块，拆分三个超载文件，把散落在页面与错误层级里的组件按域归位 `src/components/`，并把 draft 表单的共享行为收敛为 hook。**不改变任何用户可见行为**（draft 不变式补齐除外，见决策 5）。完成后的可观察收益：新页面写 mutation 只学一个 helper；探测退避逻辑进 vitest；页面文件回归"数据编排 + 组装"，`components/` 按域可检索。

## Decision

1. **`runMutation()` helper（`src/lib/mutation.ts`）**：统一 mutation 编排——`action()` 执行、成功后 `invalidate()`（scoped mutate）+ 成功 toast、失败按现状取 `e.message`（kind 体系下已本地化）渲染 `common.saveFailed`。签名收敛为 `{ action, invalidate?, okKey?, okVars? }`；迁移是逐处等价替换，各页现有 toast 文案保持不变。**不纳入**乐观更新习语（决策 6）与纯请求无 toast 的场景。
2. **probe engine 抽出（`src/lib/probe.ts`）**：从 `auth.tsx` 抽出探测状态机为独立模块，依赖注入 `fetchStatus` 与时钟；`AuthProvider` 只做 React 接线（状态订阅 ↔ useState）。接口保持最小：创建引擎（注入依赖）、`probe(instance, ep, isActive)`、`probeAll(..., force)`；内部保留 per-instance `{inFlight, failures, nextAt}` 状态与退避曲线。行为不变：非活动失败退避 15/30/60s 封顶、成功复位、活动实例永不退避、恢复触发 scoped revalidate、移除实例丢弃在途结果。
3. **机械拆分（零行为变化，路由不变）**：
   | 现文件 | 拆出 |
   | --- | --- |
   | `pages/AdvancedSettings.tsx`（1057 行） | `pages/settings/DnsSettings.tsx`、`AccessSettings.tsx`、`EncryptionSettings.tsx`、`DhcpSettings.tsx`，原文件删除 |
   | `pages/Settings.tsx`（653 行） | 索引页留 `pages/Settings.tsx`；`pages/settings/GeneralSettings.tsx`、`SystemSettings.tsx`（AGH 服务器设置组）、`AppearanceSettings.tsx`、`AboutSettings.tsx`（应用设置组）、`InstanceList.tsx`、`InstanceEdit.tsx`（实例管理组），与 `docs/web-interaction.md` 声明的分组对齐 |
   | `components/ui.tsx`（970 行、30+ exports） | `components/ui/` 下行为核心（`sheet.tsx`：SheetProvider/useSheet/useConfirm；`menu.tsx`：MenuHost/usePick/PickSelect；`toast.tsx`：toast/ToastHost）、布局原语（`primitives.tsx`：Screen/PageHeader/HeaderAction/Card/Group/GroupTitle/Row/Rows/Switch/Button/Segmented/TabContent）、原子与反馈（`atoms.tsx`：Badge/StatusDot/SourceBadge/Chip/SearchBar/CopyIconButton/Pagination/Spinner/Loading/EmptyState/ErrorBox）。**不留 re-export barrel**，全量改 import，否则 fan-in 成本未降 |
4. **组件归位与分类**：现状约 24 个页面私有组件/渲染 helper 散在 8 个页面文件（Dashboard 6、Clients 4、QueryLog 2、TopListPage 2、Protection 2 及 AdvancedSettings 局部组件等），另有 3 处 pages→pages 跨页 import（`ClientFormPage→Clients` 的 `ClientForm`/`emptyClient`、`FiltersPages→Protection` 与 `Settings→Protection` 的 `IconBubble`）——组件被迫定义在别的页面文件里。归位规则：
   - **R1 跨页消费 → 必须 `src/components/`**：`IconBubble`（→ `ui/atoms.tsx`，通用原子）、`ClientForm` + `emptyClient`（→ `components/clients/`）；跨页 import 清零。
   - **R2 页面私有、体量小、所在文件不超载 → 留内联**（内联即最高局部性）：如 `OtherStats`（SWR 静默子组件，与页面逻辑强耦合）、`TopListPage` 的 `SearchIcon`/`KINDS`。
   - **R3 页面私有但构成页面主要渲染体 → `components/<domain>/`**：Dashboard 的 `DashSkeleton`/`RangePicker`/`ServerInfoCard`/`UpstreamTable`/`InfoCell`（665→约 300 行编排）；QueryLog 的 `LogRow`/`LogTable`；Clients 的 `ClientTable`/`SortTh`/`IconB`；Protection 的 `SafeSearchSheet`；Layout 的 `TopBar`/`InstanceSwitchList`/`TabBar`/`Sidebar`/`OfflineNotice`（408 行吸收的平台怪癖按域拆开）。
   - **R4 lib/ 中的渲染面留 lib**：`routeTransition.tsx` 的 `TransitionArea` 是转场引擎的渲染出口（引擎而非控件，消费方仅 Layout）；`auth.tsx` 的 Provider 是状态接线。不因"含 JSX"而搬进 components/。
   - **目标目录树**（域子目录，不再新增无域归属的平铺文件）：
     ```
     src/components/
       ui/            行为核心 + 布局原语 + 原子（决策 3 的 ui.tsx 拆分落点）
       layout/        Layout、TopBar、InstanceSwitchList、TabBar、Sidebar、OfflineNotice
       dashboard/     DashSkeleton、RangePicker、ServerInfoCard、UpstreamTable、InfoCell
       log/           LogRow、LogTable、LogDetail
       clients/       ClientTable、SortTh、IconB、ClientForm、ClientDetail
       protection/    ProtectionCard、SafeSearchSheet
       charts.tsx     不动（5 个 export 的深模块）
     ```
     现有 `components/ClientDetail.tsx`、`LogDetail.tsx`、`ProtectionCard.tsx` 随域目录迁移；对应的薄路由包装页（`ClientDetailPage`/`LogDetailPage`）不动。
5. **`useDraftForm` hook（`src/lib/`）**：draft 表单当前 4 份副本（DnsSettings、AccessSettings、Encryption、GeneralSettings），其中「SWR refetch 后重灌未脏草稿」不变式仅 GeneralSettings 实现。实现时先逐处核对行为差异，hook 只收敛真正共享的部分（draft 状态、dirty 判定、refetch 重灌、提交回填），分歧处保留原样；缺失不变式的副本随之补齐（这是本提案唯一的预期行为变化，方向是修正）。
6. **只文档化、不抽代码**：三种乐观更新习语（`ProtectionCard` 的 pending 镜像、`ClientDetail` 的 draft+回滚、`FiltersPages` ServicesPage 的 pending Set + saveQueue + latestIdsRef 防过期写）在 `docs/engineering.md` 记录适用场景与并发防护要求——统一为 options-bag 会产出浅模块，明确不做。
7. **不做的**：分页/Sheet 表单脚手架抽取；`Row` 嵌套 `button` 修法（使用面广，另行评估）；路由与 i18n key 变更；R2 规则之外的小组件强行外移（避免 `components/` 变成倾倒场）。

## Accept

- [ ] `catch (e: any)` 的 try→api→mutate→toast 编排从 42 处（10 文件）收敛至 `runMutation`；各页成功/失败 toast 文案与回滚行为不变
- [ ] `src/lib/probe.ts` 独立于 React 可实例化，vitest 覆盖：退避 15/30/60s 封顶、成功复位、活动实例不退避、inFlight 去重、恢复触发 scoped revalidate、移除实例丢弃在途结果；`AuthProvider` 对外契约（`useAuth` 返回值）不变
- [ ] 三个文件按决策 3 的映射拆分，`App.tsx` 路由与用户可见行为不变，`components/ui.tsx` 不存在且无 barrel
- [ ] pages→pages 组件 import 清零（现 3 处）；`components/` 按决策 4 的目录树归类，页面文件只保留数据编排与组装，最大页面文件 ≤700 行
- [ ] 4 处 draft 表单走 `useDraftForm`，「refetch 后重灌未脏草稿」行为四处一致
- [ ] 乐观更新习语约定写入 `docs/engineering.md`
- [ ] `pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server` 全绿

## Note

- 基线（2026-10-06 grep 实测）：`catch (e: any)` 42 处/10 文件（AdvancedSettings 13、FiltersPages 12、Protection 5、Settings 4、QueryLog 2、Clients 2、ClientDetailPage/LogDetailPage/ProtectionCard/ClientDetail 各 1）；`common.saveFailed` 16 处；pages→pages 组件 import 3 处；页面私有内联组件约 24 个/8 文件（Dashboard 6、Clients 4、QueryLog 2、TopListPage 2、Protection 2，及 AdvancedSettings/Settings 拆分时顺带归位的局部组件）。
- 三种乐观习语、4 份 draft 副本、`useConfirm`/Sheet portal 导航注入等证据的行号见 2026-10-06 架构审核记录（会话）；拆分决策的粒度判断：AdvancedSettings 是四个互不引用 section 的命名空间（`App.tsx` 已各自路由），拆分是零耦合操作；ui.tsx 的行为核心（portal、双 rAF、滚动锁、原生 select）是全库最深的模块之一，拆分只动文件边界不动接口。
- R4 的判断依据：`routeTransition.tsx`（748 行）四个关注点中三个是引擎（转场/手势/滚动），`TransitionArea` 只是渲染出口；把它搬进 components/ 会把引擎塞进控件层。其"引擎内聚四个关注点"的评估与改进（时序协议类型化等）属移动端专项，不在本提案范围。
- 实施顺序建议：决策 3 + 4（机械拆分与归位先行、降低后续 diff 面积）→ 1（runMutation 替换）→ 2（probe engine）→ 5（useDraftForm）；决策 6 的文档随任一批次顺带落地。
