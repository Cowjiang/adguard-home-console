# 为 Pull Request 和核心分支增加自动化 CI 检查

**Class:** process
**Status:** implemented
**Date:** 2026-10-13
**Source:** 用户要求加入对 PR 的 CI 检查，确保合并到 `dev` 和 `main` 之前自动化跑通全量质量门禁。

## Goal

此前仓库仅有 `.github/workflows/release.yml`，在每日定时或发版时执行校验与多渠道构建。在日常开发与分支合并时，缺乏针对 Pull Request 的前置 CI 自动化门禁。
本提案旨在建立独立的 `.github/workflows/ci.yml` 工作流，在向 `dev` 或 `main` 提交 Pull Request 以及推送到核心分支时，自动运行全套质量门禁，阻断不合格代码合入。

## Decision

1. **触发规则**：
   - `pull_request`：目标分支为 `dev` 和 `main`。
   - `push`：直接推送到 `dev` 和 `main`。
   - `workflow_dispatch`：支持手动触发。
   - 并发控制：`group: ci-${{ github.workflow }}-${{ github.ref }}`，新 push 自动取消同分支旧 run。
2. **校验阶梯（与本地门禁及 release 保持对齐）**：
   - 依赖安装：Node.js 24 + pnpm 12（`--frozen-lockfile`）。
   - 提案流水线合规：`node scripts/verify-proposals.mjs`。
   - 严格类型检查：`pnpm check`（`tsc --noEmit`）。
   - 前端单元测试：`pnpm test`（`vitest run`）。
   - 服务端/代理契约测试：`pnpm test:server`（`node --test 'server/*.test.mjs'`）。
   - 发版规划自测：`pnpm test:release`（`node scripts/release-plan.mjs --self-test`）。
   - 前端构建打包：`pnpm build`（`vite build`）。
   - npm 发包产物自检：`pnpm check:pack`（`node scripts/check-npm-pack.mjs`）。

## Accept

- [x] 新增 `.github/workflows/ci.yml`，符合 GitHub Actions 规范与安全要求。
- [x] 触发条件覆盖针对 `dev` 和 `main` 的 PR 及 push 事件。
- [x] CI 步骤涵盖提案校验、类型检查、单元测试、服务代理测试、构建与打包自检。
- [x] 本地通过 `verify-proposals.mjs` 门禁。
