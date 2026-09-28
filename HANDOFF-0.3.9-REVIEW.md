# Handoff → Codex: 0.3.9 build review notes

- `build.sh:83` `lipo -verify_arch` multi-arch fails on macOS 26.6.2 lipo; fixed per-arch.
  See `HANDOFF-build-lipo.patch` (branch `fix/build-lipo-verify`) — same fix applied to
  `verify-release.sh` and `build-installer.sh`, which had the identical pattern.

## Phase 4.6 — Code review, 0.3.8 (`f278e14`) → `main`, branch `fix/0.3.9-review`

Scope: `git diff f278e14..main -- HeidyBakery/` (25 files, +843/-20 — the
recipe-workbook-import feature). No code changes made; every check passed.

| Severity | File:line | Issue | Fix | Status |
|---|---|---|---|---|
| None | `Resources/model.js` (unchanged in diff) | (a) Backward compat: new recipe fields (`source`, `category`, provenance) are never required by `validate()`/`normalizeState()` (recipe checks at ~line 299 only require `name`/`yield`/`unit`/`lines`/`laborHours`/`otherCost`); a 0.3.8-shaped recipe missing them still opens. `Main.swift:22` comment confirms native restore/undo share the same JS validation, no separate stricter schema. | N/A | Verified, no action needed |
| None | `Resources/app.js:1236` vs `:1445` | (b) Settings "Reimport an app Excel export" is bound to the same unchanged `importExcel` function; only its button label/copy changed (`import-excel` / "Reimport an app Excel export"). A separate `import-recipe-workbooks` button now calls the new `importRecipeWorkbooks`. | N/A | Verified, no action needed |
| None | `Source/Main.swift:456-505` | (c) `readWorkbook`/`readRecipeWorkbook`: path-traversal guarded (`..`, `\`, glob chars rejected) in both, 20 MB file cap, 30 MB per-sheet XML cap, 150-sheet cap, 2000-row cap, 10-file selection cap (`p.urls.count <= 10`). Malformed/empty xlsx throws a clear `failure(...)` ("No records were changed"); both functions are pure read/parse, no state write, so nothing partially applies on error. Shared-formula resolution (`sharedFormulas[si]`) only trusts an absolute single-cell ref (`^\$B\$[0-9]+$`); if a follower cell were ever parsed before its shared-formula master (not expected — Excel writes masters first in reading order), the line just becomes a blocking "enter a valid quantity" rather than a silently wrong cost. | N/A | Verified, no action needed |
| None | `Resources/recipe-import.js:105-138`, `Resources/app.js:240-268` | (d) `modal()`'s `onSave` only runs from the dialog's `onsubmit` handler (explicit user confirm); Cancel/close never invoke it — no state change before confirmation. `candidate()` line 128 keeps `previous.retail`/`previous.bulk` on Replace, only using the draft's price for a brand-new recipe. Blocked drafts (`blockingIssues.length`) have their checkbox `disabled` in the UI (disabled inputs are excluded from `FormData` by the browser) and `candidate()` line 109 throws on them as a backstop even if a row were force-selected. | N/A | Verified, no action needed |
| None | `Resources/model.js` (1-line diff) | (e) `calculate()`, `unitCost()`, `factor()` are byte-identical to `f278e14`; the only `model.js` change is the `ingredientIssues()` regex widening (line 94, from 5e63ebb). 11 golden costs are unchanged (confirmed via Phase 4's `npm test` run on this same tree). | N/A | Verified, no action needed |
| None | `Resources/model.js:94`, `Resources/recipe-import.js:32` | (f) Only 4 non-fixture files reference the `Unidentified …`/`Unnamed item …` placeholder-name prefixes: `model.js` (the fixed regex), `recipe-import.js` (the generator), and two consistent test files (`recipe-import.test.cjs`, `ingredient-quality.test.cjs`). No other code path still keys off the narrower pre-5e63ebb pattern. | N/A | Verified, no action needed |
| None | `HeidyBakery/Installer/postinstall:9-24` | (g) Postinstall only inspects/deletes duplicate `Applications/Heidy Bakery*.app` bundles matching bundle id `com.heidybakery.local`, verified via `PlistBuddy`/`codesign` first; it never references `~/Library/Application Support/Heidy Bakery` (Heidy's live SQLite data). | N/A | Verified, no action needed |

**Verdict: ship.** No breaking or risk-level findings in the 0.3.8→0.3.9 diff. Nothing
was fixed, so no patch was exported for this phase (only the pre-existing
`HANDOFF-build-lipo.patch` above applies). Branch `fix/0.3.9-review` has no commits
beyond `main` — safe to discard or merge as a no-op.

## Follow-up fixes, same branch — 2026-09-27

1. **Settings reimport error text** (`Main.swift:471`): changed from "This workbook
   uses an unsupported layout... Export a template from Settings..." to "This looks
   like an original recipe workbook. Use Recipes → Import recipe workbooks instead.
   This Settings option only reimports a workbook exported by this app. Required
   sheet not found: \(name). No records were changed." Text only, no behavior change.
   `Tests/excel-ui.test.cjs:52` asserted the old wording (`'unsupported layout'`) —
   updated to assert `'Import recipe workbooks instead'` instead.
2. **Save-failure rollback for `importRecipeWorkbooks`**: confirmed safe, but by a
   *generic* mechanism, not a dedicated one. `app.js` `importRecipeWorkbooks()` sets
   `state = candidate` then `await save(...)`. `save()` (`app.js:101-145`) rolls
   `state` back to `previous`/`lastSaved` in its own `catch` blocks on either a
   synchronous validation failure (line 115-120) or an async native-save failure
   (line 138-145) — this is unconditional and doesn't depend on what `state` held
   before the call, so a failed save after `state = candidate` does not leave the
   candidate state in memory. **No dedicated test exercises this path for
   `importRecipeWorkbooks` specifically** (`recipe-import-ui.test.cjs` has no
   `failSave`-style scenario, unlike `excel-ui.test.cjs`'s existing "save
   rollback/retry" case for the Settings reimport path). Not fixed here per
   instruction — flagged for Codex to add a matching test.
3. **START HERE.md**: "Import recipe workbooks" section now names all four
   workbooks (added Cloud Chiffon) and notes that Cloud Chiffon prices stay blank
   (no Price Summary sheet) and HS-channel prices stay unassigned until confirmed.
4. **`docs/RELEASE-0.3.9.md`** created, in the style of `RELEASE-0.3.8.md` —
   summarizes the recipe-workbook import, the packaging-placeholder warning, the
   `lipo` build fix, the Settings error-text change, and this session's test/build
   results. Signing/notarization fields left for Codex to fill in after `--release`.

All of `npm test` (12/12, 11 golden costs unchanged), `npm run test:ui` (10/10,
including the updated `excel-ui.test.cjs` assertion), and `bash build.sh --local`
(both self-tests, codesign verify, `lipo -archs` → `x86_64 arm64`, Info.plist
0.3.9/12) passed after these changes.
