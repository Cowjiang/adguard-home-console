# 构建与发布

三条交付线共用一份 Web 构建产物；发布走 GitHub Release，服务器只拉取产物，不在服务器上构建。

代码入口：`.github/workflows/release.yml`、`scripts/release-notes.sh`、`scripts/server-pull.sh`、`package.json`。

## 本地构建与验证

| 目的 | 命令 |
| --- | --- |
| 安装依赖 | `npm install` |
| Web 开发 | `npm run dev:all`（或 `npm run dev` + `npm run dev:server`） |
| 前端构建 | `npm run build`（Vite → `dist/`） |
| 类型检查 | `npm run check` |
| Rust 测试 | 先 `node scripts/mock-agh.mjs`，再 `cd src-tauri && cargo test` |
| 提案校验 | `node scripts/verify-proposals.mjs`（加 `--links` 核对路径） |
| iOS 工程与构建 | `./scripts/ios-signing.sh generate ios|tauri`、`npm run ios:build` |

## 发布产物

`.github/workflows/release.yml` 在 `main` 收到含源码的推送时运行：`npm ci` → `npm run build` → 打包 `agh-console.tar.gz`（含 `dist/`、`server/`、`package.json`）→ 创建 Release 并附上产物。

- 纯 `docs/**`、`.agents/**`、`**.md` 推送被 `paths-ignore` 跳过，可用 `workflow_dispatch` 手动补发。
- tag 形如 `v0.1.0-dev.<YYYYMMDD>.<短 sha>`，与分支名和提交绑定。
- 同一提交重复运行会先探测同名 Release 并跳过创建，保持幂等；`concurrency` 按分支串行，不取消进行中的运行。
- Release 与 tag 都不删除，既是回滚点，也是「相对上一版」变更列表的基线。

## Release 说明

`scripts/release-notes.sh` 由 workflow 以 `bash` 显式调用，按顺序选提交区间：

1. `before..after` —— 仅当 `github.event.before` 存在、非全零、是有效提交且是本次 `after` 的祖先；
2. 最近一个**确实是 `after` 祖先**的 `v0.1.0-dev.*` tag 到 `after`；
3. 都没有时取最近 20 个提交。

只挑祖先 tag 是为了兼容 force push：被替换的历史上的 tag 不作基线。说明正文由提交列表加 `Build of <sha> on <branch>` 组成，不含 GitHub 自动生成段落。

## 服务器部署

`scripts/server-pull.sh` 在服务器上由 systemd timer（`agh-console-pull.timer`）定时调用，只读 GitHub Release，不在服务器上构建：

- 只读 token 放 `/etc/agh-console-github-token`；文件不存在时直接退出，不报错。
- 读取 `releases/latest`，与 `/var/lib/agh-console/deployed-tag` 比对；版本未变化就结束，不重启服务。
- 下载 `agh-console.tar.gz` 解包到 `/opt/agh-console`，随后 `systemctl restart agh-console` 并校验服务处于 active。
- 覆盖前把 `dist`、`server`、`package.json` 复制到 `/opt/agh-console.bak`，上一份备份轮转为 `.bak.prev`。

## 回滚

- 代码层面回滚到任一历史 tag；Release 与 tag 长期保留，不会被清理。
- 服务器层面用 `/opt/agh-console.bak`、`.bak.prev` 覆盖回退，或手动下载目标 tag 的产物解包。
