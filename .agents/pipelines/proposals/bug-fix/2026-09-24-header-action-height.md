# 顶栏右侧按钮高度统一对齐返回胶囊

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户要求「检查整个项目所有页面，在移动端顶栏右边有按钮的地方，高度都需要跟返回按钮一样」。

## Goal

移动端悬浮顶栏的返回胶囊是 44pt（`h-11`，iOS 最小可点面积），但同一栏右侧的操作按钮各自为政：客户端/重写的「添加」与过滤器页的「更新」是 `h-10`（40pt），三处设置页「保存」用 `Button size="sm"`（`h-8`，32pt），视觉上比返回按钮矮一截、点按面积也不达标。

## Decision

在 `ui.tsx` 给顶栏右侧槽位提供两个统一入口，调用点不再手写尺寸：

- `HeaderAction`（玻璃按钮）：移动端 `h-11`，桌面 `lg:h-10`；图标按钮调用点补 `w-11 text-accent lg:w-10`，带文字的补 `px-4`。
- `Button` 新增 `size="header"`：`h-11 px-4`，桌面回落 `lg:h-8 lg:px-3.5`（与 `sm` 一致）——供主色「保存」按钮使用。

桌面端一律保持原尺寸（40pt / 32pt），本次只对齐移动端。tab 根页面（概览/过滤器/日志/设置）没有悬浮顶栏与返回按钮，其内容头部按钮（如日志页的「实时」开关）不在此约定内。

## Accept

- [x] 移动端 402pt 实测：`/clients`、`/rewrites`、`/protection/filters`、`/protection/allowlist`、`/settings/dns`、`/settings/access`、`/settings/encryption`、`/settings/dhcp` 右侧按钮高度 = 44pt = 返回胶囊
- [x] 全项目排查：顶栏右侧按钮仅这 7 处调用点，无自制顶栏绕过 `PageHeader`
- [x] 桌面端 1280pt 实测尺寸与改动前一致：添加/更新 40pt、保存 32pt
- [x] `npm run check` / `npm run build` 通过

## Note

- 定位与验收用临时 playwright 探针（WebKit + iPhone UA 移动端、Chromium 桌面端），未入库。
- 约定写入 `docs/web-interaction.md` 的路由与转场段；施工记录见 `.agents/logs/tauri-ios.md` §16。
