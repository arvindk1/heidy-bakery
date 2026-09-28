# Delivering a release to Heidy

The signed, notarized `.pkg` sent via WhatsApp is the only way this app reaches
Heidy's Mac — see `RELEASE.md` for how it's built and signed, and `release.sh`
for the pipeline that produces it. This document is Heidy's install steps,
verbatim, plus what to tell her about each release.

## Install steps (send exactly this)

1. Quit Heidy Bakery if it's open (Command + Q).
2. In WhatsApp, tap the Heidy Bakery Installer.pkg file.
3. A preview will pop up — tap Open with Installer.
4. Click Continue, then Install.
5. Enter your Mac password (or use Touch ID) if asked.
6. Wait for "Installation was successful," then close the installer.
7. Open your Applications folder and launch Heidy Bakery from there (not an old Dock icon).

## What's new in 0.3.10

- Save a full backup in the app before installing.
- In Recipes, choose **Import recipe workbooks** to bring in Cake, Bread,
  Cookie & Others, and Cloud Chiffon together. Review before saving.
- Check missing ingredient details and selling prices. Existing saved selling
  prices are kept when replacing recipes; HS prices remain unassigned.
- **Export this recipe** now works when your library also contains receipts
  for other ingredients. To bring an app export back, use Settings →
  **Reimport an app Excel export** and review shared ingredient/settings changes.
- Your existing recipes, receipts and saved prices stay in place during installation.

## Where the delivery files come from

`release.sh` copies the signed installer, its checksum, its verification
report, and `WHATSAPP-MESSAGE.txt` into `deliveries/<version>-<build>/` after
every stage of the pipeline passes. Send the `.pkg` from that folder — never
a file with `LOCAL TEST` in its name, and never anything pulled directly from
`release-reports/` or a build's temporary staging directory.
