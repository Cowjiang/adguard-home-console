# 提案分类

分类由 `.agents/pipelines/<生命周期>/` 下的目录表达，并在文件头的 `Class` 重复。

## 封闭集

| Class | 覆盖 | 审查视角 |
| --- | --- | --- |
| `feature` | 新的用户可见能力 | 产品 + 契约 |
| `bug-fix` | 修缺陷或补齐信号 | 根因 + 回归 |
| `architecture` | 已发布源码、接缝或持久化的结构决定 | 边界 + 不变量 |
| `simplification` | 不加能力地删代码或删行为 | 删除证明 + 消费者审计 |
| `process` | 代码之外的工具、策略与工作流 | 可复现 + 门禁归属 |
| `testing` | 测试基建、夹具、重放与策略 | 确定性 + 信号质量 |

一份提案**只有一个**分类。

`refactor` 与 `docs` **不是**分类：改变行为结构的归 `architecture` 或 `feature`，纯删除归 `simplification`，门禁与策略类文档归 `process`。

## 目录归属

```text
.agents/pipelines/proposals/<class>/   proposed / implemented
.agents/pipelines/rejected/<class>/    rejected
.agents/pipelines/archives/<class>/    archived
```

`rejected/` 与 `archives/` 的分类目录按需创建，不预先铺开。

## 校验

```bash
node scripts/verify-proposals.mjs
```

校验文件名、分类目录与状态三者一致；不一致时以退出码 1 失败。
