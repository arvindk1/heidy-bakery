# Heidy Bakery 0.3.7 — build 10

Released September 11, 2026. The canonical app and distribution ZIP are in the
Codex output tree. All 197 starter ingredient/packaging records are preserved.
Existing installed libraries remain in their Application Support directory.

Includes the receipt-modal layout/accessibility update, saved pack-count
correction, visible cleared-quantity notices, recovery from orphaned saved matches,
ingredient completeness flags, and automatic full backups after receipt approval.
Multiple pack sizes remain a design proposal; no new costing policy was introduced.

## Verification

- Full model/regression suites and all browser suites passed, including the new
  modal and backup checks and native Excel import/export.
- Native receipt-product, saved-product and unit-conversion workflows passed in
  three newly created libraries. Approval created an automatic backup through the
  real app bridge.
- A read-only copy of the live library passed four receipt-cost invariant cases
  across 11 recipes, using explicitly synthetic measurement inputs.
- Native backup checks passed for complete archives, ten-copy retention,
  manual/other-installation preservation, missing receipts, unavailable folders,
  persisted errors and retry. Saved records remained unchanged by backup failures.
- Final ZIP was freshly extracted and checked for both executable architectures,
  Developer ID identity/team, hardened runtime, secure timestamp, stapled ticket,
  Gatekeeper acceptance and native tests.

Apple submission: `953aeecd-cd88-44c1-8b94-1519149bab4d` — **Accepted**.
Signing identity: `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`.
Notarization Keychain profile: `HeidyBakery-notary`.
Gatekeeper: `source=Notarized Developer ID`.

ZIP SHA-256:
`f9308edb9cdf5c43c14037ffa5aa02f6a42b0810645ef604585cdb364b18a996`

Evidence: `../release-reports/20260911T182653Z-86652/` and
`../Heidy Bakery Mac.zip.verification.txt`.
Test logs: `../iteration-037-tests/` (private snapshots are not committed).

Code commits: `edd606f` (modal), `6d2cebd` (automatic backups), `720ac8a`
(version/native approval check), plus the separately committed hardening items.
No commits were pushed.

## Install the update

Save a full backup in the current app, then quit it. Unzip the new download in an
empty folder. Move `Heidy Bakery.app` to Applications and choose Replace. If the
downloaded app has a numeric suffix, rename that new copy before moving it.
Do not restore a backup during a normal update. Confirm version 0.3.7 / build 10
in Settings. Intel is compiled and inspected; runtime testing on Heidy's own Mac
is still the final compatibility check.
