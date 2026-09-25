# AdGuard Home v0.107.79 API 契约

**Status:** current
**Updated:** 2026-09-25

本项目按 AGH v0.107.79 的 `/control/*` 契约实现。类型与调用点在 `src/lib/api.ts`；可执行模拟在 `scripts/mock-agh.mjs`。`_probe/` 中的 OpenAPI 与真实响应样本是本机探查材料，被 Git 忽略，克隆后不能假定存在。

| 领域 | 当前契约 |
| --- | --- |
| 时间单位 | `querylog` / `stats` 配置的 `interval`、`/protection` 的 `duration`、`status.protection_disabled_duration` 均为毫秒 |
| 统计 | `GET /stats` 包含 `dns_queries` 时间序列及排行；`top_*` 是单键对象数组，读取前需归一。前端类型 `KVMap` 同时兼容字典形式；`avg_processing_time` 与 `top_upstreams_avg_time` 是秒（浮点），显示为毫秒时需要换算 |
| 查询日志 | 响应为 `{data: [...]}`；查询支持 `search`、可重复的 `reason[]`、`older_than`、`offset`、`limit` |
| 防护 | `POST /protection` 使用 `{enabled, duration}`，其中 `duration` 为毫秒 |
| 配置 | 查询日志为 `GET /querylog/config` 与 `PUT /querylog/config/update`；统计配置同构 |
| 拦截服务 | `GET /blocked_services/all` 返回目录（含 Base64 `icon_svg`）；`GET /blocked_services/get` 返回当前 `ids` 和 `schedule`；`PUT /blocked_services/update` 保存 |
| 客户端 | `POST /clients/add`；`POST /clients/update` 使用 `{name, data}`；`POST /clients/delete` 使用 `{name}` |
| DNS 重写 | `PUT /rewrite/update` 使用 `{target, update}`；`/rewrite/settings` 与 `/rewrite/settings/update` 管开关 |
| 安全搜索 | `PUT /safesearch/settings` 使用总开关及七个引擎布尔值 |
| DHCP | `/dhcp/set_config`、`/dhcp/find_active_dhcp`（`{interface}`）、`/dhcp/add_static_lease` 等使用 snake_case；`GET /dhcp/interfaces` 返回以接口名为键的裸对象（无 `interfaces` 包裹），每项含 `name`、`hardware_address`、`flags`、`gateway_ip`、`ipv4_addresses[]`、`ipv6_addresses[]`（可为 null） |
| 其他操作 | `POST /cache_clear`、`POST /version.json`（`{recheck_now}`）、`POST /update`、`GET /filtering/check_host?name=...` |

`reason` 是字符串枚举，当前使用的值为 `FilteredBlackList`、`FilteredBlockedService`、`FilteredSafeBrowsing`、`FilteredParental`、`FilteredInvalid`、`FilteredSafeSearch`、`NotFilteredWhiteList`、`NotFilteredNotFound`、`NotFilteredError`、`Rewrite`、`RewriteEtcHosts`、`RewriteRule`。

所有新写入的单位字段都要对照目标 AGH 版本的契约核实；不要按 UI 显示单位直接发送。
