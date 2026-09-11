# Intent

This document is the "why." `CLAUDE.md` and the `docs/` folder are the "how" and
change with every sync; this one should barely change at all. When a feature
request, a Codex handoff, or a Claude review conflicts with something here, that's
a signal to stop and flag it explicitly — not to quietly resolve it either way.

## Mission

Give Heidy one honest number: what a recipe actually costs to make, right now, from
what she actually paid for it. Everything else in this app exists to protect that
number or to reduce the typing required to keep it current.

## Who this is for

One person: Heidy, a boutique bakery owner-operator. Not a market of bakeries, not a
multi-tenant product, not a platform. Every design decision gets easier once you
remember there is exactly one non-technical user, she is not going to read an error
stack, and she needs to trust this app with real pricing decisions without
understanding how it works internally.

Arvind is the developer and maintainer, not the user. If a design choice makes
Arvind's life easier at the cost of Heidy's trust or clarity, that's the wrong choice.

## The problem this replaces

Heidy priced her menu by hand in two spreadsheets (`Cloud Chiffon Series.xlsx` for
recipes, `cost master.xlsx` for ingredient/packaging/labor costs). That worked, but
every price change meant manually re-typing numbers, and nothing connected a Costco
receipt to what it should update. The alternative was an off-the-shelf SaaS bakery
ERP — hundreds of dollars a month for a small operation, with her supplier list and
pricing living on someone else's servers. This app exists so she gets the automation
without the subscription or the data leaving her machine.

## Non-negotiables

These have each survived an explicit design argument in this project's history.
Don't relitigate them without a reason at least as strong as the original one.

- **Offline and sovereign.** No external servers, no accounts, no telemetry, no
  network calls from the running app — full stop, not "unless it's convenient."
  A runtime product-lookup API was researched, found technically real and cheap,
  and rejected anyway: the value only covers one-time cold-start typing, and that
  isn't worth a network dependency, API keys, or a silent-breakage surface in an
  app whose entire pitch to Heidy is that it doesn't phone home. If "smart" and
  "offline" ever conflict again, offline wins.
- **Not agentic.** No LLM in the loop inside the app. Receipt and product
  enrichment must be deterministic, structured, and traceable to a rule you could
  explain to Heidy in one sentence — never "the model guessed."
- **Nothing is trusted silently.** Parsing a receipt, matching a product code, or
  reading a pasted description all produce a *proposal*, never an applied fact.
  A human confirms before it's learned, and confirmation is explicit (a checkbox,
  a click) — not implied by not-cancelling. This is why paste-parsing returns
  `null` rather than guess, why a corrected product needs a fresh confirmation,
  and why an ambiguous alias can't supply a trusted pack size.
- **Her data stays hers.** `seed.json` — real suppliers, real prices — never leaves
  her machine and never gets committed to the shared repo. Anyone extending this
  app should assume the same about anything derived from it.
- **Correctness over cleverness at every layer.** The 11 golden recipe costs exist
  so that no refactor, however well-intentioned, silently changes what she pays
  for a batch. `validate()` gates every load. Tests are written to fail loudly
  rather than degrade quietly.

## What "done" looks like

Not a checklist item — a state the app should be in:

- Heidy trusts the price the app shows enough to actually charge it, without
  double-checking it against a spreadsheet.
- Every dollar on a receipt ends up reflected in the master ingredient list — no
  detail (brand, unsalted vs. salted, pack size) silently dropped because it was
  inconvenient to parse.
- Approving a receipt is close to one click for anything she's bought before, and
  honest, guided manual entry for anything genuinely new — not a wall of fields.
- The spreadsheets become historical record, not a parallel system she has to keep
  in sync by hand. (This transition is actively in progress — see `CLAUDE.md`.)

## Explicit non-goals

Written down so nobody spends a cycle building toward them by accident:

- **Not multi-tenant, not a platform.** No other bakery's data, no shared backend,
  no "what if we sold this" scope creep. If that ever becomes a real goal, it
  changes several of the non-negotiables above and deserves its own document.
- **Not a POS or an e-commerce system.** It costs and prices; it doesn't take
  orders or process payments.
- **Not an AI product.** Resist the pull to make receipt matching "smarter" by
  adding a model. The deterministic-parsing constraint is a feature, not a
  limitation waiting to be lifted.
- **Not chasing full automation.** Manual entry for a genuinely new, rare item is
  an acceptable, correct answer at this bakery's scale — not a gap to be
  engineered away. Re-litigate this only if the numbers actually change (many
  more SKUs, multiple locations), not on principle.

## When this document and a request disagree

Say so, out loud, before building. "This would mean adding a network call, which
conflicts with the offline principle in INTENT.md — do you want to revisit that, or
should I find another way?" is the right response. Silently complying erodes the
one thing this document is for; silently refusing without explaining why is just
as unhelpful.
