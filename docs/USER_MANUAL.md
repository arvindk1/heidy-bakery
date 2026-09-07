# Heidy's Bakery — Complete User Manual

Welcome to **Heidy’s Bakery**, your private, offline Mac costing and pricing assistant. This guide explains how to install, set up, and use the application every day.

---

## 1. Introduction & Core Principles

Heidy's Bakery runs entirely on your Mac.
- **100% Private and Offline**: No cloud servers, no recurring subscription, no third-party accounts, and no AI subscriptions.
- **Your Selling Prices Are Yours**: When ingredient prices rise, the app flags the change and suggests updated prices—it **never** changes your selling prices automatically.
- **True Batch Costing**: Every ingredient, sticker, packaging item, and hour of baking labor is accounted for without omitted rows or hidden assumptions.
- **Safe & Forgiving**: Up to 30 saved changes can be undone at any time, and full backup files protect your work.

---

## 2. Installation & First Launch

### 2.1 Installing the Application
1. Double-click **`Heidy Bakery Mac.zip`** to extract it.
2. Drag **`Heidy Bakery.app`** into your **Applications** folder.
3. Double-click the app in Applications to open it.

### 2.2 macOS Security Note (Test Release)
Because this is an internal test build rather than a public App Store release, macOS may display a message saying:
> *"Heidy Bakery cannot be opened because Apple cannot check it for malicious software."*

**To open the app:**
1. Right-click (or Control-click) on **Heidy Bakery.app** in Applications.
2. Select **Open** from the menu.
3. Click **Open** in the confirmation dialog that appears.
4. The app will open and macOS will remember this approval for future launches.

---

## 3. Initial Setup (First 5 Minutes)

When you first open the app, you will see the **Welcome to your bakery** screen:

### Step 1: Import Reviewed Spreadsheet Data
Click **Import reviewed spreadsheet data**.
- This loads the **11 reviewed recipes** (including wholesale/WS sheets) and **197 ingredient and packaging records** from your original spreadsheets.
- Your original Excel files are never modified or replaced.

### Step 2: Configure Your Settings
Click **Settings** in the top navigation bar:
1. **Labour rate ($ / hour)**: Set your default hourly rate for production labor (e.g. `$24.00`).
2. **Retail markup (%)**: Enter your preferred retail markup percentage (e.g. `50%` means a \$10 cost is marked up to a \$15 suggested price).
3. **Bulk markup (%)**: Enter your wholesale/bulk markup percentage (e.g. `30%`).
4. **Cost increase alert (%)**: Set when you want a warning badge (e.g. `10%` alerts you whenever a recipe’s cost rises by 10% or more).
5. **Review purchase prices after (days)**: Enter how many days before a purchase price is considered stale (e.g. `365` days).
6. Click **Save settings**.

### Step 3: Link Your Receipt Folder
Under **Settings → Receipt folder**:
1. Click **Choose folder**.
2. Select your iCloud Drive folder where receipt photos arrive (typically `iCloud Drive > Shortcuts > All new receipts`).

---

## 4. The 5 Core Tabs

The application is organized into five tabs across the top:
`Price list` | `Receipts` | `Ingredients` | `Recipes` | `Settings`

---

### Tab 1: Price List

The **Price list** gives you an instant overview of all your products, their actual costs per piece, your selling prices, and your profit margins.

- **Batch yield**: The number of pieces produced by one full recipe batch.
- **Cost / piece**: The exact cost to produce one piece, including ingredients, packaging, labor, and other costs.
- **Retail suggested**: The price calculated from your cost plus your retail markup percentage.
- **Your retail**: The actual price you charge retail customers. Click this box to type or adjust your price directly.
- **Retail margin**: Your gross profit margin at your retail price:
  $$\text{Margin} = \frac{\text{Your Price} - \text{Cost}}{\text{Your Price}} \times 100$$
- **Bulk suggested & Your bulk**: Suggested and actual wholesale prices per piece.
- **Bulk margin**: Profit margin at your bulk price.
- **Review column**: Displays badges such as:
  - `Ready`: All ingredient costs are up-to-date and complete.
  - `Missing costs`: One or more ingredients in the recipe lack a purchase price.
  - `Cost up X%`: Recent receipt updates caused the cost to increase by $X\%$.
  - `Check purchase dates`: An ingredient price hasn't been updated in over a year.

> [!TIP]
> Filter the list using the dropdown at the top: select **Needs review** to see which recipes require attention, or **Missing selling prices** to see unpriced items.

---

### Tab 2: Receipts

The **Receipts** tab is where you process receipts photographed on your phone.

#### Importing Receipts
- **Check receipt folder**: Scans the folder connected to your iPhone shortcut, automatically imports new photo and PDF files, and skips any duplicate files.
- **Add photos / PDFs**: Opens a file dialog allowing you to select individual receipt files from anywhere on your Mac.

#### Reviewing a Receipt
1. Click a receipt in the list on the left.
2. The original image appears on the left; click **Open original** to inspect it in Preview with full zoom.
3. Confirm the **Retailer** name and the **Purchase date**.
4. Click **Find candidate lines**: The app reads the OCR text and identifies items and prices.
5. Click **Edit** on each purchase line:
   - Match the item to an ingredient from your master list.
   - Enter the **Paid package total ($)** (what you actually paid on the receipt).
   - Enter the **Total quantity purchased** and select the unit (e.g. for 60 eggs, enter `60` and choose `each`; for two 1 kg bags of flour, enter `2000` and choose `g`).
   - If a line is a personal snack or non-bakery expense, check **Exclude personal item, refund or non-ingredient expense**.
6. When all items are verified, click **Approve price updates**.

#### What Happens When You Approve?
- The app updates the current purchase price on your master ingredient records.
- If the receipt is older than an existing purchase date, the new price is safely recorded in history without overwriting the newer price.
- The app remembers the retailer and item description so the next receipt from that store matches automatically.
- **Your selling prices do NOT change**. If recipe costs change significantly, a review alert will appear on the Price List.

---

### Tab 3: Ingredients

The **Ingredients** tab manages your master catalog of raw ingredients and packaging supplies.

- **Search & Filter**: Search by ingredient name or supplier; filter between raw ingredients, packaging, or items with missing costs.
- **Item Details**:
  - Name and Type (`Ingredient` or `Packaging`).
  - Supplier name.
  - Package price paid and total quantity in that package.
  - Unit of measurement (`g`, `kg`, `oz`, `lb`, `ml`, `l`, `each`, etc.).
  - Last purchase date.
- **Edit / History**:
  - Click **Edit / history** on any item to view its complete audit trail of past prices, dates, suppliers, and links to original receipts.
  - You can manually update an item's price or size here at any time.

---

### Tab 4: Recipes

The **Recipes** tab allows you to inspect, modify, and build recipes.

#### Viewing a Recipe
When you select a recipe, you see:
1. **Header Cards**: Batch yield, labor hours $\times$ hourly rate, other batch costs, and the calculated cost per piece.
2. **Ingredients and Packaging per Batch**: Table of every item in the recipe, the quantity required, whether it applies per batch or per piece, cost per source unit, and total line cost.
3. **Batch Calculation Summary**: Breakdown of ingredients subtotal, packaging subtotal, labor subtotal, other costs, and total batch cost.
4. **Retail and Bulk Pricing Summary**: Compares suggested prices with your actual prices and shows your profit margins.
5. **Instructions and Notes**: Baking directions, mixing times, temperature notes, etc.

#### Editing & Creating Recipes
- **New recipe**: Starts a blank recipe.
- **Edit recipe details**: Changes yield, selling unit, labor hours, other costs, retail/bulk prices, or bulk minimum order size.
- **Add ingredient or packaging**: Adds a new row. Choose whether the quantity applies **Per batch** (e.g. 500g flour for the whole batch) or **Per piece** (e.g. 1 paper box per piece $\times$ batch yield).
- **Make a copy**: Duplicates the recipe with all its ingredient lines. The duplicate receives a new ID and leaves selling prices blank for you to set.
- **Mark cost change as reviewed**: If an ingredient price rise triggered an alert, clicking this button acknowledges the new cost baseline and clears the alert without touching your selling prices.

---

### Tab 5: Settings

The **Settings** tab contains global configuration and safety tools:

#### Costing & Pricing Defaults
- Adjust your hourly labor rate and default retail and bulk markup percentages.
- Set your alert threshold percentage and stale-price warning timeframe.

#### Backups, Undo, and Data Protection
- **Undo last saved change**: Reverts your bakery records to the exact state before your last save. Up to 30 consecutive saves are stored in history.
- **Save full backup**: Generates a self-contained `.heidybackup` archive containing all your records, recipes, history, and original receipt image/PDF files. Save this file to iCloud Drive or an external backup drive regularly!
- **Restore backup**: Safely restores all records and receipt files from a `.heidybackup` archive.
- **Show local data folder**: Opens the local `Application Support/Heidy Bakery` folder in Finder.

#### Excel Independence
- **Export all to Excel**: Creates an independent, formatted `.xlsx` workbook containing all ingredients, recipes, lines, and settings, complete with live formulas that calculate in Microsoft Excel.
- **Review Excel import**: Allows you to import an edited workbook back into the app, with a full preview of what will change before any data is updated.

---

## 5. Frequently Asked Questions

### Can I accidentally delete or overwrite my selling prices?
**No.** Your retail and bulk selling prices are completely under your control. Approving new receipt prices or updating ingredient costs will only change the *suggested* prices. Your prices remain unchanged until you edit them directly.

### What if an ingredient's price was zero or missing?
The app treats a missing price as unknown—it will **never assume an ingredient is free**. The recipe will display a "Missing costs" warning until a valid price and package size are entered.

### Where are my files stored?
Your live database and original receipts are stored locally on your Mac at:
`~/Library/Application Support/Heidy Bakery/`
- `Bakery.sqlite`: Your active database and undo history.
- `Receipts/`: High-resolution copies of all scanned and imported receipts.
