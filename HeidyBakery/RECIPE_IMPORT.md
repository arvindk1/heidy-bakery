# Recipe workbook import (0.3.9 local test build)

## Decision and user flow

Heidy can choose her original Cake, Bread, and Cookie & Others workbooks directly in the Recipes tab. This is distinct from **Reimport an app Excel export** in Settings. The former reads one recipe per worksheet and changes recipe records only after review. The latter expects the app's four-sheet export and can change ingredients, recipes, and settings.

The recipe review displays the source file and sheet, batch yield, selling unit, labour effort, listed price when the Price Summary has one exact match, and expandable ingredient/packaging lines. New recipes with no findings are preselected. Existing recipe names and records with findings are unchecked. Heidy can select a replacement explicitly; that preserves the app's current selling prices. Missing master materials require a separate checkbox to create them as unpriced records. Cancel saves nothing. Formula costs and totals from the source workbooks are never used; the app recalculates using its current master prices.

## Three-file reconciliation

An independent openpyxl read of the source files was compared with the app's native XLSX reader and converter. All **85 recipe sheets and 1,281 material lines** matched for names, quantities, units, batch yield, labour effort, per-unit packaging basis, and unambiguous listed prices. Zero recipe sheets were skipped.

Review findings in the source files:

- **Bread Flour** and **Potato** have no exact master-list match. If selected, they become unpriced master items until Heidy enters purchase details.
- **TBC FB Bread** has a Cheese line with no unit. Its cost stays incomplete until corrected.
- One Banana Chiffon (Slice) sheet has more than one matching listed price in Price Summary. Its selling price is left blank for Heidy to choose.
- Some already tracked materials, such as Strawberry and Semolina Flour, have incomplete purchase costs. The importer does not invent them.

## Validation

`npm test` and `npm run test:ui` passed. The UI suite checks the two distinct import actions, preview, cancel, explicit missing-material confirmation, save, and repeat-import behavior. An isolated browser run imported all 85 sheets without writing to the live bakery library. The existing 11 golden recipe costs remained unchanged. `build.sh --local` passed native self-tests and produced version 0.3.9 build 12. This local ZIP is not a distribution package; Heidy's existing installer remains the previous version until a signed/notarized release is made.
