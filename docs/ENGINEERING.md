# 工程约束与已知边界

## 实现约束

- React Hooks 必须在条件返回之前调用。`src/lib/api.ts` 的 `swrFetcher` 接受只读三元组；新增 SWR 调用沿用它。
- 所有 AGH `duration` / `interval` 字段以毫秒为单位，见 [API 契约](AGH_API.md)。`stats.top_*` 使用单键对象数组，消费前需归一。
- Express 4 的 AGH 代理注册为 `app.use('/api/agh', handler)`。`app.all('/*path')` 不匹配所需路径。
- `/filtering/refresh` 可能下载大量规则，因此 Express 与 Rust 代理都有单独的长超时分支。
- 密码和 `Authorization` 不写入日志。Web/Tauri 的连接配置目前在本地 `localStorage`；签名值在被忽略的本地文件。

## UI 实现边界

- `preserveAspectRatio="none"` 会横向拉伸 SVG 的 `<text>` 和 `<circle>`；图表轴标签与 hover 数据点使用 HTML 叠层，线条使用不缩放描边。
- `.field:focus` 只改变 `background-color`，避免 `background` 简写重置选择框的背景箭头。
- `Switch` 的 knob 位移由 CSS transition 控制；给同一 `transform` 再加 keyframe animation 会抢占过渡。
- 首屏加载与正常内容共用稳定的根节点，避免数据抵达时重挂载并重播页面入场动画。概览骨架与内容的淡入由 `content-in` 负责。
- 当前 `server/index.mjs` 的 `express.static` 设置了一小时资源缓存；改动 HTML 缓存策略时需单独检查 `/index.html` 是否被静态中间件先拦截。

## 验证入口

- 文档或提案路径、分类、状态变化：`node scripts/verify-proposals.mjs`。
- Web 代码：`npm run check`、`npm run build`。
- Rust 测试：先运行 `node scripts/mock-agh.mjs`，再运行 `cd src-tauri && cargo test`。有三个测试在 mock 不可用时会跳过实际请求。
- iOS 工程生成与构建使用 `scripts/ios-signing.sh`；机器专属的构建故障与修复记录在 `.agents/reviews/`，不作为通用构建步骤。
