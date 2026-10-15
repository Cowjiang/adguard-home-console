# 构建与发布

**Status:** current
**Updated:** 2026-10-15

两条交付线共用一份 Web 构建产物；发版是一条工作流、一次构建、三个消费者（GitHub Release 产物、npm 包、GHCR 镜像），服务器只拉取产物，不在服务器上构建。iOS 的 ipa 由同一条工作流的 `ios` job 构建并挂进 Release。

代码入口：`.github/workflows/release.yml`、`.github/workflows/cut-release.yml`、`.github/scripts/release-plan.mjs`、`.github/scripts/bump-version.mjs`、`scripts/check-npm-pack.mjs`、`.github/scripts/release-notes.sh`、`scripts/server-pull.sh`、`scripts/ios-signing.sh`、`Dockerfile`、`package.json`。

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

`.github/workflows/release.yml` 是唯一的发版入口，`prepare → {build, ios} → {release, npm, docker}` 五段，四个产物共用同一个 ref 与版本：

- **prepare**：`.github/scripts/release-plan.mjs` 按 ref 算出渠道、版本与各处 tag（`pnpm test:release` 钉住这张映射表）。
- **build**（ubuntu）：`pnpm install --frozen-lockfile` → 把版本写回 `package.json` → `pnpm build` → `scripts/check-npm-pack.mjs` 打包并校验 npm 产物 → 打包 `agh-console.tar.gz`（含 `dist/`、`server/`、`package.json`）→ 两个产物一起上传。
- **ios**（macos）：`brew install xcodegen` 与 `rustup target add aarch64-apple-ios` → 由仓库变量落盘 `.env.signing` → `--set-version` 写发版版本（前端与 iOS 工程）→ `./scripts/ios-signing.sh tauri build --target aarch64 --no-sign` → ipa 改名为 `agh-console.ipa` 上传。它不消费 `build` 的产物：前端由 tauri-cli 的 `beforeBuildCommand`（`pnpm build`）自己构建并编进 Rust 二进制。
- **release / npm / docker**：只消费上述产物，不再各自安装依赖或重新构建；`release` 额外把 ipa 挂到同一条 Release 上。

stable 的 tag 不由手推产生：`.github/workflows/cut-release.yml`（仅 `workflow_dispatch`）在你选定的分支上跑提案校验与 `pnpm check`/`pnpm test`，再用 `.github/scripts/bump-version.mjs` 补版本（按 conventional commits 推断 patch/minor，major 需显式选；`custom` 可指定任意版本），同时写 `package.json`、`src-tauri/tauri.conf.json`、iOS 工程与 `CHANGELOG.md`，然后提交 `chore(release): vX.Y.Z`、打 annotated tag、推分支与 tag。tag 由 `GITHUB_TOKEN` 推送时不会触发其他工作流，因此 workflow 在未配置 `RELEASE_PAT` 时会显式 `gh workflow run release.yml --ref <tag> -f publish=true` 兜底（该兜底带 `|| true`，失败不会让 `cut-release` 变红）。

| 渠道 | 触发 | 版本 | Release | npm dist-tag | 镜像 tag |
| --- | --- | --- | --- | --- | --- |
| nightly | 定时任务（每天 UTC 19:17）从 `dev` 构建，也可 `workflow_dispatch` | `<package.json version>-nightly.<UTC YYYYMMDD>.<短 sha>` | **滚动**：tag 固定 `nightly`，强移到本次 commit 后原地更新，列表恒为一条 | `nightly` | `<版本>`、`nightly`、`sha-<短 sha>` |
| stable | 推送 tag `vX.Y.Z` | `X.Y.Z`（取自 tag） | 同名 tag，upsert | `latest` | `X.Y.Z`、`X.Y`、`latest`、`sha-<短 sha>` |
| dry-run | `workflow_dispatch`（`publish=false`，默认） | 同 ref | 不创建 | 不发布 | 只构建、不推送 |

- nightly 是 prerelease，所以 `releases/latest`、npm `latest` 与镜像 `:latest` 都留在 stable；`dev` 与滚动 tag 指向的提交相同时整条跳过。
- nightly 的 tag 是**唯一会被移动的 tag**：release job 先 `PATCH /git/refs/tags/nightly`（force）再让 action upsert 同一条 Release，同名资产被覆盖而不是堆积；stable 的 tag 一个版本一个，永不移动。
- 定时任务的定义文件必须在默认分支（`main`）上才会触发，且 `schedule` 报的 ref 是默认分支——workflow 里因此显式把构建 ref 解析成 `dev`，并把 Release tag 的 `target_commitish` 指到那个 commit。
- 发版动作是 `dev` → `main` 合并后，在 Actions 里对 `main` 派发 **Cut Release**（见上）；推送 `main` 本身不发布任何东西。手推非 `vX.Y.Z` 的 tag 会被 `prepare` 直接拒绝，避免 nightly tag 被当成稳定版顶掉 `:latest`。
- nightly 走测试门（`pnpm check` / `pnpm test` / `test:server` / `test:release`）之后才打包；手动 `workflow_dispatch` 另有 `force`，勾上时忽略「`dev` 未移动」的空转判定以重跑同一提交。
- 镜像 tag 是**全限定引用**（`ghcr.io/cowjiang/agh-console:<tag>`）：buildx 把裸 tag 读成 Docker Hub 名字，首次真实 nightly 因此在 `library/0.1.0-nightly…` 上 401。
- npm 渠道发布的就是 build 校验过的那个 tgz（`agh-console`，`files` 只含 `dist`、`server`），`NPM_TOKEN` 未配置时告警跳过。仓库已转为 public（2026-10-15），provenance 因此可用（需 `id-token: write` + `--provenance`，尚未开启）；npm 的 `latest` 要等第一个 stable 才存在。
- 镜像由 `Dockerfile` 自行构建，保证 `docker build .` 可独立复现；构建阶段跑在 builder 平台上，arm64 不再走 QEMU 编译前端。GHCR 包的可见性是包设置里的独立开关（不随仓库继承，现已设为 public）。
- iOS 产物是**未签名**的 ipa：`--no-sign` 让 xcodebuild 带上 `CODE_SIGNING_ALLOWED=NO` 等参数归档，tauri-cli 再把 `.app` 打成 `Payload/` 结构——CI 上不需要证书、账号或描述文件，安装者用 Sideloadly / AltStore / Xcode 以自己的 Apple ID 重签。工程里的系统版本由 `--set-version` 写成**核心版本 + 数字 build**（plist 只收 1–3 段纯数字），完整发版串显示在应用内「关于」页（见「版本只有一个来源」）。
- iOS 的成本门与容错：macOS runner 在私有仓库按 10× 计费，所以 **stable 恒构建，nightly 只在仓库公开（`github.event.repository.private == false`）或手动 `workflow_dispatch` 时构建**（仓库已于 2026-10-15 转为 public，nightly 因此自动构建）；`release` 的 `needs` 含 `ios`（不加会与 iOS 构建抢跑、ipa 时有时无），但容错只对 iOS 开口：`!cancelled()` 让 iOS 失败时照常发 tarball / npm / 镜像，而 `needs.build.result == 'success'` 保持既有语义——`build` 失败依旧不发布。ipa 缺失时运行页是红的，Release 不会被静默降级。
- 签名值不进 CI 配置也不用 secrets：`AGH_APPLE_TEAM` / `AGH_BUNDLE_ID` 从仓库变量读，未设置时分别兜底为 `unsigned` 与 `tauri.conf.json#identifier`（不签名的构建里 team 只是 XcodeGen 的占位符）。
- 资产名固定为 `agh-console.ipa`（与 `agh-console.tar.gz` 同风格）：nightly 的原地 upsert 因此是**替换**而不是逐日堆积一个 ipa。
- 版本只有一个来源：`.github/scripts/release-plan.mjs` 算出的发版版本（stable 的版本号由 `cut-release.yml` 经 `bump-version.mjs` 写进仓库，nightly 由 `prepare` 算出）。`--set-version <版本> <build>` 一次写完 `package.json`、`src-tauri/tauri.conf.json` 与 iOS 工程的 `CFBundleShortVersionString`/`CFBundleVersion`；前端经 `vite.config.ts` 的 `define` 把 `package.json` 的版本编进 `dist`（应用内「关于」页显示的就是它），镜像走 `build-args: APP_VERSION` 而不改上下文里的 `package.json`。iOS 的 plist 只收 1–3 段纯数字，所以记的是**核心版本 + 数字 build**（CI 传 `github.run_number`），nightly 的 prerelease 后缀只出现在应用界面里。
- `concurrency` 按 ref 串行，不取消进行中的运行；Release 与 tag 都不删除，既是回滚点，也是「相对上一版」变更列表的基线。

## Release 说明

`.github/scripts/release-notes.sh` 由 workflow 以 `bash` 显式调用，按顺序选提交区间：

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
