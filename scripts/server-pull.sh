#!/usr/bin/env bash
# Server-side pull deployment: download the latest release asset from GitHub Releases and
# replace /opt/agh-console. Supports unauthenticated public access, or read-only token
# at /etc/agh-console-github-token if present.
set -euo pipefail

REPO="${AGH_REPO:-Cowjiang/adguard-home-console}"
TOKEN_FILE="${AGH_TOKEN_FILE:-/etc/agh-console-github-token}"
INSTALL_DIR="${AGH_INSTALL_DIR:-/opt/agh-console}"
STATE_DIR="${AGH_STATE_DIR:-/var/lib/agh-console}"
ASSET_NAME="agh-console.tar.gz"

CHECK_MODE=0
DRY_RUN=0
FORCE_MODE=0

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Server-side pull deployment and upgrade utility for AdGuard Home Console.

Options:
  --check    Check if an update is available (exit 0 if up-to-date, 1 if update available)
  --dry-run  Simulate update process without altering files or restarting service
  --force    Force download and deployment even if tag matches deployed version
  --help     Show this help message
EOF
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --check)
      CHECK_MODE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --force)
      FORCE_MODE=1
      shift
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

AUTH_HEADER=()
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
  if [ -n "$TOKEN" ]; then
    AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
  fi
fi

VERSION_JSON_URL="https://github.com/$REPO/releases/latest/download/version.json"
RAW_VERSION_JSON_URL="https://raw.githubusercontent.com/$REPO/refs/heads/main/version.json"
GITHUB_API_URL="https://api.github.com/repos/$REPO/releases/latest"

TAG=""
TARBALL_URL=""

# Prefer version.json manifest for rate-limit-free updates
MANIFEST_JSON=$(curl -fsSL ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$VERSION_JSON_URL" 2>/dev/null || curl -fsSL ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$RAW_VERSION_JSON_URL" 2>/dev/null || true)

if [ -n "$MANIFEST_JSON" ]; then
  PARSED=$(python3 -c '
import json, sys
try:
    d = json.loads(sys.argv[1])
    tag = d.get("releaseTag") or ("v" + d.get("version", "").lstrip("v"))
    tarball = d.get("downloads", {}).get("tarball", "")
    print(tag + "\t" + tarball)
except Exception:
    sys.exit(1)
' "$MANIFEST_JSON" 2>/dev/null || true)

  if [ -n "$PARSED" ]; then
    TAG=$(echo "$PARSED" | cut -f1)
    TARBALL_URL=$(echo "$PARSED" | cut -f2)
  fi
fi

# Fallback to GitHub Releases API if manifest was unavailable
if [ -z "$TAG" ]; then
  RELEASE_JSON=$(curl -fsSL ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$GITHUB_API_URL" 2>/dev/null || true)
  if [ -n "$RELEASE_JSON" ]; then
    TAG=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tag_name", ""))' <<<"$RELEASE_JSON" 2>/dev/null || true)
  fi
fi

if [ -z "$TAG" ]; then
  echo "Error: Could not retrieve release information from upstream" >&2
  exit 1
fi

DEPLOYED_TAG=""
if [ -f "$STATE_DIR/deployed-tag" ]; then
  DEPLOYED_TAG=$(tr -d '[:space:]' < "$STATE_DIR/deployed-tag")
fi

if [ "$CHECK_MODE" -eq 1 ]; then
  if [ -n "$DEPLOYED_TAG" ] && [ "$DEPLOYED_TAG" = "$TAG" ]; then
    echo "AdGuard Home Console is up to date ($TAG)"
    exit 0
  else
    echo "Update available: ${DEPLOYED_TAG:-none} -> $TAG"
    exit 1
  fi
fi

if [ "$FORCE_MODE" -eq 0 ] && [ -n "$DEPLOYED_TAG" ] && [ "$DEPLOYED_TAG" = "$TAG" ]; then
  echo "Already up to date ($TAG)"
  exit 0
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Target version: $TAG (current: ${DEPLOYED_TAG:-none})"
  echo "[dry-run] Tarball source: ${TARBALL_URL:-https://github.com/$REPO/releases/download/$TAG/$ASSET_NAME}"
  echo "[dry-run] Would backup $INSTALL_DIR to $INSTALL_DIR.bak (previous to $INSTALL_DIR.bak.prev)"
  echo "[dry-run] Would unpack tarball to $INSTALL_DIR"
  echo "[dry-run] Would record $TAG in $STATE_DIR/deployed-tag"
  echo "[dry-run] Would run: systemctl restart agh-console"
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $TAG..."
if [ -n "$TARBALL_URL" ]; then
  curl -fsSL -o "$TMP/$ASSET_NAME" "$TARBALL_URL"
else
  curl -fsSL -o "$TMP/$ASSET_NAME" "https://github.com/$REPO/releases/download/$TAG/$ASSET_NAME"
fi

if [ ! -s "$TMP/$ASSET_NAME" ]; then
  echo "Error: Downloaded tarball is empty or missing" >&2
  exit 1
fi

# Back up the previous version for rollback on failure
rm -rf "$INSTALL_DIR.bak.prev"
[ -d "$INSTALL_DIR.bak" ] && mv "$INSTALL_DIR.bak" "$INSTALL_DIR.bak.prev" || true
mkdir -p "$INSTALL_DIR.bak"
cp -a "$INSTALL_DIR/dist" "$INSTALL_DIR/server" "$INSTALL_DIR/package.json" "$INSTALL_DIR.bak"/ 2>/dev/null || true

mkdir -p "$INSTALL_DIR"
tar xzf "$TMP/$ASSET_NAME" -C "$INSTALL_DIR"
mkdir -p "$STATE_DIR"
echo "$TAG" > "$STATE_DIR/deployed-tag"

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart agh-console
  systemctl is-active --quiet agh-console || {
    echo "Warning: Service is not active after restart" >&2
    exit 1
  }
else
  echo "Notice: systemctl not available, skipped service restart"
fi

echo "deployed $TAG"
