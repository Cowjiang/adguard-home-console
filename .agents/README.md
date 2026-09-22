# .agents/

本目录存放供仓库内工作的各类 AI agent 使用的**能力**与**工作产物**。**入口规则在仓库根 `AGENTS.md`**，本文件只说明目录约定。

## 与 docs/ 的分工

| 目录 | 放什么 | 判据 |
| --- | --- | --- |
| `docs/` | 常青规格与知识：项目记忆、施工蓝图、交互定稿 | 会被反复读、随代码演进更新 |
| `.agents/` | agent 能力，以及带时间属性的过程产物：日志、报告、验收、证据 | 一次性产出，记录"当时发生了什么" |

## 布局

```
.agents/
├── skills/          Agent Skills 规范（<name>/SKILL.md）
├── workflows/       预留：可复用的多步执行流程（与 pipelines/ 的分工见下）
├── pipelines/       提案生命周期：当前决策面
├── logs/            施工日志与会话存档
├── reviews/         报告 / 验收 / 验证任务书（一次性快照）
└── evidence/        取证截图，按来源分 web | native | tauri | acceptance
                     ⚠️ 不入库（.gitignore 已忽略），仅本地留存
```

## 命名规则

一律 `kebab-case` 全小写（与 Agent Skills 对技能名的要求同风格）：

- **流水类**（持续追加的日志）：不带日期前缀，如 `logs/tauri-ios.md`、`logs/orchestration.md`；日期写在文内。
- **快照类**（一次性产出的报告 / 验收 / 任务书）：前缀 `YYYY-MM-DD-`，如 `reviews/2026-09-21-ios-visual-acceptance.md`。同一天多份靠主题区分。
- 引用其他文件一律写**仓库根相对路径**（`docs/PROJECT_MEMORY.md`、`.agents/logs/tauri-ios.md`），不要写相对本文件位置的 `../` 路径。

## skills/

遵循 [Agent Skills](https://agentskills.io) 规范，与工具无关——实现该规范的客户端会扫描 `<项目根>/.agents/skills/`。

一个技能 = 一个目录，目录名即技能名，根必须含 `SKILL.md`：

```
.agents/skills/<name>/
├── SKILL.md         必需
└── ...              可选：脚本、参考资料等随技能分发的资源
```

`SKILL.md` 以 YAML frontmatter 开头，至少要 `name` 和 `description`：

```md
---
name: <技能名，与目录名一致>
description: <做什么 + 什么时候用。agent 只凭这一句决定是否加载>
---

<正文：命中后才会被读到的详细指令>
```

写法要点：

- **`description` 决定命中率**。要同时说清「做什么」和「什么场景下用」，agent 平时只看到这一句。
- **渐进披露**：未命中时只有 `name` + `description` 进入上下文，命中后才加载正文——所以正文可以写长，`description` 要精炼。
- 随技能分发的脚本/资料放在同目录下，正文里用相对路径引用（相对 `SKILL.md` 所在目录）。

## workflows/

预留给**可复用的多步执行流程**（例如发布、上游同步这类反复要走的步骤）。**目前尚无约定**——第一个流程落地时在此定稿，并同步更新本节与根 `AGENTS.md`。

与 `pipelines/` 的分工：`pipelines/` 管**决策与验收的生命周期**（一份提案从提出到实施/否决/归档），`workflows/` 管**怎么把一个已知流程跑完**。

## pipelines/

提案生命周期，是一份**流程**而不是存储桶：轨道分 Direct / Noted，Noted 轨的变更先登记提案再动手。

- 轨道规则、提案模板、生命周期与边界：`pipelines/WORKFLOW.md`
- 封闭分类集与目录归属：`pipelines/CLASSIFICATION.md`
- 当前提案一览：`pipelines/README.md`

改动提案的路径、分类或状态后运行：

```bash
node scripts/verify-proposals.mjs
```

## logs/ reviews/ evidence/

- `logs/` — 按线或按会话一份：`tauri-ios.md`（Tauri 壳线）、`ios-native.md`（SwiftUI 原生线）、`orchestration.md`（跨线编排）、`transcript-<日期>.md`（会话存档）。
- `reviews/` — 报告与验收结论。**结论落地后，仍然有效的规范要回写 `docs/`**——`reviews/` 是当时的判据，不是现状。
- `evidence/` — 取证截图。**整个目录不入库**（`.gitignore` 忽略）：仓库里不放二进制截图，截图一律只在本地留存。因此报告里的 `evidence/...` 路径是**取证位置约定**，克隆后并不存在，要复核得按报告里写的方法重拍。新素材用带来源与用途的文件名（`<端>-<序号>-<页面>-<状态>.png`），避免再出现"文件名与内容对不上"。例外是**随应用分发的图标资源**（`Assets.xcassets`、`src-tauri/icons/`）——那是 App 内容，照旧入库。

## 维护

- 新增技能、流程或提案后，同步根 `AGENTS.md` 的「必读文档」，让 agent 知道去哪儿找。
- 本目录随仓库分发：**勿放机器专属配置、路径、凭据或密钥**，也别写某台机器上的工具与装载细节（签名值走 `.env.signing`，见 `docs/PROJECT_MEMORY.md` §12）。
