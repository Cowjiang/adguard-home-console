# 把卡片圆角收敛为两档，消掉并存的 22px 节级圆角

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Source:** 用户在 DNS 重写页报「上下那些圆角不一样，页面上至少要统一」，并要求 review 其它页面

## Goal

DNS 重写页同屏出现三种圆角：`启用 DNS 重写` 分组卡 22px、重写条目卡 16px、新的同步行卡片 24px。用 DOM 直方图对全仓 23 个页面（390/1280 双视口）审计后确认：22px 只来自 `Group` 的 `!rounded-[22px]` 覆盖（初始提交起就有），而设置页普遍把 22px 分组卡和 24px 独立卡并排（`/settings/dns`、`/settings/encryption`、`/settings/dhcp`、`/settings/system`），同一页面里节级表面圆角不一致。

## Decision

- 圆角收敛为两档：**节级表面**（`Card`，以及它的行容器 `Group`）统一 `rounded-3xl`（24px）；**行内条目/统计磁贴/提示条**用 `rounded-2xl`（16px）。`Group` 去掉 `!rounded-[22px]` 覆盖，一行改动让全部分组卡跟随 `Card`。
- 不反向统一到 22px：`Card` 是默认且用量最大（概览、服务、快照等），24px 是应用的主视觉；16px 条目档保持不动（概览磁贴、客户端卡、日志行、拦截服务磁贴等）。
- 新增的同步行卡片用 `Group` 而不是 `Card`：语义是「一组行」的容器，后续若节级圆角再调也只改一处。

## Accept

- [x] 审计直方图（390/1280，23 页）：改动前 `/protection` {16,22}、`/protection/filters`/`allowlist` {16,22,24}、`/rewrites` {16,22,24}、`/settings/dns`/`encryption`/`dhcp`/`system` {22,24}；改动后所有页面只剩 {16,24}，22px 归零
- [x] 无部分圆角耦合（无 `rounded-t-*` 等半圆角依赖 22px 的写法），61 处 `<Group` 调用点无需逐个调整
- [x] `pnpm check` / `pnpm test`（118 passed）/ `pnpm build` 通过

## Note

- 证据（本地留存，不入库）：`_probe/pw/radius-audit.mjs`（按页输出卡片圆角直方图与样本文案）、`_probe/out/rad-{dhcp,dns,prot}.png`、`_probe/out/rab-{rw,fl,ru}-{16,22,24}.png`（同一张卡三种圆角的对照）。
- 保留的分档（判定依据是**层级**而非页面）：条目/磁贴 16px 位于节级 24px 之内或紧随其后，是全应用一致的视觉层级（概览磁贴、客户端列表卡、日志行）；本提案只删掉并存的第三档，不动这条层级。
- 与 `.agents/pipelines/proposals/bug-fix/2026-10-18-filter-subpage-sync-entry.md` 同批提交。
