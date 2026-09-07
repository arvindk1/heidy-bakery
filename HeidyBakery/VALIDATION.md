# Validation of version 0.2

Completed on September 6, 2026.

- Built and ad-hoc signed a universal arm64/x86_64 Mac application targeting macOS 13+.
- Verified the application bundle signature and release archive integrity.
- Opened the actual Cocoa/WebKit app and confirmed its interface loads.
- Matched corrected Vanilla per-piece cost to $2.532421872014937 from the supplied workbooks, including yolks and ingredient stickers.
- Confirmed incomplete Chestnut ingredient data produces no complete cost or suggested prices.
- Tested mass/count conversion, incompatible-unit handling, blank versus zero costs, bulk cost overrides, markup and margins.
- Locked all 11 recipe costs to spreadsheet-reconciled golden values; Chestnut remains blocked with exactly one missing-cost error.
- Tested master/recipe referential integrity, global recipe-line identifiers, non-empty selling units and safe zero-line Excel formulas.
- Tested zero-price warnings and explicit free-item confirmation.
- Restored the spreadsheet labour-effort choices without changing existing labour hours.
- Verified local calendar dates, corrected the known Vanilla Paste date typo, and reports when an older receipt is kept in history without replacing a newer master price.
- Tested older receipt handling, duplicate approval rejection, supplier mappings, prior price history and unchanged manual selling prices.
- Native SQLite save and undo tests passed.
- Native full backup and restore preserved both the state and the original receipt bytes.
- Generated a real XLSX using the native writer and parsed it with the native importer.
- Recalculated the full export in an independent spreadsheet engine. No formula errors remained; recipe costs matched the app. Blank selling prices and missing recipe costs stayed blank. Currency and margin formatting were checked.
- UI workflow tests passed for seed import, settings, price editing and reload, recipe copy/yield changes, receipt drafts and approval, duplicate import, and native Excel export/reimport.
- Verified actionable purchase-price review links, labelled ingredient/packaging sections and their subtotals.
- Visually inspected light/dark layouts and a narrow app window.
- Apple Vision recognized a synthetic receipt image. PDFKit extracted the synthetic PDF’s text.

Not yet validated: Heidy’s actual Mac or Intel hardware, her iCloud folder permissions and transfer timing, representative retailer receipt accuracy/correction time, long-term/high-volume use, and Apple notarization/distribution. Browser workflow tests use an isolated native bridge adapter; the native storage/export/OCR functions are tested separately. Original user workbooks were not changed.
