#!/usr/bin/env bash
set -euo pipefail

after="${AFTER:-$(git rev-parse HEAD)}"
before="${BEFORE:-}"
tag="${TAG:-}"
branch="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
out="${OUT:-release-notes.md}"
fallback_count="${FALLBACK_COUNT:-20}"
zero=0000000000000000000000000000000000000000

is_ancestor() {
  git merge-base --is-ancestor "$1" "$2" 2>/dev/null
}

previous_tag() {
  local candidate
  for candidate in $(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname); do
    if [ -n "$tag" ] && [ "$candidate" = "$tag" ]; then
      continue
    fi
    if is_ancestor "$candidate" "$after"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 0
}

range=""
heading=""

if [ -n "$before" ] && [ "$before" != "$zero" ] \
   && git cat-file -e "${before}^{commit}" 2>/dev/null \
   && is_ancestor "$before" "$after"; then
  heading="### Commits in this push"
  range="$before..$after"
else
  prev="$(previous_tag)"
  if [ -n "$prev" ]; then
    heading="### Commits since $prev"
    range="$prev..$after"
  else
    heading="### Recent commits"
  fi
fi

{
  echo "Build of \`${after:0:7}\` on \`${branch}\`"
  echo
  echo "$heading"
  echo
  echo '```'
  if [ -n "$range" ]; then
    git log --no-merges --pretty='%h %s' "$range"
  else
    git log --no-merges --pretty='%h %s' -n "$fallback_count"
  fi
  echo '```'
} > "$out"

cat "$out"
