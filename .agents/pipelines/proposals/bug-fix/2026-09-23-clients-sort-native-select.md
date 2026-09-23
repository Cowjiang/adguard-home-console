# 修正客户端排序控件的原生选择器与等高

**Class:** bug-fix
**Status:** implemented
**Date:** 2026-09-23
**Source:** 用户反馈「排序按钮跟左边输入框高度不一致，打开的下拉菜单在 iOS 端没走原生下拉选择器」。

## Goal

客户端页同行搜索框旁的排序入口有两个缺陷：高度比搜索框矮 1.75px（写死 `h-[42px]`，实测搜索框 43.75px），且苹果设备上弹出的是自绘锚定下拉而非系统原生选择器。根因是同一件事的两面——该入口只调用了 `usePick()`，而 `usePick` 内部的苹果分支依赖 `HTMLSelectElement.showPicker()`，WebKit 从未实现该 API，故苹果设备上恒为失败回退。

## Decision

- 排序入口改为与其余 5 处一致的渲染期分支：`isAppleMobile() ? 胶囊 + 透明 <select> 覆盖层(PickSelect) : usePick 锚定下拉`，不再依赖任何 JS 唤起原生选择器。
- 高度不写魔数，改 `self-stretch` 跟随行高；`PickSelect` 增加可选 `ariaLabel`（原 button 的 `aria-label` 不能丢）。
- 删除 `nativePickers.ts` 的 `pickViaNativeSelect` / 冷却期计时 / `NativePickReq`：在 iOS 上恒返回 false 的死代码，留着会诱导后续入口再漏原生分支；`usePick` 简化为"永远走自绘菜单"。ProtectionCard「定时暂停」的行为因此零变化（它本来就是靠失败回退到自绘菜单）。

## Accept

- [x] 苹果设备渲染真实 `select[aria-label="排序方式"]`（5 项），`elementFromPoint` 命中该 select，全程不出现自绘菜单
- [x] 选 name-asc / name-desc 后列表顺序与 `localeCompare('zh-Hans-CN')` 升序 / 逆序一致，胶囊 title 跟随
- [x] 非苹果设备不渲染 select，点击弹出自绘锚定下拉、选中生效后关闭
- [x] 双端排序控件与搜索框等高（43.75 / 43.75，上下偏差 0）
- [x] `npm run check` 与 `npm run build` 通过

## Note

验证环境：playwright + Chrome 390×844，dist/8787 + mock AGH 3990；苹果环境以伪造 UA + `navigator.vendor='Apple Computer, Inc.'` 模拟，真机点击仍待用户确认。`showPicker()` 在 WebKit 不存在的依据：MDN browser-compat-data（Safari/safari_ios 为 `preview` 且置于开关后），以及 `.agents/logs/tauri-ios.md` §9.1 在 iOS 27 模拟器上的既有实测。细节见 `.agents/reviews/2026-09-23-desktop-adaptation-snapshot.md` 的同名小节与 `.agents/reviews/2026-09-23-project-memory-snapshot.md` §7 坑 18。
