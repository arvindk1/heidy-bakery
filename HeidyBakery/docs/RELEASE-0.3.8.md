# Heidy Bakery 0.3.8 — build 11

Released September 11, 2026 (verification completed September 12 UTC).
Source commit: `3597cf5`. No commits pushed.

Receipt purchase review now prioritizes ingredient/price confirmation, total
quantity and an explicit historical-quantity shortcut. Receipt metadata, pack
calculations and exceptions remain accessible through disclosures. A pinned
purchase summary sits beside Save purchase review. The shortcut sets a purchase
total; it never multiplies a historical total by today's pack count.

Editing a total updates the per-pack calculation when count is known. Existing
same-category conversion is used for compatible historical units. Density and
measured-weight confirmation remain required for cross-category conversion.
Recipe costing, `factor()`, native storage and all 197 starter records are unchanged.

## Validation

- `npm test` and all `npm run test:ui` suites passed, including receipt review,
  learned products, quantity-story, modal accessibility, backup and native Excel
  import/export coverage.
- The banana story covers reuse, direct editing, cancel/save failure/retry, draft
  isolation, approval, multiple packs, compatible units, required measured weight,
  unmatched/new ingredients, free/excluded/removed purchases and narrow dark layout.
- Screenshots reviewed at 1100, 760 and 520px. The historical-quantity shortcut is
  verified above the pinned footer at 520 × 800.
- The signed app passed the three native receipt-product, saved-product and
  unit-conversion workflows using newly created isolated libraries.
- Freshly extracted distribution ZIP passed identity/team, hardened runtime,
  secure timestamp, both architectures, stapled ticket, Gatekeeper and native tests.

Apple submission: `94380fd4-0cb7-46f5-b113-9d9f2b6a23ca` — **Accepted**.
Identity: `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`.
Keychain profile: `HeidyBakery-notary`.
ZIP SHA-256: `315349c10a741e438855a5af76a0efef9d0930b80145816d2d28e1605474edd4`.

Release evidence: `../release-reports/20260912T030750Z-35469/`.
Browser log: `work/quantity-final-ui.log`.
Native workflow logs: `work/native-038-5jusx5gl/`.
Distribution: `../Heidy Bakery Mac.zip` in the canonical Codex output tree.

For a normal update, save a full backup, quit the old app, and replace it in
Applications. Existing records remain in Application Support. No backup restoration
is needed during a normal update. Verify version 0.3.8 / build 11 in Settings.
