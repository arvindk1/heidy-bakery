# Receipt purchase modal review — September 11, 2026

Implements `HANDOFF-RECEIPT-MODAL-UX.md`. This change is limited to presentation in
`editPurchase()`, scoped button CSS, and browser regression coverage.

## Changes

- Original receipt text, paste instructions, previous purchase reference, pack
  calculation, and current-pack helper use the existing muted text color.
- Paid total, pack size, pack count, total quantity, and purchase unit appear
  before the collapsed paste disclosure.
- Read package details and Use this quantity for one pack use secondary styling
  with existing brand color, underlining, control height and focus outline.
- A single match equal to the current selection is hidden. A different single
  match remains available; ambiguous matches retain every option even after
  selection. Hints update when the ingredient, description or code changes.
- Choosing a hint returns focus to the ingredient picker, so hiding that hint
  does not leave keyboard focus on a removed button.
- Four dynamic conversion/recipe guidance nodes have `role="status"`. The four
  cost/quantity inputs reference `pack-calculation` through `aria-describedby`.

## Reveal-focus finding

Inspected `updateBridge()`, `recipeQuantity()`, `context()` and their input/change
handlers before editing. They toggle `hidden` and update guidance without moving
focus. Typing a unit or changing an ingredient should not interrupt the user's
editing by jumping into another field.

Browser checks confirm that changing g to gal, each, or an unsupported pack unit
keeps focus in the unit input. Tab reaches the revealed density, measured-weight,
or recipe-quantity field while staying inside the native dialog. Returning to g
hides unneeded conversion fields. No change to reveal-focus handling was needed.
This finding concerns field-triggered reveal behavior; it is not a full
screen-reader audit of all dynamic buttons or live-region announcements.

## Verification

Before edits, all five handoff Node suites and the complete existing
`npm run test:ui` passed. After edits, `npm test` and `npm run test:ui` passed,
including the new `Tests/receipt-modal-ui.test.cjs`.

Coverage includes single/multiple/no candidates, selection changes, preserved
ambiguous options, field order, helper classes, ARIA attributes, working secondary
actions, pack calculation, keyboard reveal/navigation, Escape cancellation, and
draft save without changes to ingredients or recipes. Existing suites also cover
receipt approval, unit conversion, saved products, save failure/retry, and native
Excel import/export using isolated records.

Light/dark screenshots at 1100px and 760px were reviewed. Artifacts are generated
under `output/playwright/receipt-modal/`; no private library is used by these tests.
The existing contrast suite passed all 44 light/dark pairings. No claim is made
that automated checks replace a VoiceOver assessment.

`model.js`, `factor()`, recipe costing, and all 197 starter master records are
unchanged by this modal update. The update is included in signed, notarized version
0.3.7 (build 10); see `RELEASE-0.3.7.md` for the final ZIP verification evidence.
