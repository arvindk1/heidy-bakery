# Original recipe workbooks and app Excel exports

## Original recipe workbooks

Use Recipes → Import recipe workbooks for Cake.xlsx, Bread.xlsx, Cookie & Others.xlsx and Cloud Chiffon Series.xlsx. Select any combination, review the sheets, then confirm. Supported layout is the supplied recipe template, not arbitrary Excel files.

The latest direct check of the four original files found 96 recipes and 1,407 material lines, with no skipped sheets or blocked drafts: Cake 27/361; Bread 21/350; Cookie & Others 37/572; Cloud Chiffon 11/124 (recipes/lines). The three new workbooks contain 85 recipes and 1,283 lines: 1,281 named lines plus two unnamed packaging rows preserved for review. Earlier reports of 1,281 total lines omitted those rows.

Imported inputs include batch yield, selling unit, material quantities/units, per-piece packaging, labor effort and unambiguous listed prices. The app recalculates using its master costs. It does not copy the spreadsheets’ cached totals or arbitrary formulas.

Existing recipe names start unchecked. Choosing Replace replaces recipe details/lines and retains current selling prices. Duplicate matches need review. Missing master materials require explicit consent to create unpriced items. Cancel changes nothing.

Review findings: Bread Flour and Potato have no exact master match; TBC FB Chocolate CK (2) contains two unnamed packaging rows; TBC FB Bread has a Cheese line without a unit. Some master costs are incomplete. No values are invented.

All four originals have 65 drafts without an assigned selling price. Cloud has no Price Summary; its new recipes get blank prices. HS prices remain unassigned by user decision. (W)Biscoff Earlgrey Bun imports bulk 5.75 and retail null. Existing saved prices are retained on replacement. Ambiguous prices remain blank. Some spreadsheet totals omit material rows; the app includes them and may calculate a higher cost.

The original 11 Cloud recipe costs remained unchanged when reimported against the original master snapshot. Actual data is tested separately from the saved synthetic-layout reconciliation.

## Export this recipe and bring it back

Recipes → Export this recipe produces an editable app-format workbook containing the selected recipe, its ingredient/packaging records, calculation formulas and shared settings. It does not contain receipt originals or complete history. Export does not change saved data.

To bring it back, use Settings → Reimport an app Excel export. Keep IDs and required sheets/headers unchanged. Edit input values, not formulas in input columns. Review before applying. This is a merge by ID: included recipes receive the workbook inputs and lines; records absent from the file remain.

Important: even a single-recipe workbook can change shared ingredient costs and global settings. That can recalculate other recipes. Included retail/bulk prices can also be replaced. Importing an older export can restore old costs/settings. This is a different contract from original-recipe-workbook import, which protects existing master prices and actual selling prices.

## Validation and release boundary

Saved model and browser suites cover 85/96 synthetic recipe layouts, every material line, channels, missing materials, invalid input, cancel, repeat import, rollback and reload. Excel UI tests use the native XLSX reader/writer and cover exporting a single recipe with unrelated receipts/mappings/history, plus reimport and preservation of live history.

All 12 model suites, 10 browser suites, local native build and native smoke test passed after the single-recipe export fix. The 11 golden costs remained unchanged. Full manual native workflow and Heidy-device iCloud checks are still pending.

The signed mirror release is 0.3.9 build 12. Current Codex local builds contain later fixes despite that version label; they are not the signed installer and must not be distributed. A new release requires a higher build number and the canonical release pipeline.

Importing cost master.xlsx directly is out of scope by user decision. The initial master data is already supplied in the app.
