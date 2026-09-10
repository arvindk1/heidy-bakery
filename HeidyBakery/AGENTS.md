# Heidy Bakery workspace

This directory is the canonical source and Mac build location in the Codex workspace.

## Signing and notarization

Read `RELEASE.md` before distributing a build. The saved Keychain profile is **HeidyBakery-notary**, verified September 9, 2026. Use `--keychain-profile "HeidyBakery-notary"` directly. The Developer ID identity is `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`.

Do not perform broad Keychain searches or dumps. Check only the named profile. If it is missing, have the owner restore it interactively; never put passwords in files or chat.

Use `build.sh --release` with the documented identity and profile. Share the distribution ZIP only after Apple acceptance, stapling and extracted-package verification pass. Local test builds are not distribution releases.

## Testing

Use isolated libraries and inboxes for receipt approval, import, backup and undo tests. Do not approve test prices in the live bakery library. `npm test` and `npm run test:ui` cover model and interface regressions; the build runs native checks. See `../ITERATION-032.md` for native fixture setup and independent Excel recalculation.
