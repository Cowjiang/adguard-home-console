# 语言设置增加跟随系统并改为下拉选择

**Class:** feature
**Status:** implemented
**Date:** 2026-09-25
**Updated:** 2026-09-25（实施完成：三档语言设置 + 下拉/原生选择 + 提示删除；浏览器 Playwright 与 iOS 模拟器 zh/en/ja 走查通过，见 Accept。同日后续修订均按用户反馈迭代：外观页定为单卡片两行布局（应用主题 + 语言，分割线隔开），主题与语言统一为行式选择器（桌面锚定下拉 / Apple 原生选择），标题由「外观模式」更名「应用主题」（词典键 `appTheme`，设置中枢描述同步为「应用主题、界面语言」），弃用 `themeGroup`；Playwright 回归 15 项通过；桌面 zh/en、主题菜单展开、通用页参考与 WebKit iPhone 变体截图经独立 review 两轮验收通过——首轮指出截图脚本误开语言菜单，修正脚本截取主题菜单后复核全过）
**Source:** 用户要求（语言设置不应是分段选择，应为下拉或子页选择；需提供跟随系统，浏览器跟随浏览器、iOS 应用跟随系统；分别确认跟随系统生效；删除语言设置下方关于主题跟随系统的提示）。

## Goal

外观页的语言选择从分段（Segmented）控件改为与其他单选设置一致的下拉/原生选择，并新增“跟随系统”档：浏览器跟随浏览器语言（`navigator.languages`），Tauri iOS 应用跟随系统语言。同时删除外观页底部关于主题跟随系统的提示文案（`settings.themeHint`）。

现状：`resolveLang()` 在存储无值时已按 `navigator.languages` 匹配（zh→en 兜底），但设置页只允许显式选择 zh/en，一旦选择即永久覆盖、无法回到跟随系统。

## Decision

- 存储值由 `zh|en` 扩展为 `auto|zh|en`（键不变 `agh.console.lang.v1`）；`auto` 与缺省同语义：按 `navigator.languages` 顺序匹配 → 英文兜底。`index.html` 首帧引导脚本对非 `zh|en` 值本就走系统匹配分支，存 `auto` 无需改动引导。
- 控件沿用仓库单选惯例：Apple 移动端用 `PickSelect`（原生 `<select>`），桌面/其他用 `usePick()` 锚定下拉；当前值以 Row value 展示。
- 语言名（中文 / English）与 `auto` 档标签按当前 UI 语言渲染；`auto` 档标签与主题 `themeAuto` 同词（跟随系统 / System）。
- 先验证 WKWebView 的 `navigator.languages` 是否跟随系统语言（iOS 模拟器以 `AppleLanguages` 启动参数走查）；若不跟随，再评估原生 locale 桥接（Tauri 插件或 `@tauri-apps/plugin-os`），不在本提案预置桥接代码。

## Accept

- [x] 浏览器（mock + Playwright，dev + v0.107.79 契约 mock）：无存储值与 `auto` 时跟随浏览器语言（zh 环境中文、en 环境英文，日文环境英文兜底）；显式 zh 覆盖 en 浏览器语言；桌面下拉选择「跟随系统」存 `auto` 并即时切英文、reload 后保持；选「中文」存 `zh`、reload 后保持；外观页不再渲染主题跟随系统提示。共 11 项断言全部通过。
- [x] iOS 模拟器（`scripts/ios-signing.sh tauri build --target aarch64-sim --debug`，iPhone 18 Pro / iOS 27）：全新安装分别以 `AppleLanguages` 为 zh-Hans-CN / en-US / ja 启动，登录页首帧语言分别为中文 / 英文 / 英文兜底——确认 WKWebView 的 `navigator.languages` 跟随系统语言，无需原生 locale 桥接。
- [x] 外观页不再渲染主题跟随系统提示（`themeHint` 删除，zh/en 同步）；`npm run check`、`npm run build` 通过。

## Note

- 实现落点：`src/lib/i18n`（`LangSetting`/`getLangSetting`/`systemLang`，`setAppLang` 接受 `auto`）、`src/pages/Settings.tsx`（语言行：桌面 `usePick` 锚定下拉、Apple 移动端 `PickSelect`）、词典 `settings.langAuto` 新增与 `settings.themeHint` 删除。
- `index.html` 首帧引导无需改动：引导对非 `zh|en` 存储值本就落入 `navigator.languages` 匹配分支，存 `auto` 直接兼容。
- `docs/engineering.md`「i18n 约定」已同步存储值域描述。语言选择控件在 Apple 移动端的点按走查沿用 PickSelect 既有模式（原生 `<select>`），本次模拟器以全新安装的 auto 态验证解析链；应用内点按级切换由浏览器端等价控件覆盖。
