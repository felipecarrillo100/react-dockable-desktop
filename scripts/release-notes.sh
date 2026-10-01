#!/usr/bin/env bash
# Prints one version's section of CHANGELOG.md — the lines after "## [X.Y.Z]" up to the next
# "## [" heading — for the GitHub release notes (.github/workflows/release.yml).
#   bash scripts/release-notes.sh 7.4.1
set -euo pipefail
version="$1"
awk -v head="## [$version]" '
  index($0, head) == 1 { found = 1; next }
  found && /^## \[/ { exit }
  found { print }
' "$(dirname "$0")/../CHANGELOG.md" | sed -e '/./,$!d'
