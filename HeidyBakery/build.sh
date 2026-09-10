#!/bin/bash
set -euo pipefail
MODE="${1:---local}"
case "$MODE" in
  --local|--release) ;;
  *) echo 'Usage: ./build.sh [--local|--release]' >&2; exit 2 ;;
esac
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$MODE" = --release ]; then
  : "${HEIDY_SIGN_IDENTITY:?Set HEIDY_SIGN_IDENTITY to a Developer ID Application certificate name.}"
  : "${HEIDY_NOTARY_PROFILE:?Set HEIDY_NOTARY_PROFILE to a stored notarytool Keychain profile.}"
  case "$HEIDY_SIGN_IDENTITY" in
    'Developer ID Application: '*) ;;
    *) echo 'Release requires a Developer ID Application identity; local and App Store certificates are not accepted.' >&2; exit 1 ;;
  esac
  security find-identity -v -p codesigning | /usr/bin/grep -Fq "\"$HEIDY_SIGN_IDENTITY\"" || {
    echo 'The requested Developer ID Application identity is not available in the Keychain.' >&2; exit 1;
  }
  # Validate stored credentials before spending time compiling. Never put secrets in this script.
  xcrun notarytool history --keychain-profile "$HEIDY_NOTARY_PROFILE" --output-format json >/dev/null
fi
APP_DIR="$PROJECT_DIR/Heidy Bakery.app"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heidy-bakery-build.XXXXXX")"
STAGED_APP="$BUILD_DIR/Heidy Bakery.app"
ARCHIVE="$BUILD_DIR/Heidy Bakery Mac.zip"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir -p "$STAGED_APP/Contents/MacOS" "$STAGED_APP/Contents/Resources"
node "$PROJECT_DIR/Tests/model.test.cjs"
node "$PROJECT_DIR/Tests/regression.test.cjs"
node "$PROJECT_DIR/Tests/receipts.test.cjs"
node "$PROJECT_DIR/Tests/receipt-learning.test.cjs"
node "$PROJECT_DIR/Tests/receipt-parsing.test.cjs"
node "$PROJECT_DIR/Tests/receipt-products.test.cjs"
node "$PROJECT_DIR/Tests/saved-products.test.cjs"
node "$PROJECT_DIR/Tests/margin-watch.test.cjs"
node "$PROJECT_DIR/Tests/refresh-contrast.test.cjs"
for ARCH in arm64 x86_64; do
  swiftc "$PROJECT_DIR/Source/Main.swift" -O -target "$ARCH-apple-macosx13.0" -module-cache-path "$BUILD_DIR/module-cache" -framework Cocoa -framework WebKit -framework Vision -framework PDFKit -framework JavaScriptCore -lsqlite3 -o "$BUILD_DIR/HeidyBakery-$ARCH"
done
lipo -create "$BUILD_DIR/HeidyBakery-arm64" "$BUILD_DIR/HeidyBakery-x86_64" -output "$STAGED_APP/Contents/MacOS/HeidyBakery"
cp -R "$PROJECT_DIR/Resources/." "$STAGED_APP/Contents/Resources/"
cp "$PROJECT_DIR/Info.plist" "$STAGED_APP/Contents/Info.plist"
plutil -lint "$STAGED_APP/Contents/Info.plist"
if [ "$MODE" = --release ]; then
  codesign --force --options runtime --timestamp --entitlements "$PROJECT_DIR/Release.entitlements" --sign "$HEIDY_SIGN_IDENTITY" "$STAGED_APP"
else
  # Exercise the same runtime protections locally, without claiming Apple approval.
  codesign --force --options runtime --entitlements "$PROJECT_DIR/Release.entitlements" --sign - "$STAGED_APP"
fi
codesign --verify --deep --strict "$STAGED_APP"
HEIDY_DATA_DIR="$BUILD_DIR/native-tests" "$STAGED_APP/Contents/MacOS/HeidyBakery" --self-test
if [ "$MODE" = --release ]; then
  ditto -c -k --sequesterRsrc --keepParent "$STAGED_APP" "$BUILD_DIR/submission.zip"
  # Keep Apple's response for diagnosing failed or timed-out submissions.
  REPORT_DIR="$PROJECT_DIR/../release-reports/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$REPORT_DIR"
  # Preserve exactly what was submitted if Apple's response exceeds the wait.
  ditto "$STAGED_APP" "$REPORT_DIR/Heidy Bakery.app"
  xcrun notarytool submit "$BUILD_DIR/submission.zip" --keychain-profile "$HEIDY_NOTARY_PROFILE" --wait --timeout 30m --output-format json >"$REPORT_DIR/notarization.json"
  node -e 'const r=require(process.argv[1]); if(r.status!=="Accepted") { console.error("Apple did not accept this release. See",process.argv[1]); process.exit(1); }' "$REPORT_DIR/notarization.json"
  xcrun stapler staple "$STAGED_APP"
  xcrun stapler validate "$STAGED_APP"
  spctl --assess --type execute --verbose=2 "$STAGED_APP"
fi
# A fresh bundle and archive prevent removed resources from surviving a rebuild.
ditto -c -k --sequesterRsrc --keepParent "$STAGED_APP" "$ARCHIVE"
if [ "$MODE" = --release ]; then
  zip -q -j "$ARCHIVE" "$PROJECT_DIR/START HERE.md"
  DEST_ARCHIVE="$PROJECT_DIR/../Heidy Bakery Mac.zip"
else
  printf 'LOCAL TEST BUILD — not notarized and not ready to send to another Mac.\nRun build.sh --release for distribution.\n' >"$BUILD_DIR/LOCAL TEST BUILD.txt"
  zip -q -j "$ARCHIVE" "$BUILD_DIR/LOCAL TEST BUILD.txt"
  DEST_ARCHIVE="$PROJECT_DIR/../Heidy Bakery LOCAL TEST.zip"
fi
unzip -tq "$ARCHIVE"
# Verify the actual delivered bundle after extraction, not just the staging copy.
ditto -x -k "$ARCHIVE" "$BUILD_DIR/unpacked"
UNPACKED_APP="$BUILD_DIR/unpacked/Heidy Bakery.app"
test -x "$UNPACKED_APP/Contents/MacOS/HeidyBakery"
lipo "$UNPACKED_APP/Contents/MacOS/HeidyBakery" -verify_arch arm64 x86_64
cmp "$STAGED_APP/Contents/MacOS/HeidyBakery" "$UNPACKED_APP/Contents/MacOS/HeidyBakery"
codesign --verify --deep --strict "$UNPACKED_APP"
HEIDY_DATA_DIR="$BUILD_DIR/unpacked-tests" "$UNPACKED_APP/Contents/MacOS/HeidyBakery" --self-test
if [ "$MODE" = --release ]; then
  "$PROJECT_DIR/verify-release.sh" "$ARCHIVE" "$REPORT_DIR/distribution-verification.txt"
fi
if [ -e "$APP_DIR" ]; then mv "$APP_DIR" "$BUILD_DIR/previous.app"; fi
if ! mv "$STAGED_APP" "$APP_DIR"; then
  if [ -e "$BUILD_DIR/previous.app" ]; then mv "$BUILD_DIR/previous.app" "$APP_DIR"; fi
  exit 1
fi
mv "$ARCHIVE" "$DEST_ARCHIVE"
shasum -a 256 "$DEST_ARCHIVE" >"$DEST_ARCHIVE.sha256"
if [ "$MODE" = --release ]; then cp "$REPORT_DIR/distribution-verification.txt" "$DEST_ARCHIVE.verification.txt"; fi
printf 'Built %s\nPackage: %s\nMode: %s\n' "$APP_DIR" "$DEST_ARCHIVE" "$MODE"
