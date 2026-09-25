# 补齐 DHCP 设置页与 AGH 原生功能的差距

**Class:** feature
**Status:** implemented
**Date:** 2026-09-25
**Source:** 用户反馈 DHCP 页功能缺失；以 AGH v0.107.79 原生 UI（`client/src/components/Settings/Dhcp/`）与 `openapi/openapi.yaml` 为对照。

## Goal

本仓 DHCP 页只有开关、接口选择、IPv4 表单、静态租约增删，对照原生页缺 IPv6 配置、动态租约管理、静态租约编辑、重置入口，且冲突检测按旧版响应形状解析（`v4.server_ip/found`），v0.107.79 实际返回 `v4.other_server.found` + `v4.static_ip`，检测结果错误。目标是对齐原生功能集并修正解析。

## Decision

- 交互沿用本仓既有组件（Group/Row/Sheet/confirm），不做桌面式表格：动态租约与静态租约用行列表，静态租约编辑用底部 Sheet（MAC 只读、IP/主机名可改，`/dhcp/update_static_lease` 以 MAC 定位）。
- IPv6 表单仅在启用后展示（沿用本页 v4 的既有模式）；接口无 IPv6 地址时显示提示行。
- 启用开关加轻校验：无接口、或 v4/v6 任一填了部分字段时阻断并提示，不发 `/dhcp/set_config`。
- 动态租约行提供「转为静态」（预填新增 Sheet），组尾提供「清空动态租约」（`/dhcp/reset_leases`，带确认）；「重置 DHCP 设置」（`/dhcp/reset`，带确认）作为独立危险操作行。
- 冲突检测在服务端 DHCP 启用时禁用（同原生）；结果分 IPv4/IPv6 两行显示，附接口动态地址提示。

## Accept

- [x] 启用后可配置 IPv6 范围与租期，保存随 `/dhcp/set_config` 的 `v6` 字段下发
- [x] 动态租约列表显示 MAC/IP/主机名/到期时间，可转为静态租约，可确认后清空（`/dhcp/reset_leases`）
- [x] 静态租约可编辑（`/dhcp/update_static_lease`）与删除（`/dhcp/remove_static_lease`）并存
- [x] 冲突检测按 v0.107.79 契约解析 `other_server.found`（yes/no/error）与 `static_ip`，IPv4/IPv6 分别展示
- [x] 「重置 DHCP 设置」入口（`/dhcp/reset`）带确认后恢复默认
- [x] 启用开关在无接口或必填组不完整时阻断并提示
- [x] mock-agh 的 DHCP 状态机化并覆盖以上端点；浏览器经 mock 全流程验证，不依赖真实 AGH
- [x] `docs/agh-api.md` 契约与 i18n 词条同步更新

## Note

- 原生功能对照：`FormDHCPv6.tsx`（v6 范围+租期，接口无 v6 时禁用）、`Leases.tsx`（动态租约表 + make static）、`StaticLeases/index.tsx`（edit/delete）、`index.tsx`（reset_settings→`/dhcp/reset`、dhcp_reset_leases→`/dhcp/reset_leases`、启用前 filledConfig 门禁、检测到其它服务器时警告横幅）。
- 契约依据：openapi v0.107.79 `DhcpConfigV6`（仅 `range_start`/`lease_duration`）、`DhcpSearchResult`（`other_server.found` 枚举 yes/no/error，`static_ip.static` + `ip`）、`/dhcp/update_static_lease`、`/dhcp/reset`、`/dhcp/reset_leases`。
- 旧解析错误的现场证据（`r?.v4?.server_ip`）见修复前 `src/pages/AdvancedSettings.tsx` 的 `findActive`。
