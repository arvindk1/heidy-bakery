# Heidy Bakery — project instructions

A macOS costing app ("Heidy Bakery," marketed as **The Little Dot**) built for Arvind's
friend Heidy, who owns a bakery. It replaces her Excel-based recipe costing with a
native Swift + WKWebView app: offline, no telemetry, no external services. It scans
receipts on-device (Vision + PDFKit), tracks ingredient purchase history, and costs
recipes from ingredients + packaging + labor. **The app is becoming Heidy's source of
truth for pricing** — the spreadsheets were the initial import, not a system to keep
in sync going forward.

State as of 2026-09-10: shipped **0.3.5, build 8** — signed, notarized, stapled
(Apple submission `74fda170-659b-46fc-8a70-de0793f73e20`, Accepted).

## Read this first — the working agreement

This repo (`~/devl/heidy`) is **a one-way mirror**, not the primary development
location.

- **Codex owns the code.** The actual development happens in a separate coding-agent
  workspace under `~/Documents/Codex/<date>/files-pasted-by-the-user-here/outputs/HeidyBakery`.
  Check `.sync-exclude.md` for the current dated path — Codex creates a new dated
  folder periodically and old ones go stale.
- **Never write into the Codex directory.** No edits, renames, moves, or deletes
  under `~/Documents/Codex/`. Sync is pull-only: Codex → `~/devl/heidy`, never the
  reverse.
- **Claude does not fix bugs in the app's code.** Findings go back to Codex as a
  handoff doc (see the `HANDOFF-*.md` files at the repo root for the pattern) —
  Codex implements, Claude reviews and syncs. The one exception: if Codex is
  genuinely unavailable (e.g. out of usage credit), Arvind may explicitly ask
  Claude to take over build/test/sign directly in the mirror. Say so plainly if
  that's what's happening; don't do it by default.
- **Building, signing, and notarizing require a real Mac.** `swiftc`, `codesign`,
  `xcrun`, and `security` aren't available if you're running in a Linux sandbox —
  that combination can only build a local test binary at best (JS-side tests only),
  never a distributable release.
- **`HeidyBakery/Resources/seed.json` is never committed.** It holds Heidy's real
  supplier names and prices, gitignored on purpose. `seed.example.json` is a
  synthetic stand-in that *is* committed.

## Repo layout

```
~/devl/heidy/                  this repo (git remote: arvindk1/heidy-bakery on GitHub)
├── HeidyBakery/                the actual buildable Mac app
│   ├── Source/Main.swift       native shell: WKWebView host, SQLite storage, Vision OCR,
│   │                           Excel import/export, JavaScriptCore bridge to model.js
│   ├── Resources/
│   │   ├── model.js            pure domain logic — costing math, receipt parsing,
│   │   │                       product-record store, validation. No DOM, runs in both
│   │   │                       the browser (tests) and JavaScriptCore (native).
│   │   ├── app.js               UI logic (DOM), runs inside the WKWebView
│   │   ├── index.html, style.css
│   │   ├── seed.json            [gitignored] Heidy's real starter data
│   │   └── seed.example.json    [committed] synthetic stand-in
│   ├── Tests/                   *.test.cjs (Node, no deps) + *-ui.test.cjs (Playwright/Chrome)
│   ├── build.sh                 --local or --release; release requires
│   │                            HEIDY_SIGN_IDENTITY + HEIDY_NOTARY_PROFILE in the
│   │                            environment/Keychain
│   ├── AGENTS.md, RELEASE.md    Codex's own build/signing notes — read these too
│   └── package.json             npm test / npm run test:ui / npm run build
├── Makefile                     root-level convenience wrapper (see below)
├── docs/                        ARCHITECTURE.md, DATA_SCHEMA.md, DEVELOPER_GUIDE.md,
│                                 USER_MANUAL.md, RECEIPT_WORKFLOW.md, etc.
├── HANDOFF-*.md                 point-in-time handoffs written for Codex
├── .sync-exclude.md             current Codex source path + files deliberately not pulled
└── _backup-pre-pull-*/          timestamped snapshots taken before each sync (gitignored)
```

## Build & test

Two entry points exist and they are **not equivalent** — pick based on whether you
need the synthetic-seed fallback:

**Root `Makefile`** (has a seed fallback — safe on a fresh clone without `seed.json`):
```bash
make test       # JS domain-model tests only (model, regression, margin-watch, contrast)
make selftest   # native Swift self-test (SQLite, Excel round-trip, backup/restore)
make build      # full build.sh --local via the seed-aware path
make run        # open the built app
```

**Inside `HeidyBakery/`** (no fallback — `Resources/seed.json` must already exist,
or the very first test (`Tests/model.test.cjs`) throws on `require()`):
```bash
npm test              # 9 suites incl. saved-products, receipt-parsing, golden recipe costs
npm run test:ui       # Playwright/Chrome UI regression — needs Chrome installed
bash build.sh --local     # local test build, ad-hoc signed
bash build.sh --release   # full release: needs HEIDY_SIGN_IDENTITY, HEIDY_NOTARY_PROFILE
                           # in env, and the identity present in Keychain
```

If `Resources/seed.json` is missing and you're working inside `HeidyBakery/` directly,
copy the synthetic seed first: `cp Resources/seed.example.json Resources/seed.json`.

**The 11 golden recipe costs** (asserted bit-identical in `Tests/model.test.cjs`) are
the primary regression guard against `seed.json`/`seed.example.json` — but note they
run against the *seed*, not Heidy's live library in Application Support. They will
never catch a costing bug that only shows up after she's approved real receipts.

## Architecture in one paragraph

`model.js` is the single source of costing truth — pure functions, no side effects,
loaded twice: once by Node for the test suites, once by `Main.swift` via
`JavaScriptCore` for the running app (`normalizeState`/`validate` are called on every
load/undo/restore). `app.js` is DOM glue calling into `model.js` and talking to Swift
over `WKScriptMessageHandler` (`window.webkit.messageHandlers`). Receipts import as
photos/PDFs → Vision OCR → text → `model.js` parses lines, matches ingredients, and
(as of 0.3.5) builds durable "saved product records" keyed by retailer + product code
so a confirmed pack size/brand is remembered across receipts. Nothing in the app makes
network calls — enrichment is deterministic parsing plus explicit human confirmation,
never a lookup.

## Known open items (as of the 0.3.5 sync)

Not blocking, but worth a look before they compound:

- `changeSavedProduct()` in `model.js` sets `size = packSize` when correcting a
  saved product, collapsing total and per-pack size (assumes `packageCount === 1`).
- `model.js:505` silently `delete`s a line's `costing` when it no longer applies —
  no message shown to the user.
- `validate()` hard-fails if a saved product record's `ingredientId` doesn't resolve,
  including forgotten records — latent until an ingredient-delete path exists, then
  it makes the whole library unopenable.
- Design decision still open: two receipt lines for one ingredient at *different*
  pack sizes currently must be combined before approval, which invents a blended
  unit cost. Real case (two butter SKUs). Needs an explicit design, not a quick fix.
- The golden-cost regression test only covers the frozen seed, not Heidy's live
  data — worth adding an invariant test instead (snapshot recipe costs before/after
  approving a receipt, assert only the touched ingredients' costs changed).
- Heidy's live library (SQLite in Application Support) has no offsite backup beyond
  manual "Save a full backup" — now that the app is becoming the real source of
  truth for pricing, this is a bigger risk than anything in the code.

## Where to look for more

- `HeidyBakery/AGENTS.md` — Codex's own signing/testing notes
- `HeidyBakery/RELEASE.md` — the release process in detail
- `docs/DEVELOPER_GUIDE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_SCHEMA.md`
- `docs/RECEIPT_WORKFLOW.md` — how receipt → ingredient matching is supposed to work
- Root `HANDOFF-*.md` files — recent point-in-time findings sent to Codex; read the
  newest one first, they supersede each other
