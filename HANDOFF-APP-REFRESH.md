# Handoff: App Refresh (Visual + Navigation) + Brand Assets

Status: **Implemented and pulled.** Codex's own build of the refresh plan is
now in this tree (pulled from Codex's output directory into
`HeidyBakery/`), all four test suites pass (`model`, `regression`,
`margin-watch`, `refresh-contrast`), and the user has manually verified the
running app works. One concrete gap remains — the app icon isn't wired in
yet (§4).

Full plan: [`APP-REFRESH-PLAN.md`](./APP-REFRESH-PLAN.md). Verification
notes from an earlier, separately-built implementation of this same plan:
[`docs/REFRESH-VERIFICATION.md`](./docs/REFRESH-VERIFICATION.md) — read the
note at the top of that file; some specifics there (navigation order, icon
wiring) don't match what Codex actually shipped.

---

## 1. Plan feedback (from before implementation — still relevant)

- **Contrast targets were qualitative** in the original plan. Codex's
  shipped palette was checked quantitatively against WCAG AA (4.5:1 body
  text, 3:1 UI components/borders) in both light and dark mode via
  `HeidyBakery/Tests/refresh-contrast.test.cjs` — 20 pairings, all pass.
- **Window-size breakpoints**: Codex's actual implementation uses 760px,
  1,100px, and 1,440px thresholds (per an earlier verification pass's
  layout matrix — worth confirming these are the same thresholds Codex's
  current CSS uses if that matters later).

## 2. What Codex actually shipped vs. the plan

- **Navigation order differs from the plan.** The plan specified Price
  list → Recipes → Ingredients → Receipts → Margin Watch → Settings.
  Codex's shipped `index.html` orders it Price list → **Margin Watch** →
  Receipts → Ingredients → Recipes → Settings. Functionally complete either
  way (all six destinations present, Settings last), but if the plan's
  order was intentional, this needs a follow-up. Not fixed here — flagging
  it since it's the one clear deviation.
- **`Resources/model.js` is unchanged** — confirmed by diff. The costing
  engine, invariants, and Margin Watch calculations are untouched by the
  refresh, as required.
- Cross-screen links (`data-open-recipe`, `data-review-item`) are intact.

## 3. Confirmed brand palette (unchanged from original handoff)

Sampled directly from pixel data in the flat source logo (`IMG_1390.jpg`,
now at `docs/brand-reference/IMG_1390.jpg`), not the 3D-rendered icon —
glossy shading in the rendered icon skews hues lighter/warmer under
highlight, so it isn't a reliable palette source.

| Role | Hex | Notes |
|---|---|---|
| Deep caramel | `#A08050` | Dark downward-triangle mark |
| Warm tan | `#A89068` | Middle triangle mark |
| Olive / sage | `#B0B078` | The "D" mark |
| Pale sage dot | `#D8D8A8` | Too light for text/icon use at AA contrast on a light canvas — status-accent only |
| Wordmark brown | `#908060` | Close to deep caramel; likely redundant as a second accent |
| Warm porcelain canvas | `#FAF6EE` | Not sampled from the logo — matches the plan's "warm porcelain canvas" description |

Codex's shipped palette (`--paper`, `--wash`, `--ink`, `--brand`, `--bad`,
`--green`, light and dark) is close in spirit to this table without using
these exact hex values or variable names — both palettes pass AA
independently; no reconciliation needed unless brand-hex-exactness matters.

## 4. Remaining gap: the app icon isn't wired in

`HeidyBakery/Resources/AppIcon.icns` exists (corrected version, real
alpha transparency — verified by direct pixel inspection, no opaque
background) but:

- `HeidyBakery/Info.plist` has **no `CFBundleIconFile` key**.
- `HeidyBakery/build.sh` has **no icon-copying step** (`grep -i icon` on it
  returns nothing).

This app is a shell-built Cocoa bundle, not an Xcode project with an asset
catalog — so wiring the icon in means: copy `AppIcon.icns` into
`Contents/Resources/` during `build.sh`, and add `CFBundleIconFile` to
`Info.plist` pointing at it. Until this is done, a fresh build will use the
default generic app icon rather than the little dot mark.

## 5. Brand asset locations (moved since the original handoff)

| File | Status | Location now |
|---|---|---|
| `AppIcon.icns` | Usable now | `HeidyBakery/Resources/AppIcon.icns` (needs wiring per §4) |
| `AppIcon-transparent.png`, `AppIcon.iconset/` | Usable now | `assets/brand/` |
| `AppLogo-DockIcon.jpg`, `AppLogo-BrandMockup.jpg`, `IMG_1390.jpg` | Reference/marketing only, not the app icon | `docs/brand-reference/` |
| `AppIcon.png` (opaque, no transparency) | Do not use | `docs/brand-reference/superseded/AppIcon-opaque-do-not-use.png` |
| `build-icns.sh` | Tooling reference | Repo root |

## 6. What's left to do

1. Fix the icon wiring in §4 (`build.sh` + `Info.plist`).
2. Decide on the navigation-order deviation in §2 — keep Codex's order or
   correct it to match the plan.
3. Re-run `make test` after any change — all four suites must stay green.

---

## 7. Update — pulled newer Codex output (2026-09-08)

Pulled `~/Documents/Codex/2026-09-07/files-pasted-by-the-user-here/outputs/HeidyBakery`
into this tree (files changed: `Info.plist`, `Makefile`, `build.sh`,
`Resources/app.js`, `Resources/index.html`, `Resources/style.css`,
`Source/Main.swift`, `Tests/refresh-contrast.test.cjs`,
`Tests/ui-regression.cjs`; added `Tests/excel-ui.test.cjs`). `model.js`,
`seed.json`, and `AppIcon.icns` were byte-identical to what was already here,
so untouched. A dated backup of the previously-pulled files was made at
`_backup-pre-pull-<timestamp>/` before overwriting.

Both open items from §6 are resolved in this pull:

- **Icon wiring (§4) is done.** `Info.plist` now sets
  `CFBundleIconFile` to `AppIcon` (no extension — correct for `.icns`), and
  `build.sh`'s `cp -R "$PROJECT_DIR/Resources/." "$STAGED_APP/Contents/Resources/"`
  copies `AppIcon.icns` into the bundle. Confirmed present in the rebuilt
  `.app` at `Contents/Resources/AppIcon.icns`.
- **Navigation order (§2) now matches the plan.** Tab order is
  `prices, recipes, ingredients, receipts, margin-watch, settings` — the
  order `ui-regression.cjs`'s `expectedTabs` now asserts.

This pull also carries a second visual pass beyond the original refresh:
full rebrand to "the little dot — tea & bakery" (window title, header,
`<title>`, `CFBundleDisplayName`), nav icons, a collapsible nav
(`#nav-toggle`), a cross-screen `#back-view` control with filter/scroll/focus
restoration, an unsaved-settings-draft guard that survives navigation and
save failure, a second entry point for Excel import (`Import from Excel` on
the Recipes screen, calling the same `importExcel()`), and materially
clearer Excel-import error text on both the JS side (`app.js`) and the
native side (`Main.swift`: unreadable-file and unsupported-layout messages
now say plainly that no records changed and where to get a valid template).

**Verified in this Linux-VM bridge (JS-only, no native binary or browser):**
`node Tests/model.test.cjs`, `regression.test.cjs`, `margin-watch.test.cjs`,
and the rewritten `refresh-contrast.test.cjs` (now 44 pairings, covering the
new `--muted`/`--control`/`--focus`/`--on-brand` tokens) — all pass.

**Not verified here — needs the actual Mac:** `Tests/ui-regression.cjs` and
the new `Tests/excel-ui.test.cjs` need a real Chrome (via Playwright) and,
for `excel-ui.test.cjs`, the compiled `Heidy Bakery.app` binary to do native
XLSX read/write — this Linux VM has neither (no Chrome install, and the
compiled binary is a macOS Mach-O executable — `Exec format error` here).
Same for `Tests/excel.test.py`, which recalculates exported workbooks via
LibreOffice against the native binary. Run `bash build.sh` on the Mac
itself (it runs all four `make test` suites plus the native `--self-test`,
then codesigns and rebuilds `Heidy Bakery.app`) to get full native
verification before treating this pull as fully proven.
