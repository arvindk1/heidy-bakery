# Receipt unit conversions — 0.3.6

This addendum describes the optional fields introduced by HANDOFF-UNIT-CONVERSION.md. State version, ingredient identifiers, recipe lines, and the existing storage location are unchanged. Older libraries need no conversion or seeded values.

## Ingredient metadata

| Field | Meaning | Populated when |
| --- | --- | --- |
| `density` | Positive finite grams per millilitre | A receipt using an explicitly accepted density is approved and is not older than the master purchase |
| `avgUnitWeight` | Positive finite grams per individual item | A measured count conversion is approved and is not older than the master purchase |

Neither field is required. No average item weight defaults exist. Ingredient average weight is a record of the approved measurement, **not** sufficient authority for automatic reuse. Reuse requires the same ingredient, retailer, and product code in an active saved product record.

Density suggestions are a small local table of approximate values from [FAO/INFOODS](https://www.fao.org/4/ap815e/ap815e.pdf). They appear on relevant receipt purchases only. Selecting a suggestion fills an editable field; a separate confirmation is required. Changing a saved density also requires confirmation. Unlisted products get no suggestion.

## Receipt draft

Optional `line.bridge` records `kind` (`density` or `avgUnitWeight`), positive `value`, `confirmed: true`, `ingredientId`, normalized `retailer`, uppercase `productCode`, `fromUnit`, and source `receiptId`/`measuredDate`.

A measured-weight bridge also records `totalWeight` in grams and `measuredCount` as a positive whole number. Its value must equal `totalWeight / measuredCount`. For a count purchase, count comes from the total purchased quantity (including dozens and multiple packs). For the reverse weight-to-count case, the entered total must agree with the purchased weight and the actual item count is required. Editing the purchase quantity invalidates the original measurement confirmation.

Saving a draft does not alter master prices or learn a product. Approval uses the existing date, price-change, and validation checks. Missing conversions continue to require review. The existing manually confirmed recipe quantity per purchased pack remains available and takes precedence over a saved bridge unless the draft explicitly confirms a new bridge.

## Saved products and history

Saved product records and their legacy mapping projection can hold optional `density`, `avgUnitWeight`, and `weightMeasurement` (the full confirmed measurement). Average weight is reused only for a nonforgotten, unambiguous, confirmed record matching `retailer|productCode` and the selected ingredient. Description-only matches cannot reuse average weight. Forgetting or correcting a saved package clears its measured weight. A new measurement replaces the saved value through normal receipt approval; older receipts do not replace newer product setups.

An explicit manual recipe quantity per pack supersedes and clears an older saved average weight. The ingredient's mirrored average alone cannot revive it.

An approved purchase is normalized into the master ingredient's unit before reaching `unitCost`. History retains the original purchase size/unit and the applied conversion. Later metadata edits do not recalculate that historical quantity. Full backup/restore and undo retain these fields. Excel import/export remains the existing template; conversion metadata is not exposed as editable spreadsheet columns.

## Recipe guard

`factor(from, to)` retains its previous behavior. The optional third argument is supplied only at the receipt conversion boundary. `unitCost`, recipe calculation, formula generation, and same-category unit constants are unchanged. Volume and count never convert directly to each other. In particular, a recipe with incompatible units remains blocked even when its ingredient has receipt conversion metadata.
