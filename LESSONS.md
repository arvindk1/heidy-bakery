# Lessons

Findings worth not re-deriving. Newest first. Not a changelog — the changelog
is `git log`; this is the "why," for things that cost real debugging time or
nearly caused a mistake.

## 2026-09-10 — Root vs `HeidyBakery/`-level build entry points aren't equivalent

The root `Makefile`'s `seed:` target (a dependency of `test`/`build`/`selftest`)
auto-copies `seed.example.json` → `seed.json` if missing. Running `npm test` or
`bash build.sh` directly inside `HeidyBakery/` has no such fallback —
`Tests/model.test.cjs` throws on `require()` if `seed.json` doesn't exist yet.
On a fresh clone, use the root `Makefile` unless `seed.json` is already in
place.

## 2026-09-07 — Same-ingredient, different-pack-size receipt lines silently invited a blended unit cost

Two receipt lines for one ingredient at different pack sizes (real case: two
butter SKUs on one Costco run) had to be combined before approval, which
computes a blended unit cost rather than tracking them as distinct purchases.
This is still an open design question, not a fixed bug — see "Known open
items" in `CLAUDE.md`. Don't reach for "just combine them" as the permanent
answer; it was a stopgap.

## 2026-09-07 — `changeSavedProduct()` collapses total size into pack size on correction

In `model.js`, correcting a saved product record via `changeSavedProduct()`
sets `size = packSize`, which is only right when `packageCount === 1`. A
multi-pack correction (e.g., a 6-pack) silently loses the total-size
distinction. Flagged to Codex, not yet fixed as of 0.3.5 build 8.
