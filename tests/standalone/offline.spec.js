import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  EDIT_COMMENT, REVIEW_COMMENT, COMPLETION_REFERENCE, accessRow, applyDecisions,
  assertKeyAuditRecords, assertProductLanguage, changeRow, confirmCompletion,
  decideAll, downloadAudit, expandConnected, expectFullyInViewport, nav, provision, recommend,
} from '../helpers/iga-flow.js';

const output = new URL('../../dist-standalone/', import.meta.url);
const appUrl = 'http://127.0.0.1:4180/index.html';

async function supplyOfflineDocument(context) {
  // Supply only the exported document from disk. Browser networking is disabled
  // and every asset/API request is blocked, including requests to loopback.
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().url() === appUrl) {
      return route.fulfill({ path: fileURLToPath(new URL('index.html', output)), contentType: 'text/html' });
    }
    return route.abort();
  });
}

async function disableNetworking(context) {
  // Chromium may reset navigator.onLine after intercepted navigation. Routing
  // continues to block all dependencies during this offline-emulation toggle.
  await context.setOffline(false);
  await context.setOffline(true);
}

function observeRequests(page) {
  const unexpected = [];
  page.on('request', request => {
    const url = request.url();
    if (url !== appUrl && !url.startsWith('blob:') && !url.startsWith('data:')) unexpected.push(url);
  });
  return unexpected;
}

test('single HTML embeds scripts, styles, assets and exact local fonts and license while offline', async ({ page, context }) => {
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
  await page.goto(appUrl);
  await disableNetworking(context);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await assertProductLanguage(page);
  await expect(page.locator('script[src], link[rel="stylesheet"]')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  await expect(page).toHaveTitle('Northstar Identity · Meridian Global');
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
      externalLinks: [...document.querySelectorAll('a[href]')].map(anchor => anchor.getAttribute('href')).filter(href => /^https?:\/\//i.test(href)),
    };
  });
  expect(assets.fonts).toHaveLength(2);
  for (const font of assets.fonts) expect(font).toEqual({ family: 'Plus Jakarta Sans', status: 'loaded' });
  for (const image of assets.images) expect(image).toMatch(/^data:/);
  const directoryPortraits = page.locator('.directory-table .avatar img');
  await expect(directoryPortraits).toHaveCount(48);
  await expect.poll(async () => directoryPortraits.evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 192 && image.naturalHeight === 192))).toBe(true);
  expect(await directoryPortraits.evaluateAll(images => new Set(images.map(image => image.src)).size)).toBe(48);
  const photos = await page.getByRole('img', { name: /Patrick Sena|Sarah Miller/ }).evaluateAll(images => images.map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth === 192 && image.naturalHeight === 192 })));
  for (const photo of photos) expect(photo.loaded).toBe(true);
  for (const name of ['patrick-sena', 'sarah-miller']) {
    const original = await readFile(new URL(`../../src/assets/people/${name}.jpg`, import.meta.url));
    expect(original.length).toBeLessThan(40000);
    expect(photos.some(photo => Buffer.from(photo.src.split(',')[1], 'base64').equals(original))).toBe(true);
  }
  for (const css of assets.styles) {
    expect(css).not.toMatch(/@import\b/);
    for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) expect(match[1]).toMatch(/^data:/);
  }
  expect(assets.license).toEqual(await readFile(new URL('../../public/fonts/PLUS-JAKARTA-SANS-LICENSE.txt', import.meta.url), 'utf8'));
  expect(assets.externalLinks).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('offline navigation, drawers, profile portraits and all application fallback tiles load without requests', async ({ page, context }) => {
  const unexpected = observeRequests(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await supplyOfflineDocument(context);
  await page.goto(appUrl);
  await disableNetworking(context);
  for (const name of ['My tasks', 'Lifecycle events', 'Access requests', 'Access certifications', 'Policies', 'Roles', 'AI agents', 'Applications', 'Connectors', 'Workday source', 'Audit trail', 'Reports']) {
    await nav(page, name);
    const rows = page.locator('.workspace-records tbody tr');
    expect(await rows.count()).toBeGreaterThan(0);
    await rows.nth(name === 'Lifecycle events' ? 1 : 0).getByRole('button').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertProductLanguage(page);
    await page.keyboard.press('Escape');
  }
  await nav(page, 'Applications');
  await expect(page.locator('[data-asset-kind="category"]')).toHaveCount(12);
  for (const location of ['header', 'sidebar']) {
    await page.getByRole('button', { name: `Open Patrick Sena profile · ${location}`, exact: true }).click();
    const profile = page.getByRole('dialog', { name: 'Patrick Sena profile' });
    await expect(profile).toContainText('patrick.sena@meridianglobal.com');
    const photo = profile.getByRole('img', { name: 'Patrick Sena' });
    await expect(photo).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    expect(await photo.evaluate(image => image.complete && image.naturalWidth === 192)).toBe(true);
    await page.keyboard.press('Escape');
  }
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test('offline full approval path supports provisioning, editable completion, JSON export, persistence and hidden reset', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const unexpected = observeRequests(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await supplyOfflineDocument(context);
  await page.goto(appUrl);
  await disableNetworking(context);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(page.locator('.story-steps')).toHaveCount(0);
  await expect(page.locator('.app-footer')).toContainText('Today: Tuesday, 13 Oct 2026');
  await recommend(page);
  await expectFullyInViewport(page, page.locator('.exception-panel'));
  await decideAll(page);
  await page.getByRole('button', { name: 'View agent permissions', exact: true }).click();
  await expect(accessRow(page, 'a-payment')).toHaveClass(/agent-block-highlight/);
  await expect(accessRow(page, 'a-payment')).toContainText('Not permitted by policy');
  await applyDecisions(page);
  await provision(page);
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await page.getByRole('button', { name: 'Return to lifecycle events', exact: true }).click();
  const mover = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await expect(mover).toContainText('Manual task open');
  await mover.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Provisioning', exact: true })).toBeVisible();
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await confirmCompletion(page);
  await expect(page.locator('.legacy-panel .badge')).toHaveText('Completed');
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await expect(page.getByLabel('Access lifecycle', { exact: true })).toBeVisible();
  await accessRow(page, 'a-payment').getByRole('button', { name: 'View policy POL-AI-303', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('cannot be overridden for an AI agent');
  await page.keyboard.press('Escape');
  await assertKeyAuditRecords(page);
  await expect(accessRow(page, 'h-payment')).toContainText(REVIEW_COMMENT);
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  for (const id of ['h-legacy', 'a-legacy']) {
    await expect(accessRow(page, id)).toContainText('Removed');
    await expect(accessRow(page, id)).toContainText(COMPLETION_REFERENCE);
  }
  const bundle = await downloadAudit(page);
  expect(bundle.effectiveDate).toBe('2026-10-19');
  expect(bundle.legacyTask.status).toBe('Completed');
  expect(bundle.lifecycleEvidence).toHaveLength(1);
  expect(bundle.accessDecisions).toHaveLength(16);
  expect(bundle.decisionEvidence.filter(record => record.rowId === 'h-payment').at(-1)).toMatchObject({ decidedAction: 'GRANT', decidedBy: 'Patrick Sena · Head of Identity Governance', decidedAt: '2026-10-13T09:01:00.000Z', comment: REVIEW_COMMENT });
  expect(bundle.decisionEvidence.filter(record => record.rowId === 'a-payment').at(-1)).toMatchObject({ status: 'Policy-locked', decidedAction: 'NOT_PERMITTED', policyId: 'POL-AI-303' });
  for (const record of bundle.provisioningEvidence || bundle.fulfillmentEvidence) expect(record.timestamp.slice(0, 10)).toBe('2026-10-19');
  await page.reload();
  await disableNetworking(context);
  await nav(page, 'Audit trail');
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(accessRow(page, 'h-legacy')).toContainText(COMPLETION_REFERENCE);
  const stored = await page.evaluate(() => Object.entries(localStorage));
  expect(stored.length).toBeGreaterThan(0);
  const reopened = await context.newPage();
  const reopenedRequests = observeRequests(reopened);
  await reopened.goto(appUrl);
  await disableNetworking(context);
  expect(await reopened.evaluate(() => Object.entries(localStorage))).toEqual(stored);
  await nav(reopened, 'Audit trail');
  await reopened.keyboard.press('Shift+G');
  await expect(reopened.getByRole('dialog', { name: '10-minute guide', exact: true })).toBeVisible();
  await reopened.keyboard.press('Escape');
  await assertProductLanguage(reopened);
  await reopened.keyboard.press('Shift+R');
  await expect(reopened.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(reopened.locator('.app-footer')).toContainText('Today: Tuesday, 13 Oct 2026');
  const resetState = await reopened.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
  expect(resetState).toMatchObject({ evaluated: false, applied: false, review: 'pending', fulfillmentStarted: false, accessDecisions: {}, tasks: {}, decisionEvidence: [], fulfillmentEvidence: [], actions: [] });
  await reopened.reload();
  await disableNetworking(context);
  await nav(reopened, 'Audit trail');
  await expect(reopened.locator('.workspace-records tbody tr')).toHaveCount(5);
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
  expect(reopenedRequests).toEqual([]);
});

test('offline Budget Approval edit is carried into the scheduled changes and audit export', async ({ page, context }) => {
  const unexpected = observeRequests(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await supplyOfflineDocument(context);
  await page.goto(appUrl);
  await disableNetworking(context);
  await recommend(page);
  await changeRow(page, 'h-budget', 'Do not grant', EDIT_COMMENT);
  await decideAll(page);
  await applyDecisions(page);
  await expandConnected(page);
  await expect(accessRow(page, 'h-budget')).toContainText('Do not grant');
  await accessRow(page, 'h-budget').getByRole('button', { name: `Review comment: ${EDIT_COMMENT}` }).click();
  await expect(page.getByRole('tooltip')).toHaveText(EDIT_COMMENT);
  await provision(page);
  await nav(page, 'Audit trail');
  await page.getByRole('button', { name: 'All (16)', exact: true }).click();
  await expect(accessRow(page, 'h-budget')).toContainText('Changed');
  await expect(accessRow(page, 'h-budget')).toContainText(EDIT_COMMENT);
  const bundle = await downloadAudit(page);
  expect(bundle.decisionEvidence.filter(record => record.rowId === 'h-budget').at(-1)).toMatchObject({ recommendedAction: 'GRANT', decidedAction: 'DO_NOT_GRANT', status: 'Changed', comment: EDIT_COMMENT });
  expect((bundle.provisioningEvidence || bundle.fulfillmentEvidence).find(record => record.rowId === 'h-budget').status).toBe('Not granted');
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('local static-server fallback', () => {
  test.use({ offline: false });
  test('loads only the HTML from loopback and continues with browser networking disabled', async ({ page, context }) => {
    const unexpected = observeRequests(page);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.route('**/*', route => {
      if (route.request().isNavigationRequest() && route.request().url() === appUrl) return route.continue();
      return route.abort();
    });
    await page.goto(appUrl);
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await recommend(page);
    expect(requests).toEqual([appUrl]);
    expect(unexpected).toEqual([]);
  });
});
