# 提案工作流

> `.agents/pipelines/` 的唯一流程来源。轨道、模板、生命周期与校验都以本文为准。
> 移植自用户另一项目的成熟工作流，按本仓裁剪：不引入证据目录协议，记录随仓库分发。

## 轨道

| 轨道 | 用在哪 | 产出 |
| --- | --- | --- |
| Direct | 小改动、单分支、没有耐久决策 | 提交 |
| Noted | 非平凡的行为 / 架构 / 契约 / 流程变更 | 提交 + 提案 |

提案是**最小耐久规划单位**：先把目标和可观察的验收写下来，再动手；不先拆成 ticket，也不另建任务队列。

## 登记面

本仓的登记面是**提案 + PR**：提案承载目标与验收标准，PR 承载变更评审（分支与发布规则见根 `AGENTS.md`）。本仓不使用 issue 跟踪，**缺 issue 不等于未登记**。

过程材料（命令输出、日志、验收报告）按需留在 `.agents/logs/` 与 `.agents/reviews/`，不强制形态。

## 标准路径

```text
.agents/pipelines/proposals/<class>/YYYY-MM-DD-<slug>.md
.agents/pipelines/rejected/<class>/YYYY-MM-DD-<slug>.md
.agents/pipelines/archives/<class>/YYYY-MM-DD-<slug>.md
```

`<class>` 取封闭集（见 `CLASSIFICATION.md`），由目录表达并在文件头重复；`<slug>` 是 2–6 个 kebab 词。

## 提案模板

```md
# <动词开头的标题>

**Class:** feature | bug-fix | architecture | simplification | process | testing
**Status:** proposed | implemented | rejected | archived
**Date:** YYYY-MM-DD
**Updated:** YYYY-MM-DD（可选：改过哪一段）
**Source:** <上游蓝图 / 父提案 / 用户要求，可选>

## Goal
<做什么、为什么>

## Decision
<产品 / 架构决定，可选>

## Accept
- [ ] <可观察的验收项>

## Note
<证据与链接>
```

## 生命周期

```text
proposed / implemented → .agents/pipelines/proposals/<class>/
rejected               → .agents/pipelines/rejected/<class>/
archived               → .agents/pipelines/archives/<class>/
```

`rejected/` 与 `archives/` 首次使用时创建分类目录，移动一律写仓库根相对路径：

```bash
mkdir -p .agents/pipelines/rejected/<class>
mv .agents/pipelines/proposals/<class>/<file>.md .agents/pipelines/rejected/<class>/<file>.md
```

被否决的提案改 `Status: rejected`，归档的改 `Status: archived`；两者都不是待办队列。

## 校验

改动提案的路径、分类或状态后运行：

```bash
node scripts/verify-proposals.mjs
```

校验文件名、分类目录、状态三者一致，并检查 `.agents/reviews/` 的快照命名。加 `--links` 会再核对文档里引用的具体路径是否存在——默认关闭，因为证据路径允许 `01–09*.png` 这类区间简写。

## 边界

- `docs/` 记耐久知识：项目记忆、蓝图、交互定稿，随代码演进更新。
- `docs/*_PLAN.md` 的阶段表决定**接下来做哪一块**；提案决定**这一块怎么做、怎么算做完**。
- `proposals/` 记当前决策，`rejected/` 记明确否决，`archives/` 记历史与替代关系。
- `.agents/logs/`、`.agents/reviews/` 记过程；`.agents/skills/` 放可复用能力，不装项目状态。
- 纯 `docs/`、`.agents/` 改动不需要跑前端或 Rust 测试；动了代码就按根 `AGENTS.md` 跑对应检查。
