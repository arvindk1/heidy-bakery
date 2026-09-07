# The Little Dot — App Refresh Plan
Status: Implemented. See [implementation and verification report](docs/REFRESH-VERIFICATION.md) for delivered scope, evidence, and verification limits.

## Goal
Make the bakery's existing offline Mac app feel fresh, minimal, and easy to use while preserving its costing, pricing, receipt, and record-management functionality. Improve the current application without adding unnecessary visual effects or architectural weight.

## Basis and limits of this plan
- Reviewed the supplied design brief and the existing HTML, stylesheet, and screen/navigation controller.
- Received the bakery logo: geometric caramel and olive forms, a pale green dot, and the "the little dot — tea & bakery" wordmark. Use it as the brand reference; verify production color values from a suitable original asset before treating them as exact brand specifications.
- The brief references a separate app icon, which has not yet been opened or verified.
- The running app has not yet been visually inspected. Layout decisions and window-size behavior must be validated in the actual Mac application.
- The navigation order below is a recommendation based on existing workflows, not measured user frequency.

## What this refresh can achieve
| Area | Intended outcome |
|---|---|
| Identity | A consistent Little Dot identity across the app header, navigation, colors, and verified app icon. |
| Visual design | Warm neutral surfaces, readable typography, restrained accents, consistent controls, and less competing decoration. |
| Navigation | A predictable labeled sidebar, coherent tab order, clear selected state, and accessible cross-screen links. |
| Screen layout | More room for daily work, stronger information hierarchy, and appropriate layouts at narrower window sizes. |
| Pricing | Easier comparison of costs, retail prices, bulk prices, and review status without losing existing editing capabilities. |
| Recipes | Easier selection and clearer separation of recipe composition, costs, pricing, and supporting details. |
| Receipts | A clearer original-to-review workflow that retains explicit approval before purchase prices change. |
| Feedback | Clear saving, saved, failure, empty, and review-needed states without persistent animation. |
| Accessibility | Readable contrast, visible keyboard focus, understandable labels, and usable keyboard navigation. |
| Reliability | Evidence that existing workflows and calculations still work after presentation changes. |

## Visual direction
Use a warm porcelain canvas, dark espresso text, and a restrained caramel action color. Use olive and sage sparingly, with text or icons accompanying meaningful status colors. Adjust functional color variants for sufficient contrast in light and dark modes.

Use system fonts, aligned numeric columns, consistent spacing, subtle separators, and modest corner rounding. Keep content surfaces predominantly solid. Reserve any translucency for limited navigation treatment only if it remains readable and performs well.

The interface should remain still when idle. Show progress while work occurs and unobtrusive confirmation when it completes. Preserve prominent save failures. Avoid decorative pulses, large dashboard cards, and animation dependencies added solely for appearance.

## Navigation proposal
| Position | Destination | Purpose |
|---|---|---|
| 1 | Price list | Preserve the existing starting destination and fast access to selling prices. |
| 2 | Recipes | Keep recipe composition and costing next to pricing. |
| 3 | Ingredients | Maintain shared ingredient and packaging costs. |
| 4 | Receipts | Import, review, approve, and retrieve purchase records. |
| 5 | Margin Watch | Review ingredient increases and affected recipes. |
| Bottom | Settings | Access pricing defaults, receipt folder, backups, undo, and Excel tools. |

Preserve all six existing destinations. Use text labels with simple icons, a clear active state, and a compact layout. Allow navigation to collapse when the content needs more width. Keep receipt-history and recipe links working across screens.

## Screen-by-screen scope

### Price list
- Retain search, review/missing-price filters, Excel export, and new-recipe access.
- Visually group retail and bulk columns; retain both editable selling prices and their distinct cost calculations.
- Keep recipe names available during horizontal scrolling where practical and use an opaque sticky table header.
- Improve alignment, field sizing, and warning hierarchy.
- Add a compact actionable summary only if it uses clearly defined existing data.
- Do not introduce an "overall bakery margin" metric without a supported definition and the necessary data.

### Recipes
- Evaluate a compact searchable recipe list beside the selected recipe, replacing the search-plus-dropdown interaction on wider windows.
- Use a compact selector on narrow windows to preserve editing space.
- Prioritize recipe identity, yield, unit cost, and editing actions.
- Keep ingredient/packaging lines, batch calculations, retail/bulk pricing, notes, source checks, and review actions accessible.
- Retain create, copy, edit, delete, and recipe export behavior.
- Give destructive actions less visual prominence while preserving confirmation.

### Ingredients
- Retain the searchable table and all ingredient, packaging, and missing-cost filters.
- Improve scanability of supplier, package price, package size, unit cost, and update date.
- Preserve editing, purchase history, source-receipt links, missing-cost notices, future-date checks, and zero-price confirmation.

### Receipts
- Preserve the receipt list, search, filters, pagination, and selected receipt.
- Keep the original receipt and purchase review alongside each other when width permits; stack them clearly on smaller windows.
- Coordinate the app sidebar and receipt list so navigation does not crowd the review workspace.
- Make unmatched purchases, excluded items, and review status easy to distinguish.
- Keep approval and archive actions clearly labeled and separate.
- Preserve original-file access, OCR caveats, candidate-line review, folder checking, and automatic import behavior.

### Margin Watch
- Put affected recipes before supporting ingredient increases to emphasize the next decision.
- Stack tables when needed rather than compressing numeric columns.
- Retain baseline explanations, ranking semantics, ingredient editing, recipe links, and cost-review behavior.
- Ensure empty states distinguish insufficient history from confirmed absence of issues where the data supports that distinction.

### Settings
- Organize existing controls into Pricing and alerts, Receipt folder, Backups and undo, and Excel.
- Preserve every current setting and action.
- Keep explanations of markup versus margin and local storage concise and accessible.
- Avoid turning configuration into additional top-level navigation destinations.

## Separate interaction improvements
These changes affect behavior and should be implemented and checked separately from styling:
- Remember search terms, filters, selected records, and scroll position when returning to a screen. Current page rendering recreates several controls.
- Ensure navigation and rerendering do not discard edits or interrupt pending saves.
- Maintain keyboard focus predictably after closing dialogs or returning from linked records.
- Add a clear route back to the originating list where cross-screen navigation would otherwise lose context.

## Functionality protection
Preserve existing screen identifiers and event bindings wherever possible. Keep the costing model, storage format, native bridge, receipt processing, save queue, and import/export contracts outside the visual-change scope.

Required invariants:
- Cost changes do not silently overwrite selling prices.
- Receipt-derived price changes require explicit approval.
- Older purchases retain their existing history/update rules.
- Missing and invalid costs remain visible; incomplete calculations do not become apparently complete through styling.
- Save confirmation reflects actual persistence; failures remain visible and retain rollback behavior.
- Retail and bulk calculations retain their distinct inputs and outputs.
- Existing data, original receipts, backups, and Excel compatibility remain intact.

Any necessary change to those behaviors requires its own documented rationale and focused verification rather than being folded into cosmetic work.

## Delivery sequence
1. **Baseline:** Inspect the running app, verify the app icon asset, record representative screens and window sizes, identify available tests, and create a disposable test dataset with expected calculation outputs.
2. **Visual foundation:** Apply typography, spacing, contrast-adjusted colors, controls, and navigation styling while retaining existing actions.
3. **Screen layouts:** Refine Price list, Recipes, Ingredients, Receipts, Margin Watch, and Settings in small reviewable increments.
4. **Navigation behavior:** Implement any accepted context-preservation and focus improvements separately.
5. **Verification:** Compare calculations and exported values against the baseline, exercise native workflows, and inspect light/dark and narrow/wide layouts.
6. **Handoff:** Provide the change summary, representative screenshots, verification results, outstanding limitations, and a rollback route to the prior version.

## Acceptance checks
Run data-changing checks against disposable records and backups, not the bakery's live working data.

| Workflow | Required evidence |
|---|---|
| Pricing | Edit retail and bulk prices, save, reopen, and verify displayed margins and persisted values. |
| Recipes | Create, copy, edit, delete, update lines/yield, and export a recipe successfully. |
| Ingredients | Update package costs and quantities; verify downstream calculations, history, and validation. |
| Receipts | Import photos/PDFs, inspect originals, edit draft purchases, approve, archive, and verify history and price changes. |
| Navigation | Exercise every destination and cross-screen link with mouse and keyboard; verify selected states and accepted context retention. |
| Persistence | Verify saving and failure feedback, reopening, undo, backup, and restore. |
| Excel | Verify exports and reviewed reimport preserve the existing supported data contract. |
| Layout | Check representative wide and narrow Mac windows, scrolling, dialogs, long names, and empty/error states. |
| Accessibility | Check normal-text contrast, visible focus, labels, keyboard access, and reduced-motion behavior for added effects. |
| Performance | Compare startup, scrolling, and receipt review responsiveness with the baseline on the same environment. |

Completion means the refreshed interface is visually reviewed and the relevant checks pass. Source inspection alone does not establish that functionality is preserved.

## Out of scope
New accounting or sales integrations, business-profitability dashboards, forecasting, cloud sync, authentication, database migrations, and a framework rewrite. A custom command palette, elaborate animations, and a new app icon are optional future work rather than prerequisites for this refresh.

## Expected deliverables
- Refreshed interface within the existing app architecture.
- Verified navigation order and layouts for all six destinations.
- A small documented set of colors, typography, spacing, and control styles.
- Before/after screenshots and a completed verification record.
- A clear list of any deferred work or unresolved issues.

No performance improvement or absence of regressions is claimed until measured or tested.
