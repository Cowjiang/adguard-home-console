# 仓库技能

本目录放可复用的多步 agent 能力，不存提案、项目状态或一次性的施工记录。技能采用 [Agent Skills 规范](https://agentskills.io)。

一个技能对应 `.agents/skills/<name>/SKILL.md`，目录名使用小写 `kebab-case`。`SKILL.md` 须以 YAML frontmatter 开头，至少包含与目录名一致的 `name` 和说明“做什么、何时用”的 `description`；agent 在匹配任务时先看到这两个字段，命中后才读取正文。

`SKILL.md` 正文写实际步骤。技能专用脚本、示例或参考资料放在同目录，正文使用相对该文件的路径引用。发布、上游同步等可复用流程也归此处；单次方案和验收仍放在 `.agents/pipelines/` 或 `.agents/reviews/`。
