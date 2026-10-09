import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const output = new URL('../../dist-standalone/', import.meta.url);
const demoUrl = 'http://127.0.0.1:4180/index.html';

async function supplyOfflineDocument(context) {
  // Deliver the sole HTML document from disk without network access. Every
  // asset or API request remains blocked, including requests to localhost.
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().url() === demoUrl) {
      return route.fulfill({ path: fileURLToPath(new URL('index.html', output)), contentType: 'text/html' });
    }
    return route.abort();
  });
}

async function disableNetworking(context) {
  // Reapply offline emulation after an intercepted navigation: Chromium can
  // reset the renderer's online status when a document is fulfilled from disk.
  // Request routing still blocks every network dependency during this toggle.
  await context.setOffline(false);
  await context.setOffline(true);
}

function observeRequests(page) {
  const unexpected = [];
  page.on('request', request => {
    const url = request.url();
    if (url !== demoUrl && !url.startsWith('blob:') && !url.startsWith('data:')) unexpected.push(url);
  });
  return unexpected;
}

async function nav(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
}

test('one HTML embeds scripts, CSS, exact local fonts and their license while offline', async ({ page, context }) => {
  expect(await readdir(output)).toEqual(['index.html']);
  const html = await readFile(new URL('index.html', output), 'utf8');
  const fontData = [...html.matchAll(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/g)].map(match => Buffer.from(match[1], 'base64'));
  expect(fontData).toHaveLength(2);
  for (const name of ['latin', 'latin-ext']) {
    const original = await readFile(new URL(`../../src/assets/fonts/plus-jakarta-sans-${name}-wght-normal.woff2`, import.meta.url));
    expect(fontData.some(embedded => embedded.equals(original))).toBe(true);
  }
  const unexpected = observeRequests(page);
  await supplyOfflineDocument(context);
  await page.goto(demoUrl);
  await disableNetworking(context);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
  await expect(page.locator('script[src], link[href]')).toHaveCount(0);
  await expect(page.locator('script[type="module"]')).toHaveCount(1);
  await expect(page.locator('style')).toHaveCount(1);
  const assets = await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('500 16px "Plus Jakarta Sans"', 'Ā');
    return {
      fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
      images: [...document.images].map(image => image.getAttribute('src')),
      styles: [...document.querySelectorAll('style')].map(style => style.textContent),
      license: JSON.parse(document.getElementById('plus-jakarta-sans-license').textContent).license,
    };
  });
  expect(assets.fonts).toHaveLength(2);
  for (const font of assets.fonts) expect(font).toEqual({ family: 'Plus Jakarta Sans', status: 'loaded' });
  for (const image of assets.images) expect(image).toMatch(/^data:/);
  for (const css of assets.styles) {
    expect(css).not.toMatch(/@import\b/);
    for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) expect(match[1]).toMatch(/^data:/);
  }
  expect(assets.license).toEqual(await readFile(new URL('../../public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt', import.meta.url), 'utf8'));
  expect(unexpected).toEqual([]);
});

test('offline HTML preserves the complete story, JSON export, persistence and reset', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const unexpected = observeRequests(page);
  await supplyOfflineDocument(context);
  await page.goto(demoUrl);
  await disableNetworking(context);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.locator('.effective-date')).toContainText('Monday, 19 October 2026');
  await expect(page.locator('.app-footer')).toContainText('Workspace date: Tuesday, 13 Oct 2026');
  await nav(page, 'Role change event');
  await expect(page.locator('main')).toContainText('Tuesday, 13 October 2026 · 09:00 UTC');
  await page.getByRole('button', { name: 'Evaluate access', exact: true }).first().click();
  await expect(page.locator('.exception-panel')).toBeInViewport();
  await page.getByRole('button', { name: 'Review exception' }).click();
  await expect(page.getByRole('dialog')).toContainText('Patrick Sena · Head of Identity Governance');
  await page.getByLabel('Decision rationale').fill('Offline validation: approved with conflicting receivables access removed first.');
  await page.getByRole('button', { name: 'Approve with sign-off' }).click();
  await expect(page.getByRole('status')).toContainText('Approved for Sarah. Her agent remains blocked: payment approval is never inherited.');
  await expect(page.getByRole('status')).toBeInViewport();
  await page.getByRole('button', { name: 'View agent decisions' }).click();
  await expect(page.getByRole('tab', { name: 'AI agent access' })).toHaveAttribute('aria-selected', 'true');
  const blockedPayment = page.locator('tr').filter({ hasText: 'SAP Payment Approval' });
  await expect(blockedPayment).toContainText('BLOCK');
  await expect(blockedPayment).toHaveClass(/agent-block-highlight/);
  await expect(blockedPayment).toBeInViewport();
  await nav(page, 'Fulfillment');
  await page.getByRole('button', { name: 'Run Monday fulfillment' }).click();
  await expect(page.locator('.legacy-panel')).toBeInViewport();
  await expect(page.locator('.legacy-panel')).toContainText('Monday 19 October · 12:00 UTC');
  await expect(page.locator('.app-footer')).toContainText('Workspace date: Monday, 19 Oct 2026');
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('Granted');
  await page.getByRole('button', { name: 'Record completion evidence' }).click();
  await page.getByRole('button', { name: 'Use sample demo evidence' }).click();
  await page.getByRole('button', { name: 'Confirm both removals' }).click();
  await nav(page, 'Evidence');
  await expect(page.locator('.evidence-panel thead')).toBeInViewport();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
  expect((await page.locator('.evidence-panel tbody tr').evaluateAll(rows => rows.map(row => row.dataset.rowId))).sort()).toEqual(['a-inbound', 'a-legacy', 'a-payment', 'h-legacy', 'h-payment']);
  await expect(page.locator('tr[data-row-id="h-payment"]')).toContainText('APPROVED');
  await expect(page.locator('tr[data-row-id="a-payment"]')).toContainText('BLOCK');
  await expect(page.locator('tr[data-row-id="a-inbound"]')).toContainText('KEEP');
  await page.getByRole('button', { name: 'Show all 14 records' }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(14);
  await page.getByRole('button', { name: 'Show 5 key records' }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Fulfillment evidence' }).click();
  const legacyRows = page.locator('tr').filter({ hasText: 'Legacy Finance DB Write' });
  await expect(legacyRows).toHaveCount(2);
  for (const row of await legacyRows.all()) {
    await expect(row).toContainText('Removed');
    await expect(row).toContainText('CHG-2026-1042');
  }
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence' }).click();
  const download = await downloadEvent;
  const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(bundle.effectiveDate).toBe('2026-10-19');
  for (const record of bundle.decisionEvidence) expect(record.timestamp).toBe(record.decision === 'APPROVED' ? '2026-10-13T09:01:00.000Z' : '2026-10-13T09:00:00.000Z');
  expect(bundle.decisionEvidence.find(record => record.decision === 'APPROVED').actor).toBe('Patrick Sena · Head of Identity Governance');
  for (const record of bundle.fulfillmentEvidence) expect(record.timestamp.slice(0, 10)).toBe('2026-10-19');
  for (const record of bundle.fulfillmentEvidence.filter(record => ['h-legacy', 'a-legacy'].includes(record.rowId))) expect(record.sla).toBe('Monday 19 October · 12:00 UTC');
  expect(bundle.outcomes.allControlsResolved).toBe(true);
  expect(bundle.decisionEvidence).toHaveLength(15);
  expect(bundle.decisionEvidence.some(record => record.why.startsWith('Offline validation:'))).toBe(true);
  expect(bundle.fulfillmentEvidence.some(record => record.scope === 'outbound' && record.resource === 'SAP Payment Approval' && record.status === 'Blocked')).toBe(true);
  await page.reload();
  await disableNetworking(context);
  await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
  const stored = await page.evaluate(() => Object.entries(localStorage));
  expect(stored.length).toBeGreaterThan(0);
  const reopened = await context.newPage();
  const reopenedRequests = observeRequests(reopened);
  await reopened.goto(demoUrl);
  await disableNetworking(context);
  await nav(reopened, 'Evidence');
  await expect(reopened.getByRole('heading', { name: 'Explain the decision. Prove the control.' })).toBeVisible();
  expect(await reopened.evaluate(() => Object.entries(localStorage))).toEqual(stored);
  await reopened.getByRole('button', { name: 'Reset demo' }).click();
  await reopened.getByRole('button', { name: 'Reset to start' }).click();
  await expect(reopened.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
  await expect(reopened.locator('.app-footer')).toContainText('Workspace date: Tuesday, 13 Oct 2026');
  const resetState = await reopened.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
  expect(resetState).toMatchObject({ evaluated: false, review: 'pending', fulfillmentStarted: false, tasks: {}, decisionEvidence: [], fulfillmentEvidence: [], actions: [] });
  await reopened.reload();
  await disableNetworking(context);
  await nav(reopened, 'Evidence');
  await expect(reopened.getByRole('heading', { name: 'No evidence recorded yet' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
  expect(reopenedRequests).toEqual([]);
});

test.describe('local static-server fallback', () => {
  test.use({ offline: false });
  test('loads only the HTML from loopback and continues with browser networking disabled', async ({ page, context }) => {
    const unexpected = observeRequests(page);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest() && route.request().url() === demoUrl) return route.continue();
      return route.abort();
    });
    await page.goto(demoUrl);
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
    await nav(page, 'Role change event');
    await page.getByRole('button', { name: 'Evaluate access', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Access that fits the new role.' })).toBeVisible();
    expect(requests).toEqual([demoUrl]);
    expect(unexpected).toEqual([]);
  });
});
