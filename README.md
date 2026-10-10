# Northstar Identity

An offline identity governance scenario for Meridian Global, built with Vite, React and JavaScript. Sarah Miller moves from Finance Analyst to Finance Manager on Monday, 19 October 2026. Workday receives the event on Tuesday, 13 October at 09:00 UTC. Patrick Sena, Head of Identity Governance, reviews access for Sarah and the Finance Operations Agent. All records and connector operations are local; no real system is connected.

## Development and production

Use Node.js 22.12+ or 24 LTS and npm:

```sh
npm ci
npm run dev
npm run build
npm run preview -- --port 4173 --strictPort
```

The cloud checkout is `/workspace/northstar-identity-demo`. If necessary, use `--cache /workspace/.npm-cache` with npm. The development server binds to `0.0.0.0:5173`. The normal production build stays in `dist/`.

## Decisions and provisioning

Each recommendation stores its policy, reason, chosen action, status, reviewer, UTC timestamp and comment. Standard recommendations can be accepted individually or by scope. Overrides and denials require comments. Existing access can be kept or removed; new access can be granted or withheld. Agent usage follows the same decision model.

SAP Payment Approval requires explicit review under POL-RISK-204. POL-SOD-017 prevents keeping Accounts Receivable Operator while payment approval is pending or approved. Resolve the conflict by removing receivables access or denying payment approval. Agent payment approval is locked by POL-AI-303 and cannot be overridden.

**Apply decisions** stays disabled until all 14 records are decided and the policy violation is resolved. Its confirmation summarizes actions and applications. Applying schedules the chosen decisions and freezes their values; it does not provision access. **Provision changes** advances the clock to Monday, 19 October at 08:00 UTC, executes removals before conflicting grants, and creates a manual task only for legacy removals actually chosen. Human and agent scopes can differ. The ServiceNow task is due at 12:00 UTC. **Confirm completion** records the editable completion reference and verification note for its actual scope.

The audit trail separates recommendations, final decisions and comments from provisioning methods, statuses, owners, SLAs and references. It defaults to five key records and can show all 14 current records or their full history. JSON export includes the complete trails regardless of the table filter.

## Operator controls and 10-minute guide

These controls have no visible entry points in the application:

- **Shift+G** opens the 10-minute guide. Escape closes it.
- **Shift+R** restores original access, clears decisions and provisioning, and returns to Identity overview.
- **`?reset=1`** performs the same reset on load and removes the parameter from the URL.

1. **Identity · 1 min:** inspect Sarah's current access and the AI agent identity owned by Sarah. Explain agent usage and agent permissions.
2. **Lifecycle event · 1 min:** inspect the source event, effective date, affected access and policies. Click **Review access recommendations**.
3. **Recommendations · 3 min:** accept standard recommendations on both tabs. Review SAP Payment Approval and click **Approve** with a comment. Show the locked agent payment permission. Demonstrate an override or SoD conflict if needed. Click **Apply decisions**, inspect its summary and apply.
4. **Provisioning · 2 min:** inspect scheduled decisions, then click **Provision changes**. Check automated results and the manual task. Click **Confirm completion**, edit the reference or verification note if needed, and confirm.
5. **Audit trail · 2 min:** inspect the five key records in **Decisions** and **Provisioning**, including comments and completion references. Show all records and export JSON.
6. **Outcomes · 1 min:** discuss security, HR and architecture outcomes in the presentation. Meridian's 72% baseline and 95% target are program measures; one role change does not establish an enterprise-wide result.

## Standalone offline export

```sh
npm run build:standalone
```

The sole output is **`dist-standalone/index.html`**. The separate Vite configuration uses `vite-plugin-singlefile` to inline JavaScript, CSS and imported assets. Both local Plus Jakarta Sans WOFF2 files are embedded as data URIs; icons are inline SVG. The font copyright and full SIL Open Font License are embedded in a non-executable JSON element. No external fonts, scripts, styles, APIs or analytics are used. The standalone build does not overwrite `dist/`.

Open the HTML directly where browser policy allows it. This cloud environment's managed Chromium blocks `file://` with `ERR_BLOCKED_BY_ADMINISTRATOR`; direct opening cannot be validated here. The simplest fully offline fallback is:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist-standalone
```

Open **http://127.0.0.1:8080/index.html**. This needs no internet or package download. Keep the browser, hostname and port unchanged to retain `localStorage` progress. If storage is unavailable, the current session still works and the application reports that reload cannot preserve it. Versioned action replay rebuilds derived state and audit records; saved states from the previous interaction model reset safely.

Raw HTTP strings in the built HTML are React diagnostic links, XML/SVG/MathML namespace identifiers and font-license metadata. They do not cause runtime requests.

## Validation

```sh
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build:standalone
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:standalone
```

Both builds enforce the product-text guard. It parses source JSX, strings and accessible labels, then checks rendered text properties and HTML metadata in the output. Presentation terms and retired slogans fail the build. Internal storage keys, import paths and CSS identifiers are excluded because they are not user-visible text. Browser tests also sweep rendered screens, drawers and accessible labels.

Coverage includes the complete approval/apply/provision/complete/audit/reset path, Budget Approval withheld with a comment, both SoD resolutions, immutable agent policy enforcement, application prerequisites, 1920×1080 focus visibility, guide/reset shortcuts, URL reset, JSON export and persistence. Offline tests supply the sole HTML from disk with every network dependency blocked, load both exact local fonts, and exercise the full path. A Python loopback test validates the offline static-server fallback.

## Visual identity and scope

Colors, typography and layout language retain the Meridian visual identity: local Plus Jakarta Sans, navy `#0B1530`, teal `#0B7A6E`, bright teal `#19C3B1`, and mint `#E6F4F1`. Tokens are in `src/styles/tokens.css`. Font files are in `src/assets/fonts/`; local `@font-face` declarations are in `src/styles/fonts.css`. The font license is in `public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt`.

Sarah is the interactive scenario. The other 47 identities, 12 applications, 40 entitlements, four agents and four lifecycle events retain inspectable directory data. The policy rules implement this scenario rather than a general-purpose policy engine.
