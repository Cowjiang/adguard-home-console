#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ENV_FILE="$ROOT/.env.signing"

usage() {
	cat <<'EOF'
用法: scripts/ios-signing.sh <命令> [参数...]

  generate tauri    用本地签名重新生成 Tauri iOS 工程（src-tauri/gen/apple）
  generate ios      用本地签名重新生成原生 SwiftUI 工程（ios）
  tauri <参数...>   以本地签名执行 npx tauri ios <参数...>
                    （例: scripts/ios-signing.sh tauri build --target aarch64）

签名从 .env.signing 读取（已在 .gitignore 中），必需变量:
  AGH_APPLE_TEAM   Apple 开发者团队 ID，对应 Xcode 的 DEVELOPMENT_TEAM
  AGH_BUNDLE_ID    应用 Bundle ID，反查域名式且不能包含下划线
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

TAURI_CONFIG="{\"identifier\":\"$AGH_BUNDLE_ID\"}"

cmd=${1:-}
[ $# -gt 0 ] && shift

case "$cmd" in
	generate)
		which=${1:-}
		case "$which" in
			tauri)
				cd "$ROOT"
				echo "[ios-signing] team=$AGH_APPLE_TEAM bundle=$AGH_BUNDLE_ID"
				exec npx tauri ios init --ci --skip-targets-install --config "$TAURI_CONFIG"
				;;
			ios)
				cd "$ROOT/ios"
				echo "[ios-signing] team=$AGH_APPLE_TEAM bundle=$AGH_BUNDLE_ID"
				exec xcodegen generate
				;;
			*)
				usage >&2
				exit 1
				;;
		esac
		;;
	tauri)
		cd "$ROOT"
		exec npx tauri ios "$@" --config "$TAURI_CONFIG"
		;;
	*)
		usage >&2
		exit 1
		;;
esac
