# Web/PWA 侧滑返回揭示空白（压制原生手势方案已否决）

**Class:** bug-fix
**Status:** rejected
**Date:** 2026-10-16
**Source:** 用户实测反馈「Safari 的 PWA 里从设置子页左滑返回，上级页面快照是空白；客户端页、日志页的子页没问题」，随后裁定：**不要压制 WebKit 的原生返回手势**。

## 被否决的处理方式

曾实现的方案是 Web 侧收掉原生侧滑：`html:not([data-tauri-shell]) body { overscroll-behavior-x: none }`，并在 `src/main.tsx` 依 `isTauriShell()` 打 `data-tauri-shell` 把规则挡在两个 Tauri 壳之外。用户裁定这等于把平台手势盖掉，不接受——该改动已从 `dev` 历史中移除（force push，未留 revert 提交）。PWA 保持平台原生行为；本文件只保留分析与仍在桌面上的选项。

## 机制（可复用事实）

- PWA 里 `isTauriIOS()` 为 false，自研边缘侧滑不启用，左滑完全由 Safari/WebKit 接管；我们的代码不参与。
- 手势「揭示」的那一层是 WebKit 自己绘制的、按历史条目绑定的**文档快照**：同文档（pushState）条目从来没有这样一张图，于是揭示层是空白底板，且它在页面文档之外——页面怎么写都画不进去。iOS 壳上已逐帧取证（`.agents/logs/tauri-ios.md` §13.2：`#E3E5EC` 均匀空白、提交后整屏纯白），壳的对策是关掉原生手势改自研（8d97ede）。
- 浏览器端没有 `allowsBackForwardNavigationGestures` 这类开关，页面也无法取消系统手势识别器，所以「让揭示层显示正确内容」在 Web 层不可达。

## 为什么有的子页「有内容」

代码侧唯一差异是 push 是否带 `location.state`（`src/pages/QueryLog.tsx`、`src/pages/Clients.tsx` 带；`src/pages/Settings.tsx` 不带），且 src 里**没有任何整文档跳转**（无 `location.reload/assign/href=`），App 自己从不产生文档级条目。据此的模型（待真机确认）：WebKit 只对真正提交过文档的条目存有截图（PWA 被系统重启/重载、Safari 恢复会话、从后台回来重截），而全 SPA 里能得到图的就是 App 启动/恢复时所在的那条 URL——设置页与日志页都经 TabBar `replace`，共用同一条 entry，谁在启动那一刻是当前页谁就「看起来正常」。即差异更可能是**会话顺序**，而不是页面自身行为。

真机 30 秒判定：
1. 让 PWA 彻底重启、或直接以某设置子页 URL 打开，再左滑——按模型应当有内容；
2. 新会话里把 PWA 停在别的页，经 tab 跳到日志、再进详情左滑——按模型应当空白。

## 仍在桌面上的选项

1. **保留原生手势 + 下钻改成整文档加载**（MPA 式）：每条 entry 都有文档截图，原生手势天然正确；代价是每次下钻重载 App、丢掉现有转场与速度。
2. **接管手势**：把自研侧滑移植到浏览器壳——但它必须先把原生手势压掉，与本裁定冲突，当前不可选。
3. **维持现状**：接受同文档条目的揭示层空白（返回走应用内胶囊仍正常，胶囊的 CSS 过渡用的是我们自己的快照）。
