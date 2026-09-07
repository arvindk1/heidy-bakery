# Heidy Bakery — Fix Handoff

Findings from a code review + live test of build v0.1.0, written for a coding agent picking this up cold.

---

## 0. Orientation

**Repo:** `~/devl/heidy` (git initialised, **zero commits** — commit before doing anything else)

```
HeidyBakery/
  Source/Main.swift        116 lines — native: SQLite, XLSX writer, Vision OCR, PDFKit, backup/undo
  Resources/app.js         UI + all five tabs (dense, one statement per line, 43 lines)
  Resources/model.js       costing engine (27 lines) — the thing that must never silently change
  Resources/seed.json      197 master items + 11 recipes imported from the spreadsheets
  Tests/model.test.cjs     existing model test suite
  build.sh                 swiftc ×2 arches → lipo → copy Resources → codesign → ditto to zip
Makefile                   test · selftest · pdf · build · run · clean
docs/                      7 markdown docs
```

**Commands**

```bash
cd ~/devl/heidy
make test      # node HeidyBakery/Tests/model.test.cjs
make selftest  # runs the native binary's --self-test against an isolated test_data dir
make build     # full rebuild + re-sign
make run       # open the built app
```

`model.js` is written to run in both the browser and Node (`module.exports` at the bottom), so it can be unit-tested directly. Do the same for anything new you add there.

### Environment gotcha you will hit

There were **four** copies of `Heidy Bakery.app` on this Mac. LaunchServices was launching an old unpatched one from `~/Documents/Codex/2026-09-06/…`, so edits to `Resources/` appeared to do nothing. Both strays are now renamed `*.app-DISABLED`.

If a change doesn't show up after `make build`, this is why. Check with:

```bash
mdfind "kMDItemCFBundleIdentifier == 'com.heidybakery.local'"
ps -Ao pid,comm | grep -i heidybakery
```

Related: the app is ad-hoc signed (`codesign --force --sign -`), not notarized. A quarantined copy runs under Gatekeeper path randomisation from a read-only snapshot, so resource edits don't take. `xattr -dr com.apple.quarantine <bundle>` clears it.

---

## 1. Invariant — costing must not change

`model.js` reconciles exactly against the source spreadsheets. **Any change that moves these numbers is a regression** unless it is one of the fixes below and is intentional.

| Recipe | Yield | Labour h | Ingredients | Packaging | Cost / piece |
|---|---:|---:|---:|---:|---:|
| Vanilla | 16 | 1 | 14.09650995223899 | 2.42224 | **2.532421872014937** |
| Vanilla (WS) | 16 | 1 | 14.09650995223899 | 2.42224 | **2.532421872014937** |
| Matcha & Hojicha | 16 | 1 | 14.782512577990055 | 2.42224 | **2.575297036124378** |
| Matcha & Hojicha (WS) | 16 | 1 | 14.782512577990055 | 2.42224 | **2.575297036124378** |
| Banana Chocolate | 16 | 1 | 16.278106938642416 | 2.42224 | **2.6687716836651507** |
| Banana Chocolate (WS) | 16 | 1 | 16.278106938642416 | 2.42224 | **2.6687716836651507** |
| Cheese | 16 | 1 | 11.5979513924255 | 2.42224 | **2.376261962026594** |
| Cheese (WS) | 16 | 2 | 11.5979513924255 | 2.42224 | **3.876261962026594** |
| Lemon Tea | 6 | 1 | 2.292558118552032 | 0.45174 | **4.457383019758672** |
| Peach Tea | 6 | 1 | 4.8386051773755625 | 0.45174 | **4.881724196229261** |
| Chestnut | 6 | 1 | 3.4181898728466704 | 0.45174 | **null** (blocked — unidentified ingredient) |

Labour rate 24 $/h, `otherCost` 0 for all. Verified three independent ways: `model.js` under Node, the running app's Price list, and the app's own Excel export recalculated in LibreOffice.

**These deliberately differ from the spreadsheets, and that is correct** — the app fixes real spreadsheet bugs:

- Vanilla's `=SUM(F6:F12)` skipped row 5 (254 g egg yolk) → **+$2.59/batch**
- Every sheet's `=SUM(F18:F18)` packaging total captured one cell, omitting the ingredient sticker → **+$0.012988/piece on all 11**
- Chestnut row 11 has a quantity but no material name; `IFNA(…,0)` costed it at $0

---

## 2. Fixes

### P0 — correctness and data safety

---

#### F1. A zero purchase price is silently treated as free

**Where:** `model.js` → `unitCost()`, `calculate()`

`unitCost` tests `nonnegative(i.price)`, so `price: 0` yields a legitimate cost of `0`. An ingredient priced at zero contributes **$0.00** to every recipe using it and raises no error and no warning. The receipt-approval path guards this correctly (`l.price===0 && !l.freeConfirmed` throws), but the ingredient editor and the Excel import do not.

**Fix:** treat a zero price as suspicious rather than free. Add a `freeConfirmed` boolean to the ingredient record; when `price === 0 && !freeConfirmed`, push a *warning* (not an error — do not break existing data) naming the item, and surface it in the recipe's Review state. Add the checkbox to `editIngredient()`, mirroring the wording already used in `editPurchase()`.

**Must not:** change any value in the table above. No seeded ingredient has a zero price.

---

#### F2. `validate()` does not enforce referential integrity

**Where:** `model.js` → `validate()`

It checks types and ID uniqueness *within* each list, but all of these pass today:

- a recipe line whose `ingredientId` matches no ingredient
- duplicate line IDs across two different recipes
- an empty `unit` on a recipe

This matters because `validate()` is the trust boundary for **Restore backup** and **Review Excel import**. Bad data gets in and only surfaces later as per-row "Select an ingredient" errors.

**Fix:** in `validate()`, build a `Set` of ingredient IDs and assert every `line.ingredientId` is in it; track line IDs in one global `Set` across all recipes; require `r.unit` to be a non-empty string.

**Careful:** `validate()` runs on every `save()`. Make sure the seed and a full round-trip still validate, or the app becomes unusable.

---

#### F3. `workbook()` exports a broken ingredient reference against the header row

**Where:** `model.js` → `workbook()`, Lines sheet

```js
const i = s.ingredients.find(i => i.id === l.ingredientId), ir = s.ingredients.indexOf(i) + 2;
```

When `i` is `undefined`, `indexOf` returns `-1`, so `ir === 1` and the emitted formulas read `Ingredients!B1` / `C1` / `I1` — the **header row**. The workbook looks valid and silently costs against the literal string `"Name"`.

**Fix:** throw a clear error naming the recipe and line, or emit a blank row with an explicit `"UNRESOLVED"` marker in the name column. Do not emit a formula pointing at row 1.

Reproduce: take the seed, set one line's `ingredientId` to `'ghost'`, call `M.workbook(state)`, inspect `sheets.find(s=>s.name==='Lines').rows[1]`.

---

### P1 — fidelity to the spreadsheet, and usability

---

#### F4. Labour effort is not modelled

**Where:** `seed.json` carries `recipes[].laborEffort`; nothing reads it.

The source `Labor` sheet maps an effort word to hours: `factor ÷ 0.6 × 3`.

| Effort | Factor | Hours |
|---|---:|---:|
| easy | 0.2 | 1 |
| Low | 0.4 | 2 |
| Medium | 0.6 | 3 |
| High | 0.8 | 4 |
| Extreme | 1.0 | 5 |

`laborEffort` is vestigial: not in `validate()`, not in the Excel export, not in `editRecipe()`, and a new recipe never gets one. Heidy thinks in effort levels; the app asks her for decimal hours.

**Fix:** add the effort table to `model.js` as an exported constant. In `editRecipe()`, offer an effort dropdown that sets `laborHours` (show the derived hours read-only next to it), with a "custom hours" escape. Persist `laborEffort` through `validate()`, `workbook()` (a column on the Recipes sheet) and `importCandidate()`.

**Must not:** change existing `laborHours` values. Cheese (WS) is 2 h and must stay 2 h.

---

#### F5. The Review column is unactionable

**Where:** `app.js` → `priceRows()`, and `calculate()`'s `warnings`

Every row currently reads the same "Check purchase dates" with no indication of which item is at fault. The cause is usually **one shared ingredient** — Salt, last priced 2023‑04‑23, is in all 11 recipes.

There are **zero `title` tooltips in the whole app** and the Review column is not mentioned in `START HERE.md`. The only explanation lives in a collapsed `<details>` on the recipe page, eight steps away.

The vocabulary also disagrees across three screens for one concept:

| Screen | Wording |
|---|---|
| Price list | "Check purchase dates" |
| Recipe detail | "old purchase price" |
| Settings | "Review purchase prices after (days)" |

**Fix:**
1. Name the offending item in the cell — `Salt priced 3 yrs ago` instead of `Check purchase dates`. The data is already in `c.warnings` at render time.
2. Make it a link that opens that ingredient's edit dialog.
3. Add `title` tooltips to all four Review states.
4. Pick one phrase and use it on all three screens.
5. Fix the `(${c.warnings.length} notices)` pluralisation — it reads "1 notices".

---

#### F6. `today()` is computed in UTC

**Where:** `app.js` line 2

```js
today = () => new Date().toISOString().slice(0,10)
```

In US Eastern, between 20:00 and midnight the app's "today" is already tomorrow. The date-input `max` and the "future purchase date" warning are both a day too permissive. Use a local-date formatter.

Same bug in `model.js` `calculate()` and `approveReceipt()`, which both call `new Date().toISOString().slice(0,10)`.

---

#### F7. Data fix — Vanilla Paste is dated 2029‑08‑31

**Where:** `seed.json`, and the live SQLite DB

Almost certainly a typo for 2019 or 2024. It is not cosmetic:

> `approveReceipt` only overwrites a master price when `r.date >= i.updated`. With a 2029 date, Heidy can scan and approve a Vanilla Paste receipt, get a success message, and the price **silently does not update** — it only files into history.

**Fix:** correct the date in `seed.json`. Separately, make `approveReceipt` warn loudly when it accepts a receipt but declines to update the master price because the stored date is newer — right now that outcome is invisible.

Related data anomalies in `seed.json` worth surfacing to Heidy, not silently fixing:
- `Unnamed item — source row 146`
- `Unidentified ingredient — Chestnut row 11` (blocks Chestnut entirely)
- 122 of 197 master items are past the 365-day staleness threshold

---

#### F8. Packaging section on the recipe tab — **already patched, needs verification**

`Resources/app.js` `recipeDetail()` has been changed to split the line table into labelled **Ingredients** and **Packaging** sections with subtotals, matching the spreadsheet's two-section layout. Two helpers (`lineRow`, `lineSection`) plus one CSS rule (`tr.section th`) in `style.css`.

This was verified logically but **never seen running**, because of the stray-copy problem in §0. Verify it (see T7) before touching it.

Two behaviours it must keep:
- a recipe with no packaging shows **no** Packaging header (not an empty `$0.00` band)
- a line whose ingredient is unresolvable (`d.item` is `undefined`) falls into the **Ingredients** group rather than vanishing — Chestnut is the live case, 11 rows in, 11 rows rendered

---

### P2 — packaging and distribution

---

#### F9. The distribution zip carries AppleDouble sidecars

**Where:** `build.sh`

```bash
ditto -c -k --keepParent "$APP_DIR" "$PROJECT_DIR/../Heidy Bakery Mac.zip"
```

`ditto -c -k` stores extended attributes as `._*` AppleDouble files. Finder and `ditto` merge them back on extract; **anything else** (`unzip`, scripted installs) leaves them as extra files inside `Contents/`, which breaks the code-signature seal.

**Fix:** add `--sequesterRsrc` so they go to `__MACOSX/`, which unzip skips.

#### F10. Sign and notarize

`codesign --force --sign -` is ad-hoc. Developer ID signing + `notarytool` removes the Gatekeeper prompt on Heidy's first launch **and** the path-randomisation class of bug in §0. An Apple developer account is already configured on this machine.

#### F11. Smaller items

- **Zero-line recipe → inverted range.** `workbook()` emits `Lines!L2:L1` for a recipe with no lines. The guarded `missing` check keeps the visible cell blank, but the `SUMIF`s read the previous recipe's rows.
- **Missing units.** `model.js` `units` has no `mg`, `qt`, `pt`, `gal`. A gallon of milk off a receipt needs manual conversion. Keep the mass↔volume refusal — that is correct.
- **Ingredients cannot be deleted.** 197 records, many unused; only recipes have Delete.
- **Unescaped IDs in attributes.** `data-receipt="${r.id}"` etc. skip `esc()` while `esc(h.receiptId)` nearby does not. CSP blocks the exploit path, so this is consistency, not an open hole. Same for the receipt preview's data URL in `src`.
- **Dead code.** `xml()` in `model.js` is never called or exported; the Swift side does its own escaping.
- **`save()` rollback doesn't re-render**, so the UI briefly shows rejected values.
- **Excel reimport replaces recipe lines wholesale.** A recipe row with no matching Lines rows silently empties that recipe. Documented and undoable, but a foot-gun.

---

## 3. Prompt for the coding agent

> You are working on **Heidy Bakery**, an offline macOS recipe-costing app at `~/devl/heidy`. It is a Swift + WKWebView shell (`HeidyBakery/Source/Main.swift`) around a vanilla-JS front end (`HeidyBakery/Resources/app.js`, `model.js`). `model.js` is the costing engine and also runs under Node, so it is directly unit-testable. Tests: `make test`. Build: `make build`.
>
> **Before you start:** the repo has zero git commits. Commit the current tree first, and add `HeidyBakery/Heidy Bakery.app/` and `Heidy Bakery Mac.zip` to `.gitignore` — both are build outputs.
>
> **Hard invariant.** `model.js` reconciles exactly against the source spreadsheets. The cost per piece for all 11 seeded recipes, and `null` for Chestnut, must not change. The golden values are in `HANDOFF.md` §1 and the existing `Tests/model.test.cjs` already asserts Vanilla at `2.532421872014937`. Extend that suite rather than replacing it — every fix below needs a test that would fail without it.
>
> **Implement, in order:**
>
> 1. **A zero purchase price must not silently cost $0.** `unitCost()` accepts `price: 0` because it tests `nonnegative`. Add a `freeConfirmed` flag to the ingredient record; when `price === 0 && !freeConfirmed`, emit a warning naming the item and surface it in the recipe's Review state. Add the checkbox to `editIngredient()`, matching the wording already in `editPurchase()`. Warning, not error — do not break existing data.
> 2. **Enforce referential integrity in `validate()`.** Reject a recipe line whose `ingredientId` matches no ingredient, duplicate line IDs across recipes, and an empty recipe `unit`. `validate()` is the trust boundary for backup restore and Excel import, and it runs on every save — confirm the seed and a full export→import round trip still pass.
> 3. **Fix the broken-reference export.** In `workbook()`, `s.ingredients.indexOf(undefined)` returns `-1`, so an unresolvable line emits formulas pointing at `Ingredients!B1` — the header row. Throw a clear error naming the recipe and line, or emit an explicit `UNRESOLVED` marker. Never emit a formula referencing row 1.
> 4. **Restore the labour-effort model.** The source spreadsheet maps effort to hours as `factor ÷ 0.6 × 3` — easy 1 h, Low 2, Medium 3, High 4, Extreme 5. `seed.json` already carries `laborEffort` per recipe but nothing reads it. Add the table to `model.js` as an exported constant; in `editRecipe()` offer an effort dropdown that sets `laborHours`, showing the derived hours, with a custom-hours escape; persist `laborEffort` through `validate()`, `workbook()` and `importCandidate()`. Existing `laborHours` values must not change — Cheese (WS) stays at 2 h.
> 5. **Make the Review column actionable.** Every row shows an identical "Check purchase dates" with no clue which item is stale — usually one shared ingredient (Salt, 2023-04-23, in all 11 recipes). Name the item in the cell, make it link to that ingredient's edit dialog, add `title` tooltips to all four Review states, use one consistent phrase across the Price list, recipe detail and Settings, and fix the "1 notices" pluralisation.
> 6. **Use local dates, not UTC.** `today()` in `app.js` and the two `new Date().toISOString().slice(0,10)` calls in `model.js` make the app's "today" a day early after 8 pm Eastern.
> 7. **Fix the Vanilla Paste date in `seed.json`** (currently 2029-08-31, three years in the future). Then make `approveReceipt` warn when it accepts a receipt but declines to update the master price because the stored date is newer — that outcome is silent today, so an approved receipt can appear to work and change nothing.
> 8. **Add `--sequesterRsrc`** to the `ditto` line in `build.sh`, so the distributed zip stops carrying `._*` files inside the app bundle.
>
> **Already applied, verify don't rewrite:** `recipeDetail()` now splits the line table into Ingredients / Packaging sections with subtotals. It must keep two behaviours: no Packaging header when a recipe has none, and an unresolvable line (Chestnut's) falls into Ingredients rather than disappearing.
>
> **Environment warning.** There were four copies of this app on the machine and LaunchServices was launching a stale one from `~/Documents/Codex/…`, making edits appear to do nothing. Those are renamed `*.app-DISABLED`. If a change doesn't show after `make build`, check `mdfind "kMDItemCFBundleIdentifier == 'com.heidybakery.local'"` and `ps -Ao pid,comm | grep -i heidybakery` before assuming your code is wrong. The app is ad-hoc signed, so a quarantined copy also runs from a frozen snapshot — `xattr -dr com.apple.quarantine <bundle>` clears that.
>
> Report what you changed, what tests you added, and anything you chose not to do.

---

## 4. Test plan

### 4.1 Regression gate — run first and last

```bash
cd ~/devl/heidy && make test && make selftest
```

`make test` must still print `Model checks passed: …`. `make selftest` exercises the native side (SQLite save/undo, Excel round trip, backup/restore with an original receipt) against an isolated `test_data` dir.

**R1 — golden costs.** Assert all 11 rows of the §1 table to 1e‑10, not just Vanilla. This is the single most valuable test in the suite; without it any of the fixes above can silently move a price.

**R2 — Chestnut stays blocked.** `calculate(state, chestnut).unit === null` and exactly one error.

**R3 — Excel round trip is lossless.** `workbook(state)` → feed the sheets to `importCandidate()` → the resulting candidate's costs equal the originals, and the change summary reports zero changes.

---

### 4.2 Per-fix tests

| # | Fix | Test | Passes when |
|---|---|---|---|
| **T1** | Zero price | Set a seeded ingredient's `price` to `0`, recalculate a recipe using it | A warning naming that item appears; cost is **not** silently reduced. With `freeConfirmed: true`, no warning |
| **T2a** | Integrity | Set a line's `ingredientId` to `'ghost'`, call `validate()` | Throws |
| **T2b** | Integrity | Copy recipe A's first line `id` onto recipe B's first line, `validate()` | Throws |
| **T2c** | Integrity | Set a recipe's `unit` to `''`, `validate()` | Throws |
| **T2d** | Integrity | `validate(seed)` and validate after a full export→import round trip | Both pass — regression guard |
| **T3** | Broken ref export | Set a line's `ingredientId` to `'ghost'`, call `workbook()` | Throws, or the Lines row carries `UNRESOLVED`. **No formula contains `Ingredients!B1`** |
| **T4a** | Labour effort | Map each of easy/Low/Medium/High/Extreme | 1, 2, 3, 4, 5 hours |
| **T4b** | Labour effort | Load the seed, read every recipe's `laborHours` | Unchanged; Cheese (WS) is 2 |
| **T4c** | Labour effort | Export → import round trip on a recipe with an effort set | `laborEffort` survives |
| **T5** | Review column | Load the seed, render the Price list | Vanilla's Review cell names **Salt**, not a generic phrase. Clicking it opens Salt's edit dialog |
| **T6** | Local dates | Stub the clock to 22:30 US Eastern on 6 Sep | `today()` returns `2026-09-06`, not `2026-09-07` |
| **T7a** | Vanilla Paste date | Read `seed.json` | Date is in the past |
| **T7b** | Silent no-update | Set an ingredient's `updated` to a future date, approve a receipt for it dated today | Approval reports that the master price was **not** updated; history still records the purchase |
| **T8** | Zip hygiene | `make build`, then `unzip -l "Heidy Bakery Mac.zip"` | No `._*` entries inside `Heidy Bakery.app/`. Extract with plain `unzip` and confirm `codesign --verify --deep` passes |

---

### 4.3 Manual UI checks

Do these on a **freshly built** bundle, after confirming with `ps` which copy is running.

- **T9 — Packaging section.** Recipes → Matcha & Hojicha. Two headed sections: **INGREDIENTS $14.78** over 10 rows, **PACKAGING $2.42** over FG7 and Ingredient Sticker. Subtotals match the Batch calculation pane below.
- **T10 — Empty packaging.** Create a recipe with only ingredient lines. No Packaging header appears.
- **T11 — Unresolvable row.** Recipes → Chestnut. The unidentified row is visible under Ingredients, cost `—`, and the error banner still shows. Count the rows: 11 in the model, 11 on screen.
- **T12 — Persistence.** Enter a retail price, quit, reopen. It is still there.
- **T13 — Copy isolation.** "Make a copy" of a recipe. Selling prices cleared on the copy; the original untouched.
- **T14 — Excel export.** Export, open in Excel or Numbers. Every recipe's cost per piece matches §1; Chestnut's row is blank, not zero.
- **T15 — Excel reimport.** Change one ingredient price in the exported workbook, save as values, reimport. The preview reports exactly one changed master item and the price list updates accordingly.
- **T16 — Receipts (still untested end to end).** Three real receipts through recognition → matching → quantity confirmation → approval. Confirm nothing is approved automatically and the "confirm this was free" guard fires on a $0 line. **This is the largest remaining unknown in the app.**

---

### 4.4 Not yet covered anywhere

Worth adding regardless of the fixes above: backup/restore round trip with a real receipt file, undo across 30+ saves, and the iPhone shortcut folder integration.
