# 修掉概览页移动端英文文案的两处溢出

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-17
**Updated:** 2026-10-17（实现完成，补验收结论与证据）
**Source:** 用户报告「英文界面概览页有文字溢出」，2026-10-17 本地实测并据用户决定收范围

## Goal

英文文案比中文长，390px 手机视口下概览页有两处溢出：

- 榜单卡片的三段控件（`Segmented`）英文标签 Top domains / Blocked domains / Active clients 撑破胶囊，被 `Card` 的 `overflow-hidden` 裁掉——390px 下末尾贴边、胶囊右侧圆角消失，360px 下截成 "Active clie"；
- 请求构成卡（移动端）的环形图图例里 "Safe Browsing" 被截成 "Safe Brow…"（390px 截 9px）。

修完这两处，概览页在 320–430px 中英文下不再出现被裁切的标签文字。同批发现的英文流量趋势卡「标题与图例互叠」本次不动（用户决定），风险与证据见 Note。

## Decision

- 榜单三段控件保留分段形态与单击切换，把英文标签缩短为 `Domains` / `Blocked` / `Clients`（与中文四字标签等长；这三个 key 只有该控件在读）。共享 `Segmented` 组件不改，避免牵动其它调用点。
- 移动端构成卡保持「环图左、图例右」布局：`Donut` 新增 `hidePct`，移动端图例只显示「圆点 + 名称 + 数量」、数量贴右；百分比列保留在桌面构成卡（桌面「图例不截断」的约束不变）。

## Accept

- [x] 320/360/375/390/430px 中英文：概览页无被卡片裁切的文字、无图例文字互叠（扫描的英文专属命中只剩图例互叠残留与设计内的上游地址省略号）
- [x] 移动端构成卡不再出现 "Safe Brow…"；320px 下最长的 "Safe Browsing" 仍会省略（已知边界，见 Note）
- [x] 移动端三段控件在 320px 下英文三项完整显示、胶囊圆角不被裁（中文在 320px 仍有 3px 溢出，改动前既有，见 Note）
- [x] 桌面 1024/1280：构成卡仍带百分比列，概览 EN 命中与改动前逐条一致（无回归）
- [x] `pnpm check` / `pnpm test`（115 passed）/ `pnpm build` 通过

## Note

- 证据（本地留存，不入库）：`_probe/out/before/` 与 `after/` 的同名前后截图（关键是 `ovf-ctx-360-en-tabs.png`、`ovf-ctx-390-en-comp2.png`），桌面回归对照 `after/ovf-desktop-en-comp.png`，扫描报告 `_probe/out/overflow-report.json`；复现命令见 `_probe/pw/README` 式脚本头（`overflow-scan.mjs`、`overflow-collide.mjs`、`overflow-shots.mjs`、`comp-shot.mjs`、`desktop-comp-shot.mjs`，都需 `chromium.launch({ channel: 'chrome' })`）。
- 扫描结果（英文专属命中，改动前 → 改动后）：390px 4 → 2、360px 6 → 2、375/430 只剩图例互叠/标题溢出；桌面与 lg1024 维持 0。三段控件与构成卡图例的命中全部归零。
- 残留一（范围外，用户决定本次不动）：英文流量趋势卡标题压住图例、两图例项互叠（390px 标题溢出 26px、互叠 328px²；320px 两图例项也互叠）。根因是 2×2 图例的测量只比较「单行总宽 vs 余量」，而芯片 `w-max` 会撑出网格单元、标题外壳 `min-w-0` 又被压缩。修法（图例放不下时整行下移到标题行下方，仍是 2×2）已评估，待单独提案。
- 残留二（已知边界）：320px 下构成卡为环图左右布局，英文 "Blocked" / "Safe Browsing" 与中文 "正常放行" 仍会被省略；ZH 三段控件在 320px 溢出 3px（改动前既有）。仓库未声明支持 320px，若要覆盖需改环图尺寸或改纵向堆叠。
