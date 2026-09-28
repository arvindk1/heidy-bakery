# Handoff: reimporting an app Excel export can roll back newer prices

Reviewed 2026-09-28 against Codex tree `2026-09-07/.../HeidyBakery` (0.3.10 build 13),
now synced into the mirror. Claude verified the single-recipe export fix (below) and
raises one open item that should be fixed before Heidy relies on Excel round trips.

## Verified: single-recipe export fix (no action)
`Resources/app.js` `exportExcel(recipe)` validates the full snapshot, then clears
receipts, mappings, products, history and receiptId in the export clone only. This is correct: `M.workbook()`
never writes those fields, and `importCandidate` merges into `clone(state)`, so live
records are untouched. The new `Tests/excel-ui.test.cjs` block **fails on the 0.3.9
app.js** ("single recipe export with unrelated receipt history failed") and passes on
0.3.10. Full `npm test`, `npm run test:ui`, local build and `test:native-smoke` pass
(run on a scratch copy).

## Open, high: stale export silently overwrites newer costs
`importCandidate` in `Resources/app.js` (Ingredients loop) replaces `price`, `size`,
`unit`, `supplier` and `updated` whenever the workbook value differs from the live one. It never compares
dates. Settings rows get the same treatment.

Scenario: Heidy exports "Vanilla Cake" on 1 Oct (butter $10). On 15 Oct she approves a
receipt, and butter becomes $12. On 20 Oct she edits the yield in the 1 Oct file and reimports it.
Butter goes back to $10 with `updated` 2026-10-01, every recipe using butter is re-costed
lower, and the preview says only "1 ingredient changed". The previous value does go into
history, so the data can be recovered, but nothing warns her.

The app is now Heidy's pricing source of truth, so this is the riskiest path left in
the Excel workflow.

Requested (design choice is yours):
1. When a workbook row's `updated` is **older** than the live `updated` and its values
   differ, do not apply that row by default. Show it as "older than your current price"
   and require an explicit opt-in.
2. The preview should name each changed ingredient and setting with old → new values
   and list the affected recipes with before/after cost per piece. The receipt-approval
   preview (`app.js` ~801: changes table + "Affected recipes") already does this.
   Reuse its shape, including the "older purchase → history only" treatment.
3. For an export that contains exactly one recipe, default to applying recipe fields only.
   Shared ingredients and settings should need an explicit checkbox.
4. Regression test: fixture with a newer receipt-approved price, reimport an older
   single-recipe export, and assert the live price is unchanged unless the user opts in.

## Smaller items
- `recipe-import.js` notes line-by-line deduplication (stops the HS note repeating on each reimport)
  is correct but has no test. Add a repeat-import assertion that `notes` contains the HS
  line exactly once.
- `Scripts/generate-delivery.cjs` copies DELIVERY.md's markdown straight into
  WHATSAPP-MESSAGE.txt: `**bold**` (WhatsApp uses single `*`), hard-wrapped bullet lines,
  and the friendly closing line is gone. Consider converting to WhatsApp formatting and
  unwrapping bullets. The install steps stay locked as they are.
- Codex's `Tests/recipe-import.test.cjs` is older than the mirror's and lacks the
  unnamed-packaging assertions (mirror commit `5e63ebb`). Please pull the mirror's copy
  of that file into the Codex tree.
