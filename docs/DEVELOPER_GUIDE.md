# Heidy's Bakery — Developer & Contributor Guide

This guide describes how to build, test, package, and maintain the **Heidy's Bakery** macOS application.

---

## 1. Prerequisites & Environment

- **Operating System**: macOS 13.0 (Ventura) or later.
- **Compiler Tools**: Xcode Command Line Tools installed (`swiftc`, `lipo`, `codesign`, `ditto`).
- **JavaScript Runtime**: Node.js 18+ (for domain model test execution).

---

## 2. Directory Structure

```
heidy/
├── Makefile                     # Root developer build and test commands
├── package.json                 # npm scripts (npm test, npm run build)
├── README.md                    # Project overview & documentation index
├── docs/                        # Comprehensive documentation
│   ├── ARCHITECTURE.md          # Native Cocoa, WebKit bridge, SQLite engine
│   ├── USER_MANUAL.md           # End-user manual for Heidy and operators
│   ├── RECEIPT_WORKFLOW.md      # iPhone shortcut, iCloud sync, Vision OCR
│   ├── RECEIPT_QUICK_GUIDE.md   # 1-page quick cheat sheet
│   ├── FEASIBILITY_AND_ROADMAP.md # Phase 1-3 roadmap & business modeling
│   ├── DATA_SCHEMA.md           # JSON schemas, SQLite schema, Excel specs
│   └── DEVELOPER_GUIDE.md       # This file
├── HeidyBakery/
│   ├── build.sh                 # Multi-architecture compilation & packaging
│   ├── Info.plist               # App bundle metadata
│   ├── Source/
│   │   └── Main.swift           # Native host, WebKit bridge, OCR & SQLite
│   ├── Resources/               # WebKit bundled assets
│   │   ├── index.html           # Single-page interface shell
│   │   ├── style.css            # Responsive layout & theme styles
│   │   ├── model.js             # Pure domain costing & unit conversion engine
│   │   ├── app.js               # UI controller, event handlers, bridge calls
│   │   └── seed.json            # Initial migration records (11 recipes, 197 items)
│   ├── Tests/
│   │   └── model.test.cjs       # Node.js domain arithmetic test suite
│   ├── SPECIFICATION.md         # Initial technical requirements
│   ├── START HERE.md            # Onboarding & first-install notes
│   ├── VALIDATION.md            # September 6, 2026 validation report
│   └── Heidy Bakery.app/        # Compiled macOS application bundle
├── Heidy Bakery Mac.zip         # Distributable test release archive
├── Heidy - Receipt Quick Guide.pdf # Printable 1-page PDF guide
└── Heidy Bakery App Feasibility.docx # Original feasibility Word document
```

---

## 3. Build Pipeline (`HeidyBakery/build.sh`)

The build script compiles a **universal macOS binary** compatible with both Apple Silicon (`arm64`) and Intel (`x86_64`) Macs:

```bash
# Build the application
make build
# or run directly:
./HeidyBakery/build.sh
```

### What `build.sh` Executes:
1. Compiles `Main.swift` twice using `swiftc -O -target ...`:
   - Target 1: `arm64-apple-macosx13.0`
   - Target 2: `x86_64-apple-macosx13.0`
   - Frameworks linked: `Cocoa`, `WebKit`, `Vision`, `PDFKit`, `SQLite3`
2. Stitches the two binaries into a single universal binary using `lipo -create`:
   ```bash
   lipo -create "$BUILD_DIR/HeidyBakery-arm64" "$BUILD_DIR/HeidyBakery-x86_64" \
        -output "$APP_DIR/Contents/MacOS/HeidyBakery"
   ```
3. Copies all web assets from `Resources/` into `$APP_DIR/Contents/Resources/`.
4. Copies `Info.plist` into `$APP_DIR/Contents/Info.plist`.
5. Ad-hoc signs the application bundle:
   ```bash
   codesign --force --sign - "$APP_DIR"
   ```
6. Packages the final distribution archive `Heidy Bakery Mac.zip` containing `Heidy Bakery.app` and `START HERE.md`.

---

## 4. Testing & Verification

### 4.1 Domain Model Tests (`Tests/model.test.cjs`)
Runs unit tests for unit conversion, batch costing arithmetic, bulk overrides, receipts approval logic, and duplicate detection:

```bash
make test
# or:
npm test
```

### 4.2 Native Swift Self-Test (`--self-test`)
The native binary contains an internal self-test flag that exercises:
- SQLite table creation, WAL mode, transaction saves, and undo rollbacks.
- Native OpenXML (.xlsx) generation and streaming XML parsing round-trip.
- Full backup archiving and restoration with binary receipt preservation.

```bash
make selftest
```

To run the self-test manually in an isolated directory:
```bash
mkdir -p /tmp/heidy-test
HEIDY_DATA_DIR="/tmp/heidy-test" "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --self-test
rm -rf /tmp/heidy-test
```

### 4.3 Native CLI Fixture Flags
The compiled binary supports headless CLI flags for pipeline testing:

- **Export Excel fixture**:
  ```bash
  "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --export-fixture state.json output.xlsx
  ```
- **Read Excel fixture**:
  ```bash
  "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --read-fixture input.xlsx
  ```
- **Run Receipt OCR fixture**:
  ```bash
  "./HeidyBakery/Heidy Bakery.app/Contents/MacOS/HeidyBakery" --receipt-fixture receipt.jpg
  ```

---

## 5. Development Workflows

### Modifying the UI or Styles
When editing `Resources/index.html`, `Resources/style.css`, or `Resources/app.js`:
- You can copy modified files directly into `Heidy Bakery.app/Contents/Resources/` for instant reloading, or run `make build`.
- Since the web view is hosted locally, changes take effect immediately on app relaunch.

### Modifying the Domain Model
- Edit `HeidyBakery/Resources/model.js`.
- Add test assertions to `HeidyBakery/Tests/model.test.cjs`.
- Run `npm test` to verify all domain invariants hold.

### Modifying Native Swift Code
- Edit `HeidyBakery/Source/Main.swift`.
- Run `make build` and `make selftest`.

---

## 6. Release & Code Signing

The current build is ad-hoc signed (`--sign -`). To notarize for public distribution:
1. Join the Apple Developer Program.
2. Replace `--sign -` in `build.sh` with your Developer ID Application certificate:
   ```bash
   codesign --force --options runtime --sign "Developer ID Application: Your Name (TeamID)" "$APP_DIR"
   ```
3. Submit the `.zip` to Apple's notarization service:
   ```bash
   xcrun notarytool submit "Heidy Bakery Mac.zip" --keychain-profile "AC_PASSWORD" --wait
   ```
4. Staple the notarization ticket:
   ```bash
   xcrun stapler staple "$APP_DIR"
   ```
