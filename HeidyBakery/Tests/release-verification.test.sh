#!/bin/bash
# Negative tests use temporary copies, never alter the distribution app or ZIP.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/heidy-release-negative.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
export HEIDY_SIGN_IDENTITY='Developer ID Application: Arvind Kandula (7LBQ52WL9X)'
reject() {
  if "$ROOT/verify-release.sh" "$1" "$WORK/evidence.txt" >"$WORK/check.log" 2>&1; then
    echo "FAIL: verifier accepted $2" >&2; exit 1
  fi
  printf 'PASS: rejects %s\n' "$2"
}
reject "$ROOT/../Heidy Bakery LOCAL TEST.zip" 'ad-hoc local build'
HEIDY_SIGN_IDENTITY='Developer ID Application: Wrong Identity (0000000000)' reject "$ROOT/../Heidy Bakery Mac.zip" 'wrong expected signing identity'
ditto -x -k "$ROOT/../Heidy Bakery Mac.zip" "$WORK/unpacked"
printf '\n// Deliberately modified resource for negative verification test.\n' >>"$WORK/unpacked/Heidy Bakery.app/Contents/Resources/model.js"
ditto -c -k --sequesterRsrc --keepParent "$WORK/unpacked/Heidy Bakery.app" "$WORK/tampered.zip"
reject "$WORK/tampered.zip" 'modified signed resource'
printf 'PASS: negative release checks complete.\n'
