# Heidy’s Bakery — first working version

This app runs on your Mac and follows the approved five-tab design. It does not need a server, a subscription or an AI account.

## Install

1. Unzip **Heidy Bakery Mac.zip**.
2. Drag **Heidy Bakery.app** into Applications.
3. Open the app.

This is a test build, not yet signed and notarized for normal Apple distribution. macOS may block its first launch. Do not disable Mac security settings. Arvind can help with the initial test installation; an Apple-notarized release is a separate distribution step.

The app is built for Intel and Apple Silicon Macs running macOS 13 or later. It has been exercised on the development Mac; Heidy’s Mac still needs a compatibility check.

## First setup

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
2. Select a receipt. Confirm its retailer and purchase date.
3. Use **Find candidate lines**, or **Add purchase** manually.
4. For each purchase, select the ingredient, confirm the paid total and total quantity, and check the unit. For 60 eggs, use 60 and “each”.
5. Exclude personal items, refunds and non-ingredient expenses.
6. Choose **Approve price updates** after checking the original receipt.

Saved retailer/description matches are reused. Duplicate files are skipped. Older purchases are retained in history without replacing a newer dated purchase. Reviewed receipts remain searchable by retailer, dates and receipt text. **Open original** shows the full image or PDF in the Mac’s usual viewer.

Text recognition needs testing with your actual receipts. It never approves purchases automatically. PDF text recognition covers up to 10 pages; the full original is retained. Individual files must be no larger than 40 MB.

## Excel and backups

**Export all to Excel** creates an independent workbook with editable inputs and formulas. Open it in Excel to recalculate. The **Read me** sheet explains which sheets to edit. **Export this recipe** exports one recipe and the master items it needs.

**Review Excel import** accepts this app’s export format. Keep identifiers unchanged. Enter input values, not formulas, in the input columns. The app previews counts and incomplete-cost checks before applying. Existing recipes imported from the workbook have their recipe lines replaced; records not present in the workbook remain in the app.

**Save full backup** preserves the bakery records and original receipts together. Save it somewhere safe, such as iCloud Drive. A full backup is different from an Excel export: Excel does not contain receipt originals or complete audit history.

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
