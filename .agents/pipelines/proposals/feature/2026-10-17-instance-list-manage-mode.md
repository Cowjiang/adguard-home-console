# 实例列表改为「点按切换 + 管理模式下编辑删除」

**Class:** feature
**Status:** implemented
**Date:** 2026-10-17
**Source:** 用户 2026-10-17：「每一行右边都是一个向右的箭头然后点击会进入编辑页，我要你改成，如果是当前激活的实例就显示『当前实例』以及✓勾，然后页面右上角加入一个管理按钮（记得符合 iOS 壳的要求），然后点击后每一个实例的右边改成显示编辑按钮和删除按钮，编辑按钮点进去才会进入编辑页面，然后这时候右上角的管理按钮要改成显示完成」

## Goal

「设置 → 服务器连接」原本点按一行就进编辑页，多实例下最容易误触的就是编辑表单。改成以「切换实例」为主操作的列表：点行切实例，编辑与删除收进显式的管理模式。

## Decision

1. **正常态**：点按一行切换活动实例（`switchInstance`）；活动实例行标题后带 ✓（主题色），行尾显示「当前实例」文本；不再显示右箭头。
2. **页头切换按钮**：`Button size="header"` + `native={{ label, foreground: 'accent' }}`，iOS 壳内由原生玻璃按钮接管（`useNativeHeaderAction` 的依赖含 `label`，切换时原生按钮文本同步变「管理」/「完成」）。
3. **管理模式**：点行不再切换；行尾改为「编辑」（进 `/settings/server/edit?id=`）与「删除」（`useConfirm` 确认框 + `removeInstance`，最后一台沿用既有提示语），活动实例保留 ✓。
4. **文案**：`settings.instancesActive` 由「使用中」改为「当前实例」（en: `Current`）；页脚说明改写为「点按一行切换当前实例，右上角『管理』里可编辑或删除连接信息」；新增 `common.edit` / `common.manage` / `common.done`，双语对齐。

## Accept

- [x] 正常态活动实例行带 ✓ 与「当前实例」，行尾无箭头；点其他行切换实例（实测活动实例指针变更）
- [x] 「管理」进入管理模式：按钮变「完成」，每行出现编辑 / 删除；编辑跳编辑页；删除弹确认框且取消不删
- [x] 「完成」退出管理模式，点行恢复为切换
- [x] `pnpm check`、`pnpm test`（104 例）、`pnpm build` 通过；mock 下 390px 与 1280px 走查
- [x] 交互写入 `docs/web-interaction.md` 的「页面行为」

## Note

- 截图（本机忽略材料）：`_probe/gen-shots/instances-normal-mobile.png`、`_probe/gen-shots/instances-manage-mobile.png`、`_probe/gen-shots/instances-manage-desktop.png`。
- 已知代价：390px 下管理模式的行标题为两个按钮让位会截断（约 10 字符），URL 副标题仍完整；若嫌挤可改图标按钮。
- 关联：`src/pages/settings/InstanceList.tsx`、`src/pages/settings/InstanceEdit.tsx`。
