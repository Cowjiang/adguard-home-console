# 桌面端设置内嵌二级侧栏与移动端双模布局

**Class:** feature
**Status:** implemented
**Date:** 2026-10-16
**Source:** 解决设置页在桌面端大屏下「跳出式单页」交互繁琐与空间利用率不足的问题，引入二级内嵌侧栏布局（方案 A）
**Updated:** 2026-10-16

## Goal

当前 `agh-console` 在桌面端（`>= 1024px`，即 `lg` 断点）与移动端采用统一的「Hub-and-Spoke」扁平路由体系：
1. **桌面端跳转繁琐**：用户在 `/settings` 看到两列卡片列表，点击某项（如 DNS、访问控制、外观）会离开 Hub 导航到独立的子页面（如 `/settings/dns`）。若想切换到另一项设置，必须点击左上角「返回」按钮回到 `/settings` Hub，再进入下一项。
2. **大屏空间利用率低**：桌面端屏幕宽阔，设置子页面往往单列呈现，页面两侧留白过多；缺乏分类侧边导航，难以对多项设置进行连续对比与快速切换。
3. **保持移动端原生体验**：在移动端（iPhone / Android / WKWebView / PWA），现有的全屏分类 Hub、iOS 原生玻璃返回胶囊、页面滑动推进/弹出（`TransitionArea` 推进动画及边缘手势滑动返回）体验十分优秀且符合平台习惯，必须 **100% 保持现状、零回退、零破坏**。

**本提案目标**：
在路由层与组件层建立**响应式双模设置布局（Scheme A）**：
- **桌面端（`lg` 及以上）**：设置页呈现「左侧内嵌固定/吸顶二级导航（SettingsNav）+ 右侧自适应内容区（`<Outlet />`）」的分栏结构；访问 `/settings` 默认自动重定向至首个设置项（`/settings/general`）。
- **移动端（`< 1024px`）**：保持完全不变，`/settings` 渲染 Hub 分类卡片列表，点击任一项平滑推进至独立子页面，保留原生返回胶囊与手势。
- **URL 与深层链接**：所有现有路径（`/settings/general`, `/settings/dns`, `/settings/server`, `/settings/about` 等）及外部跳转行为（如多实例切换器的「管理连接」）保持完全兼容。

---

## Decision

### 1. 路由体系重构：从扁平路由升级为嵌套路由

在 `src/App.tsx` 中，将散落的 `/settings/*` 平级路由重构为以 `<SettingsLayout />` 为顶层的嵌套路由树：

```tsx
<Route path="/settings" element={<SettingsLayout />}>
  {/* 索引路由：桌面端自动重定向至 /settings/general，移动端展示 Settings Hub */}
  <Route index element={<SettingsIndexRoute />} />
  <Route path="general" element={<GeneralSettings />} />
  <Route path="dns" element={<DnsSettings />} />
  <Route path="access" element={<AccessSettings />} />
  <Route path="encryption" element={<EncryptionSettings />} />
  <Route path="dhcp" element={<DhcpSettings />} />
  <Route path="system" element={<SystemPage />} />
  <Route path="snapshots" element={<SnapshotSettings />} />
  <Route path="appearance" element={<AppearanceSettings />} />
  <Route path="server" element={<ServerSettings />} />
  <Route path="server/edit" element={<InstanceEdit />} />
  <Route path="about" element={<AboutSettings />} />
  <Route path="app" element={<Navigate to="/settings" replace />} />
</Route>
```

- **索引路由分流（`SettingsIndexRoute`）**：
  ```tsx
  function SettingsIndexRoute() {
    const isDesktop = useIsDesktop()
    if (isDesktop) {
      return <Navigate to="/settings/general" replace />
    }
    return <Settings />
  }
  ```
  - 桌面端直接打开 `/settings` 时无缝 `replace` 至 `/settings/general`，保证用户无论从一级全局侧栏点击「设置」还是刷新 `/settings`，右侧都不会出现空白，直接呈现主配置。
  - 移动端打开 `/settings` 时渲染原有的 `Settings` Hub 组件，点击每一项正常执行 `nav('/settings/...')`。

---

### 2. 响应式容器：`SettingsLayout` 结构设计

创建 `src/components/settings/SettingsLayout.tsx`：

```tsx
export function SettingsLayout() {
  const isDesktop = useIsDesktop()

  if (!isDesktop) {
    // 移动端：直接交付 Outlet，由 Layout.tsx 的 TransitionArea 接管平滑滑动动画
    return <Outlet />
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-start gap-8">
        {/* 左侧二级导航：固定宽度，粘性吸顶 */}
        <aside className="sticky top-20 w-60 shrink-0">
          <SettingsNav />
        </aside>

        {/* 右侧设置内容区 */}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
```

- **桌面端优势**：
  - 左侧二级导航 `SettingsNav` 在切换子页面时**不重新挂载**，保持滚动位置与激活状态。
  - 右侧 `<Outlet />` 在路由切换时仅重渲染具体子组件，切换毫无卡顿感与页面跳闪。
- **移动端零成本透传**：
  - 移动端渲染 `<Outlet />`，配合 `TransitionArea` 的 `location.key` 机制，Hub 页面与子页面之间进出保持 100% 的原有动画和手势响应。

---

### 3. 二级导航栏组件：`SettingsNav`

创建 `src/components/settings/SettingsNav.tsx`，与现有设计规范严格统一：

1. **视觉语言**：
   - 采用与全局 `Sidebar` 统一的圆角胶囊 (`rounded-xl px-3 py-2 text-[13.5px] font-medium`)、悬浮背景 (`hover:bg-white/[0.04]`) 与选中态 (`bg-[var(--accent-soft)] text-accent font-semibold`)。
   - 保留各功能模块专属色彩的 `IconBubble` 或彩色小图标（如 General 用 accent-2，DNS 用 accent，Access 用 violet，System 用 danger）。
2. **分组与动态离线保护**：
   - **服务设置（Server Settings）**：
     - 常规与统计 (`/settings/general`)
     - DNS 设置 (`/settings/dns`)
     - 客户端与访问控制 (`/settings/access`)
     - 加密配置 (`/settings/encryption`)
     - DHCP 服务器 (`/settings/dhcp`)
     - 配置快照与回滚 (`/settings/snapshots`)
     - 系统与更新维护 (`/settings/system`)
   - **控制台应用设置（Console Settings）**：
     - 外观与个性化 (`/settings/appearance`)
     - 服务器实例与集群 (`/settings/server`)
     - 关于与版本更新 (`/settings/about`)
   - **离线联动**：读取 `useAuth().offline`；与现有 `Settings.tsx` 一致，当实例离线时自动折叠隐藏服务端配置项，仅展示控制台与服务器连接项，防止报错干扰。
3. **状态标记（Badge 联动）**：
   - 「关于」项：当检测到新版本发布（`hasUpdate`）时，导航项右侧展示小红点或 `New` 徽标。
   - 「服务器连接」项：当多实例在线或集群同步异常时展示告警徽标。

---

### 4. 标题与返回按钮协调（`PageHeader` 适配）

在现有的 `src/components/ui/primitives.tsx` 中：
```tsx
const isTopLevel = TOP_LEVEL_ROUTES.includes(pathname)
const showBack = back && !(isDesktop && isTopLevel)
```
- **现状分析**：
  - 过去只有 `/settings` 在 `TOP_LEVEL_ROUTES` 中，因此在桌面端访问 `/settings/general` 时，`isTopLevel` 为 false，`PageHeader` 仍然会绘制一个桌面返回按钮。
  - 引入内嵌二级分栏后，在桌面端，`/settings/general`、`/settings/dns` 等一级子分类属于设置工作区内的常驻视图，左侧已有直接点击切换的 `SettingsNav`，因此在桌面端显示返回按钮是冗余且影响视觉对齐的。
  - 特殊深层子页面（例如编辑某一个服务器连接的 `/settings/server/edit`）仍需要桌面端返回按钮以返回 `/settings/server`。
- **调整规则**：
  - 扩展 `src/lib/nav/routes.ts` 或在 `PageHeader` 中识别设置二级根页面：
    - 若 `isDesktop && pathname.startsWith('/settings/') && pathname !== '/settings/server/edit'`，判定其在桌面端具备顶级导航视图语义，不展示返回按钮。
    - 移动端无论何时都保持现有判定逻辑，返回按钮依然在子页面浮动吸顶展示。

---

### 5. 边界与多实例 / 深层链接兼容性

1. **外部跳转深层链接**：
   - 全局侧栏与 TopBar 的实例切换器中有「管理实例」快捷入口：`nav('/settings/server')`。
   - DNS 设置页底部的「访问控制规则」快捷入口：`nav('/settings/access')`。
   - 这些跳转在重构后路径保持 100% 一致，桌面端将平滑切入分栏的相应菜单项，移动端将压栈进入对应子页面。
2. **移动端手势与原生 Native Back Button**：
   - 移动端 `Layout.tsx` 依赖 `useNativeBackButton` 与 `useRouteTransition`。因为移动端依然是通过真实的路由切换驱动页面加载，DOM 结构在移动端与重构前完全一致，因此 iOS WKWebView 侧滑返回和返回胶囊完全不受影响。
3. **屏幕断点切换（Resize / Split View）**：
   - 当用户在平板或桌面拖拽窗口穿越 1024px 断点时：
     - 若当前停留在 `/settings/general`：从桌面缩到手机时，由于 URL 是 `/settings/general`，直接作为子页面全屏展示并出现顶部返回按钮，点击返回退回到 `/settings` Hub，完全自然合理。
     - 若当前在 `/settings` 手机端 Hub：放大到桌面时，`SettingsLayout` 挂载，子路由索引触发 `Navigate to="/settings/general" replace`，自动进入桌面分栏模式。

---

## Accept

- [x] **桌面端分栏呈现（>= 1024px）**：
  - [x] 访问 `/settings` 自动无缝进入 `/settings/general`，左侧展示吸顶二级导航栏，右侧展示通用设置内容。
  - [x] 点击左侧导航项（如 DNS、加密、外观、关于），右侧即时响应切换对应子页面，左侧导航高亮同步切换且无闪烁。
  - [x] 桌面端设置子页面顶部 `PageHeader` 不再展示多余的「返回」箭头，与右侧内容对齐。
  - [x] `/settings/server/edit` 作为深层表单，在桌面端依然能够正确返回 `/settings/server`。
- [x] **移动端完全零回退（< 1024px）**：
  - [x] 访问 `/settings` 依旧展示两列/单列的大卡片 Hub 列表，不出现桌面侧栏。
  - [x] 点击卡片正常触发移动端平滑推进动画进入子页面，子页面顶部保留原生悬浮返回按钮，点击或侧滑手势可正常返回 `/settings`。
- [x] **兼容性与深层链接**：
  - [x] 浏览器直接输入 `/settings/about`、`/settings/server` 等 URL，桌面端与移动端均能正确直达。
  - [x] 服务端离线状态下，左侧导航与移动端 Hub 一致，自动隐藏依赖 AdGuard Home 服务的设置项。
  - [x] 代码库通过 TypeScript 类型检查与现有单元测试。
