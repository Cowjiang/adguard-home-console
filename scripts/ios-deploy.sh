#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IPA="$ROOT/src-tauri/gen/apple/build/arm64/AGH Console.ipa"
APP_NAME="AGH Console"

UDID=$(xcrun devicectl list devices | awk '$4 == "connected" && $NF == "physical" {print $2; exit}')
if [ -z "$UDID" ]; then
	echo "未检测到已连接的物理 iOS 设备(xcrun devicectl list devices 确认连接与信任)" >&2
	exit 1
fi

if [ ! -f "$IPA" ]; then
	echo "找不到 $IPA,先跑 pnpm ios:build" >&2
	exit 1
fi

# The signed bundle id comes from .env.signing (the XcodeGen project renders
# PRODUCT_BUNDLE_IDENTIFIER from it), not from tauri.conf.json's identifier, so
# read it off the artifact instead of hardcoding a value that can drift.
BUNDLE_ID=$(unzip -p "$IPA" "Payload/$APP_NAME.app/Info.plist" |
	plutil -extract CFBundleIdentifier raw -o - -)

echo "[ios-deploy] device=$UDID"
xcrun devicectl device install app --device "$UDID" "$IPA"
xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID"
