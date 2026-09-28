# Feature inventory and regression coverage

Maintained in the Codex development tree. Update this table whenever a feature changes; add a bug-specific regression plus relevant cross-feature checks. A passing test covers its assertions, not every possible user workflow.

| Feature / behavior to preserve | Automated evidence | Remaining boundary |
|---|---|---|
| Open legacy libraries, missing historical units, optional recipe metadata | model.test.cjs, regression.test.cjs; native validation/self-test | Genuine customer backup on supported Macs |
| Batch cost: ingredients, packaging per piece/per batch, yield, labor, other costs | model.test.cjs: 11 golden costs; regression.test.cjs; Excel fixtures | Excel recalculation with unusual inputs |
| Retail/bulk markup, actual price, margins, bulk overrides | model.test.cjs, ui-regression.cjs | No actual sales-profit accounting implied |
| Recipe create/edit/copy/delete, search and selection | ui-regression.cjs and its refresh checks | Very large library interaction |
| Ingredients: purchase price, quantity/unit, history, free-item confirmation | model.test.cjs, ingredient-quality.test.cjs via hardening.test.cjs, ui-regression.cjs | Receipt evidence unavailable in old history |
| Missing ingredient/packaging identity remains flagged after size/unit entered | ingredient-quality.test.cjs | Human must supply the identity |
| Receipt folder selection, rescan, retries, duplicate protection | folder UI checks, receipt tests, native self-tests | iPhone Shortcut and real iCloud sync on Heidy's devices |
| Receipt date/retailer filtering, paging, original/history links | ui-regression.cjs, receipt-ui.test.cjs | Full manual native walkthrough |
| Local receipt parsing and match suggestions | receipts.test.cjs, receipt-parsing.test.cjs, receipt-products.test.cjs | Photo/PDF OCR accuracy on unfamiliar receipts |
| Approval changes master costs only after review; older dates do not overwrite newer costs | receipt-products.test.cjs, hardening.test.cjs, receipt UI tests | Manual photo/PDF -> approval workflow |
| Saved product matches, correction, forgetting and undo | saved-products.test.cjs, saved-products-ui.test.cjs | Unseen supplier layouts |
| Weight/count/density conversions require confirmed measurements | unit-conversion.test.cjs, unit-conversion-ui.test.cjs, quantity-story-ui.test.cjs | No guessed universal cups-to-grams conversion |
| Margin Watch: normalized history and lost margin since cost baseline | margin-watch.test.cjs, navigation tests | Requires usable history/baseline |
| Full Excel export and app-export reimport | excel-ui.test.cjs with real native XLSX reader/writer | Excel exports are not full backups |
| Single-recipe Excel export with unrelated receipts/mappings/history | excel-ui.test.cjs: receipt-product fixture, narrow ingredient set, actual XLSX round trip and source/history preservation | Regression added after confirmed export failure |
| Original recipe-workbook import, four books, HS unassigned, W bulk, missing materials and unknown formulas | recipe-import.test.cjs: 85/96 layouts, 1283/1407 lines; recipe-import-ui.test.cjs: cancel/import/reload/repeat/save failure | native-recipe-import.cjs additionally covers all four actual files in WKWebView, SQLite save and separate-process reopen; native file-picker walkthrough remains incomplete |
| Save failure rollback/retry; no partial state changes | regression.test.cjs; excel-ui, recipe-import-ui and other UI suites; native SQLite tests | Disk/device failures beyond simulated cases |
| Full backup/restore with original receipts; 30-change undo | native self-test, UI regression tests | Manual save/restore/quit/reopen sequence outstanding |
| Automatic backup, retention, unavailable-folder warnings | automatic-backup-ui.test.cjs and native self-test | External disk/iCloud availability |
| Dark/light and narrow layout, focus and receipt modal controls | refresh-contrast.test.cjs, receipt-modal-ui.test.cjs, ui-regression.cjs | Human accessibility review |
| Native app launches all six tabs and reports source Info.plist version | run-native-smoke.cjs via npm run test:native-smoke | Does not verify notarization; Intel runtime needs Intel hardware |
| Release guards, stable install steps, architectures, signing, installer cleanup | release.sh, generate-delivery.cjs, verify-release.sh, verify-installer.sh, installer-cleanup.sh | Clean-main Git checkout and fresh build number required; signed release separate |

## Commands and gate boundaries

- `npm test` / `make test`: same 12 suite commands (not a count of individual assertions).
- `npm run test:ui`: 10 browser suites; native Excel reader/writer plus isolated bridge adapters.
- Local build: native checks against staged and extracted bundle; both architecture slices compile, host-native execution only.
- `npm run test:native-smoke`: real WKWebView, isolated library, version from source Info.plist.
- Release only via `make release` / `release.sh`. Never rewrite shipped ledger history.

## Guide review

Reviewed both image-based PDFs using page OCR (Digital Ledger: 15 pages; Operating Guide: 12). They document receipts, ingredient history, recipes, labor, retail/bulk pricing, Margin Watch, settings and backups. The implementation/tests above are the feature source of truth.

Corrections needed before treating the guides as current instructions:
- Digital Ledger p13 and Operating Guide p12 call .heidybackup encrypted. The app writes JSON/base64 receipt contents; app-level encryption is not implemented. Do not promise it.
- Operating Guide p10 calls the pricing input target margin; the actual setting is markup. They are different calculations.
- Both call Excel an export/backup with formulas. Excel preserves selected costing inputs/formulas, not the complete receipt archive or operational history. Use Save full backup for full restoration.
- Recipe screenshots (Ledger p8 / Guide p8) show the old Import from Excel label. Current Recipes imports original recipe workbooks; Settings reimports app Excel exports. These are separate actions.
- Offline processing does not mean iCloud transport is offline; the Shortcut/folder sync requires Apple services/connectivity when used.
- Automatic intake and matching still require review/correction, confirmed package details and approval. Hashes detect byte-identical files, not all different photos of the same paper receipt.
- Undo covers up to 30 retained saved changes; avoid promising reversal of any action at any time.

The PDFs have not been edited. These corrections belong in the next documentation revision; the seven canonical DELIVERY.md install steps stay untouched.
