# Building and sharing Heidy Bakery

The source and built app live in this Codex folder. The app requires macOS 13 or later and includes Intel and Apple Silicon executables. User records stay in the existing Application Support location; rebuilding does not migrate or replace them.

## Local development

Run `./build.sh --local` (also the default). This builds `Heidy Bakery.app` and creates `../Heidy Bakery LOCAL TEST.zip`. This package is ad hoc signed, exercises hardened runtime, and is **not approved for distribution to Heidy**.

## Saved credentials on this Mac

Verified September 9, 2026. Credentials are saved in Keychain under the exact profile **`HeidyBakery-notary`**. Use `--keychain-profile "HeidyBakery-notary"`; do not search or dump the Keychain to discover credentials.

- Signing identity: `Developer ID Application: Arvind Kandula (7LBQ52WL9X)`
- Team: `7LBQ52WL9X`
- Check access: `xcrun notarytool history --keychain-profile "HeidyBakery-notary"`
- Build: `HEIDY_SIGN_IDENTITY='Developer ID Application: Arvind Kandula (7LBQ52WL9X)' HEIDY_NOTARY_PROFILE='HeidyBakery-notary' ./build.sh --release`

If this exact profile is unavailable, ask the owner to restore it interactively using the setup below. Never record the app-specific password in source, documentation or chat.

## One-time Apple setup

1. In Xcode → Settings → Accounts, select the Apple Developer team, open Manage Certificates, and create a **Developer ID Application** certificate. This requires the appropriate Apple Developer account permissions. An Apple Development or Apple Distribution certificate cannot replace it. If managed elsewhere, import its certificate and private key securely into this Mac's login Keychain.
2. Store notarization credentials interactively in Keychain with `xcrun notarytool store-credentials "HeidyBakery-notary"`. Follow Apple's prompts using the same team as the certificate. Never paste passwords or private keys into this document, chat, or source code.
3. Use the exact Developer ID Application certificate name from `security find-identity -v -p codesigning`.

Apple references: [Developer ID](https://developer.apple.com/developer-id/) and [notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

## Release

From this source directory, run:

```bash
HEIDY_SIGN_IDENTITY='Developer ID Application: YOUR CERTIFICATE NAME (TEAMID)' \
HEIDY_NOTARY_PROFILE='HeidyBakery-notary' ./build.sh --release
```

The script checks the identity and Keychain profile before compiling. It builds both architectures, runs model/native checks against temporary records, signs with hardened runtime and a secure timestamp, submits to Apple, requires an Accepted result, and staples the ticket. It rebuilds the ZIP after stapling and verifies the extracted copy's signature, architectures, executable permissions, native self-tests, ticket and Gatekeeper approval. Only then does it publish `../Heidy Bakery Mac.zip` and its SHA-256 checksum.

Apple submission results are retained in `../release-reports/`. A failed or timed-out submission produces no new distribution ZIP. If an older verified release exists, it remains the previous release; check the build's exit status and package timestamp before sharing. For a timeout, use the submission ID with `xcrun notarytool info` or `log` and the same Keychain profile to investigate.

Send only the successfully verified **Heidy Bakery Mac.zip**. Ask the recipient to download/unzip directly on her Mac, move the app into Applications, then open it. The release does not include bakery databases or receipt originals.

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
