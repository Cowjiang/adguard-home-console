# .agents/

本目录承载当前提案、可复用 agent 能力与带时间属性的工作材料。根 `AGENTS.md` 是全局入口；本页只负责指向需要的下一层。

## 按需打开

| 需要处理 | 下一站 | 读取条件 |
| --- | --- | --- |
| 判断 Direct / Noted 轨、登记或关闭提案 | `.agents/pipelines/WORKFLOW.md` | 实施非平凡变更前 |
| 查当前提案及状态 | `.agents/pipelines/README.md` | 需要确认已有决策时 |
| 为提案选择分类 | `.agents/pipelines/CLASSIFICATION.md` | 登记、移动或重分类时 |
| 使用仓库技能 | `.agents/skills/<name>/SKILL.md` | 名称或描述与任务匹配时 |
| 新建或维护仓库技能 | `.agents/skills/README.md` | 编辑技能时 |
| 追溯施工或故障 | `.agents/logs/`、`.agents/reviews/` | 当前事实与代码不足以回答时 |
| 复核截图 | `.agents/evidence/` | 本机存在对应证据时 |

`pipelines/` 是当前决策面；`logs/`、`reviews/` 是当时的记录，不是现行规格或待办。结论落地后，把仍有效的事实回写到 `docs/` 对应主题页；当前事实从 `docs/README.md` 按主题读取。

## 存放与命名

- `pipelines/`：提案生命周期；路径、模板和校验只在 `.agents/pipelines/WORKFLOW.md` 定义。
- `skills/`：可复用能力；不存项目状态。
- `logs/`：持续追加的施工日志用无日期的 `kebab-case`；单次会话存档可用 `transcript-YYYY-MM-DD.md`。
- `reviews/`：一次性方案、调研、报告或验收快照，文件名前缀为 `YYYY-MM-DD-`。
- `evidence/`：本地取证截图，已被 Git 忽略；随应用分发的图标资源仍放在应用资源目录并入库。
- 本目录内引用仓库文件用仓库根相对路径，不用 `../`；技能内随包资源按 `SKILL.md` 的相对路径约定。勿存机器专属配置、路径、凭据或密钥。

## 维护入口

新增或更新提案时，维护 `.agents/pipelines/README.md` 并运行流水线文档规定的校验。新增技能时遵循 `.agents/skills/README.md`。只有全局规则或入口路径改变时才更新根 `AGENTS.md`，无需把每份提案或技能列在根文件。
