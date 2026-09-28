# Building and sharing Heidy Bakery

The source and built app live in this Codex folder. The app requires macOS 13 or later and includes Intel and Apple Silicon executables. User records stay in the existing Application Support location; rebuilding does not migrate or replace them.

## The only delivery method

The signed, notarized `.pkg` sent to Heidy over WhatsApp is the sole way this
app reaches her Mac — there is no auto-update, no download link, and no other
channel. `bash HeidyBakery/release.sh` (from a release repo root, or `make release` inside HeidyBakery) runs the whole
pipeline below end to end and stages the delivery files in
`deliveries/<version>-<build>/`; `DELIVERY.md` has her exact install steps and
the WhatsApp message text to send with each release.

## Local development

Run `./build.sh --local` (also the default). This builds `Heidy Bakery.app` and creates `../Heidy Bakery LOCAL TEST.zip`. This package is ad hoc signed, exercises hardened runtime, and is **not approved for distribution to Heidy**.

## Saved credentials on this Mac

Verified September 9, 2026. Credentials are saved in Keychain under the exact profile **`HeidyBakery-notary`**. Use `--keychain-profile "HeidyBakery-notary"`; do not search or dump the Keychain to discover credentials.

- Signing identity: `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`
- Installer identity: `Developer ID Installer: Arvind Kandula (7LBQ52WL9X)`
- Team: `7LBQ52WL9X`
- Check access: `xcrun notarytool history --keychain-profile "HeidyBakery-notary"`
- Release through `make release` with `HEIDY_SIGN_IDENTITY`, `HEIDY_INSTALLER_IDENTITY` and `HEIDY_NOTARY_PROFILE` set to the identities/profile above. Do not invoke the underlying release build scripts separately.

If this exact profile is unavailable, ask the owner to restore it interactively using the setup below. Never record the app-specific password in source, documentation or chat.

## One-time Apple setup

1. In Xcode → Settings → Accounts, select the Apple Developer team, open Manage Certificates, and create a **Developer ID Application** certificate. This requires the appropriate Apple Developer account permissions. An Apple Development or Apple Distribution certificate cannot replace it. If managed elsewhere, import its certificate and private key securely into this Mac's login Keychain.
2. Store notarization credentials interactively in Keychain with `xcrun notarytool store-credentials "HeidyBakery-notary"`. Follow Apple's prompts using the same team as the certificate. Never paste passwords or private keys into this document, chat, or source code.
3. Use the exact Developer ID Application certificate name from `security find-identity -v -p codesigning`.

Apple references: [Developer ID](https://developer.apple.com/developer-id/) and [notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

## Release

From a clean `main` Git checkout, inside HeidyBakery, run:

```bash
HEIDY_SIGN_IDENTITY='Developer ID Application: Arvind Kandula (7LBQ52WL9X)' \
HEIDY_INSTALLER_IDENTITY='Developer ID Installer: Arvind Kandula (7LBQ52WL9X)' \
HEIDY_NOTARY_PROFILE='HeidyBakery-notary' make release
```

This is the sole release entry point. It runs the delivery-text check, preflight, shipped-version guard, tests, signed build, installer build, verification and staging. The scripts below are pipeline internals.

Update only DELIVERY.md's What's new section for release messaging, then run `node Scripts/generate-delivery.cjs`. Its seven install steps are locked and copied verbatim. Include the generated message with the release changes before running the pipeline. SHIPPED.txt is append-only; never revise previous entries.

The script checks the identity and Keychain profile before compiling. It builds both architectures, runs model/native checks against temporary records, signs with hardened runtime and a secure timestamp, submits to Apple, requires an Accepted result, and staples the ticket. It rebuilds the ZIP after stapling and verifies the extracted copy's signature, architectures, executable permissions, native self-tests, ticket and Gatekeeper approval. Only then does it publish `../Heidy Bakery Mac.zip` and its SHA-256 checksum.

Apple submission results are retained in `../release-reports/`. A failed or timed-out submission produces no new distribution ZIP. If an older verified release exists, it remains the previous release; check the build's exit status and package timestamp before sharing. For a timeout, use the submission ID with `xcrun notarytool info` or `log` and the same Keychain profile to investigate.

Keep the verified ZIP as the installer build input. Deliver only the signed, notarized installer `.pkg` over WhatsApp. The release does not include existing bakery databases or receipt originals.

For routine updates, build the installer from the successfully verified release
ZIP and send **Heidy Bakery Installer.pkg** instead. It installs the app at
`/Applications/Heidy Bakery.app` and uses
upgrade semantics for the fixed bundle identifier, so an existing copy is
replaced without a drag-and-drop choice. The package contains no Application
Support data, receipts, recipes or settings; those remain in place. The user
opens the `.pkg`, completes Installer, then launches the app from Applications.

The installer replaces the canonical app through PackageKit. Its postinstall
script first checks the installed app's bundle identifier and signature, then
removes duplicate `Heidy Bakery*.app` directories directly inside Applications
only when their bundle identifier is `com.heidybakery.local`. It skips symlinks
and unrelated apps. Downloads, Desktop and nested folders are not scanned.
It does not delete the canonical app before installation. Expanded-package
verification runs cleanup behavior tests in a temporary volume fixture,
including missing/corrupt installed app, unrelated apps, symlinks, user data
preservation and repeat execution. This is not a full Installer transaction test
on Heidy's Mac.

Before sharing, both the installer and its contained app must have the correct
Developer ID identities, and the installer must be Accepted by notarytool,
stapled and accepted by Gatekeeper. Send the final `.pkg` only after
`Heidy Bakery Installer.pkg.verification.txt` reports PASS. A file containing
`LOCAL TEST` is never distributable.

Signing uses the existing private key. If productbuild pauses before writing
the signed product, check for a macOS Keychain authorization prompt. Do not
describe this as a notarization wait: Apple submission has not started yet.
The specific `/usr/bin/productbuild` executable may need permission to use
that key; do not grant every application access. Unlocking the screen alone
does not approve a pending Keychain prompt. Never create replacement
certificates or request passwords in chat to solve this.

## Remaining real-world verification

A local build passing does not establish that Apple has approved a release. The Developer ID and notarization stages must complete with real credentials. Confirm Heidy's macOS version and test the final notarized build on her Mac, including launching, saving and reopening a trial record. Intel support is compiled and inspected here; a separate Intel Mac is needed for an Intel runtime check.

## Final ZIP verification before sharing

Every release now runs `verify-release.sh` against a fresh extraction of the final ZIP. It rejects ad-hoc signing, a different signing identity/team, missing hardened runtime or secure timestamp, a missing notarization ticket, and anything Gatekeeper does not accept as `Notarized Developer ID`. Both architecture slices and native storage/backup tests must pass. Evidence is saved next to the ZIP and in its release report.

To recheck an existing download before sending it:

```bash
HEIDY_SIGN_IDENTITY='Developer ID Application: Arvind Kandula (7LBQ52WL9X)' \
./verify-release.sh '../Heidy Bakery Mac.zip'
```

The saved notarization profile remains `HeidyBakery-notary`; verification does not need to retrieve its password or submit the app again. Serper registration and external product lookup are paused; this release uses local receipt matching only.

## Codex handoff integration

This Codex output directory is not a Git checkout. The mirrored `release.sh` deliberately requires a clean Git repository on `main`; do not bypass that guard here. Create a reviewed release snapshot in a separate Git checkout under the Codex folder, or hand off to Claude for its mirror. Never write into devl. Preserve and append the shipped-build ledger; each release needs a higher build number. Copying source does not update the existing built app or signed installer.
