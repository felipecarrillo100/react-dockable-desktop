#!/usr/bin/env bash
# One-off (2026-10): GitHub releases for the versions published before release.yml existed.
# Only v4.0.0 had a tag. Each version below is tagged on the commit that shipped it (the commit
# whose subject names it); its notes are its CHANGELOG section. Versions with no such commit
# (2.0.0–3.2.0, 4.2.x, 5.0.0, 5.1.1–5.1.4, 5.2.x) stay CHANGELOG-only. GitHub marks "Latest" by
# version and date, so running this before or after 7.4.1's release leaves 7.4.1 as Latest.
#   bash scripts/backfill-releases.sh           dry run: what would be created
#   bash scripts/backfill-releases.sh --apply   create the tags and releases
set -euo pipefail
cd "$(dirname "$0")/.."
apply=false; [ "${1:-}" = "--apply" ] && apply=true

while read -r version sha; do
  tag="v$version"
  if gh release view "$tag" >/dev/null 2>&1; then echo "skip   $tag (has a release)"; continue; fi
  notes=$(bash scripts/release-notes.sh "$version")
  [ -n "$notes" ] || notes="No CHANGELOG entry for this version. Commit: $(git show -s --format=%s "$sha")"
  echo "create $tag at $(git show -s --format='%h %ad' --date=short "$sha")  ($(printf '%s\n' "$notes" | wc -l | tr -d ' ') lines of notes)"
  if $apply; then
    printf '%s\n' "$notes" | gh release create "$tag" --target "$(git rev-parse "$sha")" --title "$tag" --notes-file -
  fi
done <<'EOF'
4.3.0 44d1b51c
5.1.0 eba66b38
5.3.0 5142e4a4
5.3.1 f4aeffa9
5.3.2 b35a6c2c
5.3.3 d33ef717
5.3.4 3a7cf451
5.3.5 02a8432a
5.4.0 32151ae1
6.0.0 d553c603
6.0.1 83719584
6.1.0 746c11e5
6.2.0 fb16b7d5
6.3.0 c98bebe5
6.3.1 038d8e44
6.3.2 921b4759
6.4.0 4b35a6ce
7.0.0 3a771d1
7.0.1 d31e6ce0
7.1.0 fdac8683
7.1.1 fe64e921
7.1.2 41959dbd
7.1.3 6c6ad956
7.2.0 61811be9
7.3.0 f05e0626
7.4.0 fa6d7cbf
EOF
$apply || echo "Dry run. Re-run with --apply to create them."
