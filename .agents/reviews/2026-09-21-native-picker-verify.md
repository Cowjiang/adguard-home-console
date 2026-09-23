# 原生选择器 spike 验证任务书(交给 macOS 侧施工 agent)

> 2026-09-21。Windows 侧已完成编码并 commit(`6123492`),本文是该 commit 的验证任务书。
> 技术细节见 `.agents/logs/tauri-ios.md` §9;背景:原生玻璃 TabBar 叠在 WebView 之上会遮住 Web 版
> CSS 底部弹窗,本次两条替代路线各接入一个入口,代码内失败均**自动回退 CSS 弹窗,不会白屏**。

## 0. 同步与构建

1. `git pull origin feat/ios-build`,确认拿到 commit `6123492`:新增 `src/lib/nativePickers.ts`,改动 `src/components/ui.tsx`(usePick)、`src/components/ProtectionCard.tsx`(openPausePicker)及两份 docs。
2. 构建照旧:`rm -rf src-tauri/gen/apple/build` 后 `npx tauri ios build --debug --target aarch64-sim`;若前端变更未生效,`touch src-tauri/src/lib.rs` 强制重编(`.agents/logs/tauri-ios.md` §7 坑 7)。

## 1. 改动内容速览

| 入口 | 方案 | 预期表现 |
| --- | --- | --- |
| `usePick` 全部单选场景(概览"时间范围"、日志筛选、设置页单选等) | A. WebKit 原生 `<select>`:点击时同步建临时隐藏 select 并 `showPicker()` | 弹**系统原生选择器**(输入附件层,浮于 TabBar 之上);change → onPick;取消/无 change → 静默清理 |
| 防护卡"定时暂停" | B. 插件 presentSheet:系统级 presented 液态玻璃弹层,header 行作标题,选中项 `badge: '✓'`,`sheetRow` 回传 `rowId` | 弹**原生玻璃底部弹层**(真 detents + 抓取条,浮于 TabBar 之上不被遮挡) |

两方案失败(非 Tauri 壳 / showPicker 拒绝 / 插件不可用)均回退原 CSS 弹窗;桌面锚点下拉与浏览器行为不变。

## 2. 走查清单(真机/模拟器)

1. **方案 A**:概览页点"时间范围"→ 期望系统原生选择器(非 CSS 玻璃弹窗),选值后图表切换;同样过一遍日志页筛选、设置页任一单选;再验"取消/点外部关闭"路径:无残留元素、无重复回调。
2. **方案 B**:防护卡点"定时暂停"→ 期望原生玻璃弹层,标题"暂停防护",当前值带 ✓;选"30 秒"→ 防护暂停、倒计时出现;上滑关闭 → 无副作用。
3. **回退验证**:若 showPicker 在 WKWebView 不被支持,方案 A 会静默回退为 CSS 弹窗并 `console.warn`——记录该现象即可,不算事故,但需注明(决定方案 A 是否可行)。
4. **回归**:浏览器(`npm run dev:all`)桌面下拉、移动端 CSS 弹窗、防护卡暂停应与改动前完全一致。

## 3. 重点观察项(决定铺开方向)

1. `showPicker()` 在 WKWebView 是否真的弹出系统选择器(iOS 16+ Safari 支持,WKWebView 同内核但未经真机确认)。
2. 插件 `onSheetRow` 回传的 `sheetId`/`rowId` 是否与 d.ts 一致、时机是否正常(插件 0.1.8 文档覆盖约 57%)。
3. 两个入口的材质观感与跟手度对比 → 结论用于决定 usePick 铺开时选 A、选 B 还是按场景混用。

## 4. 记录要求

把结果(含截图,存 `.agents/evidence/tauri/`)追加到 `.agents/logs/tauri-ios.md` §9 末尾(新建小节"§9.1 验证结果"),并更新 `.agents/reviews/2026-09-23-tauri-platform-plan-snapshot.md` §7 进度表中"未真机验证"字样。若验证失败需回退,`git revert 6123492` 即可,改动仅 5 个文件。
