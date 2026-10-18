## 服务器部署

`scripts/server-pull.sh` 在服务器上由 systemd timer（`agh-console-pull.timer`）定时调用，也可由 Web 控制台（在环境变量 `AGH_ENABLE_SELF_UPGRADE=1` 开启下）一键安全触发，只读 GitHub Release，不在服务器上构建：

- 仓库现已公开，默认支持匿名直接拉取 `version.json` 清单与 Release 归档；若存在 `/etc/agh-console-github-token`，则自动带上 Bearer Token 以规避 GitHub 速率限制。
- 支持命令行参数：`--check`（仅比对版本）、`--dry-run`（模拟全流程不落盘不重启）、`--force`（跳过版本比对强制部署覆盖）。
- 读取 `version.json` 或 `releases/latest`，与 `/var/lib/agh-console/deployed-tag` 比对；版本未变化就结束，不重启服务。
- 下载 `agh-console.tar.gz` 解包到 `/opt/agh-console`，随后 `systemctl restart agh-console` 并校验服务处于 active。
- 覆盖前把 `dist`、`server`、`package.json` 复制到 `/opt/agh-console.bak`，上一份备份轮转为 `.bak.prev`。

因为 nightly 是 prerelease，`releases/latest` 只指向 stable，所以这条线按设计只跟正式版。要让它跟 nightly，把脚本从「读 `releases/latest`」改成「在 `releases` 列表里按 tag 形状（`v*-nightly.*`）挑最新一条」。
