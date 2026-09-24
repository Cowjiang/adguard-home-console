# 收敛下拉刷新触发范围并补上断网后的离线反馈

**Class:** feature
**Status:** implemented
**Date:** 2026-09-25
**Updated:** 2026-09-25(离线遮罩豁免设置根页,改为隐藏「服务器设置」入口组;重试按钮加加载态;指示器几何返工——锚定 `var(--safe-top)+16px` 与卡片顶恒差 12px,刷新时内容回弹、圈停在基位旋转,pill 淡出让位)
**Source:** 用户对 2026-09-25-refresh-triggers 实施后的三点反馈:二级页不应能触发下拉刷新;断网时下拉刷新等待过长;断网刷新失败后页面不应继续显示旧数据。

## Goal

上一轮下拉刷新(2026-09-25-refresh-triggers)留下三个缺口:

1. **触发范围过宽**:下拉刷新挂在 Layout,启用条件只有「移动布局 + 粗指针」,`/log/detail`、`/clients/form`、`/protection/filters` 等二级页也能触发。手势入口应与 tab 导航同层,只在 4 个 tab 根路由(`TAB_ROOT_ROUTES`)存在。
2. **断网时刷新等待过长**:前端 `api()` 无超时,超时在代理层(Rust/Express 均 25s)。断网时 `refreshAll` 的 `refreshStatus()` 与 `mutate(() => true)` 都要等代理超时才失败,刷新指示器挂 ~25s;15s 自愈探针同样被 25s 拖住,离线结论给得太慢。
3. **断网后旧数据无反馈**:SWR `keepPreviousData` 页面失败时继续显示缓存,其余页面把 error 当「连接服务器中…」渲染;auth 探针失败时不更新任何状态(`lastProbeOk` 仅 ref),TopBar 状态条冻结在旧文案,页面静默停留在过期数据。

## Decision

- **触发范围**:Layout 的下拉刷新启用条件追加 `TAB_ROOT_ROUTES.includes(pathname)`,只在 `/`、`/protection`、`/log`、`/settings` 生效;hook 的 effect 依赖 `enabled`,路由切换即挂/卸监听,转场中本就由 `useTransitionBusy` 禁用。
- **超时收紧(纯前端,不动代理层 25s/120s 契约)**:`fetchStatus` 的 `/status` 探测加 5s 前端 deadline(`Promise.race`,超时按失败返回 null)——15s 自愈探针、tab 落地刷新、下拉刷新共用这一快速失败;`refreshAll` 整体加 8s deadline,刷新指示器最多 8s 收回,后台请求失败结果自行落地。
- **离线反馈**:auth 以 `/status` 探测为唯一「服务离线」事实源,新增 `offline` 布尔暴露到 AuthCtx(探测失败→true、成功→false,`refreshStatus`/`connect`/`logout` 同步维护)。状态条 pill 判断改为 `offline || !status?.running`,顺带修掉探针失败时 pill 冻结旧状态的 bug。Layout 新增 `OfflineNotice` 遮罩:`offline` 且当前在 tab 根页时以实色背景盖住内容区(复用 `EmptyState` + WifiOff + 「立即重试」按钮触发 `refreshAll`),z-20 位于 TabBar/状态条(z-40)、下拉指示器(z-30)、Sheet(z-50)之下。二级页不遮挡,避免盖掉表单输入,靠状态条与操作报错感知。恢复路径沿用既有自愈:探针成功→`offline=false`→遮罩消失→恢复 mutate 刷新数据;断网中下拉刷新本身就是重试手段。**设置根页(`/settings`)豁免遮罩**:它承载「服务器连接」(地址、凭据)与应用设置,离线时用户可能正需要更改服务器地址——改为由 Settings 页在 `offline` 时隐藏依赖 AGH 服务器的「服务器设置」入口组,「应用设置」组保持可点,连接恢复后该组自动回来。

## Accept

- [x] 下拉刷新仅在 4 个 tab 根路由可触发;二级页(如 `/clients/form`、`/log/detail`)触摸下拉不再出现指示器(代码实现;待用户复测)
- [ ] 断网时下拉刷新:指示器 ≤8s 收回(健康网络完成即收,不受影响)
- [ ] 断网时 `/status` 探测 ≤5s 给出失败结论:状态条 pill 切换为「服务离线」,tab 根页出现离线遮罩,旧数据不可见
- [ ] 正常使用中断网、不做任何操作:≤15s 内 tab 根页自动进入离线遮罩;网络恢复后 ≤15s 自动回到真实数据与状态
- [x] 离线遮罩只在 tab 根页呈现;二级页不遮挡(表单可继续操作),桌面侧边栏与移动状态条同步显示离线(代码实现;待用户复测)
- [ ] 离线时设置根页不被遮罩遮挡:「服务器设置」组隐藏,「应用设置」组(含「服务器连接」入口)保持可点,可完成服务器地址修改;连接恢复后「服务器设置」组自动恢复
- [ ] 离线遮罩的「立即重试」点击后进入 loading(转圈+禁用,防重复触发),与下拉刷新共用同一条 refreshAll 链:8s deadline 到点或链路收口即停
- [ ] 下拉跟手与刷新期间,指示器圆圈都位于卡片视觉顶上方约 12px(锚定 `var(--safe-top)+16px`,与 `page-shell` 顶部留白联动,任意安全区机型成立);刷新时内容回弹、圈停在基位旋转,状态条 pill 淡出、完成后淡回
- [ ] `npm run check` / `npm run build` / `node scripts/verify-proposals.mjs --links` 通过;Rust 侧无改动

## Note

- 分支 `feat/refresh-triggers`(自 dev 切出),延续 2026-09-25-refresh-triggers 的实施现场。
- 代理层超时契约(25s,`/filtering/refresh` 120s)记录于 `docs/architecture/web-runtime.md` 与 `docs/architecture/tauri-shell.md`,本提案不触碰。
