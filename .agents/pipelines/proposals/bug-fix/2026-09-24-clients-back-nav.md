# 让移动端客户端页获得原生返回按钮与侧滑返回

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Updated:** 2026-09-24（用户复测后追加：移动端禁止以 replace 进入父级列表页，返回语义统一到 `navBack`）
**Source:** 用户模拟器实测反馈「客户端页没有左上角原生返回按钮，也没法左滑返回，或许被当作 replace 路由处理」；复测追加「移动端不能把客户端当成 replace 处理，否则在浏览器没法返回上一页，不要影响电脑端」。

## Goal

iOS 壳中经概览统计卡进入 `/clients` 后既无原生玻璃返回按钮、边缘侧滑也不接管，页面只剩 CSS 返回胶囊，交互与其余二级页不一致。根因是两个独立问题叠加：

1. `/clients` 被列在 `TOP_LEVEL_ROUTES`，而 `nativeBackButton` 对顶级路由主动移除原生按钮——该分类本为桌面侧边栏设计，但移动端 TabBar 只有 4 个 tab，没有客户端；
2. 入口 `Dashboard.tsx` 走 `useTabJump`（replace），不进历史栈，自研边缘侧滑只对 PUSH 落地（有来路快照）的条目接管——这是 tab 切换不可侧滑的有意设计被错误套到了二级页入口上。

## Decision

把混用的「顶级路由」拆成两个概念，作为移动/桌面导航语义分离的单一事实源：

- `TOP_LEVEL_ROUTES`（成员不变）收窄为**桌面侧边栏根**，只供 PageHeader 桌面端隐藏返回胶囊；
- 新增 `TAB_ROOT_ROUTES = ['/', '/protection', '/log', '/settings']`（移动端 4 个 tab 根），消费方：原生返回按钮显隐、顶部状态条显隐、转场方向仲裁（push 到 tab 根不播动画）；
- 概览统计卡入口改 `nav('/clients')` push（与「查看全部客户端」按钮一致）；`/log?filter=` 两个入口保持 `useTabJump`（`/log` 是真 tab 根）。

`/clients` 改为 push 落地后，侧滑快照、滚动恢复、深链直落（历史栈空回退父级）均由现有机制自动生效，Rust 侧零改动。

复测追加（同一方案的第二半）：客户端表单保存后曾 `replace` 到 `/clients`，从列表 push 进表单会在栈里留下两条 `/clients`，浏览器返回一次等于没动。因此把「有历史就 POP、栈空才 replace 回父级」抽成 `src/lib/backNav.ts` 的 `navBack`，返回胶囊、原生按钮与表单保存/取消、详情删除收尾共用一个实现——移动端不再用 replace 导航到父级列表页。桌面端表单/详情走居中弹层，不经过这些路由，行为不变。

## Accept

- [x] 概览 → 客户端卡片：push 转场、左上角原生返回按钮随导航条滑入、点击返回概览且滚动位置恢复（用户模拟器验证通过）
- [x] 同路径左缘侧滑返回接管，与其它二级页一致（用户验证通过）
- [x] 4 个 tab 互切仍 replace、侧滑不可跨 tab；`/log?filter=blocked` 行为不变（用户验证通过）
- [ ] 列表 → 添加/编辑客户端 → 保存/取消：POP 回列表，栈中无重复 `/clients`，浏览器返回一次回到概览（待用户复测）
- [ ] 详情页删除后同样经 `navBack` 收尾（直落详情页时 replace 回 `/clients`，不再空操作）（待用户复测）
- [x] 桌面端无行为变化：`/clients` 无返回胶囊、添加/编辑仍走弹层（桌面不经 `ClientFormPage` / `ClientDetailPage`，代码层面确认）
- [x] `npm run check` / `npm run build` 通过；Rust 侧无改动

## Note

- 分支 `fix/clients-back-nav`（自 dev 切出），改动 7 文件 +20/−12，含 `docs/web-interaction.md` 路由约定同步。
- 施工记录见 `.agents/logs/tauri-ios.md` §14。
