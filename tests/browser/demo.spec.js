import { test, expect } from '@playwright/test';

async function nav(page, name) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
}
async function evaluate(page) {
  await nav(page, 'Role change event');
  await page.getByRole('button', { name: 'Evaluate access', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Access that fits the new role.' })).toBeVisible();
  await expect(page.locator('.exception-panel')).toBeInViewport();
}
async function review(page, approved = true) {
  await page.getByRole('button', { name: 'Review exception' }).click();
  if (!approved) await page.getByLabel('Decision rationale').fill('Payment approval is retained by the Treasury team.');
  await page.getByRole('button', { name: approved ? 'Approve with sign-off' : 'Deny request' }).click();
}
async function execute(page) {
  await nav(page, 'Fulfillment');
  await page.getByRole('button', { name: 'Run Monday fulfillment' }).click();
  await expect(page.locator('.legacy-panel')).toBeInViewport();
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
  await expect(page.getByRole('status')).toContainText('Approved for Sarah. Her agent remains blocked: payment approval is never inherited.');
  await expect(page.getByRole('status')).toBeInViewport();
  await page.getByRole('button', { name: 'View agent decisions' }).click();
  await expect(page.getByRole('tab', { name: 'AI agent access' })).toHaveAttribute('aria-selected', 'true');
  const agentPayment = page.locator('tr').filter({ hasText: 'SAP Payment Approval' });
  await expect(agentPayment).toContainText('BLOCK');
  await expect(agentPayment).toHaveClass(/agent-block-highlight/);
  await expect(agentPayment).toBeInViewport();
  await expect(agentPayment).not.toHaveClass(/agent-block-highlight/);
  await execute(page);
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' })).toContainText('Granted');
  await nav(page, 'Evidence');
  await expect(page.locator('.evidence-panel thead')).toBeInViewport();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toBeVisible();
  await page.getByRole('tab', { name: 'Fulfillment evidence' }).click();
  await expect(page.locator('tr').filter({ hasText: 'Legacy Finance DB Write' }).first()).toContainText('Pending completion');
  await nav(page, 'Fulfillment'); await completeLegacy(page);
  await expect(page.getByRole('heading', { name: 'Role access ready. Removal controls complete.' })).toBeVisible();
  await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' }).filter({ hasText: 'Sarah Miller · human' })).toContainText('APPROVED');
  await expect(page.locator('tr').filter({ hasText: 'SAP Payment Approval' }).filter({ hasText: 'outbound' })).toContainText('BLOCK');
  await expect(page.locator('tr').filter({ hasText: 'inbound' })).toContainText('KEEP');
  expect((await page.locator('.evidence-panel tbody tr').evaluateAll(rows => rows.map(row => row.dataset.rowId))).sort()).toEqual(['a-inbound', 'a-legacy', 'a-payment', 'h-legacy', 'h-payment']);
  await expect(page.getByRole('button', { name: 'Show all 14 records' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Show all 14 records' }).click();
  await expect(page.getByRole('button', { name: 'Show 5 key records' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(14);
  await page.getByRole('button', { name: 'Show 5 key records' }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
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
  expect(bundle.effectiveDate).toBe('2026-10-19');
  for (const record of bundle.decisionEvidence) expect(record.timestamp).toBe(record.decision === 'APPROVED' ? '2026-10-13T09:01:00.000Z' : '2026-10-13T09:00:00.000Z');
  expect(bundle.decisionEvidence.find(record => record.decision === 'APPROVED').actor).toBe('Patrick Sena · Head of Identity Governance');
  for (const record of bundle.fulfillmentEvidence) expect(record.timestamp.slice(0, 10)).toBe('2026-10-19');
  for (const record of bundle.fulfillmentEvidence.filter(record => ['h-legacy', 'a-legacy'].includes(record.rowId))) expect(record.sla).toBe('Monday 19 October · 12:00 UTC');
  expect(bundle.syntheticDemo).toBe(true); expect(bundle.outcomes.allControlsResolved).toBe(true);
  expect(bundle.decisionEvidence).toHaveLength(15); expect(bundle.fulfillmentEvidence.length).toBeGreaterThan(14);
  expect(bundle.decisionEvidence.some(e => e.decision === 'APPROVED')).toBe(true);
  expect(bundle.fulfillmentEvidence.some(e => e.scope === 'outbound' && e.resource === 'SAP Payment Approval' && e.status === 'Blocked')).toBe(true);
  await page.reload(); await nav(page, 'Evidence');
  await expect(page.getByText('Evidence does not yet prove all controls complete.', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await page.getByRole('button', { name: 'Reset to start' }).click();
  await expect(page.getByRole('heading', { name: 'Access starts with context.' })).toBeVisible();
  await expect(page.locator('.app-footer')).toContainText('Workspace date: Tuesday, 13 Oct 2026');
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

test('Decision summary follows its tab, keeps zero counts muted, and preserves the reviewer policy', async ({ page }) => {
  await page.goto('/'); await evaluate(page);
  async function expectCounts(values) {
    const types = ['KEEP', 'GRANT', 'REMOVE', 'REVIEW', 'BLOCK'];
    const tiles = page.locator('.decision-summary > div');
    await expect(tiles).toHaveCount(types.length);
    for (let index = 0; index < types.length; index += 1) {
      const tile = tiles.nth(index);
      await expect(tile).toContainText(types[index]);
      await expect(tile.locator('strong')).toHaveText(String(values[index]));
      if (values[index] === 0) await expect(tile).toHaveClass(/zero-count/);
      else await expect(tile).not.toHaveClass(/zero-count/);
    }
  }
  await expectCounts([2, 2, 2, 1, 0]);
  await page.getByRole('tab', { name: 'AI agent access' }).click();
  await expectCounts([3, 1, 2, 0, 1]);
  await expect(page.locator('.inbound-panel')).toContainText('KEEP');
  await page.getByRole('tab', { name: 'Human access' }).click();
  await expectCounts([2, 2, 2, 1, 0]);
  await page.getByRole('button', { name: 'Review exception' }).click();
  await expect(page.getByRole('dialog')).toContainText('Patrick Sena · Head of Identity Governance');
  await expect(page.getByRole('dialog')).toContainText('POL-SOD-017');
  await page.getByRole('button', { name: 'Approve with sign-off' }).click();
  await expectCounts([2, 2, 2, 1, 0]);
});

test('meeting dates, participant labels, 10-minute guide and outcome questions stay consistent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.effective-date')).toContainText('Monday, 19 October 2026');
  await expect(page.locator('.app-footer')).toContainText('Workspace date: Tuesday, 13 Oct 2026');
  await expect(page.locator('.user-footer')).toContainText('Patrick Sena');
  await expect(page.locator('.user-footer')).toContainText('Head of Identity Governance');
  await expect(page.locator('.user-avatar')).toHaveText('PS');
  await expect(page.locator('.top-avatar')).toHaveAttribute('title', 'Patrick Sena · Head of Identity Governance');
  const eventNav = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Role change event', exact: true });
  await expect(eventNav).toHaveText('Role change event');
  await page.getByRole('button', { name: 'Presenter guide' }).click();
  const guide = page.getByRole('dialog');
  await expect(guide.getByRole('heading', { name: '10-minute presenter guide' })).toBeVisible();
  await expect(guide.locator('.guide-list li > strong')).toHaveText(['Identity · 1 min', 'Event · 1 min', 'Decision · 3 min', 'Fulfillment · 2 min', 'Evidence · 2 min', 'Outcomes · 1 min']);
  await expect(guide).toContainText('five key records');
  await page.keyboard.press('Escape');
  await nav(page, 'Role change event');
  await expect(page.locator('main')).toContainText('Tuesday, 13 October 2026 · 09:00 UTC');
  await expect(page.locator('main')).toContainText('Prepare access decisions now. Fulfill the approved changes on Monday, 19 October, Sarah’s effective date.');
  await page.getByRole('button', { name: 'Evaluate access', exact: true }).first().click();
  await review(page); await execute(page);
  await expect(page.locator('.app-footer')).toContainText('Workspace date: Monday, 19 Oct 2026');
  await expect(page.locator('.legacy-panel')).toContainText('Monday 19 October · 12:00 UTC');
  await completeLegacy(page); await nav(page, 'Evidence');
  const outcomes = page.locator('.outcomes-grid .outcome');
  await expect(outcomes.locator('h3')).toHaveText([
    'Access is re-evaluated when business context changes, with auditable evidence.',
    '95%+ of movers fully productive on their effective date, including approved AI tools.',
    'One governance model for people, agents, modern and legacy apps, without new custom logic.',
  ]);
  await expect(outcomes.locator('small')).toHaveText(['Patrick Sena · Head of Identity Governance', 'Tim Hintermann · Director HR Operations & HRIS', 'Andre Hostombe · Lead Enterprise Architect']);
  await expect(outcomes.locator('.outcome-top svg')).toHaveCount(0);
  await expect(page.locator('.outcome-footnote')).toContainText('program outcome');
  await expect(page.locator('.outcome-footnote')).toContainText('separate from this individual role change');
});
