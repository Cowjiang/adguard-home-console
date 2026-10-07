# 收敛 src/ 页面层的重复编排、探测状态机与超载文件

**Class:** simplification
**Status:** proposed
**Date:** 2026-10-06
**Source:** 2026-10-06 整体架构审核（web 端部分）建议 1/2/3/4；用户方向（同日会话）

## Goal

消除 `src/pages` 最大的一类重复（42 处 try→api→mutate→toast 编排，基线见 Note），把 `auth.tsx` 内嵌的探测状态机变为可测模块，拆分三个超载文件，并把 draft 表单的共享行为收敛为 hook。**不改变任何用户可见行为**（draft 不变式补齐除外，见决策 4）。完成后的可观察收益：新页面写 mutation 只学一个 helper；探测退避逻辑进 vitest；页面文件不再混合多个已独立路由的域。

## Decision

1. **`runMutation()` helper（`src/lib/mutation.ts`）**：统一 mutation 编排——`action()` 执行、成功后 `invalidate()`（scoped mutate）+ 成功 toast、失败按现状取 `e.message`（kind 体系下已本地化）渲染 `common.saveFailed`。签名收敛为 `{ action, invalidate?, okKey?, okVars? }`；迁移是逐处等价替换，各页现有 toast 文案保持不变。**不纳入**乐观更新习语（决策 5）与纯请求无 toast 的场景。
2. **probe engine 抽出（`src/lib/probe.ts`）**：从 `auth.tsx` 抽出探测状态机为独立模块，依赖注入 `fetchStatus` 与时钟；`AuthProvider` 只做 React 接线（状态订阅 ↔ useState）。接口保持最小：创建引擎（注入依赖）、`probe(instance, ep, isActive)`、`probeAll(..., force)`；内部保留 per-instance `{inFlight, failures, nextAt}` 状态与退避曲线。行为不变：非活动失败退避 15/30/60s 封顶、成功复位、活动实例永不退避、恢复触发 scoped revalidate、移除实例丢弃在途结果。
3. **机械拆分（零行为变化，路由不变）**：
   | 现文件 | 拆出 |
   | --- | --- |
   | `pages/AdvancedSettings.tsx`（1057 行） | `pages/settings/DnsSettings.tsx`、`AccessSettings.tsx`、`EncryptionSettings.tsx`、`DhcpSettings.tsx`，原文件删除 |
   | `pages/Settings.tsx`（653 行） | 索引页留 `pages/Settings.tsx`；`pages/settings/GeneralSettings.tsx`、`SystemSettings.tsx`（AGH 服务器设置组）、`AppearanceSettings.tsx`、`AboutSettings.tsx`（应用设置组）、`InstanceList.tsx`、`InstanceEdit.tsx`（实例管理组），与 `docs/web-interaction.md` 声明的分组对齐 |
   | `components/ui.tsx`（970 行、30+ exports） | `components/ui/` 下行为核心（`sheet.tsx`：SheetProvider/useSheet/useConfirm；`menu.tsx`：MenuHost/usePick/PickSelect；`toast.tsx`：toast/ToastHost）、布局原语（`primitives.tsx`：Screen/PageHeader/HeaderAction/Card/Group/GroupTitle/Row/Rows/Switch/Button/Segmented/TabContent）、原子与反馈（`atoms.tsx`：Badge/StatusDot/SourceBadge/Chip/SearchBar/CopyIconButton/Pagination/Spinner/Loading/EmptyState/ErrorBox）。**不留 re-export barrel**，全量改 import，否则 fan-in 成本未降 |
4. **`useDraftForm` hook（`src/lib/`）**：draft 表单当前 4 份副本（DnsSettings、AccessSettings、Encryption、GeneralSettings），其中「SWR refetch 后重灌未脏草稿」不变式仅 GeneralSettings 实现。实现时先逐处核对行为差异，hook 只收敛真正共享的部分（draft 状态、dirty 判定、refetch 重灌、提交回填），分歧处保留原样；缺失不变式的副本随之补齐（这是本提案唯一的预期行为变化，方向是修正）。
5. **只文档化、不抽代码**：三种乐观更新习语（`ProtectionCard` 的 pending 镜像、`ClientDetail` 的 draft+回滚、`FiltersPages` ServicesPage 的 pending Set + saveQueue + latestIdsRef 防过期写）在 `docs/engineering.md` 记录适用场景与并发防护要求——统一为 options-bag 会产出浅模块，明确不做。
6. **不做的**：分页/Sheet 表单脚手架抽取；`Row` 嵌套 `button` 修法（使用面广，另行评估）；路由与 i18n key 变更；`Dashboard`/`QueryLog` 等未超载页面重排。

## Accept

- [ ] `catch (e: any)` 的 try→api→mutate→toast 编排从 42 处（10 文件）收敛至 `runMutation`；各页成功/失败 toast 文案与回滚行为不变
- [ ] `src/lib/probe.ts` 独立于 React 可实例化，vitest 覆盖：退避 15/30/60s 封顶、成功复位、活动实例不退避、inFlight 去重、恢复触发 scoped revalidate、移除实例丢弃在途结果；`AuthProvider` 对外契约（`useAuth` 返回值）不变
- [ ] 三个文件按决策 3 的映射拆分，`App.tsx` 路由与用户可见行为不变，`components/ui.tsx` 不存在且无 barrel
- [ ] 4 处 draft 表单走 `useDraftForm`，「refetch 后重灌未脏草稿」行为四处一致
- [ ] 乐观更新习语约定写入 `docs/engineering.md`
- [ ] `pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server` 全绿（`src/pages` 行数分布随拆分明显下降，最大页面文件 ≤700 行）

## Note

- 基线（2026-10-06 grep 实测）：`catch (e: any)` 42 处/10 文件（AdvancedSettings 13、FiltersPages 12、Protection 5、Settings 4、QueryLog 2、Clients 2、ClientDetailPage/LogDetailPage/ProtectionCard/ClientDetail 各 1）；`common.saveFailed` 16 处。
- 三种乐观习语、4 份 draft 副本、`useConfirm`/Sheet portal 导航注入等证据的行号见 2026-10-06 架构审核记录（会话）；拆分决策的粒度判断：AdvancedSettings 是四个互不引用 section 的命名空间（`App.tsx` 已各自路由），拆分是零耦合操作；ui.tsx 的行为核心（portal、双 rAF、滚动锁、原生 select）是全库最深的模块之一，拆分只动文件边界不动接口。
- 实施顺序建议：决策 3（机械拆分先行、降低后续 diff 面积）→ 1（runMutation 替换）→ 2（probe engine）→ 4（useDraftForm）；决策 5 的文档随任一批次顺带落地。
