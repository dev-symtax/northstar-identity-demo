# Local application logos

`src/data/assets.js` is the central registry. Connector records use the same application IDs, so every screen and drawer shares these assets.

| Application ID | Application | Supplied filename |
| --- | --- | --- |
| `sap` | SAP S/4HANA | `SAP_2011_logo.svg` |
| `powerbi` | Microsoft Power BI | `New_Power_BI_Logo.svg` |
| `workday` | Workday | `Workday_logo.svg` |
| `ad` | Active Directory | `active-directory.svg` |
| `snow` | ServiceNow | `ServiceNow_logo.svg` |
| `salesforce` | Salesforce | `Salesforce.com_logo.svg` |
| `m365` | Microsoft 365 | `Microsoft_365_logo.svg` |
| `entra` | Microsoft Entra ID | `Microsoft_Entra_ID_color_icon.svg` |

The supplied SVG files are stored byte-for-byte unchanged: no recoloring, cropping, redrawing or reinterpretation. They render with `object-fit: contain` at 22×22px in the existing 28×28px white tile. Vite bundles them locally; the standalone build embeds them as data URIs. No remote URLs or brand approximations are used.

All eight supplied application logos use this registry. Finance Hub keeps its generic finance icon. Legacy Finance DB keeps its database icon and Manual badge. Other applications without supplied logos retain their category icons.

The supplied Meridian Global tenant logo is stored byte-for-byte unchanged in `meridian-global.png` and registered separately as `tenantAssets.meridian` in `src/data/assets.js`. `TenantLogo` displays its globe monogram through a compact CSS viewport in the existing 31px sidebar tenant slot, alongside the existing tenant text. This viewport excludes the wordmark entirely; it preserves the original pixel colors and aspect ratio. The original full horizontal PNG, including its transparency and wordmark, remains available in the registry and is embedded unchanged in the standalone HTML. The white header and profile surfaces retain their text labels. Northstar product branding, favicon, application logos and identity portraits are unchanged.
