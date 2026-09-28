# Heidy Bakery — installation and setup

This app runs locally on your Mac. It does not need a server, a subscription or an AI account.

## Install

1. Download **Heidy Bakery Mac.zip** directly on your Mac and double-click it to unzip.
2. Drag **Heidy Bakery.app** into Applications.
3. Open the app.

These instructions accompany the signed, Apple-notarized release produced by `build.sh --release`. A **LOCAL TEST** ZIP is for development and should not be sent as an installer. If the app cannot open, send Arvind the exact message and your macOS version from **Apple menu → About This Mac**. Do not disable Mac security settings.

The app is built for Intel and Apple Silicon Macs running macOS 13 or later. It has been exercised on the development Mac; Heidy’s Mac still needs a compatibility check.

## First setup

Already using the app? Save a full backup in the current app and quit. Unzip the update directly on your Mac in an empty folder, then drag **Heidy Bakery.app** into Applications and choose **Replace**. If Finder adds “2” to the new app name, rename that new copy to **Heidy Bakery.app** before moving it. Your existing library remains in Application Support. Do not restore an older backup or repeat the first setup during a normal update.

1. On the welcome screen, read **Import checks**, then choose **Import reviewed spreadsheet data**. This loads 11 recipe sheets and 197 ingredient/packaging records. Your original spreadsheets stay unchanged.
2. In **Settings**, enter your retail and bulk markup percentages. They start blank so the app does not assume your preferred pricing.
3. In **Price list**, enter your selling prices per piece. Suggested prices appear alongside yours. Your prices do not change automatically.
4. In **Settings → Choose folder**, select the **All new receipts** folder used by your iPhone shortcut.

The **Review** column names the first master item that needs attention, such as **Salt priced 3 yrs ago**. Select that item name to open its purchase-price record. **Missing costs** means the recipe cannot yet produce a reliable suggested price; open the recipe to see the exact missing item.

If you chose an empty bakery, add ingredients first, then create a recipe. To return to the supplied import before adding recipes, use **Undo last saved change** as appropriate, or restore a backup. Never delete your records to restart without a backup.

## Recipes

Search or select a recipe. Use **Edit recipe details** for its yield, labour, prices and notes. Labour effort follows the spreadsheet: easy is 1 hour, Low 2, Medium 3, High 4 and Extreme 5; choose Custom to enter another number of hours. Use **Add ingredient or packaging** and each row’s **Edit** button for recipe quantities.

**Make a copy** creates a separate recipe and clears its selling prices. Changing the batch yield changes how the batch cost is divided; it does not scale the ingredient quantities automatically.

Recipe totals include all ingredient and packaging rows, shown in separate sections with subtotals and percentage shares. They include the egg yolks and stickers omitted by the original formulas. Chestnut remains incomplete until its unidentified ingredient is corrected. The separate WS sheets retain their original labour; their business meaning still needs confirmation.

## Receipts

1. Choose **Check receipt folder**, or **Add photos / PDFs**.
2. Select a receipt. Recognized retailer names and unambiguous purchase dates are filled automatically. Check them against the original.
3. Review the automatically prepared purchase lines. Use **Find candidate lines** to add further detected lines, or **Add purchase** manually. Existing unreviewed receipts are prepared when the updated app first opens; entered details are preserved.
4. For each purchase, select the ingredient, confirm the paid total and total quantity, and check the unit. For 60 eggs, use 60 and “each”.
5. Exclude personal items, refunds and non-ingredient expenses.
6. Resolve the links under **Before updating Ingredients**. Suggested items need review, and package quantities absent from the receipt must be entered. Then choose **Approve price updates** after checking the original receipt.

Saved retailer/description matches are reused. Duplicate files are skipped. Older purchases are retained in history without replacing a newer dated purchase. Reviewed receipts remain searchable by retailer, dates and receipt text. **Open original** shows the full image or PDF in the Mac’s usual viewer.

Text recognition needs testing with your actual receipts. It never approves purchases automatically. PDF text recognition covers up to 10 pages; the full original is retained. Individual files must be no larger than 40 MB.

## Excel and backups

Receipt cards lead with the matched ingredient name and retain the original receipt wording underneath. For older drafts, **Review updated suggestions** shows a comparison; apply only the changes you want.

In a purchase review, check the ingredient and paid total, then enter the total quantity purchased. **Use 700 g as total**, for example, copies a previous recorded quantity only when today's entire purchase has that same quantity. It does not multiply the old total by today's pack count. For equal-sized packs, expand **Bought multiple packs?** and enter the pack size and count. Editing the total updates the per-pack calculation. Receipt wording, pasted product details and exclude/free/remove options remain available in their disclosures. **Save purchase review** saves a draft; ingredient prices update only after you approve the receipt.

When volume and weight units differ, **Convert purchase units** lets you enter and confirm a density in grams per millilitre. Common liquids may offer an editable approximation. Select it only if appropriate to the product, then tick the confirmation. Saving a draft does not update Ingredients; approving the receipt saves the accepted density for later purchases. You can edit it on a later receipt without changing earlier purchase history.

When count and weight units differ, enter the **measured total weight of the items bought**, then confirm it. The app derives grams per item from the receipt's total count. There is no suggested item weight. Approval remembers the measured average for that retailer and product code; a later receipt can reuse it. If the product weight changes, enter a new measured total. The existing confirmed recipe quantity per pack remains an alternative. Unmatched purchases can be linked, added as new ingredients, or excluded.

**Export all to Excel** creates an independent workbook with editable inputs and formulas. Open it in Excel to recalculate. The **Read me** sheet explains which sheets to edit. **Export this recipe** exports the selected recipe, the master ingredient/packaging items it needs, and the shared settings used by the calculations. It creates the app’s multi-sheet Excel format, not Heidy’s original one-sheet-per-recipe layout. Receipt images and receipt/matching history are not included. Exporting does not change your saved records.

**Import recipe workbooks** in Recipes accepts the original Cake, Bread, Cookie & Others, and Cloud Chiffon files, with one recipe per sheet. You can select all four files together. The review shows recipe lines, batch yield, labour and a listed price when there is one clear match. Cloud Chiffon has no Price Summary sheet, so its recipes import with prices left blank instead of failing the import. Recipes marked **HS** have an unconfirmed sales channel; their retail and bulk prices stay unassigned until you confirm which one applies. New recipes are selected when there are no findings; recipes already in the app or needing review start unchecked. Choosing an existing recipe replaces its recipe details but keeps your current selling prices. Missing materials can be added as unpriced master items only if you check that option. Review selling units, missing costs and ambiguous prices before importing. The original workbooks and master purchase prices stay unchanged.

**Reimport an app Excel export** in Settings accepts only this app’s export format. Keep identifiers unchanged. Enter input values, not formulas, in the input columns. The app previews counts and incomplete-cost checks before applying. Existing recipes imported from the workbook have their recipe lines replaced; records not present in the workbook remain in the app. This action can also change master costs and settings—even when the workbook came from **Export this recipe**. Those ingredients and settings are shared, so changes can recalculate other recipes too. The workbook’s retail and bulk prices can replace the saved values for recipes included in it. An older export can bring back older ingredient prices or settings. Review the changed-master and changed-settings counts before applying. Recipes absent from the file are not deleted, but their calculated costs can change when shared inputs change.

**Save full backup** preserves the bakery records and original receipts together. Save it somewhere safe, such as iCloud Drive. A full backup is different from an Excel export: Excel does not contain receipt originals or complete audit history.

**Automatic backups** save a full copy after each approved receipt and keep the latest ten automatic copies from this Mac. Manual backups are retained. In Settings, choose a backup folder or use **Back up now**. Saving a manual backup also selects its folder for future automatic copies. The default automatic folder is local to this Mac; choose an iCloud Drive folder if you want iCloud to sync copies. Settings shows the folder and last successful backup. A failed backup shows a warning; your saved library remains intact. Retry after making the folder available.

Settings also lists master items with missing quantities, units or identities. These records are preserved for review, including records that may be needed by recipes not yet imported.

The live records are stored locally in **Library/Application Support/Heidy Bakery**. **Show local data folder** opens that folder. Do not move the live database into iCloud. Use the backup command instead. Up to 30 saved changes can be undone.

## First validation with Heidy

- Check the yield and ingredient quantities on two familiar recipes.
- Enter a selling price, quit and reopen the app, and confirm it remains.
- Copy a recipe and confirm the original is unchanged.
- Process three typical receipts; check the amount, package size and matched ingredient before approval.
- Export Excel, change an input there and check that its formulas recalculate.
- Save and restore a full backup using trial records.

## Next phase

Square imports, sales and market-day records, business expenses, CPA reports and six-month income scenarios are not included in this first costing release.
