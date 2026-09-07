# Heidy's Bakery — Data Schema & Specifications

This document formally specifies the data structures, JSON schemas, SQLite storage contracts, and Excel workbook layouts used across **Heidy's Bakery**.

---

## 1. Document State JSON Schema (Version 1)

The complete application state is serialized as a single structured JSON document:

```typescript
interface BakeryState {
  version: 1;
  imported: boolean;
  settings: Settings;
  ingredients: Ingredient[];
  recipes: Recipe[];
  receipts: Receipt[];
  mappings: Record<string, SupplierMapping>;
}
```

### 1.1 `Settings`
```typescript
interface Settings {
  laborRate: number;         // Hourly labor cost in dollars (e.g. 24.0)
  retailMarkup: number | null; // Retail markup percentage (e.g. 50.0 for 50%)
  bulkMarkup: number | null;   // Bulk/wholesale markup percentage (e.g. 30.0 for 30%)
  alertPercent: number;      // Cost increase threshold to trigger alerts (e.g. 10.0)
  staleDays: number;         // Max days before a purchase price is flagged stale (e.g. 365)
}
```

### 1.2 `Ingredient`
```typescript
interface Ingredient {
  id: string;               // Unique ID (UUID or slug)
  name: string;             // Display name (e.g. "Unsalted Butter")
  kind: "ingredient" | "packaging"; // Category
  supplier: string;         // Retailer or vendor (e.g. "Costco")
  price: number | null;     // Total package price paid (e.g. 14.99)
  size: number | null;      // Total quantity contained in package (e.g. 2000.0)
  unit: string;             // Unit ("g", "kg", "oz", "lb", "ml", "l", "each", etc.)
  updated: string;          // Last purchase date (YYYY-MM-DD)
  receiptId?: string | null;// SHA-256 hash of receipt establishing this price
  notes?: string;           // Optional user notes or supplier SKU
  source?: string;          // Provenance ("Imported from spreadsheet", "Created in app")
  history: PurchaseEvent[]; // Audit log of past purchases
}

interface PurchaseEvent {
  date: string;             // Purchase date (YYYY-MM-DD)
  supplier: string;         // Retailer
  price: number | null;     // Price paid
  size: number | null;      // Package size
  unit: string;             // Unit
  receiptId?: string | null;// Reference to receipt record
  note?: string;            // Context ("Receipt approved", "Previous master purchase")
}
```

### 1.3 `Recipe` & `RecipeLine`
```typescript
interface Recipe {
  id: string;               // Unique ID
  name: string;             // Recipe title (e.g. "Vanilla Madeleines")
  yield: number;            // Total pieces produced per batch (e.g. 48)
  unit: string;             // Selling unit (e.g. "piece", "box")
  laborHours: number;       // Hours of labor required per batch (e.g. 1.5)
  otherCost: number;        // Additional batch cost in dollars (e.g. gas, parchment)
  retail: number | null;    // User-entered retail price per unit
  bulk: number | null;      // User-entered bulk/wholesale price per unit
  bulkMin: number | null;   // Minimum order quantity for bulk pricing
  bulkPackaging?: number | null; // Optional override for packaging cost per piece
  bulkLaborHours?: number | null;// Optional override for labor hours per batch
  costBaseline?: number | null;  // Baseline cost per piece used to track alerts
  notes: string;            // Baking method, oven temps, prep instructions
  category: string;         // Product category (e.g. "Pastries", "Cakes")
  lines: RecipeLine[];      // Component ingredient and packaging lines
}

interface RecipeLine {
  id: string;               // Unique line ID
  ingredientId: string;     // Foreign key referencing Ingredient.id
  quantity: number;         // Amount required
  unit: string;             // Unit of measurement
  perPiece: boolean;        // If true: quantity scales per piece (quantity * yield)
                            // If false: quantity is for the entire batch
}
```

### 1.4 `Receipt` & `PurchaseLine`
```typescript
interface Receipt {
  id: string;               // SHA-256 hex digest of file bytes
  file: string;             // Stored filename in Receipts/ directory (<hash>.<ext>)
  originalName: string;     // Original filename on import (e.g. "IMG_4021.HEIC")
  supplier: string;         // Identified retailer (e.g. "Costco Wholesale")
  date: string;             // Confirmed purchase date (YYYY-MM-DD)
  status: "Needs review" | "Reviewed" | "Archived";
  text: string;             // Full OCR extracted text
  pages: number;            // Total pages (PDFs)
  ocrLimited: boolean;      // True if document exceeded 10-page OCR limit
  lines: PurchaseLine[];    // Extracted and verified purchase lines
  importedAt: string;       // ISO-8601 timestamp
  reviewedAt?: string;      // ISO-8601 timestamp when approved
}

interface PurchaseLine {
  description: string;      // OCR text description from receipt
  ingredientId: string;     // Matched Ingredient.id
  price: number | null;     // Price paid on receipt
  size: number | null;      // Total package quantity
  unit: string;             // Unit
  excluded: boolean;        // True if personal expense or non-bakery item
  freeConfirmed?: boolean;  // True if explicitly confirmed as a $0.00 item
}
```

### 1.5 `SupplierMapping`
```typescript
interface SupplierMapping {
  ingredientId: string;
  size: number | null;
  unit: string;
}
// Key format: `${normalized(supplier)}|${normalized(description)}`
```

---

## 2. Full Backup Archive Specification (`.heidybackup`)

A backup is a self-contained JSON file bundling database state and raw receipt files:

```json
{
  "format": "heidy-backup-1",
  "state": { /* Full BakeryState object */ },
  "files": {
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.jpeg": "<base64 encoded binary bytes>",
    "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb.pdf": "<base64 encoded binary bytes>"
  }
}
```

### Restore Validation Invariants
- Format header must strictly equal `"heidy-backup-1"`.
- Total archive payload size must not exceed 750 MB.
- All receipt references in `state.receipts[].file` must exist as keys in `files`.
- Filenames must pass `AppDelegate.safeName` (no path traversal).
- If an existing file in `Receipts/` shares the same name, its contents must match exactly.

---

## 3. SQLite Database Schema (`Bakery.sqlite`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS state (
    id INTEGER PRIMARY KEY CHECK(id=1),
    json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    json TEXT NOT NULL,
    created TEXT DEFAULT CURRENT_TIMESTAMP
);
```

- **`state` Table**: Contains exactly one row (`id=1`) holding the active JSON document. Writes use `BEGIN IMMEDIATE` transactions.
- **`history` Table**: Contains up to 30 snapshots of previous states for instant rollback via **Undo**. Automatically pruned on commit:
  ```sql
  DELETE FROM history WHERE id NOT IN (
      SELECT id FROM history ORDER BY id DESC LIMIT 30
  );
  ```

---

## 4. Excel Export/Import Contract (`.xlsx`)

The application exports and reads five standardized worksheets:

### Sheet 1: `Ingredients` (Editable Inputs)
| Column | Name | Type | Notes |
|---|---|---|---|
| A | ID | String | Stable unique identifier |
| B | Name | String | Display name |
| C | Kind | String | `ingredient` or `packaging` |
| D | Supplier | String | Vendor name |
| E | Package price | Number | Formatted as `"$#,##0.00"` |
| F | Package quantity | Number | Decimal quantity |
| G | Unit | String | Unit abbreviation (`g`, `ml`, etc.) |
| H | Updated date | String | `YYYY-MM-DD` text |
| I | Cost per unit | Formula | `=IF(OR(E2="",F2="",F2<=0,G2=""),"",E2/F2)` |

### Sheet 2: `Settings` (Editable Inputs)
Key-value configuration table containing `laborRate`, `retailMarkup`, `bulkMarkup`, `alertPercent`, and `staleDays`.

### Sheet 3: `Recipes` (Editable Inputs)
Metadata for each recipe: ID, Name, Yield, Yield unit, Labour hours, Your retail, Your bulk, Bulk minimum, Notes, Category, Other batch cost, Bulk packaging per piece, Bulk labour hours.

### Sheet 4: `Lines` (Editable Inputs)
Recipe line details: Line ID, Recipe ID, Ingredient ID, Quantity, Unit, Per piece ($1$ or $0$), Conversion factor, Name (lookup formula), Kind (lookup formula), Cost per source unit, Batch quantity formula, Batch cost formula.

### Sheet 5: `Price list` (Calculated Formulas)
Live calculating summary: Recipe name, Batch yield, Ingredients subtotal (`SUMIF`), Packaging subtotal (`SUMIF`), Labour cost, Other cost, Batch total, Cost per piece, Suggested retail, Your retail, Retail margin, Bulk cost per piece, Suggested bulk, Your bulk, Bulk margin.
