# 修掉原生选择器覆盖层撑宽文档导致的页面横向拖动

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-24
**Source:** 用户模拟器反馈「客户端页为什么内容可以左右滑动，貌似页面宽度溢出了」。

## Goal

iOS 壳中 `/clients` 整页可被左右拖动。根因不是常规盒子溢出：苹果端的排序控件是 `PickSelect` 渲染的真实 `<select>` 覆盖层，WebKit 会把其中 `<option>` 当真实盒子按文字宽度布局，长选项（「请求数从多到少」）溢出被压到 56pt 的控件且**不被裁剪**，把文档 `scrollWidth` 从 402 撑到 433。文档比视口宽，整页即可横向拖动。

判据是「文档变宽但无任何元素 rect 越界」——这也是常规 `getBoundingClientRect` 排查找不到元凶的原因；定位靠逐个隐藏元素看文档宽度是否回落。

## Decision

在 `PickSelect` 的 `<select>` 上加 `overflow-hidden`（组件层单点修复，覆盖概览/客户端/防护/设置的全部用法），控件自身尺寸不变（客户端排序钮仍 56pt，右缘 385pt）。

## Accept

- [x] WebKit + iPhone UA 实测：`/clients` 文档宽 433 → 402，与视口一致
- [x] 全页面回归（`/`、`/clients`、`/clients/form`、`/log`、`/protection`、`/protection/filters`、`/protection/services`、`/rewrites`、`/settings`、`/settings/general`、`/settings/dns`、`/settings/system`、`/top/queried`）横向溢出均为 0
- [x] 控件尺寸/位置与修复前逐点一致；可见的 `.field` 选择器即使塞入超长选项也不撑宽文档（无需额外改动）
- [x] `npm run check` / `npm run build` 通过
- [ ] 模拟器内点击排序钮仍能唤出系统选择器（待用户复测；`overflow-hidden` 不改变可点性，但只有真机/模拟器能验证原生 picker）

## Note

- 定位脚本为临时 playwright 探测（WebKit + iPhone UA + 长数据桩），未入库；同类排查手法：先看 `document.scrollingElement.scrollWidth` 与视口差，再逐个 `display:none` 二分定位。
- 平台事实已写进 `docs/engineering.md` 的 UI 实现边界；施工记录见 `.agents/logs/tauri-ios.md` §15。
