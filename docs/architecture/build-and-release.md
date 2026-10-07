# 构建与发布

**Status:** current
**Updated:** 2026-10-07

两条交付线共用一份 Web 构建产物；发版是一条工作流、一次构建、三个消费者（GitHub Release 产物、npm 包、GHCR 镜像），服务器只拉取产物，不在服务器上构建。

代码入口：`.github/workflows/release.yml`、`scripts/release-plan.mjs`、`scripts/check-npm-pack.mjs`、`scripts/release-notes.sh`、`scripts/server-pull.sh`、`Dockerfile`、`package.json`。

## 本地构建与验证

| 目的 | 命令 |
| --- | --- |
| 安装依赖 | `pnpm install`（`corepack enable` 即可，版本钉在 `package.json#packageManager`） |
| Web 开发 | `pnpm dev:all`（或 `pnpm dev` + `pnpm dev:server`） |
| 前端构建 | `pnpm build`（Vite → `dist/`） |
| 类型检查 | `pnpm check` |
| 单元测试 | `pnpm test`（vitest） |
| Rust 测试 | `cd src-tauri && cargo test`（契约 runner 自起临时 origin 服务器；`scripts/mock-agh.mjs` 只在本地手工联调时用） |
| 插件 fork delta | `scripts/plugin-fork-diff.sh`（对照上游 crate 输出我方改动，基线与清单见插件内 `FORK.md`） |
| 发版计划自检 | `pnpm test:release`（渠道/版本/tag 映射的断言） |
| npm 包内容 | `pnpm check:pack`（先 `pnpm build`；打 tgz 并断言只含 `dist/`、`server/` 与包元数据） |
| 提案校验 | `node scripts/verify-proposals.mjs`（加 `--links` 核对路径） |
| iOS 工程与构建 | `./scripts/ios-signing.sh generate tauri`、`pnpm ios:build`（生成后校验工程，缺工程时构建前自动重建） |

## 发布产物

`.github/workflows/release.yml` 是唯一的发版入口，`prepare → build → {release, npm, docker}` 四段，三个消费者共用一次构建：

- **prepare**：`scripts/release-plan.mjs` 按 ref 算出渠道、版本与各处 tag（`pnpm test:release` 钉住这张映射表）。
- **build**：`pnpm install --frozen-lockfile` → 把版本写回 `package.json` → `pnpm build` → `scripts/check-npm-pack.mjs` 打包并校验 npm 产物 → 打包 `agh-console.tar.gz`（含 `dist/`、`server/`、`package.json`）→ 两个产物一起上传。
- **release / npm / docker**：只消费上面这两个产物，不再各自安装依赖或重新构建。

| 渠道 | 触发 | 版本 | Release | npm dist-tag | 镜像 tag |
| --- | --- | --- | --- | --- | --- |
| nightly | 定时任务（每天 UTC 19:17）从 `dev` 构建，也可 `workflow_dispatch` | `<package.json version>-nightly.<UTC YYYYMMDD>.<短 sha>` | **滚动**：tag 固定 `nightly`，强移到本次 commit 后原地更新，列表恒为一条 | `nightly` | `<版本>`、`nightly`、`sha-<短 sha>` |
| stable | 推送 tag `vX.Y.Z` | `X.Y.Z`（取自 tag） | 同名 tag，upsert | `latest` | `X.Y.Z`、`X.Y`、`latest`、`sha-<短 sha>` |
| dry-run | `workflow_dispatch`（`publish=false`，默认） | 同 ref | 不创建 | 不发布 | 只构建、不推送 |

- nightly 是 prerelease，所以 `releases/latest`、npm `latest` 与镜像 `:latest` 都留在 stable；`dev` 与滚动 tag 指向的提交相同时整条跳过。
- nightly 的 tag 是**唯一会被移动的 tag**：release job 先 `PATCH /git/refs/tags/nightly`（force）再让 action upsert 同一条 Release，同名资产被覆盖而不是堆积；stable 的 tag 一个版本一个，永不移动。
- 定时任务的定义文件必须在默认分支（`main`）上才会触发，且 `schedule` 报的 ref 是默认分支——workflow 里因此显式把构建 ref 解析成 `dev`，并把 Release tag 的 `target_commitish` 指到那个 commit。
- 发版动作是 `dev` → `main` 合并后打 `vX.Y.Z` 并推送；推送 `main` 本身不发布任何东西。手推非 `vX.Y.Z` 的 tag 会被 `prepare` 直接拒绝，避免 nightly tag 被当成稳定版顶掉 `:latest`。
- nightly 走测试门（`pnpm check` / `pnpm test` / `test:server` / `test:release`）之后才打包；手动 `workflow_dispatch` 另有 `force`，勾上时忽略「`dev` 未移动」的空转判定以重跑同一提交。
- 镜像 tag 是**全限定引用**（`ghcr.io/cowjiang/agh-console:<tag>`）：buildx 把裸 tag 读成 Docker Hub 名字，首次真实 nightly 因此在 `library/0.1.0-nightly…` 上 401。
- npm 渠道发布的就是 build 校验过的那个 tgz（`agh-console`，`files` 只含 `dist`、`server`），`NPM_TOKEN` 未配置时告警跳过。私有仓库不生成 provenance，故不加 `--provenance`；npm 的 `latest` 要等第一个 stable 才存在。
- 镜像由 `Dockerfile` 自行构建，保证 `docker build .` 可独立复现；构建阶段跑在 builder 平台上，arm64 不再走 QEMU 编译前端。GHCR 包继承仓库可见性，设为 public 才能匿名拉取。
- `concurrency` 按 ref 串行，不取消进行中的运行；Release 与 tag 都不删除，既是回滚点，也是「相对上一版」变更列表的基线。

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

因为 nightly 是 prerelease，`releases/latest` 只指向 stable，所以这条线按设计只跟正式版。要让它跟 nightly，把脚本从「读 `releases/latest`」改成「在 `releases` 列表里按 tag 形状（`v*-nightly.*`）挑最新一条」。

## 回滚

- 代码层面回滚到任一历史 tag；Release 与 tag 长期保留，不会被清理（例外是 nightly 的滚动 tag，它一直在动，本就不作回滚点——夜间的回滚锚点是镜像的 `sha-<短 sha>` tag）。
- 服务器层面用 `/opt/agh-console.bak`、`.bak.prev` 覆盖回退，或手动下载目标 tag 的产物解包。
