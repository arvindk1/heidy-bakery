# Heidy's Bakery — macOS Costing, Receipt OCR & Pricing App

> **A fast, sovereign, offline Mac application for boutique bakery recipe costing, receipt OCR scanning, and retail/wholesale price management.**

---

## What it does

- Runs entirely offline on this Mac: no external servers, no subscriptions, no telemetry. All computation and receipt OCR happen locally.
- Universal binary: works on Apple Silicon and Intel Macs running macOS 13+.
- Costs every recipe batch from ingredients, packaging, and labor hours, with unit conversions across mass, volume, and count.
- Scans receipt photos/PDFs on-device (Vision + PDFKit), extracts line items, and tracks purchase history per ingredient.
- Suggested selling prices update when costs change; your own manual prices are never silently overwritten.
- Exports and re-imports standard `.xlsx` workbooks with live formulas, so the data is never locked into the app.
- SQLite storage in WAL mode with 30-step undo and full `.heidybackup` archives.

---

## Quick Start

### For Bakery Operators (Heidy & Arvind)
1. Double-click **`Heidy Bakery Mac.zip`** to extract it.
2. Drag **`Heidy Bakery.app`** into your **Applications** folder.
3. Right-click the app in Applications and choose **Open** (to confirm the initial test build).
4. On the welcome screen, click **Import reviewed spreadsheet data** to load the 11 recipe sheets and 197 ingredient records.
5. In **Settings**, enter your retail and bulk markup percentages and link your iPhone receipt folder.
6. Check out the [User Manual](docs/USER_MANUAL.md) or the [1-Page Receipt Quick Guide](docs/RECEIPT_QUICK_GUIDE.md) to get started.

### For Developers
```bash
# Clone the repository and navigate to the folder
cd /path/to/heidy

# Run domain model calculation tests (Node.js)
make test

# Run native Swift self-tests (SQLite, Excel round-trip, backup/restore)
make selftest

# Recompile the universal macOS application bundle
make build
```

---

## The 5 Core Tabs

| Tab | Purpose |
|---|---|
| **Price list** | Master overview of all recipes, yields, calculated costs per piece, suggested prices, manual selling prices, and profit margins. |
| **Receipts** | Scans iPhone receipt photos/PDFs from iCloud Drive, runs on-device OCR, matches candidate items to ingredients, and updates purchase histories. |
| **Ingredients** | Master catalog of ingredients and packaging items, package sizes, purchase prices, suppliers, and historical price charts. |
| **Recipes** | Recipe builder and cost breakdown: per-batch and per-piece ingredients, labor allowances, bulk overrides, and baking instructions. |
| **Settings** | Global labor rate, retail/bulk markups, cost increase alert thresholds, 30-step undo, full backups, and Excel export/import. |

---

## Documentation Suite

Comprehensive technical, functional, and strategic documentation is organized in the [`docs/`](docs/) directory:

| Document | Description |
|---|---|
| [**Visual User Guide & Troubleshooting Manual (PDF)**](file:///Users/arvindk/devl/heidy/Heidy%20Bakery%20-%20Complete%20User%20Guide%20%26%20Troubleshooting%20Manual.pdf) | **8-page printable PDF manual** featuring vector UI screen walkthroughs and step-by-step solutions for every error. |
| [**Architecture & System Design**](docs/ARCHITECTURE.md) | Native Cocoa host, WebKit JavaScript bridge, SQLite WAL engine, Vision OCR pipeline, and OOXML Excel writer. |
| [**Complete User Manual**](docs/USER_MANUAL.md) | Comprehensive step-by-step guide for bakery operators covering all 5 tabs and common workflows. |
| [**Receipt Capture & Verification Pipeline**](docs/RECEIPT_WORKFLOW.md) | Detailed technical breakdown of the iOS Shortcut, iCloud sync, Vision OCR heuristics, and audit rules. |
| [**Receipt Quick Guide**](docs/RECEIPT_QUICK_GUIDE.md) | A clean, printable 1-page cheat sheet for the daily 4-step receipt routine. |
| [**Data Schema & Persistence Contracts**](docs/DATA_SCHEMA.md) | Formal JSON schemas (State v1), `.heidybackup` format, SQLite tables, and Excel worksheet specifications. |
| [**Developer & Contributor Guide**](docs/DEVELOPER_GUIDE.md) | Environment setup, compilation commands, test suites, CLI inspection flags, and release packaging. |

---

## Repository Structure

```
heidy/
├── Makefile                     # Root build and test automation
├── package.json                 # npm scripts (npm test, npm run build)
├── README.md                    # This document
├── .gitignore                   # macOS, Swift, and temporary file rules
├── docs/                        # Complete technical and user documentation
│   ├── ARCHITECTURE.md          # Architecture & system design
│   ├── USER_MANUAL.md           # End-user manual
│   ├── RECEIPT_WORKFLOW.md      # Receipt pipeline deep-dive
│   ├── RECEIPT_QUICK_GUIDE.md   # Printable quick reference
│   ├── DATA_SCHEMA.md           # Formal data and storage schemas
│   └── DEVELOPER_GUIDE.md       # Developer setup and compilation guide
├── HeidyBakery/
│   ├── build.sh                 # Universal multi-architecture build script
│   ├── Info.plist               # Application bundle metadata
│   ├── Source/
│   │   └── Main.swift           # Native Cocoa host, WebKit bridge, Vision OCR, SQLite
│   ├── Resources/               # WebKit client UI assets
│   │   ├── index.html           # HTML5 application shell
│   │   ├── style.css            # Application styling & layout
│   │   ├── model.js             # Pure JavaScript costing & conversion engine
│   │   ├── app.js               # UI controller and native bridge communication
│   │   └── seed.json            # Seed data (11 recipes, 197 ingredients)
│   ├── Tests/
│   │   └── model.test.cjs       # Node.js domain test suite
│   ├── SPECIFICATION.md         # Initial v0.1 specification
│   ├── START HERE.md            # Onboarding & test release notes
│   ├── VALIDATION.md            # Validation checklist and sign-off notes
│   └── Heidy Bakery.app/        # Compiled native macOS application bundle
├── Heidy Bakery Mac.zip         # Distributable application archive
├── Heidy - Receipt Quick Guide.pdf # Original printable PDF guide
└── Heidy Bakery App Feasibility.docx # Original feasibility study Word document
```

---

## Verification & Status

All unit tests and native self-tests have been verified:
- **Universal Binary**: Ad-hoc signed arm64 / x86_64 universal binary.
- **Mathematical Invariants**: Verified Vanilla per-piece cost (\$2.53242...) matches original workbook formulas including egg yolks and packaging stickers.
- **Durability**: SQLite WAL mode, atomic saves, and 30-step historical undo verified.
- **Excel Round-Trip**: Multi-sheet export recalculates accurately in independent spreadsheet engines with zero formula errors.
