#!/bin/bash
set -euo pipefail
cleanup_script="${1:?postinstall script}"
source_app="${2:?verified app fixture}"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/heidy-cleanup-test.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT
apps="$test_root/Applications"
mkdir -p "$apps"
make_fixture() {
  mkdir -p "$1/Contents"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $2" "$1/Contents/Info.plist" >/dev/null
}
make_fixture "$apps/Heidy Bakery 2.app" com.heidybakery.local
make_fixture "$apps/Heidy Bakery Other.app" com.example.unrelated
make_fixture "$apps/Unrelated.app" com.heidybakery.local
make_fixture "$test_root/Downloads/Heidy Bakery.app" com.heidybakery.local
mkdir -p "$test_root/Users/heidy/Library/Application Support/Heidy Bakery" "$test_root/Receipts" "$test_root/Backups"
printf 'user data must survive\n' > "$test_root/Users/heidy/Library/Application Support/Heidy Bakery/records.json"
printf 'receipt\n' > "$test_root/Receipts/original.jpg"
printf 'backup\n' > "$test_root/Backups/full.zip"
ln -s "$test_root/Downloads/Heidy Bakery.app" "$apps/Heidy Bakery linked.app"
if bash "$cleanup_script" fixture.pkg / "$test_root" 2>/dev/null; then
  echo 'Missing new app must prevent cleanup' >&2; exit 1
fi
test -d "$apps/Heidy Bakery 2.app"
make_fixture "$apps/Heidy Bakery.app" com.heidybakery.local
if bash "$cleanup_script" fixture.pkg / "$test_root" 2>/dev/null; then
  echo 'Unsigned/corrupt new app must prevent cleanup' >&2; exit 1
fi
test -d "$apps/Heidy Bakery 2.app"
rm -rf "$apps/Heidy Bakery.app"
ditto "$source_app" "$apps/Heidy Bakery.app"
bash "$cleanup_script" fixture.pkg / "$test_root"
test ! -e "$apps/Heidy Bakery 2.app"
test -d "$apps/Heidy Bakery.app"
test -d "$apps/Heidy Bakery Other.app"
test -d "$apps/Unrelated.app"
test -L "$apps/Heidy Bakery linked.app"
test -d "$test_root/Downloads/Heidy Bakery.app"
test "$(cat "$test_root/Users/heidy/Library/Application Support/Heidy Bakery/records.json")" = 'user data must survive'
test "$(cat "$test_root/Receipts/original.jpg")" = receipt
test "$(cat "$test_root/Backups/full.zip")" = backup
bash "$cleanup_script" fixture.pkg / "$test_root"
echo 'Installer cleanup tests: PASS'
