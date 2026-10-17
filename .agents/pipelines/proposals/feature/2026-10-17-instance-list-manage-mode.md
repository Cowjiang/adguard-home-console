# 实例列表改为「点按切换 + 管理模式下编辑删除」

**Class:** feature
**Status:** implemented
**Date:** 2026-10-17
**Updated:** 2026-10-17（用户复核反馈：当前实例改绿色 badge、去掉行内 ✓ 与页脚说明、管理按钮改无强调色）
**Source:** 用户 2026-10-17：「每一行右边都是一个向右的箭头然后点击会进入编辑页，我要你改成，如果是当前激活的实例就显示『当前实例』以及✓勾，然后页面右上角加入一个管理按钮（记得符合 iOS 壳的要求），然后点击后每一个实例的右边改成显示编辑按钮和删除按钮，编辑按钮点进去才会进入编辑页面，然后这时候右上角的管理按钮要改成显示完成」；复核反馈：「右边当前实例改成绿色 badge，左边对勾不需要了，然后底下不要显示这么多余的提示文字，右上角管理按钮应该是没有颜色的，只有完成的时候才是绿色」

## Goal

「设置 → 服务器连接」原本点按一行就进编辑页，多实例下最容易误触的就是编辑表单。改成以「切换实例」为主操作的列表：点行切实例，编辑与删除收进显式的管理模式。

## Decision

1. **正常态**：点按一行切换活动实例（`switchInstance`）；活动实例行尾挂绿色「当前实例」badge（`Badge kind="ok"`，`var(--ok)` / `var(--ok-soft)`）；行内不再有 ✓，也不再显示右箭头，页脚说明文字删除。
2. **页头切换按钮**：`Button size="header"`，**「管理」态为 `variant="glass"` 无强调色**（native spec 不带 `foreground`，走系统默认色），**「完成」态为 `variant="primary"` 绿色**（native spec `foreground: 'accent'`）；iOS 壳内由原生玻璃按钮接管（`useNativeHeaderAction` 依赖含 `label`/`foreground`，切换时颜色与文本同步）。
3. **管理模式**：点行不再切换；行尾换成两个 44×44 圆角方块按钮（`rounded-[14px]`、无文字，`aria-label` 供无障碍）——「编辑」玻璃底（进 `/settings/server/edit?id=`）与「删除」`--danger-soft` 底 + 红色图标（`useConfirm` 确认框 + `removeInstance`，最后一台沿用既有提示语）；当前实例 badge 在此模式下隐藏（用户复核确认）。
4. **文案**：`settings.instancesActive` 由「使用中」改为「当前实例」（en: `Current`）；新增 `common.edit` / `common.manage` / `common.done`，双语对齐（`instancesListNote` 随页脚说明一起删除）。

## Accept

- [x] 正常态活动实例行尾是绿色「当前实例」badge，无 ✓、无箭头、无页脚说明；点其他行切换实例（实测活动实例指针变更）
- [x] 「管理」按钮无强调色，进入后变绿色「完成」，每行出现编辑 / 删除；编辑跳编辑页；删除弹确认框且取消不删
- [x] 「完成」退出管理模式，点行恢复为切换
- [x] `pnpm check`、`pnpm test`（104 例）、`pnpm build` 通过；mock 下 390px 与 1280px 走查
- [x] 交互写入 `docs/web-interaction.md` 的「页面行为」

## Note

- 截图（本机忽略材料）：`_probe/gen-shots/instances-v2-normal-mobile.png`、`_probe/gen-shots/instances-v2-manage-mobile.png`（v1 的 `instances-normal-mobile.png`、`instances-manage-mobile.png`、`instances-manage-desktop.png` 为改版前记录）。
- 已知取舍：390px 下管理模式的行标题为两个按钮让位会截断（约 10 字符），URL 副标题仍完整；管理模式里当前实例 badge 让位给按钮，若要保留标记可改图标按钮。
- 关联：`src/pages/settings/InstanceList.tsx`、`src/pages/settings/InstanceEdit.tsx`。
