#!/bin/bash
# One-command, fail-fast release pipeline: preflight -> version guard -> tests ->
# signed build -> signed installer -> verified delivery folder. Never commits or
# pushes; it only prints the git commands for a human to run afterward.
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  ''|--check) ;;
  *) echo 'Usage: ./release.sh [--check]' >&2; exit 2 ;;
esac

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
SHIPPED="$ROOT_DIR/docs/releases/SHIPPED.txt"

# --- Preflight ---
BRANCH="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = main ] || { echo "release.sh must run from main (currently on $BRANCH)." >&2; exit 1; }
[ -z "$(git -C "$ROOT_DIR" status --porcelain --untracked-files=no)" ] || {
  echo 'Tracked tree is not clean. Commit or stash before releasing.' >&2; exit 1;
}
test -f "$PROJECT_DIR/Resources/seed.json" || {
  echo "Resources/seed.json is missing. A release build needs Heidy's real data file, not the synthetic example." >&2
  exit 1
}
: "${HEIDY_SIGN_IDENTITY:?Set HEIDY_SIGN_IDENTITY to a Developer ID Application certificate name.}"
: "${HEIDY_INSTALLER_IDENTITY:?Set HEIDY_INSTALLER_IDENTITY to a Developer ID Installer certificate name.}"
: "${HEIDY_NOTARY_PROFILE:?Set HEIDY_NOTARY_PROFILE to a stored notarytool Keychain profile.}"
echo "Preflight passed: on main, clean tree, seed.json present, signing env set."

# --- Version guard ---
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PROJECT_DIR/Info.plist")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PROJECT_DIR/Info.plist")"
test -f "$SHIPPED" || { echo "Missing $SHIPPED" >&2; exit 1; }
LAST_LINE="$(tail -n 1 "$SHIPPED")"
LAST_BUILD="$(awk '{print $2}' <<<"$LAST_LINE")"
[ -n "$LAST_BUILD" ] || { echo "Could not parse a build number from the last line of $SHIPPED (\"$LAST_LINE\")." >&2; exit 1; }
case "$BUILD" in ''|*[!0-9]*) echo "CFBundleVersion is not a plain integer: \"$BUILD\"." >&2; exit 1;; esac
case "$LAST_BUILD" in ''|*[!0-9]*) echo "Last shipped build in $SHIPPED is not a plain integer: \"$LAST_BUILD\"." >&2; exit 1;; esac
[ "$BUILD" -gt "$LAST_BUILD" ] || {
  echo "CFBundleVersion ($BUILD) must be strictly greater than the last shipped build ($LAST_BUILD, from \"$LAST_LINE\")." >&2
  exit 1
}
echo "Version guard passed: $VERSION build $BUILD > last shipped build $LAST_BUILD."

# --- Tests ---
(cd "$PROJECT_DIR" && npm test)
(cd "$PROJECT_DIR" && npm run test:ui)
echo 'Tests passed: npm test and npm run test:ui.'

if [ "$MODE" = --check ]; then
  echo 'release.sh --check passed. Nothing was built, signed or delivered.'
  exit 0
fi

# --- Signed build + installer (unchanged scripts) ---
(cd "$PROJECT_DIR" && ./build.sh --release)
(cd "$PROJECT_DIR" && ./build-installer.sh --release)

# --- Verify the delivery artifact ---
PKG="$ROOT_DIR/Heidy Bakery Installer.pkg"
VERIFICATION="$ROOT_DIR/Heidy Bakery Installer.pkg.verification.txt"
case "$PKG" in
  *'LOCAL TEST'*) echo "Refusing a LOCAL TEST artifact: $PKG" >&2; exit 1 ;;
esac
test -f "$PKG" || { echo "Expected installer not found: $PKG" >&2; exit 1; }
test -f "$VERIFICATION" || { echo "Expected verification report not found: $VERIFICATION" >&2; exit 1; }
LAST_RESULT="$(tail -n 1 "$VERIFICATION")"
[ "$LAST_RESULT" = 'RESULT: PASS' ] || {
  echo "Installer verification did not report RESULT: PASS (got \"$LAST_RESULT\"). Refusing to deliver." >&2
  exit 1
}
echo 'Installer verification passed: RESULT: PASS.'

# --- Copy delivery artifacts ---
DELIVERY_DIR="$ROOT_DIR/deliveries/$VERSION-$BUILD"
mkdir -p "$DELIVERY_DIR"
cp "$PKG" "$DELIVERY_DIR/"
cp "$PKG.sha256" "$DELIVERY_DIR/"
cp "$VERIFICATION" "$DELIVERY_DIR/"
cp "$PROJECT_DIR/WHATSAPP-MESSAGE.txt" "$DELIVERY_DIR/"
echo "Delivery staged: $DELIVERY_DIR"

# --- Record the shipped build ---
DATE="$(date -u +%Y-%m-%d)"
SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
printf '%s %s %s %s\n' "$VERSION" "$BUILD" "$DATE" "$SHA" >>"$SHIPPED"

cat <<GITCMDS

release.sh never commits or pushes. Run these yourself when ready:

  git -C "$ROOT_DIR" add "$SHIPPED"
  git -C "$ROOT_DIR" commit -m "Ship $VERSION build $BUILD"

GITCMDS

printf 'Released %s build %s\nDelivery: %s\n' "$VERSION" "$BUILD" "$DELIVERY_DIR"
