# 为多实例增加集群级防护并发控制

**Class:** feature
**Status:** implemented
**Date:** 2026-10-12
**Source:** 竞品功能调研与多实例主备高可用（HA）场景反馈。对标 `adguard_home_client` 等竞品的集群控制能力。

## Goal

当前控制台已支持多实例指标聚合（`aggregateStats`），但在防护控制上，`ProtectionCard` 与防护设置页面的开关及定时暂停（Snooze）操作只下发至当前活跃实例（`activeId`）。
在典型的家庭或小微企业主备双机 DNS 环境（如主路由部署 Primary、NAS 部署 Secondary）下，用户遇到网页误报临时暂停拦截时，只关停了主机，内网设备的 DNS 请求一旦命中备机仍会被拦截，导致排障与临时放行体验中断。
本提案旨在为多实例环境引入「集群级并发控制」，支持一键对所有在线实例同时生效防护开关与暂停倒计时。

## Decision

- **集群操作开关与范围选择**：
  - 当配置的实例数量 `instances.length > 1` 时，`ProtectionCard` 与相关防护操作区增加「应用到所有在线实例」的集群协同控制开关（默认勾选或提供便捷切换）。
  - 仅对探活状态为 `online === 'ok'` 的实例下发指令；对已标记为离线的实例自动跳过，避免阻塞或超时挂起。
- **并发请求与容错下发**：
  - 调用时并发向各目标实例的 `/control/protection` 接口发送请求（携带统一的 `enabled` 与 `duration` 毫秒数）。
  - 采用 `Promise.allSettled` 处理各机响应，并在操作完成后通过 Toast 汇总执行结果（如「所有在线实例已暂停防护」或「2 台已暂停，1 台离线已跳过」）。
- **状态感知与倒计时协同**：
  - 聚合多实例的当前防护状态：若各在线实例状态不一致，显示「部分保护」或差异提示；
  - 暂停倒计时：以最长或当前生效的暂停截止时间为基准显示剩余倒计时，倒计时结束时并发触发各实例的状态刷新（`refreshStatus` 与 probe 回调）。

## Accept

- [x] 在仅有 1 个实例时保持原有单机行为，无冗余 UI 元素。
- [x] 在存在 >1 个实例时，防护卡片清晰展示多实例协同操作入口与目标实例清单。
- [x] 切换总保护开关或选择定时暂停（如 10 分钟、1 小时）时，可并发向所有在线实例成功下发 `/control/protection`。
- [x] 离线或异常实例能够被优雅识别并跳过，Toast 提供明确的操作统计反馈（成功数 / 失败数）。
- [x] 暂停倒计时能在多实例下正常计时并在到期后并发刷新各实例状态。
- [x] 编写对应的单元测试，覆盖多机并发下发 helper 与状态判定逻辑。

## Note

- 关联代码：`src/components/protection/ProtectionCard.tsx`、`src/lib/session/instances.ts`、`src/lib/session/probe.ts`。
- AGH 协议依据：`POST /control/protection` 接收 `{ enabled: boolean, duration: number }`，其中 `duration` 为毫秒。
