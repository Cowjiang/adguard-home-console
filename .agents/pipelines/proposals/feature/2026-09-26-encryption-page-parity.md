# 补齐加密设置页与 AGH 原生功能的差距

**Class:** feature
**Status:** implemented
**Date:** 2026-09-26
**Updated:** 2026-09-26（追加专业 UX 评审轮：落地来源清空披露、禁用态状态占位符、重置行全宽收束 + 弹窗草稿披露与动词确认、textarea 加高、孤字与残留文案修正；复核判定通过）
**Source:** 用户要求对照 AGH v0.107.79 原生「加密设置」页（`client/src/components/Settings/Encryption/index.tsx` + `Form.tsx`）复核并更新；契约以 `openapi/openapi.yaml` 的 `TlsConfig` 为准。

## Goal

本仓加密设置页已覆盖原生大部分字段（启用、明文 DNS、强制 HTTPS、三个端口、SNI、证书/私钥路径与内容、状态卡、验证后保存），但缺四项：证书与私钥的**来源单选**（原生 `certificate_source`/`key_source` radio，提交时清空未选字段）、内容模式下的**「使用已保存的密钥」**（`private_key_saved`，服务端保存过私钥后不再回传内容，须显式沿用）、**重置设置**（原生 `reset_settings` 按钮确认后下发默认配置）、**端口冲突校验**（原生 `form_error_equal`：HTTPS 与 DoT 端口不得相同）。另修复保存后 `setDraft(null)` 被 effect 用旧 SWR 数据回填导致 dirty 无法清除的竞态（与常规设置页同源）。

## Decision

- 证书/私钥卡内各加一行来源 `Segmented`（路径 | 内容）：路径模式显示路径输入框，内容模式显示 PEM textarea；初始来源按原生规则推导（`certificate_chain` 非空 → 内容；`private_key` 或 `private_key_saved` → 内容）。
- 保存体按原生 `getSubmitValues` 语义构造：路径模式清空 `certificate_chain`/`private_key`；内容模式清空 `certificate_path`/`private_key_path`，且勾选「使用已保存的密钥」时置 `private_key=''` 保留 `private_key_saved`，由服务端沿用已存私钥。
- 「使用已保存的密钥」以开关行呈现，仅当服务端确有已存私钥（`data.private_key_saved`）且私钥处于内容模式时显示；勾选即清空 textarea 内容并禁用输入（同原生勾选即 `setValue('private_key','')`）。
- 页面底部新增「重置加密设置」危险行（沿用 DHCP 页重置行的 Card+Row 模式），确认后 `POST /tls/configure` 下发默认配置（`enabled:false`、`serve_plain_dns:true`、标准端口 443/853/784、四个证书/私钥字段与 `private_key_saved` 清空）；桌面端两栏内容下方不再铺全宽行，限宽 `max-w-xl` 居中，移动端自然占满（验收反馈：全宽行中间空一块）。
- 保存前校验 `port_https === port_dns_over_tls` 则阻断并提示（原生在两端口上标 `form_error_equal`）。
- 保存/重置成功后 `await mutate()` 取服务端新值回填草稿（不先置 null），来源选择保持用户所选不被重置；页头保存 + 底部「放弃/验证并保存」行保持 DNS/访问控制页既有模式不变。
- mock-agh 的 TLS 状态机化：`GET /tls/status` 返回完整状态，`POST /tls/configure` 存储并按内容/路径/已存私钥推导 `valid_*` 与证书元数据，`POST /tls/validate` 以合并态试算不落库。

## Accept

- [x] 证书/私钥来源可在路径与内容间切换，保存后服务端只保留所选来源的字段（读回验证）
- [x] 服务端已存私钥时内容模式出现「使用已保存的密钥」开关，勾选后 textarea 禁用，保存体 `private_key=''` 且 `private_key_saved=true`，读回 `valid_key=true`
- [x] 「重置加密设置」确认后恢复默认（enabled=false、标准端口、证书/私钥清空），页面与 mock 状态一致
- [x] `port_https === port_dns_over_tls` 时保存被阻断并提示
- [x] 保存后 dirty 正确清除，无 stale-pin；页头保存与底部放弃/验证并保存行保持既有模式
- [x] i18n zh/en 同步；`docs/agh-api.md` 新增加密契约行
- [x] 浏览器经 mock 全流程验证（来源切换、已存私钥、重置、端口冲突），不依赖真实 AGH
- [x] 全场景截图经独立评审视觉验收通过

## Note

- 契约依据：openapi v0.107.79 `TlsConfig`（`private_key_saved` 描述明确「服务端与客户端不必每次互传私钥」，即 GET 不回传已存私钥内容）；端点 `GET /tls/status`、`POST /tls/validate`、`POST /tls/configure`。
- 原生 UI 依据：`Encryption/Form.tsx` 的 `certificate_source`/`key_source` radio、`use_saved_key` checkbox（勾选即清空 `private_key`）、`clearFields()`（确认 → `setTlsConfig(defaultValues)`，即向服务端下发默认值）、`onFormSubmit` 的 `validatePorts`（`form_error_equal`）。
- 底部「放弃/验证并保存」行是 DNS/访问控制/加密三页既有统一模式，页头保存按钮并存，非例外，不在本提案调整范围。
- 视觉验收：`_probe/gen-shots/`（本机忽略材料）E1–E4 截图——桌面内容模式+已存私钥、dirty 态禁用 textarea、移动端悬浮导航保存按钮、重置确认弹窗——独立评审 4/4 通过；E2E 走 mock（3990）验证内容来源保存清空路径字段、`private_key_saved` 生命周期、`port_https === port_dns_over_tls` 阻断与重置恢复默认。
- 专业 UX 评审轮（独立评审判定「有条件通过 → 落实后通过」）：P0 来源分段下新增清空披露「保存时仅提交所选来源,未选来源的内容将被清空」（消除静默数据丢失）；P1 禁用 textarea 占位符改为状态解释「已使用服务器保存的私钥,关闭上方开关可粘贴新私钥」、重置行恢复全宽并与 dirty 双按钮拉开 mt-6（全宽底边线收束,不拆证书/私钥对去填两栏高度）、dirty 时确认弹窗追加「当前未保存的修改将被丢弃」且确认按钮改动词「重置」；P2 顺带修正 textarea 高度 72→128、启用副标题孤字、key_type 不换行空格、encryptionNote 删除与新分段语义矛盾的「内容优先」残留。评审同时确认多项不应动的既有设计（状态卡徽章、证书/私钥同栏、主开关不联动禁用下游、双保存入口等）。
