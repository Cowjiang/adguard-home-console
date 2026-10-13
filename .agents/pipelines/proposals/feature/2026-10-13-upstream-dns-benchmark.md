# 上游 DNS 并发测速与基准测试（Upstream DNS Benchmark）

**Class:** feature
**Status:** implemented
**Date:** 2026-10-13
**Source:** 路线图 `2026-10-13-multi-instance-evolution-roadmap.md` P2-1 阶段；解决上游解析时延不可见、缺乏优选推荐的痛点

## Goal

在 AdGuard Home 配置中，上游 DNS（Upstream DNS）是决定全网解析速度与连通质量的核心枢纽。
目前控制台虽然具备基础的「测试上游」按钮（单次返回 OK/Fail），但存在以下核心痛点：
1. **时延黑盒**：原生 `/test_upstream_dns` 仅给出是否通畅，不返回各服务器的实际往返耗时（RTT）。
2. **多节点差异难对比**：在主备或双路由多实例部署下，各节点到同一公网上游（如 Cloudflare、AliDNS、DNSPod）的延迟因物理线路存在差异，用户无法横向对比各节点的表现。
3. **缺乏优选洞察**：用户配置了多路上游后，不知道哪一个应当设为主用，哪个时延过大应当剔除或降权。

本提案为控制台引入**上游 DNS 并发测速与基准测试套件（Upstream Benchmark Suite）**：
- 支持对当前配置（或临时自定义输入）的上游列表执行并发多轮精准往返测速（RTT）；
- 结合各实例历史累计解析时延（`stats.top_upstreams_avg_time`），输出综合延迟对比图谱；
- 在多实例环境下，支持横向展示不同节点的测速矩阵与优选上游建议。

## Decision

### 1. 测速引擎算法 (`src/lib/dns/benchmark.ts`)
- **采样机制**：
  - 前端并发针对各上游单项发起 `POST /test_upstream_dns`，记录服务端往返耗时：
    ```ts
    const t0 = performance.now()
    const res = await api(cfg, '/test_upstream_dns', {
      method: 'POST',
      body: { upstream_dns: [upstream] }
    })
    const rtt = Math.round(performance.now() - t0)
    ```
  - 支持配置采样轮数（默认 3 轮采样，计算中位数与抖动 Jitter），降低单次偶发网络波动影响。
- **状态判定标准**：
  - 🟢 **Fast（极速）**：RTT < 50ms 且状态 OK。
  - 🔵 **Good（良好）**：50ms <= RTT < 150ms 且状态 OK。
  - 🟡 **Slow（较慢）**：150ms <= RTT < 300ms 且状态 OK。
  - 🔴 **Poor / Failed（异常/超时）**：RTT >= 300ms 或接口返回具体报错。
- **多实例协同测试**：
  - 当存在多个在线实例时，前端支持并发指挥所有在线实例并行执行测速，汇总为「节点 x 上游」对比结果。

### 2. UI 交互与可视化 (`src/components/dns/UpstreamBenchmarkSheet.tsx`)
- **入口位置**：
  - 在 `src/pages/settings/DnsSettings.tsx` 的上游 DNS 配置组右侧/底部，增加「基准测速」按钮，唤起居中 Glass Sheet 弹层。
- **视图层呈现**：
  - **延迟对比柱状图**：按时延自低向高动态排序，彩色进度条直观显示差距。
  - **多实例横向切换/对比**：支持按实例标签切片查看，或多节点并列展示。
  - **智能建议卡片**：
    - 推荐标记：时延最低 Top 3 上游、不可达上游警告。
    - 一键优化辅助：可勾选优选上游直接复制或一键回填到配置表单。

## Scope Boundaries

- **性能约束**：测速由用户在前端主动点击触发，测速过程中设置单项超时保护（5s），避免挂起页面。
- **服务端无副作用**：只调用原生的只读测试端点 `/test_upstream_dns`，不修改任何 AGH 运行配置。
- **多语言适配**：中英文完整对齐（`zh/advanced.ts`, `en/advanced.ts`）。

## Accept

- [x] **测速核心逻辑**：封装 `benchmarkUpstreams` 工具函数，支持单/多轮采样、耗时统计与异常捕获，具备完善的单元测试。
- [x] **可视化交互面板**：提供 `UpstreamBenchmarkSheet`，实时展示各上游测试进度、RTT 延迟、状态徽标与排序。
- [x] **多实例测速支持**：在 `instances.length > 1` 时支持选择测试目标节点或跨节点比对。
- [x] **智能建议与辅助**：自动标出最优上游，支持一键将推荐配置应用或复制。
- [x] **质量门禁**：通过 `pnpm check`、`pnpm test` 与 `verify-proposals.mjs`。
