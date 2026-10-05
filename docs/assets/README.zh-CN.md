# AdGuard Home Console 简介

**Status:** current
**Updated:** 2026-09-26

AdGuard Home Console 是一个**非官方**的 [AdGuard Home](https://github.com/AdguardTeam/AdGuardHome) 跨平台管理控制台：完整管理界面跑在浏览器里，也可以作为 PWA 装到手机桌面，或打包成桌面与移动端的原生应用。界面提供英文与简体中文、浅色与深色主题。

## 为什么有这个项目

AdGuard Home 的 API 不返回 CORS 头，浏览器无法直连——所有第三方「云端控制台」都必须经过一台能看到你凭据的中转服务器。AdGuard Home Console 把这件事反过来：你自己运行一个极小的无状态服务，用户名和密码从不离开你的机器。

- **自托管优先**：Express 服务只做两件事——托管静态文件、把 `/api/agh/*` 反向代理到你的 AdGuard Home。没有账号体系、没有遥测、没有第三方中转。
- **随处运行**：一个 Node 进程同时提供 UI 和代理，可以暴露给局域网、VPN（Tailscale、EasyTier），也可以只留在本机。
- **对齐当前 API**：面向 AdGuard Home v0.107.79 的 HTTP API（`POST /control/protection`、`PUT /querylog/config/update` 等），对旧版结构保持部分兼容。

## 界面预览

概览页提供防护开关与定时暂停、今日查询/拦截统计、24 小时流量趋势、热门域名与客户端、上游延迟与运行状态。

![概览页（深色）](../images/dashboard-dark.png)

![概览页（浅色）](../images/dashboard-light.png)

查询日志支持实时滚动（2 秒轮询）、按结果与 DNS 类型过滤、域名/客户端搜索，详情浮层内可一键加入黑白名单。

![查询日志](../images/query-log-light.png)

过滤器页集中管理黑白名单、自定义规则、拦截服务、DNS 改写与安全搜索/家长控制。

![过滤器](../images/filters-dark.png)

打包为原生 iOS 应用（Tauri 2 外壳）后：底部玻璃标签栏、原生返回手势与下拉刷新，界面语言跟随系统（截图为英文系统下的效果）。

<div align="center">
  <img src="../images/ios-query-log.png" width="220" alt="iOS 查询日志" />
  <img src="../images/ios-filters.png" width="220" alt="iOS 过滤器" />
  <img src="../images/ios-settings.png" width="220" alt="iOS 设置" />
</div>

## 功能速览

- **概览**：防护开关与定时暂停、查询/拦截统计、24 小时趋势图、热门榜单、上游延迟与运行时长
- **查询日志**：实时滚动、多维度过滤、搜索、详情浮层、一键黑白名单
- **过滤器**：黑白名单管理、AdGuard 语法自定义规则与规则检查工具、拦截服务、DNS 改写、Safe Browsing / 家长控制 / SafeSearch
- **客户端**：持久客户端与按客户端过滤策略，自动发现的客户端可一键转持久
- **设置**：日志与统计的保留期和匿名化、完整 DNS 配置与上游测试、访问控制、TLS 加密、DHCP 服务端
- **体验**：浅色/深色/跟随系统主题、中英双语、可安装为 PWA，移动端支持下拉刷新

## 快速上手

三种部署通道任选其一，详细配置见英文 [README](../../README.md)：

```bash
# Docker（amd64 / arm64）
docker run -d --name agh-console -p 8787:8787 ghcr.io/cowjiang/agh-console:latest

# npx（Node ≥ 18）
npx agh-console

# 源码运行
git clone https://github.com/Cowjiang/adguard-home-console.git
cd adguard-home-console && npm install
npm run dev:all              # 开发：前端 5173，代理到 8787
```

启动后打开 <http://localhost:8787>，填入 AdGuard Home 地址与账号密码即可。局域网设备访问 `http://<电脑 IP>:8787` 并「添加到主屏幕」可获得全屏体验。

## 声明与许可

本项目与 AdGuard 官方无关联、未获背书。「AdGuard」与「AdGuard Home」是其各自所有者的商标。源码以 [Apache-2.0 with Commons Clause](../../LICENSE) 发布：个人与非商业使用免费，未经许可不得销售本软件或基于其功能提供付费服务。
