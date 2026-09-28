# 0.3.10 build 13

Recipe-workbook import supports all four supplied workbooks, preserves unidentified rows for review, routes wholesale prices to bulk and leaves HS prices unassigned. Existing master costs and saved selling prices are protected during original-workbook import.

Single-recipe Excel export now succeeds when unrelated ingredients appear in receipts or saved matches. The export does not change live history. App-export reimport remains a separate advanced action that can update shared costs/settings.

Includes packaging-identity warnings, clearer native workbook picker, version-aware native smoke testing and stable generated installation instructions.

Automated coverage includes 11 golden costs, all model/browser suites, native storage/backup/undo, actual four-workbook native import with SQLite persistence, and installer cleanup tests. Release-specific evidence will be recorded in the delivery verification report. No cloud sales, POS or cost-master spreadsheet import is added.
