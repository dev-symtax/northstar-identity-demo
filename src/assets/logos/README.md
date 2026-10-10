Official asset slots are defined in `src/data/assets.js`:

- `sap` → SAP
- `snow` → ServiceNow (`servicenow` slot)
- `workday` → Workday
- `powerbi` → Microsoft Power BI (`microsoft-power-bi` slot)
- `entra` → Microsoft Entra ID (`microsoft-entra-id` slot)

No official logo files were supplied. These slots intentionally contain `null`,
so the interface uses neutral category icons and initials. Finance Hub uses a
generic finance icon; Legacy Finance DB uses a database cylinder and Manual label.
To replace a slot, store the supplied official SVG/PNG here, import it in the
registry and assign its import to `asset`. Vite bundles it locally and the
standalone build inlines it. Do not use a remote URL or recreate a brand logo.
