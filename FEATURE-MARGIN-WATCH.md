# Feature handoff — Margin Watch

## Objective

Heidy's stated concern: when an ingredient's price rises and she hasn't
revised her selling price, she has no way to notice the margin erosion
until it's already cost her money. The app already tracks everything
needed to answer this — this feature surfaces it proactively instead of
requiring her to notice a per-recipe badge.

**Constraint: 100% local, no new inputs.** Everything below is computed
from data already captured (`ingredient.history[]`, `recipe.costBaseline`,
existing settings) — no new fields to fill in, no new data collection, no
network access. Same offline philosophy as the rest of the app.

## What already exists (do not duplicate)

- `recipe.costBaseline` — set opportunistically in `app.js` (`save()`) and
  `model.js` (`approveReceipt()`) whenever a recipe's cost per piece rises
  above its last-reviewed value. Cleared when the user clicks "Mark cost
  change as reviewed" (`app.js` ~line 370).
- The Price list's "Cost up X%" badge (`app.js` ~line 242) — fires per
  recipe when `costBaseline` is set and the rise exceeds `settings.alertPercent`.
- Ingredient staleness reminders ("Salt priced 3 yrs ago").

All of the above are reactive and per-row. Margin Watch is a ranked,
aggregate view on top of the same underlying signal.

## Feature spec

### A. Ingredient price trend (ranked)

For every ingredient with at least one `history[]` entry:

```js
const unitCostOf = (price, size) => (price && size) ? price / size : null;
// oldest known price point: history[0] if sorted chronologically, else min by date
const then = unitCostOf(oldestHistory.price, oldestHistory.size);
const now = unitCostOf(ingredient.price, ingredient.size);
const deltaPercent = then && now ? 100 * (now / then - 1) : null;
const deltaDollarsPerUnit = then && now ? now - then : null;
```

Compare **per-source-unit cost** (`price / size`), not raw package price —
package sizes vary between purchases, so raw price is misleading. This is
the same normalization `unitCost()` already uses in `model.js`; reuse it
rather than reimplementing.

Rank descending by `deltaPercent` (or `deltaDollarsPerUnit`, exposed as a
sort toggle if easy — not required for v1). Show the top N (suggest 10, or
all if fewer). Skip ingredients with only one price point ever recorded
(no `then` to compare against) and ingredients whose price hasn't moved.

### B. Recipe margin drift (ranked)

Scope: only recipes that currently have `costBaseline` set (i.e. the same
population already flagged by the existing "Cost up X%" badge — this is
intentionally the minimal-scope version, no new tracking field).

```js
const marginNow = r.retail ? 100 * (r.retail - costNow) / r.retail : null;
const marginBaseline = r.retail ? 100 * (r.retail - r.costBaseline) / r.retail : null;
const marginDropPoints = marginBaseline - marginNow;       // percentage points lost
const dollarsPerPiece = costNow - r.costBaseline;           // $ lost per piece sold
```

Use the recipe's *current* retail price for both calculations (retail
hasn't changed — this isolates cost-driven erosion from her own pricing
decisions). Same for bulk, if `r.bulk` is set.

Rank descending by `dollarsPerPiece` — dollar impact reads more clearly
than percentage points for a bakery owner deciding what to reprice first.

### C. UI

New pane, either its own top-level tab ("Margin Watch") or a card added to
the Price list — your call, but a dedicated tab is more discoverable than
another card competing with the existing Settings panes. Two ranked
lists side by side or stacked:

- **Ingredients rising fastest** — name, then→now unit cost, % and $ delta.
  Each row links to that ingredient's edit dialog (reuse the existing
  `data-review-item` pattern already used elsewhere).
- **Recipes losing the most margin** — name, margin now vs. margin when
  last reviewed, $ lost per piece. Each row links to that recipe.

Empty state: if no ingredient has ≥2 history points yet (real seed data
today: 21 of 197 ingredients have any history, max 2 entries), show a
short explanation that this view fills in as receipts get scanned and
approved — not an error state, an expectation-setting one.

## Test plan (Node-testable, add to `Tests/model.test.cjs` or a new file)

| # | Case | Expects |
|---|---|---|
| T1 | Ingredient with 2 history entries, price rose | `deltaPercent` and `deltaDollarsPerUnit` both positive, magnitude matches hand-computed value |
| T2 | Ingredient with 2 history entries, price fell | Both deltas negative |
| T3 | Ingredient with 0 or 1 history entries | Excluded from the ranked list, not a crash |
| T4 | Ingredient history entries with different `unit` values (e.g. one in `g`, one in `kg`) | Compared on a common basis via existing `factor()`, not raw numbers |
| T5 | Recipe with `costBaseline` set | `marginDropPoints` and `dollarsPerPiece` match hand-computed values from `retail`, `costBaseline`, and current `calculate().unit` |
| T6 | Recipe with no `costBaseline` | Excluded from the ranked list |
| T7 | Recipe with `retail` unset (null) | Excluded rather than dividing by null/zero |
| T8 | Full real seed data | Both lists render without throwing; spot-check one known ingredient's numbers by hand |

Regression guard: none of this reads or writes `calculate()`'s cost
numbers — it's a read-only view over existing state — so the golden-cost
table in `Tests/model.test.cjs` should not be affected by this change at
all. Confirm `make test` still passes unmodified after implementing.

## Notes for whoever picks this up

- `~/devl/heidy` is a **pull-only mirror** — implement in the Codex tree,
  not here.
- No schema/`validate()` changes needed — this reads existing fields only.
- See `.sync-exclude.md` for files intentionally not mirrored.
