# Heidy Bakery 0.1 — requirements and implementation

## Product scope

An offline Mac costing app using the approved price-list, receipts, ingredients, recipes and settings layout. A Cocoa application hosts a bundled WebKit interface. There is no hosted website, remote database, telemetry or paid API. Apple Vision supplies on-device image OCR; PDFKit reads PDFs and renders their first page for preview.

## Records and persistence

- SQLite stores the versioned application document and a 30-save undo history. Writes use an immediate transaction and FULL synchronous mode with WAL journaling.
- Ingredients have stable IDs, kind, supplier, paid package price, total quantity, unit, purchase date, source provenance and history.
- Recipes have stable IDs, yield, selling unit, labour hours, additional batch cost, manual retail/bulk prices, optional bulk packaging/labour overrides, minimum bulk quantity, notes, category and ingredient lines.
- Lines retain their own IDs, ingredient reference, quantity, unit and whether quantity applies to a piece or a batch. Duplicate named lines are preserved because the original recipe can use the same ingredient at different stages.
- Receipts retain a SHA-256 content identifier, original filename and bytes, date, retailer, OCR text, reviewed purchase lines and status. Originals are copied into the app’s local Receipts directory. They are not deleted by record undo.
- Receipt approvals preserve previous master values, append the approved purchase, remember supplier/description mappings, and update current purchase data only if the receipt is not older than the current date.
- Full backups bundle state and original files. Restore validates the format and receipt presence, protects against unsafe filenames and conflicting file contents, and creates an undo point.

## Costing requirements

1. Batch ingredients and packaging sum every line; no omitted first or last rows.
2. Compatible mass, volume and count conversions are supported. Mass-to-volume conversion needs explicit compatible inputs and is never guessed.
3. Ingredient unit cost = paid package price / total package quantity.
4. Per-piece line quantities are multiplied by recipe yield before summing the batch.
5. Batch cost = ingredients + packaging + labour hours × global labour rate + other batch costs.
6. Unit cost = batch cost / yield. Missing costs, unknown items, invalid quantities and incompatible units block complete unit costs and suggestions. Zero is distinct from missing.
7. Suggested price = applicable unit cost × (1 + markup / 100). Retail and bulk markup are separate and initially unset.
8. Bulk packaging per piece and bulk labour per batch may replace the corresponding standard costs. Bulk minimum order is independent of recipe yield.
9. Margin at the chosen selling price = (selling price − applicable unit cost) / selling price. A zero/unset selling price has no displayed margin.
10. Manual selling prices never change from ingredient updates. Significant cost rises accumulate against a review baseline; reviewing the change resets that baseline without changing selling prices.
11. Old and future purchase dates are flagged. Labour here is a pricing allowance, not an accounting claim about business profit.

## Screens

- Price list: searchable rows, review/missing-price filters, editable retail/bulk prices, calculated suggestions and actual margins, recipe navigation and full Excel export.
- Recipes: search/select, create/edit/copy/delete, complete ingredient and packaging lines, batch summary, retail/bulk breakdown, notes and expandable purchase checks. Copies receive fresh IDs and unset selling prices.
- Ingredients: search supplier/name, kind/missing-cost filters, purchase editing, price history and receipt links.
- Receipts: search retailer/text/items, date range, retailer/status filters, 12-record pagination, original preview, full-file opening, editable draft purchases, candidate-line extraction, saved exact mappings, manual approval and archive without updates.
- Settings: labour, retail/bulk markup, alert threshold, stale-price interval, folder selection, backup/restore, undo and Excel import/export.

## Excel contract

The native app writes standard OOXML workbooks without external links. Ingredients, Recipes, Lines and Settings are editable inputs; Price list contains formulas. The Read me sheet explains conversion-factor handling and independent use. Original receipt images and audit history are deliberately in the full backup rather than XLSX.

Reimport accepts the generated template only. Header, record-ID, numeric, setting and relationship checks run before a preview. Input formulas are rejected. Existing recipe lines are replaced for recipes present in the import; omitted recipes and ingredients are retained. A recipe-only export retains only its required master items.

## Initial migration

The seed retains the supplied 11 recipe sheets, including WS variants, and 197 ingredient/packaging records including explicit unresolved entries. Original spreadsheets are untouched. The broken unnamed selling-price summary is not used to assign prices. The Vanilla corrected unit cost is approximately $2.5324218720 using the supplied master costs. Chestnut’s unnamed ingredient blocks its complete cost.

## Validation

Pure calculation tests cover source reconciliation, missing/zero values, compatible/incompatible units, bulk overrides, markup/margin, historical updates, duplicate approval and stable selling prices. Native tests cover SQLite save/undo, workbook archive/XML round trip and full backup/restore with an original receipt. UI integration covers import, persistent price editing, copying/yield, receipt review, duplicate detection and native Excel export/reimport. An independent spreadsheet engine recalculates exported formulas and is checked against app results. Synthetic image OCR and PDF text extraction are exercised separately.

## Release boundary

This is a first test release. It is a universal binary targeting macOS 13+, ad-hoc signed rather than Apple notarized. Actual receipt correction time, Heidy’s Mac compatibility and the full workflow with her iCloud folder still require user validation. Intel is cross-compiled, not exercised on Intel hardware.

Bulk tier assumptions, remaining 50+ recipe migration, Square data, historical production costing, sales/event records, recurring expenses, profitability, CPA extracts and seasonal/capacity forecasts are separate follow-up work. Current recipe changes are not presented as historical business-profit calculations.
