# The Little Dot — Refresh Implementation & Verification

> **Note (superseded in part):** this documents a refresh implementation built directly in this working copy. Since then, Codex's own independent implementation of the same refresh plan was pulled into this tree and now supersedes it on disk. Most of what's below still holds (the model/regression/margin-watch suites, the overall visual direction, functionality-protection invariants), but two specifics do not match what's currently shipped: the navigation order here differs slightly from Codex's (Codex ships Price list, Margin Watch, Receipts, Ingredients, Recipes, Settings), and the app icon described as "bundled through `CFBundleIconFile`" is not currently wired into Codex's `Info.plist`/`build.sh` — see `HANDOFF-APP-REFRESH.md` for the current, accurate state and what's left to do.

Implemented September 7, 2026, in `/Users/arvindk/devl/heidy`.

## Delivered

- Warm porcelain surfaces, system typography, restrained caramel actions, aligned numbers, visible keyboard focus, and contrast-adjusted dark mode.
- Six labeled destinations ordered Price list → Recipes → Ingredients → Receipts → Margin Watch → Settings, with Settings at the bottom on wide windows.
- Collapsible navigation; compact horizontal navigation at 1,100 px and below. Recipe selector replaces the side list at that threshold. Receipt original/review panes stack at 1,400 px and below; the existing 760 px compact fallback remains.
- Grouped retail/bulk columns, opaque sticky headers, and a sticky recipe-name column. Horizontal scrolling preserves readable data and review labels at smaller widths.
- Searchable recipe list on wide windows; the existing selector remains on narrow windows. All create/copy/edit/delete/export and costing controls remain available.
- Ingredient filters/history, receipt filters/pagination/approval/archive, and native original-file access retained.
- Recipe margin effects precede ingredient increases. Empty-state wording no longer implies that absent increases prove all costs are current.
- Clearer Settings sections, with all existing configuration, backup, undo, and Excel tools retained.
- Session retention for filters, selection, workspace/table scroll, and unsaved settings drafts; Back links for cross-screen recipe/receipt navigation; predictable focus after dialogs.
- Corrected transparent icon bundled through `CFBundleIconFile`. This repository builds a Cocoa bundle with a shell script and does not have an Xcode asset catalog.
- Source artwork moved to `assets/brand/`; reference and superseded artwork clearly separated under `docs/brand-reference/`. The pre-existing untracked `AppIcon.iconset.zip` was left untouched.

## Protected behavior

`Resources/model.js` is unchanged. The only native Swift change is the window title. Database identity, native bridge, save queue, OCR pipeline, workbook contracts, and costing formulas are unchanged. Selling prices remain independent of cost updates, receipt-derived updates still require approval, and save failure/rollback handling is retained.

All data-changing verification used isolated fixture records or fresh directories under `/tmp`. The installed application in `~/Applications` and its live database were not replaced.

## Checks performed

| Check | Result |
|---|---|
| Model suite | Passed, including 11 golden costs and input validation. |
| Regression suite | Passed, including atomic approvals, exact save snapshots, rollback, dates, and import provenance. |
| Margin Watch suite | All T1–T8 passed. |
| Contrast suite | 44 functional light/dark pairings passed: normal text ≥4.5:1; controls/focus ≥3:1. Added to root and nested test/build commands. |
| Existing UI regression suite | Passed: bulk/labour editing, history links, pagination/search, receipt approval, save retry, automatic draft pickup, and narrow dark layout. |
| Added refresh UI checks | Passed: navigation order, active destination, filter return, unsaved settings retention/save, retail/bulk persistence across navigation, recipe copy/delete, and navigation collapse. |
| Layout matrix | All six destinations checked at 760, 1,100, and 1,440 px in light and dark mode, without unintended window/workspace horizontal overflow. Data tables deliberately scroll internally. |
| Real WebKit smoke test | Passed on final repository build: seed import, SQLite save/reload, automatic image/PDF pickup, manual receipt approval, original preview, stable selling price, and undo. |
| Native self-tests | Passed: initial/no-op/30-entry undo, SQLite rollback, validation, Excel round trip, receipt backup/restore, conflict preflight, and inbox undo suppression. |
| Independent Excel recalculation | All 22 edited-workbook scenarios passed using LibreOffice/openpyxl, with no formula errors. |
| Packaging | Universal arm64/x86_64 build, plist lint, ad-hoc signature verification, and archive integrity passed. |
| Native visual review | Installed baseline and refreshed WebKit window inspected. A final minimum table width addresses tall rows caused by squeezed review text in WebKit. |
| Icon | Supplied RGBA master has zero alpha at all four corners; runtime ICNS uses the supplied corrected file. Finder shows the branded icon at list and preview sizes. |

## Visual evidence

Baseline browser screenshots and the final 36-screen layout matrix are provided with the local refresh review deliverables. Screenshots use fixture records and may show deliberate test edits; they are not the bakery's live database. Native screenshots were also inspected in the task.

## Performance and weight

No runtime packages, frameworks, web fonts, blur effects, animation libraries, or network calls were added. The supplied ICNS adds approximately 1.6 MB to the app bundle.

A seven-load comparison using the same isolated Chrome bridge fixture measured median initial display at 69 ms for the baseline and 74 ms for the refresh. This is a small diagnostic sample, not a statistically controlled benchmark and not a measurement of full native startup, OCR throughput, or power use. No overall speed improvement is claimed.

## Verification limits

- The full Dock/Finder appearance matrix was not manually exercised in both system appearances. Finder list/preview display and source transparency were checked; app light/dark layouts were tested separately.
- Universal compilation was verified; runtime tests ran on this Mac rather than separate Intel hardware.
- The UI regression suite uses a native bridge adapter. Native persistence, OCR/approval smoke coverage, backup/restore, and Excel checks supplement it, but every OS file chooser was not manually exercised.
- The tests provide substantial regression evidence, not a guarantee against every possible defect. Larger datasets and prolonged daily use were not benchmarked.

## Build and verification commands

From the repository root:

```sh
make test
bash HeidyBakery/build.sh
PLAYWRIGHT_MODULE=/path/to/playwright node HeidyBakery/Tests/ui-regression.cjs /path/to/disposable/screenshots
python3 HeidyBakery/Tests/excel.test.py /path/to/disposable/excel-tests
```

The browser test uses installed Chrome. The Excel test requires openpyxl and LibreOffice. Neither is a runtime dependency of the bakery app.

The native smoke test requires `HEIDY_DATA_DIR`, `HEIDY_RECEIPT_INBOX`, and `HEIDY_UI_TEST_SCRIPT` pointing to isolated directories and `HeidyBakery/Tests/native-ui.js`; run the built executable with `--ui-smoke`. Supply at least one generated image receipt and one PDF in the isolated inbox.

## Rollback and handoff

The work remains uncommitted. The pre-refresh tracked source is available at the existing repository HEAD; no database migration was made. To revert the refresh, first preserve this diff and any later user work, restore only the refresh-related source/assets to that revision, then rebuild. Do not run a blanket hard reset or delete the live database.

The local output is `HeidyBakery/Heidy Bakery.app` and `Heidy Bakery Mac.zip`. The bundle filename and identifier remain compatible with the existing app; its displayed identity is The Little Dot. Installation into Applications is a separate step and was not performed.
