#!/bin/bash
set -euo pipefail

MODE=release
if [ "${1:-}" = --local ]; then
  MODE=local
  shift
fi
PKG="${1:?Usage: verify-installer.sh [--local] package.pkg [report.txt]}"
REPORT="${2:-}"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/heidy-installer-verify.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

test -f "$PKG"
pkgutil --expand-full "$PKG" "$WORK/expanded"
APP="$WORK/expanded/component.pkg/Payload/Applications/Heidy Bakery.app"
INFO="$WORK/expanded/component.pkg/PackageInfo"
POSTINSTALL="$WORK/expanded/component.pkg/Scripts/postinstall"
test -d "$APP"
test -f "$INFO"
test -x "$POSTINSTALL"
test ! -e "$WORK/expanded/component.pkg/Scripts/preinstall"
cmp "$PROJECT_DIR/Installer/postinstall" "$POSTINSTALL"

# The package upgrades this exact bundle in /Applications and cannot relocate
# it or write user records into the payload.
grep -Fq 'install-location="/"' "$INFO"
grep -Fq 'relocatable="false"' "$INFO"
grep -Fq '<upgrade-bundle>' "$INFO"
grep -Fq '<bundle id="com.heidybakery.local"/>' "$INFO"
test ! -e "$WORK/expanded/component.pkg/Payload/Users"
test ! -e "$WORK/expanded/component.pkg/Payload/Library/Application Support"
bash "$PROJECT_DIR/Tests/installer-cleanup.sh" "$POSTINSTALL" "$APP"

codesign --verify --deep --strict "$APP"
lipo "$APP/Contents/MacOS/HeidyBakery" -verify_arch arm64 x86_64
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = com.heidybakery.local
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")" = "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PROJECT_DIR/Info.plist")"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")" = "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PROJECT_DIR/Info.plist")"
HEIDY_DATA_DIR="$WORK/self-test-data" "$APP/Contents/MacOS/HeidyBakery" --self-test >/dev/null

if [ "$MODE" = release ]; then
  : "${HEIDY_SIGN_IDENTITY:?Set the expected Developer ID Application identity.}"
  : "${HEIDY_INSTALLER_IDENTITY:?Set the expected Developer ID Installer identity.}"
  pkgutil --check-signature "$PKG" >"$WORK/package-signature.txt"
  grep -Fq "$HEIDY_INSTALLER_IDENTITY" "$WORK/package-signature.txt"
  codesign -dv --verbose=4 "$APP" 2>"$WORK/app-signature.txt"
  grep -Fxq "Authority=$HEIDY_SIGN_IDENTITY" "$WORK/app-signature.txt"
  xcrun stapler validate "$PKG" >"$WORK/stapler.txt" 2>&1
  spctl --assess --type install --verbose=2 "$PKG" >"$WORK/gatekeeper.txt" 2>&1
  grep -Fq 'source=Notarized Developer ID' "$WORK/gatekeeper.txt"
fi

{
  echo 'Heidy Bakery installer verification'
  echo "Mode: $MODE"
  echo 'Install path: /Applications/Heidy Bakery.app'
  echo 'Upgrade behavior: replace main bundle, then remove matching duplicate app bundles directly inside /Applications'
  echo 'Cleanup behavior tests: passed (including missing/corrupt new app and unrelated files)'
  echo 'User data included in payload: no'
  echo 'User data touched by cleanup: no'
  echo "App version: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
  echo "App build: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP/Contents/Info.plist")"
  echo 'Architectures: arm64, x86_64'
  echo 'Native self-test: passed'
  if [ "$MODE" = release ]; then
    echo "App identity: $HEIDY_SIGN_IDENTITY"
    echo "Installer identity: $HEIDY_INSTALLER_IDENTITY"
    echo 'Notarization ticket: validated'
    echo 'Gatekeeper: Notarized Developer ID'
  fi
  echo 'RESULT: PASS'
} | if [ -n "$REPORT" ]; then tee "$REPORT"; else cat; fi
