#!/usr/bin/env bash
# Shim for legacy/local references: core release notes generation has moved to
# .github/scripts/release-notes.sh.
exec "$(dirname "$0")/../.github/scripts/release-notes.sh" "$@"
