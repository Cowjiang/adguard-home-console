# 让更新渠道贯通服务端与按渠道执行升级

**Class:** feature
**Status:** implemented
**Date:** 2026-10-21
**Updated:** 2026-10-21（并入 Docker `AGH_DATA_DIR` 对齐与服务器级渠道的多设备语义；实现与部署验证完成）
**Source:** 用户要求进入方案 B：把「关于」页的渠道选择与一键升级真正落到服务端和升级脚本。2026-10-21 的部署验证确认了两个断点：渠道只写浏览器 localStorage，升级请求不携带渠道。

## Goal

统一版本清单、应用内检查更新与服务端自升级已经交付，但「渠道」仍只存在于前端展示层，更新链路并没有真正跟随它：

1. **渠道是浏览器私有的**：`AboutSettings` 把选择写入 `localStorage`，`GET /api/system/version?channel=` 仅把渠道当作单次查询参数。换浏览器、换设备或清理站点数据后，服务端仍按安装版本猜渠道。
2. **一键升级不带渠道**：`POST /api/system/upgrade` 没有请求体，`server/upgrade.mjs` 只按环境变量找脚本；脚本不知道目标渠道。结果是：stable 用户升级到 stable，nightly 用户点「一键升级」也仍然去装 stable（或直接 no-op）。
3. **升级脚本只认 stable**：`scripts/server-pull.sh` 固定读取 `releases/latest` 与主分支 `version.json`，没有 `--channel`，不知道 nightly Release 使用固定标签 `nightly` 和同名资产。
4. **npm/pnpm 部署没有升级执行器**：npm 包只发布 `dist`、`server`；`server/upgrade.mjs` 的兜底路径 `<pkg>/scripts/server-pull.sh` 在 npm 安装里不存在。被 systemd 托管的 npm 全局安装还会先命中 `INVOCATION_ID`，runtime 显示为 `systemd`，默认再去 `/opt/agh-console` 找脚本，一键升级必然失败。
5. **定时器无法跟随目标渠道**：`server-pull.sh` 没有渠道输入，timer 只能永远跑 stable。

**目标**：让服务端成为 Web 端更新渠道的唯一事实来源；升级请求把目标渠道传给执行器；tarball 与 npm/pnpm 两条部署路径都能按 stable/nightly 安装；timer 与 CLI 更新提示读取同一份渠道状态。Tauri/iOS 壳不经过服务端，保持现有本地渠道逻辑。

## Decision

### 1. 服务端持久化目标渠道

- 新状态文件：`<state>/update-channel`，单行 `stable` 或 `nightly`；写入采用临时文件 + rename，失败不影响服务启动。
- 状态目录解析顺序：`AGH_STATE_DIR`（保留 `server-pull.sh` 既有契约）→ `AGH_DATA_DIR`（托管模式持久数据目录，Docker 镜像默认 `/app/data`）→ 可写的 `/var/lib/agh-console`（root/systemd 部署）→ `$XDG_STATE_HOME/agh-console` / `~/.local/state/agh-console`（普通用户 npm 部署）。解析结果通过 `AGH_STATE_DIR` 传给升级子进程，保证脚本读到的文件与服务端一致。
- 渠道解析优先级：合法的 `?channel=` 参数 → 持久化渠道 → `AGH_UPDATE_CHANNEL` 环境变量（Docker/只读文件系统）→ 安装版本自身的后缀。
- `GET /api/system/version` 额外返回 `targetChannel`（服务端持久化的渠道，未设置时为空）与 `channelSource`，`channel` 仍表示本次实际使用的渠道；按渠道缓存的行为不变。
- 渠道是**服务器级设置**：托管模式下的多浏览器、多设备共享同一个 `targetChannel`。单次检查仍可用 `?channel=` 临时查看另一渠道，但不会写入持久化状态；若未来需要“每设备检查偏好”，另立提案，不在本次范围。

### 2. API

- `POST /api/system/channel`：请求体 `{ channel: 'stable' | 'nightly' }`；非法渠道返回 400；自升级未开启时返回 403（本接口只服务于升级闭环，避免在未启用升级的部署上新增无鉴权写入口）。成功返回 `{ ok: true, targetChannel }`。
- `POST /api/system/upgrade`：可选请求体 `{ channel }`；非法渠道返回 400；未带渠道时使用持久化渠道，仍缺失则回落到安装版本推断。选中的渠道会被持久化，并以 `AGH_UPGRADE_CHANNEL` 注入升级子进程；响应增加 `channel`。
- `GET /api/system/upgrade/status`：增加 `channel` 字段，便于 UI 显示本次升级的目标渠道。
- 兼容性：不带 body 的旧客户端、`?channel=` 查询参数、`AGH_UPDATE_URL` 的 `{channel}` 占位符全部保持可用。

### 3. 升级执行器按部署形态选择

- `AGH_UPGRADE_SCRIPT` 继续拥有最高优先级（运维自定义脚本的兼容契约）。
- 新增 `AGH_DEPLOYMENT=auto|tarball|npm|docker`，默认 `auto`：包路径位于 `node_modules` 或 `AGH_RUNTIME=npm` 时判为 `npm`；`/opt/agh-console` 安装或仓库检出判为 `tarball`；Docker 判为 `docker`。
- `docker` 不支持原地自升级：`canSelfUpgrade` 返回 false，UI 只展示镜像升级指引；渠道状态与托管模式数据统一落在 `AGH_DATA_DIR`（镜像默认 `/app/data`），升级本身仍走镜像替换。
- 所有执行器统一读取 `AGH_UPGRADE_CHANNEL` 与 `AGH_STATE_DIR`；未传渠道时自行从状态文件读取。
- systemd 环境下升级需要重启自身所在的 unit，执行器用 `systemd-run --collect --no-block` 启动分离进程（权限不足时回退直接 spawn，并在状态中说明重启可能中断脚本）；非 systemd 环境直接 spawn，由脚本决定是否重启服务。

### 4. tarball 执行器（scripts/server-pull.sh）

- 新增 `--channel stable|nightly`；缺省时按 `AGH_UPGRADE_CHANNEL` → `<state>/update-channel` → stable 解析。
- stable 走 `releases/latest/download/version.json`（回退主分支 `version.json`）；nightly 走 `releases/download/nightly/version.json`。
- GitHub API 兜底同样按渠道选择：stable 用 `/releases/latest`，nightly 用 `/releases/tags/nightly`。
- `--check`、`--dry-run` 输出包含目标渠道；`deployed-tag` 继续记录实际安装的标签；备份、解包、重启与失败检查保持现有行为。
- Release 归档需携带 `scripts/server-pull.sh`，保证 `/opt/agh-console` 安装内的一键升级与 timer 有执行器。
- timer/service 不带参数运行时自然跟随持久化渠道，无需额外 wrapper。

### 5. npm/pnpm 执行器（随 npm 包发布）

- 新增随包发布的 `server/npm-upgrade.mjs`，由 `server/upgrade.mjs` 以 `node <pkg>/server/npm-upgrade.mjs --channel <channel>` 调起。
- 渠道映射 dist-tag：stable → `latest`，nightly → `nightly`；默认 `npm i -g agh-console@<tag>`，`AGH_PACKAGE_MANAGER=pnpm` 时改为 `pnpm add -g`（pnpm 的 `global-bin-dir` 由部署方配置）。
- 安装前记录当前版本；安装后重启 systemd unit（`AGH_SERVICE_NAME`，默认 `agh-console`），等待 `AGH_HEALTH_URL`（默认 `http://127.0.0.1:${PORT}/api/health`）恢复；失败则回装旧版本并返回非零退出码。
- 没有可重启的 systemd unit 时只完成安装并输出手动重启提示，不把 `canSelfUpgrade` 标为可用。

### 6. 前端

- Web：渠道切换先调用 `POST /api/system/channel`，成功后把服务端 `targetChannel` 作为 UI 状态；`localStorage` 降级为离线缓存。服务端不可用时保持现有本地切换与检查行为。
- `AppUpdateContent` / 移动端更新子页接收当前渠道，`triggerSelfUpgrade({ channel })` 在请求体中携带它；更新指引里的 npm 命令按渠道给出 `@latest` 或 `@nightly`。
- Tauri/iOS：不调用服务端渠道接口，继续使用 `localStorage` 与直连清单。

### 7. Timer、CLI 与文档

- `server-pull.sh` 与 npm 执行器都以持久化渠道为缺省值；文档给出能跟随渠道的 systemd timer 示例。
- CLI 启动横幅按持久化渠道选择清单与提示命令（`@latest` / `@nightly`）。
- 更新 `docs/architecture/build-and-release.md`（或新增更新主题页），写清渠道状态、API、脚本契约、部署形态差异与安全边界。

## Accept

- [x] 在 Web 上切换渠道后，服务端写入 `update-channel`；新开浏览器/清理站点数据后仍显示同一目标渠道。
- [x] 设置 `AGH_DATA_DIR`（模拟 Docker `/app/data`）时 `update-channel` 落在该目录，未设置时回落到 `/var/lib/agh-console` 或用户状态目录。
- [x] 托管模式多浏览器/多设备看到同一 `targetChannel`；`?channel=` 单次检查另一渠道不改变持久化值。
- [x] `GET /api/system/version` 返回 `targetChannel`；查询参数、持久化渠道、`AGH_UPDATE_CHANNEL`、安装版本四种来源的优先级有单测覆盖。
- [x] `POST /api/system/channel` 校验渠道与自升级开关（400/403），写入失败返回可读错误且不破坏服务。
- [x] `POST /api/system/upgrade` 接受渠道并注入 `AGH_UPGRADE_CHANNEL`；不带 body 的旧请求仍可工作；状态接口返回本次渠道。
- [x] `scripts/server-pull.sh --channel nightly --dry-run` 指向 nightly 清单与标签，`--check` 按渠道比较 `deployed-tag`；stable 行为不回归。
- [x] npm/pnpm 执行器能把目标 dist-tag 安装到全局目录，重启 unit 并在失败时回滚；`AGH_PACKAGE_MANAGER=pnpm` 路径有验证记录。
- [x] 不带渠道参数的 timer 运行会读取持久化渠道（dry-run 或日志证据），切换渠道后下一轮跟随新渠道。
- [ ] `AGH_ENABLE_SELF_UPGRADE` 关闭时渠道写接口返回 403，前端回退本地切换，检查更新不受影响。
- [x] Docker 部署 `canSelfUpgrade=false`，UI 不显示一键升级。
- [x] `pnpm check`、`pnpm test`、`npm run test:server`、`node scripts/verify-proposals.mjs --links` 全绿。
- [x] 文档与中英词条同步；不引入新的无鉴权升级入口。

## Note

- 关联提案：[统一版本清单（Manifest）与应用内检查更新闭环](2026-10-15-update-check-manifest-and-ui.md)、[支持 CLI 启动更新提示与服务端自升级闭环](2026-10-15-cli-update-and-self-upgrade.md)、[多渠道分发的检查更新与自动更新路线图](2026-10-15-update-check-and-distribution-roadmap.md)。
- 基线已包含 2026-10-21 合入的 [Docker 托管模式数据卷提案](../process/2026-10-21-docker-managed-mode-storage.md)（`AGH_DATA_DIR`，Docker 默认 `/app/data`）；本提案的状态目录解析与 Docker 说明已按该约定对齐。
- 本提案是「方案 B」的上游原生实现；2026-10-21 的方案 A 是部署侧桥接（清单代理记录渠道、`AGH_UPGRADE_CHANNEL` 触发脚本、timer 跟随状态文件），仅用于验证链路。B 落地后 A 的代理与覆盖项可删除，保留的契约是 `AGH_UPGRADE_CHANNEL` 与持久化渠道文件。
- 既有事实：nightly Release 使用固定标签 `nightly`，资产名固定为 `agh-console.tar.gz` / `version.json`；npm 的 stable/nightly dist-tag 已存在；`AGH_UPDATE_URL` 已支持 `{channel}` 占位符。
- 实现状态（2026-10-21）：服务端渠道状态与 API、tarball/npm 执行器、systemd 分离与状态文件、前端渠道贯通、CLI 与文档均已完成；Release 归档改为携带 `scripts/server-pull.sh`。`npm run test:server`（84 项）、`vitest run`（185 项）、`tsc --noEmit`、`vite build`、`node scripts/check-npm-pack.mjs`、`node scripts/verify-proposals.mjs --links` 均通过。
- 部署验证（2026-10-21，npm 全局安装 + systemd）：从 `bffe6e6` 通过 `POST /api/system/upgrade` 升到 `1468f3a`，返回 `detached=true`、状态文件与接口均为 `completed`，服务健康；随后安装 `dd821e2` 并验证 timer 服务读取 `update-channel`、在已是最新时跳过重启；用不存在的 unit 验证了 npm 执行器失败回滚路径（退出码 1，控制台不受影响）。`server-pull.sh --check --channel nightly` 的相同/不同标签退出码也已在本地验证。
- 部署过程中发现并修复两个上游问题：pnpm 12 的 `minimumReleaseAge` 会把刚发布的 nightly 解析成旧构建（#32）；pnpm 符号链接布局下 `npm-upgrade.mjs` 的直接执行检测失效（#33）。
- 未覆盖：自升级关闭时的浏览器端回退交互（对应验收项保持未勾选）；Docker 运行时的真实升级未执行，相关逻辑由单测覆盖。
- 待确认的实现细节：npm 执行器是否需要把 pnpm 作为默认探测（当前决定为 npm 默认、pnpm 显式开启）；systemd 分离执行在非 root 运维下的降级提示措辞。
