# Handoff — regression in v0.2.0 `validate()`

Found while syncing the Codex tree into `~/devl/heidy`. **Reproduces in the Codex tree itself**, so it is not a merge artifact.

---

## P0 — `validate()` rejects the app's own seed data

`M.validate()` throws on `Resources/seed.json`:

```
Error: Invalid purchase history for Bread Flour Sir Galahad (11.7%)
    at Object.validate (Resources/model.js:54)
```

Verified in `~/Documents/Codex/2026-09-06/files-pasted-by-the-user-i/outputs/HeidyBakery`:

```bash
node -e 'const M=require("./Resources/model.js"),s=require("./Resources/seed.json");
         M.validate(Object.assign(M.empty(),JSON.parse(JSON.stringify(s))))'
# -> Invalid purchase history for Bread Flour Sir Galahad (11.7%)
```

### Cause

`model.js:54` added a purchase-history check:

```js
for(const h of i.history)
  if(!object(h)||!optionalNumber(h.price)||!optionalNumber(h.size)||!text(h.unit)||!receiptReference(h.receiptId))
    throw Error('Invalid purchase history for '+i.name);
```

`h.unit` is required to be a string. **All 25 historical rows in `seed.json` have no `unit` field at all** — they came from the "Historical/Secondary Data" columns of `cost master.xlsx`, where package size was never recorded:

```json
{"supplier":"Costco","price":11.49,"date":"2023-04-23",
 "note":"Original secondary/historical record; package size not specified"}
```

Every other predicate on that line passes. `unit` is the only failure, and it fails on **25 of 25** history rows.

### Why it matters

`validate()` runs on the app's load path (`app.js`: `state = result.state ? M.validate(result.state) : M.empty()`) and again on every `save()`. So once these history rows are in the database, **the app cannot open** — it renders "Could not open records" instead of the UI. It also breaks `make test`, which validates the seed on line 3.

This is a hard startup failure for anyone who imports the supplied spreadsheet data.

### Fix — pick one

**A. Relax the predicate (recommended).** A historical row with a price but no package size is legitimate data, not corruption. Introduce an optional-text predicate and use it for `h.unit`:

```js
const optionalText = v => v == null || typeof v === 'string';
// ...
if(!object(h) || !optionalNumber(h.price) || !optionalNumber(h.size)
   || !optionalText(h.unit) || !receiptReference(h.receiptId)) throw …
```

`calculate()` and `unitCost()` already ignore history rows, so a missing unit has no effect on any cost.

**B. Backfill the seed.** Add `"unit": ""` to all 25 rows in `seed.json`. Keeps the strict check, but `text('')` must then be accepted, and any older backup a user restores will still fail — so A is safer.

### Regression test to add

```js
// a historical row without a package unit must not break validation
const h = M.empty();
h.ingredients = [{id:'i1',name:'X',kind:'ingredient',supplier:'S',price:1,size:100,unit:'g',
                  updated:'2026-01-01',history:[{supplier:'S',price:5.29,date:'',note:'no size recorded'}]}];
M.validate(h);   // must not throw
```

---

## P1 — `receiptReference` may break backup restore

Same line: `receiptReference = v => v == null || (text(v) && receiptIds.has(v))`.

A history row whose `receiptId` points at a receipt that is no longer in `state.receipts` now throws. That is reachable on restore from an older backup, or if receipts are ever prunable. Consider degrading to a warning, or dropping the dangling reference to `null` on load, rather than refusing to open the file.

---

## Notes for whoever picks this up

- `~/devl/heidy` is a **read-only mirror** of the Codex tree — pull only, nothing is written back. Fix these in the Codex tree.
- Two files in the mirror are intentionally **not** from Codex and should not be copied back:
  - `HeidyBakery/Resources/seed.example.json` — synthetic fixture (invented suppliers and prices) so a clone can build without the private seed
  - `HeidyBakery/Tests/model.test.cjs` — carries a `REAL_DATA` guard so the golden-cost reconciliation is skipped when running on the example fixture
- If `model.test.cjs` is rewritten in the Codex tree, that guard is lost on the next pull and has to be re-applied. Adding it upstream would be better:

```js
const REAL_DATA = !/Synthetic example data/.test((seed.notes||[])[0]||'');
if (REAL_DATA) { /* 11 recipes, 197 ingredients, golden costs, Vanilla Paste date */ }
// and: if (REAL_DATA) assert.equal(real.recipes.find(r=>r.name==='Cheese (WS)').laborHours, 2);
```

- Golden costs are unchanged and must stay so: Vanilla `2.532421872014937`, Chestnut `null`. Full table in `HANDOFF.md` §1.
