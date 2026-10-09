import { test, expect } from '@playwright/test';

async function nav(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
}
async function evaluate(page) {
  await nav(page, 'Role change event');
  await page.getByRole('button', { name: 'Evaluate access', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Access that fits the new role.' })).toBeVisible();
}
async function review(page, approved = true) {
  await page.getByRole('button', { name: 'Review exception' }).click();
  if (!approved) await page.getByLabel('Decision rationale').fill('Payment approval is retained by the Treasury team.');
  await page.getByRole('button', { name: approved ? 'Approve with SoD condition' : 'Deny request' }).click();
}
async function execute(page) {
  await nav(page, 'Fulfillment');
  await page.getByRole('button', { name: 'Run Monday fulfillment' }).click();
}
async function completeLegacy(page) {
  await page.getByRole('button', { name: 'Record completion evidence' }).click();
  await page.getByRole('button', { name: 'Use sample demo evidence' }).click();
  await page.getByRole('button', { name: 'Confirm both removals' }).click();
}
test('complete customer story: approval, agent guardrail, legacy proof, export, reload and reset', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
  await evaluate(page); await review(page);
  await page.getByRole('tab', { name: 'AI agent access' }).click();
  const agentPayment = page.locator('tr').filter({ hasText: 'SAP Payment Approval' });
  await expect(agentPayment).toContainText('BLOCK');
  await execute(page);
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('Granted');
  await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Fulfillment evidence' }).click();
  await expect(page.locator('tr').filter({ hasText: 'Legacy Finance DB Write' }).first()).toContainText('Pending completion');
  await nav(page, 'Fulfillment'); await completeLegacy(page);
  await expect(page.getByRole('heading', { name: 'Role access ready. Removal controls complete.' })).toBeVisible();
  await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Fulfillment evidence' }).click();
  const legacyRows = page.locator('tr').filter({ hasText: 'Legacy Finance DB Write' });
  await expect(legacyRows).toHaveCount(2);
  for (const row of await legacyRows.all()) { await expect(row).toContainText('Removed'); await expect(row).toContainText('CHG-2026-1042'); }
  await page.getByLabel('Show full history').check();
  await expect(page.locator('tr').filter({ hasText: 'Legacy Finance DB Write' })).toHaveCount(4);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence' }).click();
  const download = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const bundle = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(bundle.syntheticDemo).toBe(true); expect(bundle.outcomes.allControlsResolved).toBe(true);
  expect(bundle.decisionEvidence).toHaveLength(15); expect(bundle.fulfillmentEvidence.length).toBeGreaterThan(14);
  expect(bundle.decisionEvidence.some(e => e.decision === 'APPROVED')).toBe(true);
  expect(bundle.fulfillmentEvidence.some(e => e.scope === 'outbound' && e.resource === 'SAP Payment Approval' && e.status === 'Blocked')).toBe(true);
  await page.reload(); await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Reset to start' }).click();
  await expect(page.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
  await nav(page, 'Evidence');
  await expect(page.getByRole('heading', { name: 'No evidence recorded yet' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('denied payment approval does not block core role readiness', async ({ page }) => {
  await page.goto('/'); await evaluate(page); await review(page, false); await execute(page); await completeLegacy(page);
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('Not granted');
  await nav(page, 'Evidence');
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' }).filter({ hasText: 'Sarah Miller · human' })).toContainText('DENIED');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
});
test('pending review survives reload; late approval needs execution and agent stays blocked', async ({ page }) => {
  await page.goto('/'); await evaluate(page); await execute(page); await completeLegacy(page);
  await expect(page.getByRole('heading', { name: 'Role access ready. Payment review is outstanding.' })).toBeVisible();
  await page.reload(); await nav(page, 'Governance decision'); await review(page);
  await nav(page, 'Fulfillment');
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('Ready to execute');
  await page.getByRole('button', { name: 'Execute approved permission' }).click();
  await nav(page, 'Governance decision'); await page.getByRole('tab', { name: 'AI agent access' }).click();
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('BLOCK');
});
test('enterprise directory supports search, filters, and detail views', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search identities').fill('Elena');
  await expect(page.locator('.directory-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Elena Rossi', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('HR Specialist');
  await page.keyboard.press('Escape');
  await page.getByLabel('Search identities').fill('');
  await page.getByLabel('Filter by department').selectOption('Finance');
  await expect(page.locator('.directory-table tbody tr')).toHaveCount(8);
  await page.getByRole('tab', { name: 'Applications' }).click();
  await page.getByRole('button', { name: 'Legacy Finance DB', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Controlled task');
  await expect(page.getByRole('dialog')).toContainText('Legacy Finance DB Write');
});
test('built demo completes with all external network requests blocked', async ({ page }) => {
  const external = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto('/'); await evaluate(page); await review(page); await execute(page); await completeLegacy(page); await nav(page, 'Evidence');
  await expect(page.getByRole('heading', { name: 'Explain the decision. Prove the control.' })).toBeVisible();
  expect(external).toEqual([]);
});
test('mobile navigation, keyboard dialog controls, and no page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await nav(page, 'Role change event');
  await expect(page.getByRole('heading', { name: 'One business event. A new access context.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Reset to start' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Reset demo' })).toBeFocused();
});
