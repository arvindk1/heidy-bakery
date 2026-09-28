# Heidy Bakery workspace

This directory is the canonical source and Mac build location in the Codex workspace.

## Signing and notarization

Read `RELEASE.md` before distributing a build. The saved Keychain profile is **HeidyBakery-notary**, verified September 9, 2026. Use `--keychain-profile "HeidyBakery-notary"` directly. The Developer ID identity is `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`.

Do not perform broad Keychain searches or dumps. Check only the named profile. If it is missing, have the owner restore it interactively; never put passwords in files or chat.

Use `release.sh` / `make release` as the only release path; extend it when needed rather than invoking the signing/build scripts ad hoc. Deliver only the verified signed/notarized installer `.pkg` via WhatsApp. Local test builds are not distribution releases.

## Testing

Use isolated libraries and inboxes for receipt approval, import, backup and undo tests. Do not approve test prices in the live bakery library. `npm test` and `npm run test:ui` cover model and interface regressions; the build runs native checks. See `../ITERATION-032.md` for native fixture setup and independent Excel recalculation.

## Stable delivery and handoff rules

- DELIVERY.md's seven numbered Install steps are fixed canonical text. Never rephrase them between releases; only update its What's new section per release.
- WHATSAPP-MESSAGE.txt is generated, never hand-edited. Run `node Scripts/generate-delivery.cjs` after changing What's new and include the result with the release changes. The release pipeline verifies it and regenerates the staged message from DELIVERY.md.
- The output/repository root's docs/releases/SHIPPED.txt is the sole shipped-build ledger. Append new entries only; never edit past entries. The version guard reads its last line.
- Put future handoffs at the output/repository root as HANDOFF-<topic>.md, one scoped file per topic.

## Feature regression tracking

Maintain docs/FEATURE-COVERAGE.md when adding or changing a feature. Record behavior, automated coverage, and remaining manual checks. Add a regression test that reproduces each bug before its fix; cover interactions with existing receipts, mappings, history and unrelated recipes, not only empty-library fixtures. Use npm test (also make test), npm run test:ui, a local native build when bundled/native code changes, and npm run test:native-smoke. Passing suites do not imply untested manual workflows pass. PDFs are explanatory references, not an authoritative implementation specification.

## Workspace ownership — explicit user instruction

Codex owns only the Codex workspace under ~/Documents/Codex. Claude Code owns ~/devl, including ~/devl/heidy. Never create, edit, delete, sync into, build in, or run commands that write artifacts into the devl tree. Read-only inspection there is allowed when relevant. Copy incoming handoff changes into the Codex tree only; provide a scoped HANDOFF-*.md in the Codex output root for Claude to apply on its side. A release requiring the mirror checkout must be handed to Claude, not executed there by Codex. Do not infer permission to write in devl from a general request to fix, test, sync or release.
