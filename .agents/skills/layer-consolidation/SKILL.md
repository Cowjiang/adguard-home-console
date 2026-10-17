---
name: layer-consolidation
description: 分层收敛与结构治理：将散落组件与 lib 归位、拆分超载文件、收敛重复编排，并落地为可验收提案与分批实施。触发分支：(1) 整理、归位或拆分 src、components、lib 散落文件；(2) 跨页面/跨层重复编排收敛；(3) 架构审计或分层混乱治理。
---

# 分层收敛（Layer Consolidation）

分层收敛是将散落组件、超载大文件与重复编排按统一规则收敛归位的工程方法。全流程遵循确定性闭环：
**取证基线 ➔ 设计放置规则 ➔ 登记提案 ➔ 分批实施 ➔ 基线对照验收**。

## 核心原则

1. **规则先于枚举（Rule-First）**：放置规则决定文件归属，不针对单个文件临时决策。规则必须能够无歧义决定"下一个新增文件应该放哪"。
2. **平铺与内联默认（Inline/Flat by Default）**：保留代码的高局部性。建组、新建公共目录必须达到明确阈值，防止控件层与 lib 成为模糊倾倒场（Dumping Ground）。
3. **严格行为保持（Strict Behavior Preservation）**：结构整理不掺杂业务行为变更。若发现历史缺陷需修复，必须显式在提案中列出并独立验证。

## 何时不用（Exclusion Gates）

- **极小范围局部调整**：仅重命名文件或微调一两处组件，走 Direct 轨直接完成，无需建立提案与取证闭环。
- **业务行为变更与新需求**：属于 Feature 轨；收敛重构至多作为前置批次独立落地。
- **缺乏模块设计判据**：需先阅读 `codebase-design`（掌握深模块 `deep module`、杠杆率 `leverage`、局部性 `locality` 的判定模型）。

---

## 实施流程（Ordered Steps）

### 第一步：取证基线（Baseline Discovery）

在修改任何代码前，必须执行只读命令取证，获取四类硬指标并记录具体数值。基线数据直接作为后续提案立项与验收的客观依据：

```bash
# 1. 重复编排规模（测量常见重复样板与编排语句）
grep -rn 'catch (e: any)' src/pages src/components | wc -l

# 2. 跨层/跨页非法引用（硬证据：组件被迫定义于页面并被外部引入）
grep -rn "from './" src/pages/*.tsx | grep -E "from '\./[A-Z]"

# 3. 文件体量分布（识别超出合理上限的超载文件）
wc -l src/pages/*.tsx src/components/*.tsx src/lib/*.ts | sort -rn

# 4. 内联私有组件盘点（盘点可归位或需保留的目标对象）
grep -cE '^(export )?function [A-Z]|^const [A-Z][A-Za-z]+ = ' src/pages/*.tsx
```

> **完成判据（Checkable Completion Criterion）**：
> - 四类基线指标（重复计数、跨层跨页引用路径、超载大文件行数、内联组件清单）均完成命令取证并记录为确切整数及文件列表；
> - 确定本次收敛的明确目标集合，不留模糊推测。

---

### 第二步：设计放置规则与判定矩阵（Placement Rules & Decision Matrix）

根据代码库特征裁剪并确立两套互斥且完备的放置规则（组件 R 系 + 工具函数/库 L 系），并对重复模式执行深模块判定。

#### 1. 放置规则表（Components & Lib）

| 规则 | 判定条件 | 目标归宿 | 架构意图 |
| :--- | :--- | :--- | :--- |
| **R1** | 跨页面或跨层引用的组件 | 必须迁至 `src/components/`；原跨页 import 清零 | 组件定义在调用页面内是层级散落的硬证据，必须提升为共享控件 |
| **R2** | 页面私有、体量适中、宿主文件不超载 | 保持在原页面内联（Inline） | 内联具备最高局部性；过度拆分会造成碎片化并将根目录变成倾倒场 |
| **R3** | 页面私有、构成主要渲染体，且宿主页面超载 | 迁至 `src/components/<domain>/` | 页面文件回归"数据编排 + 状态装配"；域目录保证按业务内聚收敛 |
| **R4** | 底层库/引擎自有的渲染视图面 | 留在 `src/lib/<module>/` 内部 | 带有 JSX 不是移入控件层的充分理由；引擎专用渲染出口（Provider/Canvas/转场）属于引擎本身 |
| **L1** | 门面文件（Facade，如全局 API 客户端） | 始终保留在 `src/lib/` 根目录 | 保持全库调用入口单一，最小化引用路径层级深度 |
| **L2** | 单一完整引擎/独立状态机（即使单文件） | 保持平铺于 `src/lib/` 根目录 | 独立功能无需为了形式美观嵌套额外目录 |
| **L3** | 多文件共享特定关注点（≥ 3 个文件） | 建立子目录分组（如 `src/lib/dns/`） | 仅在达到文件数阈值（≥3）时建组，抑制目录层级膨胀 |
| **L4** | 工具函数与辅助算法 | 归入公共域辅助文件或并入深模块 | 严禁建立无语义的 `utils.ts` 杂物堆 |

#### 2. 抽取 vs 文档化决策矩阵（Deep Module Filter）

- **抽取并收敛（Deep Module Extraction）**：
  - *判定*：多处（≥3）存在逐字或高度近似的样板代码，且逻辑与异常流完全一致。
  - *动作*：抽取为纯粹公共 helper 或自包含 Hook，对外暴露极窄接口，一次性收敛所有调用点。
- **仅文档化（Documentation-only）**：
  - *判定*：各处存在相似习语，但分别具备各自合理的边界保护（如细微并发竞态处理、乐观更新回滚差异）。
  - *动作*：严禁用带有多布尔开关的 options-bag（浅模块）强行统一；将最佳实践与约束记录至文档。
- **补齐式收敛（Invariant Bug-fixing）**：
  - *判定*：多处共享核心不变式，但部分实现存在历史漏洞（如仅某处实现了回滚防护，其余处遗漏）。
  - *动作*：显式逐处比对差异，将公共核心逻辑提取至 Hook，并在提案中显式登记行为修正。

> **完成判据（Checkable Completion Criterion）**：
> - 待收敛清单中的所有组件与文件均映射至唯一的 R/L 规则；
> - 规则通过"新文件推演测试"（任何新加入的文件均有唯一落点）；
> - 制定完毕明确的"不做清单"（明确不抽取、不移动的文件与目录边界）。

---

### 第三步：登记提案（Proposal Registration）

分层收敛属于架构简化类变更，必须遵循 `.agents/pipelines/WORKFLOW.md` 规范，在 `.agents/pipelines/proposals/simplification/` 目录下登记提案：

- **Goal**：陈述可测量的技术与维护指标（禁用"代码更清晰"等主观描述）。
- **Decision**：记录确切的放置规则（R/L 表）、完整的文件迁移映射（原路径 ➔ 新路径）、深模块判定结论，以及"明确不做清单"。
- **Accept**：包含四类可客观检验的判据：
  1. 基线指标清零断言（如"跨页 import 清零"、"跨组件 catch 编排收敛至 1 处"）；
  2. 业务行为保持断言（路由、视图渲染、用户交互及网络调用行为一致）；
  3. 代码体量健康断言（超载文件 LOC 降至目标阈值内）；
  4. 校验命令全绿断言（`pnpm check`、`pnpm test`、`pnpm build`、`npm run test:server`）。
- **Note**：附带第一步的完整基线命令与测量数据快照，标明推荐实施批次，并链接参考范例。

> **完成判据（Checkable Completion Criterion）**：
> - 提案文件创建于 `.agents/pipelines/proposals/simplification/<date>-<topic>.md`，四大核心要素（Goal、Decision、Accept、Note）完备；
> - 运行 `node scripts/verify-proposals.mjs` 输出 `verify-proposals: ok`，提案校验通过。

---

### 第四步：分批实施（Phased Implementation & Verification）

实施阶段严格执行两大纪律：
1. **机械移动先行（Mechanical Moves First）**：文件物理移动、拆分与创建目录为纯移动，优先在最初批次集中实施，保持后续逻辑调整的 diff 干净可读。
2. **一次 import 风暴（Single Import Wave）**：所有跨模块路径引用与 import 改写集中在同一批次完成，不在后续批次重复震荡全库 import。

#### 建议实施批次序列

```
批次 1：纯机械移动与拆分（目录建组、组件归位、全库 import 路径同步更新）
  ↓
批次 2：纯编排收敛（公共 helper/数据适配层抽取，逐处等价替换）
  ↓
批次 3：复杂逻辑解耦与可测化（引入依赖注入，针对状态机与核心算法补充单测）
  ↓
批次 4：共享不变式 Hook 收敛（核对各调用处行为分歧后收敛，必要修复显式验证）
  ↓
批次 5：架构约定沉淀（在 docs/ 登记分层约束与深模块规范）
```

> **完成判据（Checkable Completion Criterion）**：
> - 每个批次变更后，运行全套检验命令并通过（`pnpm check && pnpm test && pnpm build && npm run test:server`）；
> - 重新运行第一步的四类基线取证命令，测量数值严格匹配提案 Accept 中的清零与收敛目标；
> - Git diff 经过逐处审查，无非预期的业务逻辑、文案或错误回滚差异。

---

## 陷阱防护（Failure Modes & Positive Steers）

| 典型陷阱 | 失败根因 | 正向应对指引 |
| :--- | :--- | :--- |
| **Barrel 抵消拆分** | 拆分后保留全量 index.ts 导出，未降低模块耦合度 | **全量按需引用**：拆分后彻底更新各调用点为精确子路径，消除过渡性 barrel 文件。 |
| **Options-bag 浅模块** | 强行将不同分支合并为带大量 boolean 的巨大 helper | **小接口与局部化**：保持模块接口极简深邃；特定于业务上下文的分支保留在局部。 |
| **倾倒场（Dumping Ground）** | 将仅单处消费的私有子组件全量扔入全局 components/ | **就近原则**：单处使用的私有组件坚决内联；体量过大时放入 `components/<domain>/`。 |
| **顺手改动业务逻辑** | 在结构重构的 diff 中顺便修改业务分支或修补小缺陷 | **正交变更**：结构整理严格保持行为一致；发现的历史问题单独创建 bug-fix 待办。 |
| **依赖主观印象** | 凭感觉编写"大量重复"、"层级不清"等无法量化的表述 | **实测基线先行**：所有收敛主张必须由确切的 grep/wc 数据及对比数字支撑。 |

---

## 参考范例（Reference Instance）

本仓规范参考范例：[`.agents/pipelines/proposals/simplification/2026-10-06-src-layer-consolidation.md`](.agents/pipelines/proposals/simplification/2026-10-06-src-layer-consolidation.md)。
该提案完整展示了四类基线数据盘点、R1-R4 与 L1-L4 放置规则落地、目标目录树拓扑图，以及前置/后置基线比对的 Accept 验收断言。
