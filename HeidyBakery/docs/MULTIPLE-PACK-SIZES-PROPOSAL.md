# Two products mapped to one ingredient

Proposed for discussion only. No purchasing or recipe-cost behavior is changed by this document.

## Recommendation

Keep one current cost per master ingredient. Save both receipt purchases separately, including retailer, SKU, pack size, pack count, paid amount and normalized unit cost. When two purchases map to Butter, ask which purchase should supply Butter's current recipe cost. The other purchase stays in history and its own saved-product record.

A weighted average is mathematically legitimate if explicitly chosen: combined paid total divided by combined usable quantity. It is a derived cost basis, not the price of either SKU. Making that the default would introduce a costing policy; implementing a moving average would also require stock quantities, consumption, opening inventory and a policy for returns. Those are outside this proposal.

## Receipt review

Show one group for Butter with two rows. Each row keeps its original description, SKU, purchased quantity, converted quantity, paid amount and cost per gram. Both rows use the existing matching and conversion confirmation rules.

Once both rows are valid, show: **Which purchase should set Butter's current cost?** Each row has a selection control. Start with neither selected. The action remains unavailable until one is chosen. Do not ask when a receipt contains only one purchase for the ingredient. Repeated identical SKU/pack purchases can retain today's pack aggregation.

The preview shows the chosen cost, affected recipe changes and a clear note that the other purchase will be saved to history. Approval performs one atomic save: both history entries, both saved-product records, one master cost update. Selling prices stay unchanged. Undo reverses all of it together.

## History and later purchases

Each history entry needs a stable purchase-line ID so two entries on one receipt can be distinguished. Record the selected source line on the master ingredient and approval summary; never recover the source merely by matching receipt ID. Keep each product's density/weight/pack confirmation independently scoped as today.

Existing older-purchase rules still apply. An older receipt cannot replace a newer master cost, even if its line was selected. If both lines are older, approval is history-only and no selection is needed. A later single-product purchase continues today's latest-purchase behavior. Changing that to a permanently preferred SKU would require a separate explicit decision.

## Checks required before implementation

- Two butter SKUs with different pack sizes: both retained; selected cost only reaches recipes.
- Repeated same-SKU packs retain every paid amount without asking twice.
- Missing conversions, conflicting matches and unconfirmed selections block approval.
- Different densities/usable weights remain attached to the corresponding product.
- Both older and same-day purchases obey the defined source selection and date rules.
- Backup/restore, undo, product corrections and exports preserve both histories and selected source.
- The existing live-snapshot cost invariant checks all affected and unaffected recipes.

## Decision requested

Approve the **choose one current purchase; keep both in history** approach, or explicitly choose a weighted-average costing policy. Until that discussion, the current duplicate-ingredient approval guard remains in place.
