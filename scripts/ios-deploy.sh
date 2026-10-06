#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IPA="$ROOT/src-tauri/gen/apple/build/arm64/AGH Console.ipa"
BUNDLE_ID="com.adguardhome.console"

UDID=$(xcrun devicectl list devices | awk '$4 == "connected" && $NF == "physical" {print $2; exit}')
if [ -z "$UDID" ]; then
	echo "未检测到已连接的物理 iOS 设备(xcrun devicectl list devices 确认连接与信任)" >&2
	exit 1
fi

if [ ! -f "$IPA" ]; then
	echo "找不到 $IPA,先跑 pnpm ios:build" >&2
	exit 1
fi

echo "[ios-deploy] device=$UDID"
xcrun devicectl device install app --device "$UDID" "$IPA"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID"
