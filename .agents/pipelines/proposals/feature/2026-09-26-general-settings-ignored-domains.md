# 补齐常规设置页「被忽略的域名」功能

**Class:** feature
**Status:** implemented
**Date:** 2026-09-26
**Updated:** 2026-09-26（两轮验收反馈：弹层编辑先改为组内 textarea；保存按钮再从卡片内移到页头右上角——整页改为与 DNS 设置页一致的「草稿 + dirty 时页头保存」模式，所有行不再即时保存）
**Source:** 用户反馈 `/settings/general` 功能缺失（例如被忽略的域名）；以 AGH v0.107.79 原生常规设置页（`client/src/components/Settings/index.tsx` + `LogsConfig`/`StatsConfig`）与 `openapi/openapi.yaml` 为对照。

## Goal

本仓常规设置页（查询日志与统计）只有开关、保留时长、匿名化三组行，对照原生「常规设置」页的 LogsConfig/StatsConfig 卡片缺「被忽略的域名」：`ignored`（域名列表）与 `ignored_enabled`（开关），即匹配名单的查询不写入查询日志/不计入统计。原生页其余卡片（阻止域名、过滤器更新间隔、安全浏览、家长控制、安全搜索）在本仓已由防护页承担（`Protection.tsx` 的过滤开关/刷新间隔/三个防护开关与安全搜索引擎 Sheet），不重复实现。

## Decision

- 页面整体采用与 DNS 设置页一致的「草稿 + 页头保存」模式：两组配置（含既有的开关/保留时长/匿名化）都编辑本地草稿，`dirty` 时页头右上角出现「保存」按钮（`size="header"`，移动端由原生液态玻璃按钮接管），保存时分别 PUT 有变动的 `/querylog/config/update` 或 `/stats/config/update`，成功后草稿回填服务端值并 toast；卡片内不出现保存按钮（验收反馈：按钮不得作为例外留在卡片里）。
- 两组配置各加一行「被忽略的域名」：右侧 Switch 绑定 `ignored_enabled`。
- 名单编辑为组内内嵌 textarea（用户反馈：点击弹层不可发现；同 DNS 设置页限速白名单的内嵌模式），对齐原生 Form 的 `ignored.join('\n')` ↔ `split('\n')` 语义，保存时按行拆分、trim、去空行并去重随完整配置体下发。
- i18n 文案对齐原生 zh-cn 词条：「被忽略的域名」「匹配这些规则的查询不在查询日志/不在统计信息」「忽略的域名（以换行符分隔）」；保存提示合并为单条 `settings.generalSaved`（原两组各自的成功词条移除）。
- mock-agh 的两个配置端点已含 `ignored`/`ignored_enabled` 且 PUT 为合并语义，无需改动。

## Accept

- [x] 查询日志组可开关「被忽略的域名」并编辑名单，保存后读回与 mock 状态一致
- [x] 统计组同上；两者互不影响，PUT 体保留各自其余字段（enabled/interval/anonymize）
- [x] 名单按行拆分、trim、去空行、去重；开关状态独立于名单内容保存
- [x] 页面为「草稿 + 页头右上角保存」：dirty 才出现保存按钮，保存只下发有变动的配置；无卡片内按钮、无即时保存行
- [x] i18n zh/en 同步（文案对齐原生 zh-cn/en 词条，保存提示合并为单条）
- [x] 浏览器经 mock 全流程验证（编辑→dirty→保存→读回与刷新持久），不依赖真实 AGH
- [x] `docs/agh-api.md` 契约同步补充 `ignored`/`ignored_enabled`
- [x] 全场景截图（桌面/移动端、名单为空/非空、dirty 保存态）经独立评审视觉验收通过

## Note

- 契约依据：openapi v0.107.79 `GetQueryLogConfigResponse`/`GetStatsConfigResponse` 的 `ignored`（host names 数组）与 `ignored_enabled`；PUT 请求体与 GET 同构，须整体下发。
- 原生 UI 依据：`Settings/index.tsx` 常规设置页 = FiltersConfig + 安全浏览/家长控制/安全搜索 + LogsConfig + StatsConfig 三卡；`LogsConfig/Form.tsx`/`StatsConfig/Form.tsx` 中 `ignored_enabled` Checkbox + textarea（`ignore_domains_title`/`ignore_domains_desc_query`/`ignore_domains_desc_stats`）。
- 原生 LogsConfig/StatsConfig 卡片内还有清空查询日志/重置统计按钮，本仓放在「系统管理」页维护组，为既有信息架构差异，不属本提案。
- 视觉验收：`_probe/gen-shots/`（本机忽略材料）截图——桌面/移动端整页、textarea 编辑态——独立评审通过；E2E 走 mock（3990）验证开关写入、名单清洗（trim/去空行/去重）、保存后读回与刷新持久。
