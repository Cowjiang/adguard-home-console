# 让深色浮层显示玻璃并修复 backdrop-filter 前缀失效

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户澄清「不是不要用 backdrop-filter，是不要滥用；tabbar 和下拉选择器这类是允许显示玻璃的」。

## Goal

两件事：①`docs/PROJECT_MEMORY.md` §4 原先的"性能红线：大面积 backdrop-filter + 背景动画会发烫、已把卡片全改实色、勿回退"容易被读成全面禁用模糊，与用户真实意图不符；②深色下浮层（下拉选择器 / Sheet / Toast / 图表 tooltip / 登录卡）虽然带 `blur(24)`，但底色 `--glass-strong:#15171d` 完全不透明，玻璃实际看不见。排查过程中还发现模糊在多数引擎上根本没生效。

## Decision

- 模糊边界的准确表述：禁的是**大面积**模糊（整排卡片、整页）叠加背景动画；标签栏、顶栏、浮层、tab 透镜**允许并保留**玻璃。
- 浮层底色与升层实色拆成两个变量：新增 `--glass-pop`（深色 `rgba(21,23,29,0.72)`、浅色 `rgba(255,255,255,0.85)`）供 `.glass-strong`；`--glass-strong` 保持实色，继续供概览防护卡渐变与 `Card strong` 使用。否则大号防护卡会跟着变半透明，正好撞上"大面积"红线。
- 源码里 `backdrop-filter` 只写不带前缀的一条：手写的 `-webkit-backdrop-filter` 会被构建链（Lightning CSS）当同一属性去重、只留前缀那条，而现代 Chromium（实测 Chrome 153）已移除该别名，导致 Chrome / Firefox / WebView2 上标签栏、tab 透镜、浮层的模糊长期静默失效（只有 WebKit 正常）。

## Accept

- [x] 深色下拉浮层 `rgba(21, 23, 29, 0.72)` 且 `backdrop-filter: blur(24px) saturate(1.6)` 生效；桌面详情弹窗同款
- [x] 深色标签栏 `blur(16px) saturate(1.6) brightness(1.08)` 生效（Chrome 下此前为 `none`）
- [x] 构建产物同时输出 `-webkit-backdrop-filter` 与 `backdrop-filter` 两条
- [x] 深色概览防护卡仍为实色 `rgb(21, 23, 29)` 渐变、无 backdrop-filter
- [x] 浅色外观零变化（下拉浮层维持 `rgba(255,255,255,0.85)`）
- [x] 排序按钮双端等高与原生 / 自绘两条路径回归通过

## Note

验证环境：playwright + Chrome，390×844 与 1440×900，dist/8787 + mock AGH 3990，13 项断言全绿；排查手法（直接读 `dist/assets/*.css` 看该属性是否只剩前缀版）与结论已写进 `docs/PROJECT_MEMORY.md` §7 坑 19，设计侧表述写进 §4「模糊边界」，过程记录见 `docs/PC_ADAPTATION.md` 同名小节。
