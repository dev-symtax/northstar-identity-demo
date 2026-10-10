import { test, expect } from '@playwright/test';
import { accessRow, applyDecisions, assertProductLanguage, changeRow, COMPLETION_NOTE, COMPLETION_REFERENCE, confirmCompletion, decideAll, downloadAudit, nav, provision, recommend } from '../helpers/iga-flow.js';

const storedState = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const manualRecords = page => page.locator('[data-audit-category="controlled-task"]');
const manualRecord = page => page.locator('[data-record-id="MF-SN-TASK-004812-completed"]');

test('Lifecycle Events and detail drawers show varied HR dates without changing Sarah’s mover timing', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Lifecycle events');
  const records = [
    ['WD-JOIN-2026-0731', 'Thursday, 1 October 2026', 'Completed'],
    ['WD-JOIN-2026-0732', 'Thursday, 15 October 2026', 'Awaiting effective date'],
    ['WD-JOIN-2026-0733', 'Sunday, 1 November 2026', 'Awaiting effective date'],
    ['WD-LEAVE-2026-0421', 'Wednesday, 30 September 2026', 'Completed'],
    ['WD-LEAVE-2026-0422', 'Thursday, 1 October 2026', 'Completed'],
  ];
  for (const [id, effective, status] of records) {
    const row = page.locator(`[data-record-id="${id}"]`);
    await expect(row.locator('td').nth(3)).toHaveText(effective);
    await expect(row.locator('td').nth(4)).toHaveText(status);
    await row.getByRole('button').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.locator('.detail-field').filter({ has: page.locator('dt', { hasText: /^Effective$/ }) })).toContainText(effective);
    await expect(drawer.locator('.detail-field').filter({ has: page.locator('dt', { hasText: /^Status$/ }) })).toContainText(status);
    await assertProductLanguage(page);
    await page.keyboard.press('Escape');
  }
  const sarah = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await expect(sarah).toContainText('Monday, 19 October 2026');
  await sarah.getByRole('button').first().click();
  await expect(page.locator('main')).toContainText('Tuesday, 13 October 2026 · 09:00 UTC');
  await expect(page.locator('main')).toContainText('Monday, 19 October 2026');
});

test('Show unchanged access includes only lifecycle KEEP entitlements alongside actual changes and preserves counts', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await changeRow(page, 'h-budget', 'Do not grant', 'Budget approval remains with the Finance Director.');
  await changeRow(page, 'h-bi', 'Remove', 'Reporting uses the management dashboard.');
  await decideAll(page);
  await applyDecisions(page);
  const changed = ['a-ar', 'a-dashboard', 'h-ar', 'h-bi', 'h-dashboard', 'h-payment', 'h-snow-approver'];
  const unchanged = ['a-bi', 'a-reports', 'h-sap', 'h-snow-self'];
  const connected = page.locator('.provisioning-connected');
  const rows = connected.locator('tbody tr');
  const checkbox = page.getByLabel('Show unchanged access');
  async function verify(completed) {
    const saved = await storedState(page);
    await expect(checkbox).not.toBeChecked();
    for (const include of [false, true, false]) {
      if (include) await checkbox.check();
      else await checkbox.uncheck();
      await expect(rows).toHaveCount(include ? 11 : 7);
      expect(await rows.evaluateAll(items => items.map(item => item.dataset.rowId).sort())).toEqual((include ? [...changed, ...unchanged] : changed).sort());
      await expect(connected).toContainText(`${completed} of 7 changes provisioned`);
      for (const id of ['h-budget', 'a-inbound', 'a-payment', 'h-legacy', 'a-legacy']) await expect(accessRow(page, id)).toHaveCount(0);
      await expect(connected).not.toContainText('Vendor Master Maintenance');
      expect(await storedState(page)).toEqual(saved);
    }
  }
  await verify(0);
  await provision(page);
  await verify(7);
  await page.reload();
  await nav(page, 'Lifecycle events');
  await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
  await verify(7);
});

test('completed controlled task has its own Martin Keller evidence in All, Manual tasks, export, reload and reset', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await recommend(page);
  await decideAll(page);
  await applyDecisions(page);
  await provision(page);
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All (17)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(manualRecord(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to lifecycle events', exact: true }).click();
  const sarah = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await sarah.getByRole('button').first().click();
  await confirmCompletion(page);
  await expect(sarah).toContainText('Completed');
  await sarah.getByRole('button').first().click();
  const completed = await storedState(page);
  for (const type of ['Decisions', 'Provisioning']) {
    await page.getByRole('tab', { name: type, exact: true }).click();
    await expect(page.getByRole('tab', { name: type, exact: true })).toHaveText(`${type}18`);
    await page.getByRole('button', { name: 'All (18)', exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(18);
    await expect(manualRecords(page)).toHaveCount(2);
    await expect(manualRecord(page)).toHaveCount(1);
    for (const text of ['Manual fulfillment', 'SN-TASK-004812', 'Martin Keller', 'Completed manual access removal', COMPLETION_REFERENCE]) await expect(manualRecord(page)).toContainText(text);
    await expect(manualRecord(page).getByRole('img', { name: 'Martin Keller', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manual tasks', exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(4);
    for (const id of ['h-legacy', 'a-legacy']) {
      await expect(accessRow(page, id)).toContainText(type === 'Decisions' ? 'Remove' : 'Removed');
      if (type === 'Decisions') await expect(accessRow(page, id)).toContainText('Patrick Sena');
    }
    await manualRecord(page).getByRole('button', { name: 'Legacy Finance DB Write', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Completed manual access removal' });
    for (const text of ['Martin Keller', 'Legacy Finance DB', 'Legacy Finance DB Write', 'SN-TASK-004812', 'Completed', COMPLETION_REFERENCE, COMPLETION_NOTE, '19 Oct 2026', 'UTC']) await expect(drawer).toContainText(text);
    await expect(drawer.getByRole('img', { name: 'Martin Keller', exact: true })).toBeVisible();
    await assertProductLanguage(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Manual tasks', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Show full history').check();
    const total = (type === 'Decisions' ? completed.decisionEvidence : completed.fulfillmentEvidence).length + completed.manualFulfillmentEvidence.length;
    await page.getByRole('button', { name: `All (${total})`, exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(total);
    await expect(manualRecords(page)).toHaveCount(2);
    await expect(manualRecord(page)).toHaveCount(1);
    await expect(page.getByRole('table', { name: 'Lifecycle history' }).locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Show full history').uncheck();
    for (const [filter, count] of [['Key controls', 5], ['Policy-locked', 1], ['Overrides', 0]]) {
      await page.getByRole('button', { name: filter, exact: true }).click();
      await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(count);
      await expect(manualRecord(page)).toHaveCount(0);
    }
  }
  const bundle = await downloadAudit(page);
  expect(bundle.manualFulfillmentEvidence).toEqual(completed.manualFulfillmentEvidence);
  expect(bundle.manualFulfillmentEvidence[1]).toMatchObject({ actor: 'Martin Keller', action: 'Completed manual access removal', application: 'Legacy Finance DB', target: 'Legacy Finance DB Write', resource: 'Legacy Finance DB Write', task: 'SN-TASK-004812', result: 'Completed within SLA', timestamp: bundle.legacyTask.completedAt, reference: COMPLETION_REFERENCE, note: COMPLETION_NOTE });
  for (const id of ['h-legacy', 'a-legacy']) expect(bundle.decisionEvidence.filter(record => record.rowId === id).at(-1)).toMatchObject({ decidedAction: 'REMOVE', decidedBy: 'Patrick Sena · Head of Identity Governance' });
  await page.reload();
  await nav(page, 'Lifecycle events');
  await expect(sarah).toContainText('Completed');
  await sarah.getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'All (18)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(manualRecords(page)).toHaveCount(2);
  await expect(manualRecord(page)).toHaveCount(1);
  expect((await storedState(page)).manualFulfillmentEvidence).toEqual(completed.manualFulfillmentEvidence);
  await page.keyboard.press('Shift+R');
  expect((await storedState(page)).manualFulfillmentEvidence).toEqual([]);
  await recommend(page);
  await nav(page, 'Audit trail');
  await expect(page.getByRole('button', { name: 'All (16)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(manualRecord(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
