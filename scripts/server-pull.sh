#!/usr/bin/env bash
# 服务器端拉取部署:从 GitHub Releases 下载最新产物并替换 /opt/agh-console。
# 私有仓库需要只读 token,放在 /etc/agh-console-github-token(600, root)。
# 由 agh-console-pull.timer 定时调用;版本没变化时直接退出,不会反复重启服务。
set -euo pipefail

REPO="Cowjiang/adguard-home-console"
TOKEN_FILE=/etc/agh-console-github-token
INSTALL_DIR=/opt/agh-console
STATE_DIR=/var/lib/agh-console
ASSET_NAME=agh-console.tar.gz

[ -f "$TOKEN_FILE" ] || exit 0
TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
mkdir -p "$STATE_DIR"

RELEASE_JSON=$(curl -fsSL -H "Authorization: Bearer $TOKEN" \
	"https://api.github.com/repos/$REPO/releases/latest") || exit 0

TAG=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])' <<<"$RELEASE_JSON")

if [ -f "$STATE_DIR/deployed-tag" ] && [ "$(cat "$STATE_DIR/deployed-tag")" = "$TAG" ]; then
	exit 0
fi

ASSET_ID=$(python3 -c '
import json, sys
d = json.load(sys.stdin)
print(next(a["id"] for a in d["assets"] if a["name"] == "'"$ASSET_NAME"'"))
' <<<"$RELEASE_JSON")

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" \
	-o "$TMP/$ASSET_NAME" \
	"https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID"

# 备份旧版本,失败可回滚
rm -rf "$INSTALL_DIR.bak.prev"
[ -d "$INSTALL_DIR.bak" ] && mv "$INSTALL_DIR.bak" "$INSTALL_DIR.bak.prev" || true
mkdir -p "$INSTALL_DIR.bak"
cp -a "$INSTALL_DIR/dist" "$INSTALL_DIR/server" "$INSTALL_DIR/package.json" "$INSTALL_DIR.bak"/ 2>/dev/null || true

tar xzf "$TMP/$ASSET_NAME" -C "$INSTALL_DIR"
echo "$TAG" > "$STATE_DIR/deployed-tag"
systemctl restart agh-console
systemctl is-active --quiet agh-console
echo "deployed $TAG"
