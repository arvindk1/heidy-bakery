#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$PROJECT_DIR/Heidy Bakery.app"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/heidy-bakery-build.XXXXXX")"
STAGED_APP="$BUILD_DIR/Heidy Bakery.app"
ARCHIVE="$BUILD_DIR/Heidy Bakery Mac.zip"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir -p "$STAGED_APP/Contents/MacOS" "$STAGED_APP/Contents/Resources"
node "$PROJECT_DIR/Tests/model.test.cjs"
node "$PROJECT_DIR/Tests/regression.test.cjs"
for ARCH in arm64 x86_64; do
  swiftc "$PROJECT_DIR/Source/Main.swift" -O -target "$ARCH-apple-macosx13.0" -module-cache-path "$BUILD_DIR/module-cache" -framework Cocoa -framework WebKit -framework Vision -framework PDFKit -framework JavaScriptCore -lsqlite3 -o "$BUILD_DIR/HeidyBakery-$ARCH"
done
lipo -create "$BUILD_DIR/HeidyBakery-arm64" "$BUILD_DIR/HeidyBakery-x86_64" -output "$STAGED_APP/Contents/MacOS/HeidyBakery"
cp -R "$PROJECT_DIR/Resources/." "$STAGED_APP/Contents/Resources/"
cp "$PROJECT_DIR/Info.plist" "$STAGED_APP/Contents/Info.plist"
plutil -lint "$STAGED_APP/Contents/Info.plist"
codesign --force --sign - "$STAGED_APP"
codesign --verify --deep --strict "$STAGED_APP"
HEIDY_DATA_DIR="$BUILD_DIR/native-tests" "$STAGED_APP/Contents/MacOS/HeidyBakery" --self-test
# A fresh bundle and archive prevent removed resources from surviving a rebuild.
ditto -c -k --sequesterRsrc --keepParent "$STAGED_APP" "$ARCHIVE"
zip -q -j "$ARCHIVE" "$PROJECT_DIR/START HERE.md"
unzip -tq "$ARCHIVE"
if [ -e "$APP_DIR" ]; then mv "$APP_DIR" "$BUILD_DIR/previous.app"; fi
if ! mv "$STAGED_APP" "$APP_DIR"; then
  if [ -e "$BUILD_DIR/previous.app" ]; then mv "$BUILD_DIR/previous.app" "$APP_DIR"; fi
  exit 1
fi
mv "$ARCHIVE" "$PROJECT_DIR/../Heidy Bakery Mac.zip"
printf 'Built %s\n' "$APP_DIR"
