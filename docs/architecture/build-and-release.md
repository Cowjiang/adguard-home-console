# 构建与发布

**Status:** current
**Updated:** 2026-10-21

发布流水线由 `.github/workflows/release.yml` 一次构建产出 Release 归档、npm 包与 GHCR 镜像；nightly 从 `dev` 定时构建并发布到固定标签 `nightly`，stable 由 `vX.Y.Z` 标签发布。运行时更新检查与自升级读取同一份 `version.json` 清单。

## 更新检查

- `GET /api/system/version` 返回 `currentVersion`、`channel`、`channelSource`、`targetChannel`、`runtime`、`canSelfUpgrade`、`hasUpdate` 与 `latest`。
- 渠道解析顺序：合法 `?channel=` 查询参数 → 服务端持久化渠道 → `AGH_UPDATE_CHANNEL` → 安装版本自身后缀。
- 清单地址按渠道选择：stable 读 `releases/latest/download/version.json`，nightly 读 `releases/download/nightly/version.json`；`AGH_UPDATE_URL` 的 `{channel}` 占位符可覆盖上游地址。
- 服务端按渠道维护 12 小时内存缓存，`?force=1` 绕过缓存；网络失败返回 `checkFailed` 而不阻塞页面。

## 渠道状态

- 目标渠道保存在状态目录的 `update-channel`（单行 `stable`/`nightly`），写入使用临时文件 + rename。
- 状态目录解析顺序：`AGH_STATE_DIR` → `AGH_DATA_DIR` → 可写的 `/var/lib/agh-console` → `$XDG_STATE_HOME/agh-console` 或 `~/.local/state/agh-console`。
- `POST /api/system/channel` 持久化渠道，与自升级接口共用 `AGH_ENABLE_SELF_UPGRADE` 安全开关；关闭时返回 403。
- 渠道是服务器级设置：Web 端多浏览器、多设备（含托管模式）共享 `targetChannel`；Tauri/iOS 壳不经过服务端，继续使用本地 `localStorage`。
- `?channel=` 仍可用于单次检查另一渠道，不改变持久化值。

## 自升级

`POST /api/system/upgrade` 接受可选请求体 `{ "channel": "stable" | "nightly" }`，非法渠道返回 400，未提供时使用持久化渠道或安装版本推断。选中的渠道会持久化，并以 `AGH_UPGRADE_CHANNEL` 注入升级子进程；`GET /api/system/upgrade/status` 返回状态、渠道、日志与是否分离执行。

部署形态由 `AGH_DEPLOYMENT=auto|tarball|npm|docker` 选择（默认 `auto`）；`AGH_UPGRADE_SCRIPT` 仍拥有最高优先级，供运维接入自定义脚本。

### tarball（systemd）

`scripts/server-pull.sh` 支持 `--channel stable|nightly`；缺省时依次读取 `AGH_UPGRADE_CHANNEL`、`<state>/update-channel`、`stable`。脚本按渠道下载 `agh-console.tar.gz`、备份 `/opt/agh-console`、解包并重启 `agh-console` 单元，支持 `--check`、`--dry-run`、`--force`。定时器不需要额外参数即可跟随持久化渠道：

```ini
[Service]
Type=oneshot
ExecStart=/opt/agh-console/scripts/server-pull.sh

[Timer]
OnCalendar=*-*-* 00/6:00:00
Persistent=true
```

### npm / pnpm

`server/npm-upgrade.mjs` 随 npm 包发布，由 `server/upgrade.mjs` 调起：stable 映射 npm dist-tag `latest`，nightly 映射 `nightly`；默认执行 `npm install -g agh-console@<tag>`，`AGH_PACKAGE_MANAGER=pnpm` 时改用 `pnpm add -g`。安装后重启 `AGH_SERVICE_NAME`（默认 `agh-console`）并轮询 `AGH_HEALTH_URL`（默认 `http://127.0.0.1:$PORT/api/health`）；重启或健康检查失败会回装旧版本。

### 分离执行与状态文件

在 systemd 下（检测到 `INVOCATION_ID` 与 `systemd-run`）升级通过 `systemd-run --collect --no-block` 启动，避免重启自身单元时杀掉升级进程；否则直接 spawn。`AGH_UPGRADE_DETACH=1` / `0` 可强制或关闭分离执行。升级执行器把最终状态写入 `<state>/upgrade-status.json`、日志写入 `<state>/upgrade.log`，服务重启后状态接口仍能读到最后一次结果。

### 边界

- Docker 部署不支持原地自升级，`canSelfUpgrade` 为 `false`，只能替换镜像；渠道状态可落在 `AGH_DATA_DIR`（镜像默认 `/app/data`）。
- 自升级接口没有账号鉴权，必须限制监听地址（如 `HOSTS=127.0.0.1,tailscale0`），不要把 8787 暴露到不可信网络。
