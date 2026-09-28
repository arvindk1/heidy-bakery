# Heidy Bakery 0.3.9 — build 12

Not yet released. This documents local verification on branch `fix/0.3.9-review`
(merging into `main`) — signing, notarization and the actual `--release` build
remain Codex's to run, per the working agreement in `CLAUDE.md`.

Adds **Import recipe workbooks** (Recipes tab): Heidy's original one-recipe-per-sheet
files — Cake, Bread, Cookie & Others, and Cloud Chiffon — can now be read directly,
without first exporting the app's own template. Up to 10 workbooks can be selected at
once; every import is reviewed before anything is saved, batch yield/ingredient/
packaging quantities and labour effort come from the workbook, and an unambiguous
listed price is carried over when one clear match exists. Cloud Chiffon has no Price
Summary sheet, so its recipes import with prices left blank instead of failing the
whole import. Recipes marked **HS** have an unconfirmed sales channel; their retail
and bulk prices stay unassigned until confirmed. Replacing an existing recipe keeps
its current selling prices; missing master items can be added unpriced only if
explicitly checked. The Settings **Reimport an app Excel export** path is unchanged
apart from its label and a clearer error: pointing someone who selects an original
recipe workbook there back to **Recipes → Import recipe workbooks** instead of the
previous "unsupported layout" wording.

`model.js`'s `ingredientIssues()` now also flags unnamed **packaging** placeholders
(previously only unnamed ingredient placeholders were flagged), so a "Confirm
ingredient identity" warning appears for packaging rows the importer had to name
`Unidentified packaging — …`. `calculate()`, `unitCost()` and `factor()` are
unchanged — the 11 golden recipe costs are byte-identical to 0.3.8.

`build.sh`, `verify-release.sh` and `build-installer.sh` had a `lipo -verify_arch
arm64 x86_64` call that fails outright on this Mac's current `lipo` (macOS 26.6.2);
all three now verify each architecture in its own call. This only affects the build
scripts, not the shipped binary — the local test build already produced a genuine
universal binary before this fix, verified independently.

## Validation

- `npm test`: 12/12 suites passed, including the 11 golden recipe costs (unchanged),
  the synthetic 85-sheet / 96-sheet recipe-workbook fixtures, and the widened
  ingredient-quality placeholder check.
- `npm run test:ui`: 10/10 suites passed, including `excel-ui.test.cjs` (now asserting
  the new Settings reimport error text) and `recipe-import-ui.test.cjs`.
- `bash build.sh --local`: both self-test runs (staged and re-extracted) passed,
  `codesign --verify --deep --strict` OK, `lipo -archs` → `x86_64 arm64`,
  Info.plist confirmed at `0.3.9` / build `12`.
- Code review of the full 0.3.8→0.3.9 diff (`f278e14..main`, `HeidyBakery/`): no
  breaking or risk-level findings — see `HANDOFF-0.3.9-REVIEW.md` for the full table.
- Not yet run: signed `--release` build, notarization, Gatekeeper/stapler validation.
  These require Codex's signing environment.

## For Codex

- `HANDOFF-0.3.9-REVIEW.md` — code-review findings table and the `lipo` fix note.
- `HANDOFF-0.3.9-all.patch` — full patch from `f278e14` to `main` (this file + all
  0.3.9 work), for applying in the live Codex tree.
- Remaining known items from `HANDOFF-RECIPE-WORKBOOK-IMPORT.md`: `RECIPE_IMPORT.md`
  line-count text still needs the 1,283/1,407 update, and the cost-total note
  (fires on most drafts) could collapse into one modal-header line.
- No dedicated test yet covers a simulated save failure specifically inside
  `importRecipeWorkbooks` (the shared `save()` rollback in `app.js` covers it
  generically — see `HANDOFF-0.3.9-REVIEW.md`); worth a targeted test alongside the
  existing `excel-ui.test.cjs` save-rollback/retry coverage.
- Once signed and notarized, bump this doc with the Apple submission ID, ZIP
  SHA-256, and release-evidence path, matching `RELEASE-0.3.8.md`'s format.
