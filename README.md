# Northstar Identity

A fictional enterprise identity governance demo for a 10–15 minute Solution Validation / Technical Evaluation presentation to Meridian Global. Built with Vite, React and JavaScript. All data, approvals, connector executions, tickets and audit records are synthetic and local. There is no backend, authentication or external API integration.

## Development

Use Node.js 22.12+ or 24 LTS and npm. From the repository root:

```sh
npm ci
npm run dev
```

This cloud workspace uses `/workspace/northstar-identity-demo`. If the default npm cache is not writable, pass `--cache /workspace/.npm-cache` to `npm ci`. Each cloud task is already isolated; use the existing checkout without creating a worktree.

## Production build

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

The `dist/` directory is a self-contained static site. Serve it with any static HTTP server. Runtime requests go only to the serving origin; fonts, icons, data and application behavior do not depend on external services. A live server process must be restarted when restoring a cloud snapshot.

## Standalone offline export

```sh
npm run build:standalone
```

The output is **`dist-standalone/index.html`**. This is the only file in that directory and the only file needed to share the demo. The separate Vite configuration uses `vite-plugin-singlefile` to embed all application JavaScript, CSS and imported assets. Both Plus Jakarta Sans WOFF2 files are embedded as base64 data URIs; icons are inline SVG. The font copyright and full OFL license are embedded in a non-executable JSON element in the HTML. There are no runtime services, external fonts, scripts, styles or analytics. The existing `dev`, `build`, `preview` and browser-test workflows are unchanged; the standalone build does not overwrite `dist/`.

Open the HTML directly where your browser permits local files. This cloud environment's managed Chromium blocks `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so direct opening could not be validated here. Browsers can also restrict storage or downloads for local files. The simplest fully offline fallback, from the repository root, is:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist-standalone
```

Open **http://127.0.0.1:8080/index.html**. No internet connection or npm package download is needed to serve it. On another machine, place `index.html` in a directory and serve that directory with Python's standard-library server. Keep the same browser, hostname and port to retain `localStorage` progress; moving between origins starts a separate saved scenario. Reset and JSON evidence export work locally.

Validate the export after building it:

```sh
npm run test:standalone
```

The suite verifies that the directory contains only the HTML, fonts match the repository files byte for byte, font faces actually load, and scripts/styles have no linked dependencies. With browser networking disabled, it supplies only the HTML document from disk and exercises approvals, independent agent blocking, fulfillment, JSON download, reload, reopening and reset. A separate test serves the same HTML through Python on loopback, blocks every other request, then disables browser networking and continues the scenario. Python 3 and a Playwright-compatible Chromium are required for these tests; the existing `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` override also applies.

Raw `http://` and `https://` strings in the generated HTML are limited to React error-documentation links, XML/SVG/MathML namespace identifiers and font-license references. They are metadata and diagnostic strings, not runtime requests or dependencies.

## Validation

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

If Chromium is already installed, use it without downloading another browser:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

The browser suite runs against the production build. It covers the complete approval flow, denial, late approval, legacy evidence, export, reload, reset, enterprise search, mobile navigation and operation with external requests blocked. State tests verify SoD order, independent agent boundaries, evidence separation and deterministic restoration.

## Presenter flow

1. **Identity overview:** introduce Sarah, her direct access, and the Finance Operations Agent. The directory contains 48 employees, 12 applications, 40 entitlements, 4 agents and 4 movers. Meridian’s 35,000 employees refer to the fictional enterprise; the directory is a representative demo cohort.
2. **Role change event:** Workday changes Finance Analyst to Finance Manager, effective Monday, 12 October 2026. Click **Evaluate access**.
3. **Governance decision:** show human keep/grant/remove/review decisions. Open **Review exception**, record the rationale, and approve conditionally or deny. In **AI agent access**, show inbound eligibility and outbound permissions. SAP Payment Approval stays blocked for the agent regardless of the human review.
4. **Fulfillment:** click **Run Monday fulfillment**. The scenario clock advances from Friday to Monday. Connected changes execute; incompatible receivables access is removed before payment approval can activate. The legacy task remains open. Open **Record completion evidence**, use the sample evidence or enter a fictional reference and verification note, and confirm both direct and delegated removals.
5. **Evidence:** distinguish decision evidence (who, what, why, policy, timestamp, decision) from fulfillment evidence (how, status, owner, SLA, completion reference). Open a record for its full details. **Show full history** retains earlier review and task-open states. **Export evidence** downloads both trails as a local JSON audit bundle.

Payment approval is an additional privilege, not a prerequisite for Sarah’s core-role productivity. Pending or denied review does not block the required manager access. An open legacy task prevents claiming that obsolete access removal is complete.

Use **Reset demo → Reset to start** before the panel. Reload preserves valid scenario actions in versioned `localStorage`; reset clears the scenario and both evidence trails. If storage is blocked or corrupted, the application safely returns to the start and warns when persistence is unavailable. All scenario dates and evidence times are fixed in UTC rather than using the presentation date.

Meridian’s 72% mover readiness is a fictional customer baseline and 95%+ is a target. A single demo event does not demonstrate an enterprise-wide improvement.

## Scope

Sarah is the fully interactive scenario. Other identities, applications and agents have populated read-only details; the three additional movers establish enterprise context. Policies are explicit scenario rules, not a general-purpose policy engine. No real fulfillment or audit assurance is claimed.

## Visual identity

The interface follows the Meridian Global presentation: locally bundled Plus Jakarta Sans, navy `#0B1530`, teal `#0B7A6E`, restrained bright teal `#19C3B1`, and mint `#E6F4F1`. The wordmark reproduces the presentation’s text treatment; no separate symbol is introduced. Shared tokens live in `src/styles/tokens.css`. The Latin and Latin Extended variable WOFF2 files are checked into `src/assets/fonts/`, sourced from `@fontsource-variable/plus-jakarta-sans` 5.3.0, and referenced by local `@font-face` declarations in `src/styles/fonts.css`. The normal build emits font assets; the standalone build embeds them. The SIL Open Font License is distributed in `public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt` and embedded in the standalone HTML. No external font CDN is used.
