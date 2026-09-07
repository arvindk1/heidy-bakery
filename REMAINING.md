# Heidy Bakery — remaining items

Supersedes `HANDOFF.md` and `HANDOFF-BUGS.md`. Both are retired: 11 of the
13 findings across those two documents are now fixed and verified directly
against the current code (v0.3.0) — validate() referential integrity, the
zero-price warning, the Excel export's broken-reference handling, the
labour-effort model, the actionable Review column, local (not UTC) dates,
the Vanilla Paste date fix with a silent-no-update warning, the packaging
section UI, and the zip's AppleDouble hygiene are all in place and covered
by `Tests/model.test.cjs` / `Tests/regression.test.cjs`.

Two items are still open.

---

## 1. Code signing / notarization

**Where:** `build.sh`

```bash
codesign --force --sign - "$STAGED_APP"
```

Still ad-hoc signed, not Developer ID signed or notarized. Low urgency —
this app never leaves Heidy's Mac — but an ad-hoc-signed, quarantined copy
(e.g. if it's ever re-downloaded or moved through AirDrop/a share link)
will trip Gatekeeper and can run from a randomized read-only snapshot,
which is the same class of "my edit didn't show up" bug documented in the
build history. Developer ID signing + `notarytool` removes both problems.
An Apple developer account is already configured on this machine.

## 2. Ingredients cannot be deleted

**Where:** `Resources/app.js` — Ingredients tab has no delete/remove/archive
action; only Recipes have Delete.

197 ingredient records exist; likely a growing number are unused as
recipes are edited over time. Consider either a hard delete (blocked while
any recipe line references the ingredient — same referential-integrity
rule `validate()` already enforces) or an archive/hide flag so old records
stop cluttering the ingredient list and the price-staleness alerts without
losing their purchase history.

---

## Reference — golden costs (must never silently change)

Enforced by `Tests/model.test.cjs`; kept here for quick reference only.

| Recipe | Cost / piece |
|---|---:|
| Vanilla / Vanilla (WS) | 2.532421872014937 |
| Matcha & Hojicha / (WS) | 2.575297036124378 |
| Banana Chocolate / (WS) | 2.6687716836651507 |
| Cheese | 2.376261962026594 |
| Cheese (WS) | 3.876261962026594 |
| Lemon Tea | 4.457383019758672 |
| Peach Tea | 4.881724196229261 |
| Chestnut | null (blocked — unidentified ingredient) |

## Notes for whoever picks this up

- `~/devl/heidy` is a **pull-only mirror** of Codex's tree at
  `~/Documents/Codex/2026-09-06/files-pasted-by-the-user-i/outputs/HeidyBakery`.
  Fix these in the Codex tree; nothing is written back from here.
- `Resources/seed.example.json` and the `REAL_DATA` guard in
  `Tests/model.test.cjs` are devl-only additions — already adopted
  upstream by Codex, so they travel with normal pulls now.
- See `.sync-exclude.md` for files deliberately not mirrored from Codex's
  tree.
