# AdGuard Home Console

跨端的 AdGuard Home 管理控制台,基于 React 19 + Vite + Tailwind 4 + Express,可在手机、平板与桌面浏览器中获得一致的体验。

针对 AdGuard Home v0.107.79 的新式 HTTP API 开发(`POST /control/protection`、`PUT /querylog/config/update` 等),兼容部分旧结构。

## 功能

- **概览**:防护开关 + 定时暂停、查询/拦截统计、24h 趋势图、Top 榜单、上游延迟
- **查询日志**:实时滚动(2s 轮询)、按拦截原因筛选、域名/客户端搜索、详情浮层、一键拦截/白名单
- **防护**:黑白名单过滤器管理、自定义规则、拦截服务列表、DNS 重写、规则检测工具、安全搜索/家长控制
- **客户端**:持久客户端增删改、每客户端过滤策略、自动识别客户端转持久
- **设置**:日志/统计保留与匿名化、DNS 全套配置、上游测试、访问控制、加密、DHCP、主题

## 快速开始

```bash
npm install

# 开发模式(前端 5173 + 服务端 8787)
npm run dev:all

# 生产模式(构建后由 8787 托管)
npm run build
npm start
```

打开 http://localhost:8787,输入 AdGuard Home 地址与账号密码即可。

可在项目根目录创建 `.env`(已被 gitignore)预填默认地址:

```
AGH_DEFAULT_URL=http://AGH地址:端口
```

`AGH_DEFAULT_URL` 只是登录页预填值,可省略;登录页填写不同地址即可切换多实例。

### 局域网内访问

手机等设备与电脑同处一个局域网时,访问 `http://<电脑IP>:8787`,在手机上"添加到主屏幕"即可获得全屏 App 体验。

## 架构

```
浏览器 ──┬── 静态资源(dist)────────────── Express(8787)
         └── /api/agh/*  ──转发──▶  AdGuard Home /control/*
                (X-AGH-Target 头指定目标,
                 Authorization Basic 透传,
                 自动跟随 308 重定向)
```

- **代理的必要性**:AdGuard Home 不返回 CORS 头,浏览器无法直连;代理同时避免凭据离开本机。
- **凭据安全**:账号密码仅保存在本机 `localStorage`,请求经本地服务转发,不经过任何第三方。

## License

Apache-2.0 with Commons Clause:源码开放,个人与非商业使用免费;未经作者许可,不得出售本软件或基于其功能提供收费服务。详见 `LICENSE`。
