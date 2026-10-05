# 代码库事实

**Status:** current
**Updated:** 2026-09-24

`docs/` 记录当前代码与已定下的持久约定。本页只管本层：列出有哪些主题、入口在哪、怎么维护；点进入口再按需往下读，实现变化时同步修正事实页。本目录不承担待办队列。

| 主题 | 入口 | 内容 |
| --- | --- | --- |
| 项目简介（中文） | [assets/README.zh-CN.md](assets/README.zh-CN.md) | 项目定位、界面预览、功能速览与快速上手 |
| 结构与接缝 | [architecture/README.md](architecture/README.md) | 两条交付线、请求路径、各端结构与构建发布；该目录自成一册，页面不在此展开 |
| AdGuard Home v0.107.79 契约 | [agh-api.md](agh-api.md) | `/control/*` 的字段、单位与枚举 |
| Web 端布局与交互 | [web-interaction.md](web-interaction.md) | 响应式结构、弹层与选择器、页面行为、路由转场 |
| 原生平台 | [native-platforms.md](native-platforms.md) | Tauri 壳的原生能力、iOS 签名与工程生成（含生成校验） |
| 工程约束 | [engineering.md](engineering.md) | 实现边界、发布流程、验证入口 |

子目录以自己的 `README.md` 作为入口，本页不展开其下的页面；每个页面各自给出代码入口与元信息。需要提案、技能、施工历史或验收证据时，从 `.agents/README.md` 进入。

## 维护约定

- 文件名用小写 kebab-case；目录索引固定为 `README.md`。
- 每页标题下写两行元信息：`**Status:**` 与 `**Updated:**`（最后核对日期，`YYYY-MM-DD`）。
- `Status` 取值：`current` 已对照代码核实；`stale` 已知与代码不一致、待核对；`draft` 尚未核实。
- 改动事实页时同步更新 `Updated`；发现内容与代码不符，先把 `Status` 改成 `stale`，再核对修正。
