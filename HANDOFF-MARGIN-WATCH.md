# Handoff — absorb Margin Watch feature into Codex's tree

## What happened

Antigravity (a different coding agent) implemented the Margin Watch feature
specified in `FEATURE-MARGIN-WATCH.md`, directly in `~/devl/heidy` — not in
your tree. That's the reverse of the normal flow (devl is usually a
pull-only mirror of your tree). This is a one-time exception: the feature
was built and independently code-reviewed here first, and is now handed to
you to port into your own tree at
`~/Documents/Codex/2026-09-06/files-pasted-by-the-user-i/outputs/HeidyBakery`
so you stay the source of truth going forward. Do not treat `~/devl/heidy`
as a source to pull from generally — this handoff is the one exception.

## Independent review already done

I read every changed line, wrote my own additional tests beyond the ones
Antigravity wrote, and ran everything myself rather than trusting their
summary. Verdict: the implementation is correct and safe, with one small
defensive fix needed (below). Specifically verified:

- Unit-conversion math is correct in both directions — checked a round-number
  case (g/kg) and a non-round case (tsp/cup, 48:1 ratio) by hand; both matched
  the function's output exactly.
- Mass-vs-volume unit mismatches are correctly excluded (`factor()` returns
  `null`, entry is skipped) rather than producing a bogus number.
- No regressions: `Tests/model.test.cjs` (all 11 golden costs) and
  `Tests/regression.test.cjs` pass unchanged.
- `Tests/margin-watch.test.cjs` (T1–T8, matching the spec's test plan) passes,
  and I independently re-verified the hand-calculated expected values in T1,
  T4, and T5 are actually right, not just internally consistent.
- Code reuses existing conventions correctly: `$$`, `money()`, `pct()`,
  `esc()` helpers, the same `data-review-item`/`data-open-recipe` click-handler
  pattern already used on the Price list, and existing `.good`/`.bad` CSS
  classes — no new CSS needed.
- `marginWatch()` is read-only — does not mutate `state`.

## Defensive fix applied (included in commit)

**Where:** `model.js`, inside `marginWatch()`, the history-sorting step.

*Status:* **Fixed & tested in `~/devl/heidy`** (test included in `Tests/margin-watch.test.cjs`).

```js
validHistory.sort((a, b) => {
  const da = a.entry.date || '';
  const db = b.entry.date || '';
  return da.localeCompare(db);
});
```

A history entry with no `date` sorts to the *front* (empty string sorts
before any real date string), so it gets treated as the oldest purchase
regardless of when it actually happened. I confirmed this produces wrong
output: a synthetic case with a correctly-dated $12/kg entry and an undated
$5 entry picked the $5 entry as "then", inflating the computed rise from a
correct ~67% to a wrong 300%.

**Current real-world impact: none yet.** I checked `seed.json` — 3 of 25
history entries have no date, but none of them currently co-occur with a
second unit-tagged entry on the same ingredient, so `marginWatch()` doesn't
misfire on what ships today. It will misfire once Heidy has two or more
receipt-approved purchases on an ingredient that also carries one of these
undated legacy rows — which is a matter of time, not a hypothetical.

**Fix:** exclude undated entries when building `validHistory` — an entry
with no date can't be reliably placed in chronological order, so it
shouldn't be eligible to anchor the "then" baseline at all:

```js
for (const h of i.history) {
  const u = unitCost(h);
  if (u === null) continue;
  if (!h.date) continue;                 // <-- add this
  const f = factor(i.unit, h.unit);
  if (f === null) continue;
  validHistory.push({ entry: h, cost: u * f });
}
```

Add a regression test for it (not in the original T1–T8 set): an ingredient
with one dated history entry and one undated history entry must use the
dated one as `then`, not whichever sorts first as a string.

## Files changed (all in `~/devl/heidy`, for you to port)

- `HeidyBakery/Resources/model.js` — new `marginWatch(state, now)` function
  (~75 lines), exported alongside the existing `calculate`/`validate`/etc.
  exports. Full diff below.
- `HeidyBakery/Resources/app.js` — new `marginWatchPage()` render function
  (~110 lines) wired into the existing tab-router object, plus a
  `'margin-watch': marginWatchPage` entry.
- `HeidyBakery/Resources/index.html` — one new `<button data-tab="margin-watch">`
  in the nav bar.
- `HeidyBakery/Tests/margin-watch.test.cjs` — new file, T1–T8 test suite
  (apply the undated-history fix above and add the T9 test alongside it).
- `HeidyBakery/build.sh`, root `Makefile`, `package.json` — one line each,
  wiring `margin-watch.test.cjs` into the existing test/build commands
  alongside `model.test.cjs` and `regression.test.cjs`.

Get the full diff directly:

```bash
cd ~/devl/heidy
git show 0bde6f3
```

(commit `0bde6f3`, "Implement Margin Watch feature", on branch `main`)

## What "absorb" means here

Port the same changes into your own tree at the path above — same function,
same UI, same test file — applying the one fix described above while you're
already touching this code. Once it's in your tree and passing your own test
run, the normal one-way pull flow resumes: devl pulls from you again, not
the other way around.

## Test plan

```bash
cd ~/Documents/Codex/2026-09-06/files-pasted-by-the-user-i/outputs/HeidyBakery
node Tests/model.test.cjs        # golden costs must still pass unchanged
node Tests/regression.test.cjs
node Tests/margin-watch.test.cjs # T1-T8 plus the new undated-history test
```

Manual check once built: open the app, click the new "Margin Watch" tab,
confirm it renders (either the ranked tables or the empty state, depending
on current seed data) without a console error.
