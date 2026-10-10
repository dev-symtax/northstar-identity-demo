# Official application logo registry

`src/data/assets.js` maps application IDs to local assets. Connector records carry the same application ID, so all screens use one registry. The supplied `connector_logo_official_sources.zip` contains source links only, with no image binaries. All eight official logo slots therefore retain their neutral fallback. No brand marks were recreated.

The missing official SVG files (official transparent PNG equivalents are also accepted) are:

| Application ID | Required file | Mark |
| --- | --- | --- |
| sap | sap-s4hana.svg | Official SAP S/4HANA mark, or an approved SAP primary logo with the nearby S/4HANA application label |
| powerbi | microsoft-power-bi.svg | Official Power BI product icon |
| workday | workday.svg | Official Workday primary logo |
| entra | microsoft-entra-id.svg | Official Microsoft Entra ID product icon |
| ad | active-directory.svg | Official on-premises Active Directory / AD DS icon; do not substitute Entra ID |
| snow | servicenow.svg | Official ServiceNow logo |
| salesforce | salesforce.svg | Official Salesforce cloud logo |
| m365 | microsoft-365.svg | Official Microsoft 365 product icon |

Store official supplied assets here, import them in the registry, and assign their import to `asset`. Vite bundles them locally and the standalone build embeds them. Never assign remote URLs or imitate brand marks. Official images render at 22px on the existing white tile.

Finance Hub keeps the generic finance icon. Legacy Finance DB keeps the database icon and Manual label. Warehouse Operations and Legal Document Vault also use category fallbacks.
