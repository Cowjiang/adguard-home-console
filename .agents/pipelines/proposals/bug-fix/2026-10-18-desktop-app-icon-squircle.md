# 让 Windows 桌面图标带上圆角盘面与透明边距

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-10-18
**Updated:** 2026-10-18（实施完成：新图标源 + icon.ico 重生成 + NSIS 安装器图标；标题栏、任务栏与安装器均实测核对）
**Source:** 用户在验收 Windows 桌面端时指出：任务栏与标题栏里的图标是硬边矩形，与旁边其它应用不一致

## Goal

Windows 不像 iOS 那样给应用图标自动遮罩：Win32 应用的图标原样画在任务栏与标题栏上。仓库的图标源 `src-tauri/icons/app-icon-shield.svg` 是**满幅方形**（1024 画布铺满 `#DEF8EF` 盘面），于是任务栏里是一块硬边亮色矩形，深色任务栏上尤其突兀；旁边 QQ / ZCode / PhpStorm 这类应用都自带圆角盘面 + 透明边距。

## Decision

- 新增 Windows 专用图标源 **`src-tauri/icons/app-icon-windows.svg`**：同一枚盾牌、同一套配色，盘面改为**超椭圆（squircle）**，指数 5.5、占画布 900/1024（四周 62px 透明边距）。
- `icon.ico` 由该文件生成：`npx tauri icon src-tauri/icons/app-icon-windows.svg -o <tmp>` 后**只取** `icon.ico` 覆盖回 `src-tauri/icons/`。
- **iOS / Android / PWA 资源保持满幅**：那些平台由系统或客户端自己遮罩，预先圆角会变成"圆角套圆角"。因此 `app-icon-shield.svg` 及其派生资源一律不动，也**不要**把 `app-icon-windows.svg` 喂给整套生成流程。
- 指数 5.5 不是拍脑袋：把候选渲染与你任务栏里真实邻座图标放大到同尺度做过对照（`_probe/out/win2/icon-compare.png`），4.2 偏圆、5.5 与邻座的"方中带圆"更接近。
- **不改** `src-tauri/tauri.conf.json` 的 `bundle.icon`：它已指向 `icons/icon.ico`，替换内容即可同时覆盖 exe 内嵌资源、安装包图标与快捷方式。
- **补上 NSIS 安装器/卸载器图标**：新增 `bundle.windows.nsis.installerIcon` 与 `uninstallerIcon`（都指向 `icons/icon.ico`）。不配这两项时 NSIS 安装器用的是 **NSIS 默认图标**——实测把重打包后的 `setup.exe` 图标抽出来核对，看到的仍是蓝白 NSIS 标志（`bundle.icon` 只覆盖 exe 资源与 MSI 的产品图标，不覆盖 NSIS 安装器自身）。Windows 包是这次才第一次进发行线，所以这个默认值到现在才暴露。
- 生成脚本 `_probe/pw/make-windows-icon.mjs` 只在本机使用（探针目录不入库）。它带一条几何自检：盘面必须是单一连通形状（中心行列不得有缝）、四角与边距必须透明——这条自检在本次就抓到过一次真的路径缺陷（象限拼接把轮廓连成四段错序弧，盘面中央出现两道透明缝）。

## Accept

- [x] 自检通过：盘面中心行列无透明缝、四角与四周边距透明、盘内实心
- [x] `icon.ico` 六档结构与旧文件一致（16/24/32/48/64/256，全部 PNG 条目），256 档为圆角盘面 + 透明边距
- [x] `app-icon-shield.svg`、`icons/ios/`、`icons/android/`、`icons/*.icns` 与各尺寸 PNG 未被改动
- [x] 重新打包后：应用**标题栏**与**任务栏**显示圆角盘面，不再有硬边矩形（标题栏取窗口实拍，任务栏从实拍里按盘面色+盾牌色认领按钮后放大核对）
- [x] 从重打包的 `setup.exe` 抽出图标核对：安装器与卸载器图标取自应用图标，不再是 NSIS 默认标志
- [x] 验收环境（深色任务栏）下与邻座图标并排无明显违和

## Note

- 证据（本地留存，不入库）：`_probe/out/win2/icon-compare.png`（邻座 vs 候选同尺度对照）、`app-icon-windows-preview.png`（1024 预览）、`ico-256.png`（ico 的 256 档解出）、`_probe/pw/icon-compare.mjs` 与 `make-windows-icon.mjs`（对照与生成脚本）。
- 与 `AGENTS.md` 的"图标资源仍放在应用资源目录并入库"一致：新增的是矢量源 + 重生成的 `icon.ico`，都属于应用资源目录的入库内容。
- 顺带记录一个工具坑：`tauri icon` 走 resvg 解析 SVG，**XML 注释里不允许出现 `--`**（`--output` 这样的写法会让它报 `comment at 2:3 contains '--'` 直接失败），注释里改用短选项名即可；另外 Git Bash 会把 `-o /tmp/x` 这类参数改写成 Windows 路径，输出目录用仓库内相对路径最省事。
