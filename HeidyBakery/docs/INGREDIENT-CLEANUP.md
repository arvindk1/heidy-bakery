# Source ingredient audit

The original `cost master.xlsx`, Ingredient sheet, was checked against the starter data. Package quantity is column E and unit is column F.

| Entry | Source row | Finding |
| --- | --- | --- |
| Cocoa Butter | 43 | Quantity absent; unit g |
| Digestives | 58 | Quantity and unit absent |
| Red Food Colour | 136 | Quantity and unit absent |
| Semolina Flour | 141 | Quantity and unit absent |
| Strawberry | 144 | Quantity and unit absent; distinct from Fresh Strawberry |
| Unnamed item | 146 | Name absent; retained for recipes not yet loaded |

`Cloud Chiffon Series.xlsx`, Chestnut sheet, A11 is blank while B11:C11 records 8 g. Adjacent rows do not establish its identity. The Chestnut reference must remain blocked until identified.

All master rows are preserved. The owner confirmed that many recipes have not been loaded, so absence of references in the current app does not establish that an ingredient is unused. No removal tool or automatic deletion is included. Any future removal needs a separate decision based on the complete recipe collection and the owner's confirmation. The original workbooks and starter records remain unchanged.

No package quantities or identities were invented. Incomplete named entries and both placeholders are flagged in Settings, with links to their existing ingredient editor. The current installed library is checked too. Actual package measurements and missing identities are still needed to finish those data corrections.
