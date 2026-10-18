# 把过滤器子页的「同步到其他实例」从页头收进页底行卡片

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Source:** 用户要求（「不要放在右上角按钮，改用 DHCP 设置页最底下那个重置按钮的方式，但不需要 danger 颜色」）

## Goal

过滤器/允许列表、自定义规则、DNS 重写三个子页原先把「同步到其他实例」放在页头右上角，与刷新/新增挤在同一槽位：多实例时移动端页头是两个图标胶囊（同步与刷新/新增），英文标题（`Blocklist filters`）被 `PageHeader` 的夹取压得很窄。用户要求改为 DHCP 设置页「重置 DHCP 设置」那种页底行卡片（`title` + `subtitle` + 箭头），但不带危险色。

## Decision

- 三处同步入口从页头移除，页面底部（列表/表单之后）渲染单行行卡片：`Group` + `Rows` + `Row`（title `filters.syncAction`、subtitle 新增 `filters.syncSub`＝「目标实例的原有规则将被替换」/ en「Rules on the target instances will be replaced」，承载模态里「目标实例原有规则会被替换」的后果说明）。
- 行为不变：移动端进 `/sync/:type` 子页、桌面开居中浮层；仅在多实例（`instances.length > 1`）时渲染。
- 页头保留的按钮回到默认 slot 0（刷新、新增各一处），`slot: 1` 的三处原生规格与相关注释一并删除；`HeaderAction` / `ArrowLeftRight` 引用按需清理。

## Accept

- [x] 三个子页页头不再有 `aria-label` 为「同步到其他实例」的按钮；刷新/新增仍在（黑/白名单 1 个、规则 0 个、重写 1 个）
- [x] 六种组合（390/1280 × zh/en）页底均出现同步行，subtitle 文案随之切换；移动端点按进 `/sync/filters`，桌面点按弹出同步浮层
- [x] `pnpm check` / `pnpm test`（118 passed）/ `pnpm build` 通过
- [x] 与 `.agents/pipelines/proposals/bug-fix/2026-10-18-card-radius-scale.md` 同批：行卡片用 `Group`，与页面其它节级表面圆角一致

## Note

- 证据（本地留存，不入库）：`_probe/out/sync-{390,1280}-{zh,en}-{filters,rules,rewrites}.png`、`sync-390-*-subpage.png`（移动端子页）、`sync-1280-*-sheet.png`（桌面浮层），脚本 `_probe/pw/sync-row-shots.mjs`（需 `chromium.launch({ channel: 'chrome' })`，播种两个实例才会渲染该入口）。
- 客户端页（`/clients`）保持页头同步按钮不动：本批次只按用户指定处理过滤器子页；若要一并下沉需另开改动。
