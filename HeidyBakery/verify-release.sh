#!/bin/bash
# Verify the ZIP that will actually be shared. Never reads or prints credentials.
set -euo pipefail
trap 'echo "Release verification failed. Do not distribute this ZIP." >&2' ERR
: "${HEIDY_SIGN_IDENTITY:?Set the expected Developer ID Application identity.}"
case "$HEIDY_SIGN_IDENTITY" in
  'Developer ID Application: '*) ;;
  *) echo 'A Developer ID Application identity is required.' >&2; exit 1 ;;
esac
ARCHIVE="${1:?Usage: verify-release.sh ZIP [evidence-file]}"
EVIDENCE="${2:-$ARCHIVE.verification.txt}"
CHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heidy-release-check.XXXXXX")"
trap 'rm -rf "$CHECK_DIR"' EXIT
unzip -tq "$ARCHIVE"
ditto -x -k "$ARCHIVE" "$CHECK_DIR/unpacked"
APP="$CHECK_DIR/unpacked/Heidy Bakery.app"
BIN="$APP/Contents/MacOS/HeidyBakery"
test -x "$BIN"
lipo "$BIN" -verify_arch arm64 x86_64
codesign --verify --deep --strict "$APP"
codesign -dv --verbose=4 "$APP" >"$CHECK_DIR/signature.txt" 2>&1
# A valid ad-hoc signature alone is not a distribution signature.
grep -Fxq "Authority=$HEIDY_SIGN_IDENTITY" "$CHECK_DIR/signature.txt"
TEAM="${HEIDY_SIGN_IDENTITY##*(}"
TEAM="${TEAM%)}"
grep -Fxq "TeamIdentifier=$TEAM" "$CHECK_DIR/signature.txt"
grep -Eq '^CodeDirectory .*flags=.*runtime' "$CHECK_DIR/signature.txt"
grep -q '^Timestamp=' "$CHECK_DIR/signature.txt"
xcrun stapler validate "$APP" >"$CHECK_DIR/stapler.txt" 2>&1
spctl --assess --type execute --verbose=2 "$APP" >"$CHECK_DIR/gatekeeper.txt" 2>&1
grep -Fxq 'source=Notarized Developer ID' "$CHECK_DIR/gatekeeper.txt"
HEIDY_DATA_DIR="$CHECK_DIR/native-tests" "$BIN" --self-test >"$CHECK_DIR/native.txt" 2>&1
{
  printf 'Verified UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'Version: '; /usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist"
  printf 'Build: '; /usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$APP/Contents/Info.plist"
  shasum -a 256 "$ARCHIVE"
  cat "$CHECK_DIR/signature.txt" "$CHECK_DIR/stapler.txt" "$CHECK_DIR/gatekeeper.txt" "$CHECK_DIR/native.txt"
  printf '\nPASS: extracted ZIP, expected Developer ID and team, hardened runtime, timestamp, both architectures, notarization ticket, Gatekeeper and native tests.\n'
} >"$EVIDENCE"
printf 'Distribution verification passed. Evidence: %s\n' "$EVIDENCE"
