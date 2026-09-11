---
name: heidy-sync-guardrails
description: Enforced rules for working in the heidy-bakery repo mirror — read before touching files, especially anything under ~/Documents/Codex or Resources/seed.json.
---

# Sync guardrails — heidy-bakery

This repo (`~/devl/heidy`) is a **one-way mirror** of a separate Codex workspace.
These rules are non-negotiable, not house style — violating them causes real
damage (overwriting Codex's tree, or leaking Heidy's real supplier prices into
a public repo).

## Never write into the Codex directory

No edits, renames, moves, or deletes anywhere under `~/Documents/Codex/`. Sync
direction is Codex → `~/devl/heidy`, never the reverse. If a fix belongs in the
app's code, write a handoff doc (see `HANDOFF-*.md` at the repo root for the
pattern) instead of editing Codex's files directly.

## Claude reviews and syncs; Claude does not fix app bugs

Findings in `model.js`, `app.js`, or `Main.swift` go back to Codex as a
handoff, not a direct edit — even if the fix looks trivial. The one exception:
Codex is genuinely unavailable (e.g., out of usage credit) and Arvind has
explicitly said to take over build/test/sign directly. State that exception
out loud when it applies; never assume it.

## `Resources/seed.json` is never committed

It holds Heidy's real supplier names and prices. It's gitignored on purpose —
check `git status` before any commit touching `HeidyBakery/Resources/` to
confirm it isn't staged. `seed.example.json` (synthetic) is the one that's
tracked.

## Building/signing needs a real Mac

`swiftc`, `codesign`, `xcrun`, `security` aren't available in a Linux sandbox.
That combination can build/run JS-side tests at best — never a distributable
release. Don't attempt `build.sh --release` outside macOS.

## When in doubt

Say so before acting, per `INTENT.md`'s closing clause: flag the conflict,
don't silently resolve it either way.
