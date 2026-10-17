# 按 AGH 契约修正单位换算（filtering 间隔小时、统计保留期、毫秒与秒混用）

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Updated:** 2026-10-18（登记并实施：真实 AGH v0.107.79 源码逐字段核对 → 前端三处单位修复 + mock 契约校验 + 事实页补齐；mock 上的 GUI 验收已完成，同日登记遗留项）
**Source:** 用户 2026-10-18 报告「过滤器更新间隔设置时间会显示 unsupported interval」

## Goal

消掉控制台与 AGH 之间的单位错配：所有写入 AGH 的数值字段必须与 AGH v0.107.79 的实际单位一致，读回来的数值也必须按同一单位显示。触发用例：过滤器更新间隔在任何选项下都保存失败，界面弹 `Unsupported interval`。

## 复盘（为什么会出现）

1. `/control/filtering/config` 与 `GET /filtering/status` 的 `interval` 单位是**小时**（AGH `internal/filtering/http.go:419` `Interval uint32 \`json:"interval"\` // in hours`，上限 `365*24 = 8760`，`http.go:763-767`），而 `FiltersPages.tsx` / `Protection.tsx` 把它当毫秒：发送 `hours * 3_600_000`，最小选项 1 小时也是 `3_600_000 > 8760`，AGH 直接 400 + 纯文本 `Unsupported interval`（`http.go:474-477`）。
2. 读取方向同样错：状态返回 24（小时）被 `/ 3_600_000` 除成 0.0000067，`hoursLabel` 落进 `< 1` 分支显示「0 分钟」，选择器当前值匹配不到任何选项。
3. `scripts/mock-agh.mjs` 自己就把该字段种成毫秒（`24 * 3600_000`）且收到任何数值都照单全收，mock 与前端错在同一方向，本地怎么点都不会报错，只有连真机才暴露。
4. 同类错配不止这一处：统计保留期选项值写成 `h * DAY`（`GeneralSettings.tsx`），选「1 天」实际下发 24 天，选「30 天」「90 天」下发 720/2160 天并被 AGH 的「不超过一年」校验拒绝；`fmtMs()` 按数值大小猜单位（< 1 视为秒），同时被喂毫秒的 `elapsedMs` 与秒的 `avg_processing_time`，两侧都有值域会算错；总览趋势图忽略 `GET /stats` 的 `time_units`，AGH 保留期超过 7 天时按天分桶仍标成「HH:00」。
5. 根因是契约没有落在任何一处可核对的地方：`docs/agh-api.md` 的时间单位行只声明 querylog/stats 与 protection 为毫秒，filtering 这一项在表里完全缺席，mock 也没有照 AGH 校验，于是「UI 显示单位 → 直接发送」成了默认写法。

## Decision

1. **filtering `interval` 全程按小时**：两个页面的发送、显示、选择器当前值统一为小时，删掉 `HOUR_MS` 常量。
2. **统计保留期选项值改为 `h * HOUR`**：与查询日志保留期同构，四个选项分别落在 1/7/30/90 天，均在 AGH 的 1 小时–1 年窗口内。
3. **`fmtMs()` 只接受毫秒**（名字即契约），新增 `fmtMsFromSeconds()` 供 AGH 用秒上报的 `avg_processing_time`、`top_upstreams_avg_time` 在边界换算，不再按数值大小猜单位。
4. **趋势图跟随 `time_units`**：分桶宽度按响应声明的 `hours`/`days` 决定横轴标签与区间选择器文案（新增 `range6d/12d/24d` 词条），与 AGH 自家前端 `lineUtils.formatHistoryLabel` 的语义一致。
5. **mock 照 AGH 校验**：filtering 间隔按小时并复刻 `Unsupported interval`（400 纯文本），统计/查询日志保留期按毫秒校验 1 小时–1 年；`upstream_timeout` 默认值改为真实的 10 秒。目的是让同类错配在本地就失败，而不是留到真机。
6. **契约写进事实页**：`docs/agh-api.md` 补上 filtering 间隔为小时，以及秒/字节/「当日零点起的毫秒」等非毫秒字段，另在 `src/lib/api.ts` 的非毫秒字段上就地标注单位。
7. **不动的事**：不改 `FilteringStatus`/`DnsInfo` 等类型的字段名与形状，不动 `Protection.tsx` 的开关回传与快照的原样透传（它们本就单位无关）；不引入 AGH 的 `recent` 查询参数（控制台未使用）。

## Accept

- [x] 过滤器页选择任一更新间隔保存成功且回读一致：mock 上「1 天」→「12 小时」保存后 `GET /control/filtering/status` 回读 `interval = 12`，副标题显示「每 12 小时自动更新」，无错误提示
- [x] 过滤器列表页（黑名单过滤器）同路径：选「3 天」→ 服务端 `interval = 72`，行值与页头「更新间隔 3 天」一致
- [x] 通用设置页统计保留期选「30 天」→ `GET /control/stats/config` 为 `2592000000` ms（正好 30 天），保存后草稿清空、无报错；旧代码该选项发的是 720 天，mock 以 422 `unsupported interval: more than a year` 拒绝（实测复现）
- [x] 旧实现的请求体现在会被 mock 拒绝：向 `POST /filtering/config` 发 `interval: 86400000` 得到 400 纯文本 `Unsupported interval`（复刻用户报告的报错）
- [x] `MOCK_TIME_UNITS=days` 下总览趋势图横轴为日期（9/25…10/15）、区间选择器为「24 天」；`MOCK_AVG_TIME=1.5` 时平均耗时显示「1.50 s」（旧 `fmtMs` 会显示 1.50 ms）
- [x] `pnpm check`、`pnpm test`（131 例，含新增 `aghUnits` 3 例）、`pnpm build`、`node scripts/verify-proposals.mjs` 全绿

## Note

- 契约出处（AGH v0.107.79 源码，本机解包核对）：`internal/filtering/http.go:415-421`（`// in hours`）、`:474-477`（`Unsupported interval`）、`:763-767`（`maxUpdateIvlHours = 365 * 24`）、`:446`（status 回读同字段）；`internal/stats/http.go:130-136`（保留期毫秒）、`:252-265`（1 小时–1 年）；`internal/querylog/http.go:42-47`、`:260-273`（同上）；`internal/dnsforward/http.go:61-62`（`upstream_timeout` 秒）、`:85-95`（`blocked_response_ttl`、`cache_ttl_min/max` 秒）、`:88-89`（`cache_size` 字节）；`internal/dhcpd/config.go:120`、`:259`（`lease_duration` 秒）；`internal/stats/unit.go:482-500`（`time_units` 在保留期超过 7 天时切为 `days`，AGH 自家前端 `client/src/components/ui/lineUtils.ts` 据此切换横轴格式）。
- 触发路径的报错文案来源：AGH 用 `aghhttp.ErrorAndLog` → `http.Error` 写纯文本（`internal/aghhttp/aghhttp.go:31-52`），控制台 `api()` 的兜底分支把响应体前 200 字符当 message（`src/lib/api.ts:158`），因此用户看到的是 AGH 的英文原文。
- 验收环境（本机，实测后已清理）：临时 mock `PORT=3992`（新代码）+ `pnpm dev`（5173）+ 应用内浏览器；应用实例地址临时指向 3992，验收结束后已还原为原值 3990，用户原有的 3990 / 3991 / 8787 三个进程未被触碰。
- 遗留（不在本提案范围，另行登记）：`ClientForm` 的保存体不含 `blocked_services_schedule`（`src/lib/api.ts` 已声明该字段），编辑客户端会把服务端已配置的按服务时段静默清空；这是字段缺失而非单位错配，需要单独决定是否在界面上暴露该配置。
