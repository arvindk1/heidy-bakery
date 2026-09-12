# Quantity-first receipt review

The main task is to confirm the ingredient, paid amount and total quantity, then
save the purchase review. The quantity card provides the next instruction, a
weight/volume/count label based on the entered unit, and a visible previous-quantity
shortcut. Missing information gets focus on opening; field changes do not interrupt
editing with focus jumps.

## User paths

- **First purchase, missing weight:** check the matched item and price. Enter the
  weight or select the previous quantity only if the entire current purchase has
  that quantity. The shortcut identifies both quantity and supplier.
- **Different quantity:** edit the total directly. If a pack count is present,
  the form updates the calculated pack size to keep the two entry paths consistent.
- **Multiple equal packs:** the pack disclosure opens for a known count above one.
  Enter each pack's size and count; the total and calculation update together.
  A previous recorded total is never treated as a known single-pack size. Using
  700 g with two current packs yields 700 g total and 350 g per pack, not 1,400 g.
- **Different units:** the historical shortcut only supports existing same-category
  conversion. Cross-category quantities retain the established density or measured
  weight review. No density or item weight is silently accepted.
- **No match:** select an ingredient or explicitly add one. Missing matches remain
  blocked at receipt approval. Entering a quantity does not manufacture a match.
- **Personal, free or removed purchase:** expand the clearly named exceptions
  disclosure. The pinned summary reflects the selected action.
- **Save and approve:** the pinned summary displays item, amount and quantity next
  to Save purchase review. Saving does not change master prices; receipt approval
  retains its existing validation and price-change preview. Cancel and failed saves
  preserve the prior state.

Original receipt description/code, paste details and remembered products remain
available through disclosures. Save and the purchase summary stay visible when the
dialog scrolls. The previous-quantity button remains above the fixed actions at a
520 × 800 test viewport. Light and dark layouts are checked at desktop and narrow
widths. Master records, recipe costing, `factor()` and native storage are unchanged.

`Tests/quantity-story-ui.test.cjs` tests these paths with an isolated in-memory
library. Existing modal, receipt, conversion, saved-product, backup and Excel
browser suites remain in `npm run test:ui`; `npm test` checks model regressions.
