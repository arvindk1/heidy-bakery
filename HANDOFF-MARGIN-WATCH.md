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

## Bug found in review — already fixed, nothing further needed

I originally found that a history entry with no `date` sorted to the
*front* of the chronological comparison (empty string sorts before any
real date), so it could be picked as the "oldest" purchase regardless of
when it actually happened — confirmed with a synthetic case that inflated
a correct ~67% rise into a wrong 300%.

That's already fixed and tested in `~/devl/heidy`: `marginWatch()` now
filters out any history entry whose date doesn't pass the existing
`validDate()` check before it's eligible to anchor the "then" baseline —
stricter than a simple truthy check, since it also rejects a malformed
date string, not just a missing one. A regression test for exactly this
case (dated + undated entries on the same ingredient) is included in
`Tests/margin-watch.test.cjs` and passes. Nothing further to do here —
port it as-is.

## Files changed (all in `~/devl/heidy`, for you to port)

- `HeidyBakery/Resources/model.js` — new `marginWatch(state, now)` function
  (~80 lines, including the date-validation fix above), exported alongside
  the existing `calculate`/`validate`/etc. exports.
- `HeidyBakery/Resources/app.js` — new `marginWatchPage()` render function
  (~110 lines) wired into the existing tab-router object, plus a
  `'margin-watch': marginWatchPage` entry.
- `HeidyBakery/Resources/index.html` — one new `<button data-tab="margin-watch">`
  in the nav bar.
- `HeidyBakery/Tests/margin-watch.test.cjs` — new file, full test suite
  including the undated-history regression case, all passing.
- `HeidyBakery/build.sh`, root `Makefile`, `package.json` — one line each,
  wiring `margin-watch.test.cjs` into the existing test/build commands
  alongside `model.test.cjs` and `regression.test.cjs`.

Get the full diff directly (spans two commits — the feature, then the
date-validation fix bundled with this handoff doc):

```bash
cd ~/devl/heidy
git show 0bde6f3   # Implement Margin Watch feature
git show f348061   # date-validation fix + regression test
```

(branch `main`)

## What "absorb" means here

Port the same changes into your own tree at the path above — same function,
same UI, same test file, fix already included. Once it's in your tree and
passing your own test run, the normal one-way pull flow resumes: devl pulls
from you again, not the other way around.

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
