#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$ROOT/.env.signing"
APPLE_DIR="$ROOT/src-tauri/gen/apple"
PBXPROJ="$APPLE_DIR/adguard-home-console.xcodeproj/project.pbxproj"

usage() {
	cat <<'EOF'
用法: scripts/ios-signing.sh <命令> [参数...]

  generate tauri    用本地签名重新生成 Tauri iOS 工程（xcodegen，src-tauri/gen/apple）
  tauri <参数...>   以本地签名执行 npx tauri ios <参数...>
                    （例: scripts/ios-signing.sh tauri build --target aarch64）

签名从 .env.signing 读取（已在 .gitignore 中），必需变量:
  AGH_APPLE_TEAM   Apple 开发者团队 ID，对应 Xcode 的 DEVELOPMENT_TEAM
  AGH_BUNDLE_ID    应用 Bundle ID，反查域名式且不能包含下划线

不走 `tauri ios init`:它用 CLI 模板重写 project.yml,会把 `{{apple.development-team}}`
渲染成明文 team id 写进被跟踪文件。全新克隆缺的只是生成出来的 *.xcodeproj,本命令足够;
真要重铺整个 gen/apple 时,先备份 project.yml 并在其后再补 ${AGH_*} 占位符。
EOF
}

if [ ! -f "$ENV_FILE" ]; then
	echo "找不到 $ENV_FILE" >&2
	usage >&2
	exit 1
fi

set -a
. "$ENV_FILE"
set +a

missing=""
[ -n "${AGH_APPLE_TEAM:-}" ] || missing="$missing AGH_APPLE_TEAM"
[ -n "${AGH_BUNDLE_ID:-}" ] || missing="$missing AGH_BUNDLE_ID"
if [ -n "$missing" ]; then
	echo "签名变量为空或缺失:$missing" >&2
	echo "请在 $ENV_FILE 中补全后再执行；XcodeGen 对未解析的 \${...} 不报错，会静默生成坏工程。" >&2
	exit 1
fi

# Keep in sync with bundle.iOS.minimumSystemVersion in tauri.conf.json
DEPLOYMENT_TARGET=15.0

# Hard validation of the generated project. XcodeGen's default settings live in
# <prefix>/share/xcodegen/SettingPresets, not in the binary. Without them (e.g. only the
# binary copied into PATH), xcodegen silently emits a project missing platform defaults —
# the classic symptom is an ipa with no icon (missing ASSETCATALOG_COMPILER_APPICON_NAME).
# Assert what the output must look like: fail on the spot instead of leaving a
# harmless-looking broken project.
verify_project() {
	if [ ! -f "$PBXPROJ" ]; then
		echo "[ios-signing] 找不到生成工程:$PBXPROJ" >&2
		exit 1
	fi
	local fail=0
	require() {
		if grep -q "$1" "$PBXPROJ"; then
			return 0
		fi
		echo "[ios-signing] 生成物缺少:$2" >&2
		fail=1
	}
	require "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;" "应用图标设置(装出来的 ipa 会没有图标)"
	require "DEVELOPMENT_TEAM = $AGH_APPLE_TEAM;" "DEVELOPMENT_TEAM = $AGH_APPLE_TEAM"
	require "PRODUCT_BUNDLE_IDENTIFIER = $AGH_BUNDLE_ID;" "PRODUCT_BUNDLE_IDENTIFIER = $AGH_BUNDLE_ID"
	require "IPHONEOS_DEPLOYMENT_TARGET = $DEPLOYMENT_TARGET;" "IPHONEOS_DEPLOYMENT_TARGET = $DEPLOYMENT_TARGET"
	# This value only comes from XcodeGen's SettingPresets/base.yml; use it to check
	# that the presets were actually loaded
	require "CLANG_ENABLE_OBJC_ARC = YES;" "XcodeGen 预设设置(CLANG_ENABLE_OBJC_ARC)"
	if [ "$fail" -ne 0 ]; then
		cat >&2 <<'EOF'

[ios-signing] 生成的工程不完整，已中止（不落坏工程）。
  最常见原因：xcodegen 只装了二进制，缺 <prefix>/share/xcodegen/SettingPresets。
  正确装法（用 release 包自带的 install.sh；本机 brew 在 macOS 27 上不可用）：
    PREFIX=/opt/homebrew /path/to/xcodegen/install.sh
  细节与恢复步骤见 .agents/logs/tauri-ios.md §4。
EOF
		exit 1
	fi
	echo "[ios-signing] 工程校验通过:$PBXPROJ"
}

# Regenerate the project from gen/apple/project.yml and verify it
generate_project() {
	cd "$APPLE_DIR"
	echo "[ios-signing] xcodegen generate(team=$AGH_APPLE_TEAM bundle=$AGH_BUNDLE_ID)"
	local out
	out=$(xcodegen generate 2>&1)
	printf '%s\n' "$out"
	if printf '%s' "$out" | grep -q 'settings found'; then
		echo "[ios-signing] xcodegen 报出缺失的默认设置组（上面几行 No \"…\" settings found）:SettingPresets 没装全。" >&2
		exit 1
	fi
	verify_project
}

TAURI_CONFIG="{\"identifier\":\"$AGH_BUNDLE_ID\"}"

cmd=${1:-}
[ $# -gt 0 ] && shift

case "$cmd" in
	generate)
		which=${1:-}
		case "$which" in
			tauri)
				echo "[ios-signing] team=$AGH_APPLE_TEAM bundle=$AGH_BUNDLE_ID"
				generate_project
				;;
			*)
				usage >&2
				exit 1
				;;
		esac
		;;
	tauri)
		cd "$ROOT"
		if [ ! -f "$APPLE_DIR/project.yml" ]; then
			echo "[ios-signing] 缺少 $APPLE_DIR/project.yml:这是入库文件,先 git checkout 恢复;" >&2
			echo "若整个 gen/apple 都没了,按 .agents/logs/tauri-ios.md §19 用 tauri ios init 重铺并补回占位符。" >&2
			exit 1
		fi
		# tauri ios build does not rerun xcodegen: once the pbxproj is missing, the build only
		# ends with "failed to read pbxproj file … No such file or directory". Self-heal here.
		rebuilt=0
		if [ ! -f "$PBXPROJ" ]; then
			echo "[ios-signing] 生成工程缺失,先按 project.yml 重建（不改任何源码）。"
			generate_project
			cd "$ROOT"
			rebuilt=1
		fi
		[ "$rebuilt" -eq 1 ] || verify_project
		exec npx tauri ios "$@" --config "$TAURI_CONFIG"
		;;
	*)
		usage >&2
		exit 1
		;;
esac
