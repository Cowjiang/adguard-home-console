# 让移动端客户端页获得原生返回按钮与侧滑返回

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户模拟器实测反馈「客户端页没有左上角原生返回按钮，也没法左滑返回，或许被当作 replace 路由处理」。

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

## Accept

- [x] 概览 → 客户端卡片：push 转场、左上角原生返回按钮随导航条滑入、点击返回概览且滚动位置恢复（用户模拟器验证通过）
- [x] 同路径左缘侧滑返回接管，与其它二级页一致（用户验证通过）
- [x] 4 个 tab 互切仍 replace、侧滑不可跨 tab；`/log?filter=blocked` 行为不变（用户验证通过）
- [x] `npm run check` / `npm run build` 通过；Rust 侧无改动

## Note

- 分支 `fix/clients-back-nav`（自 dev 切出），改动 7 文件 +20/−12，含 `docs/WEB_INTERACTION.md` 路由约定同步。
- 施工记录见 `.agents/logs/tauri-ios.md` §14。
