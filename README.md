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

Each recommendation stores its policy, reason, chosen action, status, reviewer, UTC timestamp and comment. Standard recommendations can be accepted individually or by scope. Overrides and rejections require comments. Reject opens the same editor as Change with the opposite action selected; a comment is required. Existing access can be kept or removed; new access can be granted or withheld. Agent usage follows the same decision model.

SAP Payment Approval requires explicit review under POL-RISK-204. POL-SOD-017 prevents keeping Accounts Receivable Operator while payment approval is pending or approved. Resolve the conflict by removing receivables access or denying payment approval. Agent payment approval is locked by POL-AI-303 and cannot be overridden.

**Apply decisions** stays disabled until all 16 records are decided and the policy violation is resolved. Its confirmation summarizes actions and applications. Applying schedules the chosen decisions and freezes their values; it does not provision access. **Provision changes** runs the scheduled operation on Monday, 19 October at 08:00 UTC, executes removals before conflicting grants, and creates a manual task only for legacy removals actually chosen. Human and agent scopes can differ. The global Today date remains Tuesday, 13 October throughout the session; the Provisioning header reports the separate run date. The connected change count includes only actual grants and removals, excluding unchanged access, withheld grants, locked permissions and manual removals. The default is 0 of 7 before the run and 7 of 7 after; withholding Budget Approval gives 6 of 6. Connected results are collapsed, and unchanged access is hidden unless selected. Review comments open as tooltips. The ServiceNow task is due at 12:00 UTC. **Confirm completion** records the editable completion reference and verification note for its actual scope.

The audit trail separates recommendations, final decisions and comments from provisioning methods, statuses, owners, SLAs and references. It defaults to All (16), with Key controls (five records), Overrides, Policy-locked and Manual tasks filters, plus full history. Every policy ID in the Decisions table opens a read-only policy drawer, including its rule and decision result; closing it preserves the selected tab, filter, history setting and scroll position. JSON export includes the complete trails, manual-task status and lifecycle completion history regardless of the table filter.

Sarah retains **ServiceNow · Employee Self Service** (KEEP) and receives **ServiceNow · Finance Request Approver** (GRANT). These replace the prior ServiceNow Requester and Change Approver catalog entries, keeping 40 entitlements. All previous recommendations remain, producing nine human and seven agent records. Sarah starts with five entitlements and ends with seven on the standard approved path.

The lifecycle stepper appears only inside Sarah’s opened workflow, including its Audit Trail. After provisioning runs, **View audit trail** is the primary next action, even while a manual task is open. Workflow Audit Trail places primary **Return to lifecycle events** first and secondary **Export audit trail** beside it. Global sidebar Audit Trail omits the lifecycle-return action. Overview, global Lifecycle events and sidebar Audit Trail have no stepper. The Workday source label keeps the application name and mover-event label together.

After the automated run, Sarah’s event is **Manual task open** until completion evidence is recorded. From workflow Audit Trail, returning to Lifecycle events and reopening Sarah resumes the highlighted legacy task directly, including after a reload. The task and event then become **Completed**, one lifecycle-completion record is appended to audit history, and reopening Sarah leads to her Audit Trail. The task’s access-removal records continue to show Removed.

## Operator controls and 10-minute guide

These controls have no visible entry points in the application:

- **Shift+G** opens the 10-minute guide. Escape closes it.
- **Shift+R** restores original access, clears decisions and provisioning, and returns to Overview.
- **`?reset=1`** performs the same reset on load and removes the parameter from the URL.

1. **Identity · 1 min:** inspect Sarah's current access and the AI agent identity owned by Sarah. Explain agent usage and agent permissions.
2. **Lifecycle event · 1 min:** open Lifecycle events and select Sarah Miller, then inspect the source event, effective date, affected access and policies. Click **Review access recommendations**.
3. **Recommendations · 3 min:** accept standard recommendations on both tabs. Review SAP Payment Approval and click **Approve** with a comment. Show the locked agent payment permission. Demonstrate an override or SoD conflict if needed. Click **Apply decisions**, inspect its summary and apply.
4. **Provisioning · 2 min:** inspect scheduled decisions, then click **Provision changes**. Check automated results and the manual task. Click **View audit trail** to continue, including while the task is open.
5. **Audit trail · 2 min:** start with All (16) in **Decisions**, inspect ServiceNow KEEP/GRANT, open POL-SOD-017 and POL-AI-303, and inspect the five Key controls. View **Provisioning**, then **Return to lifecycle events**. See **Manual task open** and reopen Sarah to resume the highlighted task. Confirm completion with a reference and verification note, review Audit Trail and full lifecycle history, and return to the queue. Reopening the completed event shows Audit Trail. JSON export remains optional.
6. **Outcomes · 1 min:** discuss security, HR and architecture outcomes in the presentation. Meridian's 72% baseline and 95%+ target are program measures; one role change does not establish an enterprise-wide result.

## Standalone offline export

```sh
npm run build:standalone
```

The sole output is **`dist-standalone/index.html`**. The separate Vite configuration uses `vite-plugin-singlefile` to inline JavaScript, CSS and imported assets. Both local Plus Jakarta Sans WOFF2 files are embedded as data URIs; icons and the favicon are inline SVG. Every locally bundled portrait is embedded as a JPEG data URI; Sarah and Patrick retain their original optimized 192×192 photos. The font copyright and full SIL Open Font License are embedded in a non-executable JSON element. No external fonts, scripts, styles, APIs or analytics are used. The standalone build does not overwrite `dist/`.

Open the HTML directly where browser policy allows it. This cloud environment's managed Chromium blocks `file://` with `ERR_BLOCKED_BY_ADMINISTRATOR`; direct opening cannot be validated here. The simplest fully offline fallback is:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist-standalone
```

Open **http://127.0.0.1:8080/index.html**. This needs no internet or package download. Keep the browser, hostname and port unchanged to retain `localStorage` progress. If storage is unavailable, the current session still works and the application reports that reload cannot preserve it. Versioned action replay rebuilds derived state and audit records; version 2 sessions migrate the two standard ServiceNow decisions while preserving their prior approval, overrides and task progress. Unsupported or invalid saved histories reset safely.

Raw HTTP strings in the built HTML are React diagnostic links, XML/SVG/MathML/RDF namespace identifiers, original SVG publisher metadata and font-license metadata. They do not cause runtime requests.

## Validation

```sh
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npm run build:standalone
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:standalone
```

Both builds enforce the product-text guard. It parses source JSX, strings and accessible labels, then checks rendered text properties and HTML metadata in the output. Presentation terms and retired slogans fail the build. Internal storage keys, import paths and CSS identifiers are excluded because they are not user-visible text. Browser tests also sweep rendered screens, drawers and accessible labels.

Coverage includes the complete approval/apply/provision/complete/audit/reset path, Budget Approval withheld with a comment, both SoD resolutions, immutable agent policy enforcement, application prerequisites, 1920×1080 focus visibility, guide/reset shortcuts, URL reset, JSON export and persistence. Logo checks compare the supplied SVG artwork with each mapped output asset, verify the unchanged tile dimensions and check consistent sources across screens and drawers. Workflow checks cover Provisioning → Audit Trail → operational queue, primary/secondary action hierarchy, mobile button containment and open/completed event resume after reload. Offline tests supply the sole HTML from disk with every network dependency blocked, load both exact local fonts and official logos, and exercise the full path. A Python loopback test validates the offline static-server fallback.

## Visual identity and scope

Colors, typography and layout language retain the Meridian visual identity: local Plus Jakarta Sans, navy `#0B1530`, teal `#0B7A6E`, bright teal `#19C3B1`, and mint `#E6F4F1`. Tokens are in `src/styles/tokens.css`. Font files are in `src/assets/fonts/`; local `@font-face` declarations are in `src/styles/fonts.css`. The font license is in `public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt`.

Sarah is the interactive scenario. The other 47 identities, 12 applications, 40 entitlements, four agents and four mover events retain inspectable directory data. The sidebar adds populated read-only tasks, lifecycle events (four movers, three joiners and two leavers), requests, certifications, policies, roles, agents, applications, connectors, Workday source, audit activity and reports. Rows open detail drawers; Sarah’s event opens the decision path. Reports distinguish the 72% baseline and 95%+ program target from one role change. The policy rules implement this scenario rather than a general-purpose policy engine.


## Portraits and application assets

Every directory identity has a locally bundled profile picture. The supplied originals are stored as optimized local JPEGs in `src/assets/people/`: Patrick is 5,427 bytes and Sarah is 9,508 bytes, each 192×192. Circular rendering uses centered `object-fit: cover`. Patrick appears in both profile controls, the factual profile popover and recorded-decision actors; Sarah appears in the global identity header and scenario screens. The other 47 directory identities use distinct locally generated fictional portraits, optimized to 192×192 JPEGs (265,260 bytes total, at most 7,490 bytes each) and bundled in the same registry. Additional fictional stakeholder portraits cover agent owners. There are no runtime image URLs.

Eight supplied official SVGs are stored unchanged in `src/assets/logos/` and mapped through `src/data/assets.js`, including `Microsoft_Entra_ID_color_icon.svg` for Microsoft Entra ID. Applications, connectors, access tables, recommendations, provisioning, Audit Trail and drawers share the same registry and existing 28px white tile with a 22px contained image. Imported logos are embedded in the standalone HTML. No brand marks are recreated or recolored. `src/assets/logos/README.md` lists exact filenames and mappings. Finance Hub uses a generic finance icon, Legacy Finance DB a database icon and Manual badge, and API applications a Connected indicator.

The normal development and production commands are unchanged. All changes belong to source; generated HTML is rebuilt. Browser acceptance checks cover every sidebar page and detail drawer, event filters, portraits/profile/title/favicon, Reject/comment/SoD behavior, 40px controls, reduced motion, actual provisioning counts, unchanged-access toggling and audit filters, alongside the original full-path regression checks.
