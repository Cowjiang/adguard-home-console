# 日志页筛选状态同步进 URL，避免返回时被旧筛选覆盖

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户反馈「从桌面点已拦截进入日志页，筛选器点全部，点一条日志，再返回上一页，会被强制回到已拦截的筛选器」。

## Goal

日志页的筛选（`?filter=`）与搜索（`?q=`）只在进入页面时从 URL 读一次，之后切筛选只改本地 state、**URL 一直停留在旧值**。于是任何重建本页的动作（进日志详情再返回、刷新、前后退）都会按旧 URL 恢复筛选——刚切成「全部」的视图被拽回「已拦截」。复现证据：点「全部」后界面已是全部，URL 仍是 `?filter=blocked`。

## Decision

筛选与搜索作为页内状态同步进 URL：`setSearchParams(..., { replace: true })`。与 tab 切换同一约定——页内状态切换不压历史栈，但 URL 必须反映当前状态，重建时恢复的才是用户最后的选择。搜索沿用既有 `?q=`（客户端详情「查看查询记录」的预填参数），从此预填与当前值合一。

## Accept

- [x] 桌面：概览 →「已拦截」磁贴 → 点「全部」：URL 由 `?filter=blocked` 变为 `?filter=all`，刷新后仍是全部（修复前刷新会回到已拦截）
- [x] 桌面：搜索 `google` 写入 `?q=google`，刷新后搜索框与结果保持
- [x] 移动：概览 → 已拦截 → 全部 → 进日志详情（`/log/detail`）→ 返回：筛选停在「全部」，不再被拽回「已拦截」（修复前会）
- [x] 历史栈语义未变：页内切换不新增条目（`replace`），详情页仍为 push、返回走 `navBack`
- [x] `npm run check` / `npm run build` 通过

## Note

- 验收用临时 playwright 探针（Chromium 桌面 1280 + WebKit 移动 402，mock AGH 数据），未入库。
- 约定写入 `docs/web-interaction.md` 路由与转场段；施工记录见 `.agents/logs/tauri-ios.md` §17。
