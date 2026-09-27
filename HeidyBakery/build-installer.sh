#!/bin/bash
set -euo pipefail

MODE="${1:---local}"
case "$MODE" in
  --local|--release) ;;
  *) echo 'Usage: ./build-installer.sh [--local|--release]' >&2; exit 2 ;;
esac

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_ZIP="${HEIDY_APP_ZIP:-$PROJECT_DIR/../Heidy Bakery Mac.zip}"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PROJECT_DIR/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PROJECT_DIR/Info.plist")"
BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PROJECT_DIR/Info.plist")"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/heidy-bakery-installer.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

test -f "$SOURCE_ZIP" || {
  echo 'Build and verify the app release ZIP before building the installer.' >&2
  exit 1
}

unzip -tq "$SOURCE_ZIP"
ditto -x -k "$SOURCE_ZIP" "$WORK/source"
APP="$WORK/source/Heidy Bakery.app"
test -d "$APP" || {
  echo 'The release ZIP does not contain Heidy Bakery.app.' >&2
  exit 1
}

# Package only the app extracted from the verified release ZIP. User records
# live outside the app bundle and are deliberately absent from the payload.
codesign --verify --deep --strict "$APP"
lipo "$APP/Contents/MacOS/HeidyBakery" -verify_arch arm64 x86_64
cmp "$PROJECT_DIR/Info.plist" "$APP/Contents/Info.plist"

if [ "$MODE" = --release ]; then
  : "${HEIDY_SIGN_IDENTITY:?Set HEIDY_SIGN_IDENTITY to the existing Developer ID Application identity.}"
  : "${HEIDY_INSTALLER_IDENTITY:?Set HEIDY_INSTALLER_IDENTITY to the Developer ID Installer identity.}"
  : "${HEIDY_NOTARY_PROFILE:?Set HEIDY_NOTARY_PROFILE to the stored notarytool Keychain profile.}"
  case "$HEIDY_SIGN_IDENTITY" in
    'Developer ID Application: '*) ;;
    *) echo 'The app identity must be a Developer ID Application certificate.' >&2; exit 1 ;;
  esac
  case "$HEIDY_INSTALLER_IDENTITY" in
    'Developer ID Installer: '*) ;;
    *) echo 'The package identity must be a Developer ID Installer certificate.' >&2; exit 1 ;;
  esac
  xcrun notarytool history --keychain-profile "$HEIDY_NOTARY_PROFILE" --output-format json >/dev/null
  codesign -dv --verbose=4 "$APP" 2>"$WORK/app-signature.txt"
  grep -Fxq "Authority=$HEIDY_SIGN_IDENTITY" "$WORK/app-signature.txt"
  xcrun stapler validate "$APP"
  spctl --assess --type execute --verbose=2 "$APP"
fi

mkdir -p "$WORK/root/Applications"
ditto "$APP" "$WORK/root/Applications/Heidy Bakery.app"
mkdir -p "$WORK/scripts"
cp "$PROJECT_DIR/Installer/postinstall" "$WORK/scripts/postinstall"
chmod 755 "$WORK/scripts/postinstall"
pkgbuild --analyze --root "$WORK/root" "$WORK/components.plist"
/usr/libexec/PlistBuddy \
  -c 'Set :0:BundleIsRelocatable false' \
  -c 'Set :0:BundleIsVersionChecked false' \
  -c 'Set :0:BundleHasStrictIdentifier true' \
  -c 'Set :0:BundleOverwriteAction upgrade' \
  "$WORK/components.plist"

pkgbuild \
  --root "$WORK/root" \
  --identifier "$BUNDLE_ID.installer" \
  --version "$VERSION" \
  --install-location / \
  --scripts "$WORK/scripts" \
  --component-plist "$WORK/components.plist" \
  "$WORK/component.pkg"

if [ "$MODE" = --release ]; then
  DEST="$PROJECT_DIR/../Heidy Bakery Installer.pkg"
  REPORT_DIR="$PROJECT_DIR/../release-reports/$(date -u +%Y%m%dT%H%M%SZ)-pkg-$$"
  mkdir -p "$REPORT_DIR"
  productbuild --package "$WORK/component.pkg" --sign "$HEIDY_INSTALLER_IDENTITY" "$WORK/installer.pkg"
  pkgutil --check-signature "$WORK/installer.pkg" >"$REPORT_DIR/pre-notarization-signature.txt"
  grep -Fq "$HEIDY_INSTALLER_IDENTITY" "$REPORT_DIR/pre-notarization-signature.txt"
  xcrun notarytool submit "$WORK/installer.pkg" \
    --keychain-profile "$HEIDY_NOTARY_PROFILE" \
    --wait --timeout 30m --output-format json >"$REPORT_DIR/notarization.json"
  node -e 'const r=require(process.argv[1]); if(r.status!=="Accepted") { console.error("Apple did not accept this installer. See",process.argv[1]); process.exit(1); }' "$REPORT_DIR/notarization.json"
  xcrun stapler staple "$WORK/installer.pkg"
  xcrun stapler validate "$WORK/installer.pkg"
  spctl --assess --type install --verbose=2 "$WORK/installer.pkg"
  "$PROJECT_DIR/verify-installer.sh" "$WORK/installer.pkg" "$REPORT_DIR/distribution-verification.txt"
else
  DEST="$PROJECT_DIR/../Heidy Bakery Installer LOCAL TEST.pkg"
  productbuild --package "$WORK/component.pkg" "$WORK/installer.pkg"
  "$PROJECT_DIR/verify-installer.sh" --local "$WORK/installer.pkg"
fi

mv "$WORK/installer.pkg" "$DEST"
shasum -a 256 "$DEST" >"$DEST.sha256"
if [ "$MODE" = --release ]; then
  cp "$REPORT_DIR/distribution-verification.txt" "$DEST.verification.txt"
fi

printf 'Built installer for version %s (build %s)\nPackage: %s\nMode: %s\n' "$VERSION" "$BUILD" "$DEST" "$MODE"
