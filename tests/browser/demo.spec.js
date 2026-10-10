import { test, expect } from '@playwright/test';
import {
  EDIT_COMMENT, REVIEW_COMMENT, COMPLETION_REFERENCE, accessRow, acceptAll,
  applyDecisions, assertKeyAuditRecords, assertProductLanguage, changeRow,
  confirmCompletion, decideAll, decidePayment, downloadAudit, expandConnected,
  expectFullyInViewport, nav, openSarahEvent, provision, recommend,
} from '../helpers/iga-flow.js';

const storageKey = 'northstar-identity-demo-v1';
async function storedState(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
}

test('full approval and provisioning path preserves audit history, persistence and keyboard reset without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await assertProductLanguage(page);
  await recommend(page);
  await expectFullyInViewport(page, page.locator('.exception-panel'));
  await decideAll(page);
  await page.getByRole('tab', { name: 'Human access', exact: true }).click();
  await expect(page.locator('.exception-panel')).toContainText('Approved · activates after Accounts Receivable Operator is removed');
  await page.getByRole('button', { name: 'View agent permissions', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'AI agent', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(accessRow(page, 'a-payment')).toContainText('Not permitted by policy');
  await expect(accessRow(page, 'a-payment')).toHaveClass(/agent-block-highlight/);
  await expectFullyInViewport(page, accessRow(page, 'a-payment'));
  await expect(accessRow(page, 'a-payment')).not.toHaveClass(/agent-block-highlight/);
  const unprovisioned = await storedState(page);
  expect(unprovisioned.tasks).toEqual({});
  expect(unprovisioned.fulfillmentEvidence).toEqual([]);
  await applyDecisions(page);
  await expect(page.locator('.provisioning-connected')).toContainText('0 of 7 changes provisioned');
  await expandConnected(page);
  await expect(accessRow(page, 'h-payment')).toContainText('Scheduled');
  await provision(page);
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await expect(page.locator('main')).toContainText('Role access provisioned. 1 manual task open.');
  await expect(page.locator('.provisioning-connected')).toContainText('7 of 7 changes provisioned');
  await expandConnected(page);
  await expect(accessRow(page, 'h-payment')).toContainText('Granted');
  await confirmCompletion(page);
  await nav(page, 'Audit trail');
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true })).toBeVisible();
  await assertKeyAuditRecords(page);
  await expect(accessRow(page, 'h-payment')).toContainText(REVIEW_COMMENT);
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  for (const id of ['h-legacy', 'a-legacy']) {
    await expect(accessRow(page, id)).toContainText('Removed');
    await expect(accessRow(page, id)).toContainText(COMPLETION_REFERENCE);
    await expect(accessRow(page, id)).toContainText('Monday 19 October · 12:00 UTC');
  }
  const bundle = await downloadAudit(page);
  expect(bundle.effectiveDate).toBe('2026-10-19');
  const decisions = bundle.decisionEvidence;
  const provisioning = bundle.provisioningEvidence || bundle.fulfillmentEvidence;
  expect(decisions.length).toBeGreaterThanOrEqual(16);
  for (const record of decisions) {
    expect(record.eventId).toBe('WD-MOV-2026-0842');
    expect(record.timestamp).toMatch(/^2026-10-13T09:0[01]:00\.000Z$/);
  }
  const humanPayment = decisions.filter(record => record.rowId === 'h-payment').at(-1);
  expect(humanPayment).toMatchObject({ decidedAction: 'GRANT', decidedBy: 'Patrick Sena · Head of Identity Governance', decidedAt: '2026-10-13T09:01:00.000Z', comment: REVIEW_COMMENT });
  expect(decisions.filter(record => record.rowId === 'a-payment').at(-1)).toMatchObject({ decidedAction: 'NOT_PERMITTED', status: 'Policy-locked', policyId: 'POL-AI-303' });
  for (const record of provisioning) expect(record.timestamp.slice(0, 10)).toBe('2026-10-19');
  const arRemoved = provisioning.find(record => record.rowId === 'h-ar' && record.status === 'Removed');
  const paymentGranted = provisioning.find(record => record.rowId === 'h-payment' && record.status === 'Granted');
  expect(Date.parse(arRemoved.timestamp)).toBeLessThan(Date.parse(paymentGranted.timestamp));
  await page.reload();
  await nav(page, 'Audit trail');
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(accessRow(page, 'h-legacy')).toContainText(COMPLETION_REFERENCE);
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.locator('.app-footer')).toContainText('Today: Tuesday, 13 Oct 2026');
  expect(await storedState(page)).toMatchObject({ evaluated: false, applied: false, review: 'pending', fulfillmentStarted: false, tasks: {}, accessDecisions: {}, decisionEvidence: [], fulfillmentEvidence: [], actions: [] });
  await nav(page, 'Audit trail');
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(5);
  await assertProductLanguage(page);
  expect(errors).toEqual([]);
});

test('Apply decisions stays disabled until both scopes and the policy violation are resolved', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  const apply = page.getByRole('button', { name: 'Apply decisions', exact: true }).first();
  await expect(apply).toBeDisabled();
  await expect(accessRow(page, 'h-budget')).toContainText('Recommended');
  await acceptAll(page, 'human');
  await expect(accessRow(page, 'h-budget')).toContainText('Accepted');
  await expect(accessRow(page, 'h-payment')).toContainText('Needs review');
  await expect(apply).toBeDisabled();
  await acceptAll(page, 'agent');
  await expect(accessRow(page, 'a-inbound')).not.toContainText('Accepted');
  await expect(accessRow(page, 'a-inbound').getByText('Keep', { exact: true })).toHaveCount(1);
  expect((await storedState(page)).accessDecisions['a-inbound']).toMatchObject({ status: 'Accepted', decidedAction: 'KEEP' });
  await expect(accessRow(page, 'a-payment')).toContainText('Policy-locked');
  await expect(apply).toBeDisabled();
  await nav(page, 'Provisioning');
  await expect(page.getByRole('button', { name: 'Provision changes', exact: true })).toHaveCount(0);
  await nav(page, 'Access recommendations');
  await decidePayment(page);
  await expect(apply).toBeEnabled();
  expect((await storedState(page)).fulfillmentEvidence).toEqual([]);
  await apply.click();
  await expect(page.getByRole('dialog', { name: 'Apply access decisions' })).toBeVisible();
  expect((await storedState(page)).applied).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await storedState(page)).applied).toBe(false);
});

test('Budget Approval override requires a comment and is reflected in provisioning and the audit trail', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await accessRow(page, 'h-budget').getByRole('button', { name: 'Change', exact: true }).click();
  const editor = page.locator('[data-change-for="h-budget"]');
  await editor.getByLabel('Decision', { exact: true }).selectOption({ label: 'Do not grant' });
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  expect(await editor.getByLabel('Comment', { exact: true }).evaluate(input => input.validity.valid)).toBe(false);
  expect((await storedState(page)).accessDecisions['h-budget'].decidedAction).toBe(null);
  await editor.getByLabel('Comment', { exact: true }).fill(EDIT_COMMENT);
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(accessRow(page, 'h-budget')).toContainText('Changed from Grant to Do not grant');
  await expect(accessRow(page, 'h-budget')).toContainText(EDIT_COMMENT);
  await decideAll(page);
  expect((await storedState(page)).accessDecisions['h-budget']).toMatchObject({ recommendedAction: 'GRANT', decidedAction: 'DO_NOT_GRANT', status: 'Changed', comment: EDIT_COMMENT });
  await applyDecisions(page);
  await expect(page.locator('.provisioning-connected')).toContainText('0 of 6 changes provisioned');
  await expandConnected(page);
  await expect(accessRow(page, 'h-budget')).toHaveCount(0);
  await provision(page);
  await expandConnected(page);
  await expect(accessRow(page, 'h-budget')).toHaveCount(0);
  await expect(page.locator('.provisioning-connected')).toContainText('6 of 6 changes provisioned');
  await page.getByLabel('Show unchanged access').check();
  await expect(accessRow(page, 'h-budget')).toHaveCount(0);
  await expect(page.locator('.provisioning-connected')).toContainText('6 of 6 changes provisioned');
  await nav(page, 'Audit trail');
  await page.getByRole('button', { name: 'All (16)', exact: true }).click();
  await expect(accessRow(page, 'h-budget')).toContainText('Changed');
  await expect(accessRow(page, 'h-budget')).toContainText('Do not grant');
  await expect(accessRow(page, 'h-budget')).toContainText(EDIT_COMMENT);
  const bundle = await downloadAudit(page);
  expect(bundle.decisionEvidence.filter(record => record.rowId === 'h-budget').at(-1)).toMatchObject({ recommendedAction: 'GRANT', decidedAction: 'DO_NOT_GRANT', status: 'Changed', comment: EDIT_COMMENT });
  expect((bundle.provisioningEvidence || bundle.fulfillmentEvidence).filter(record => record.rowId === 'h-budget').at(-1).status).toBe('Not granted');
});

for (const resolution of ['Remove Accounts Receivable Operator', 'Deny Payment Approval']) {
  test(`SoD edit is blocked until resolved with ${resolution}`, async ({ page }) => {
    await page.goto('/');
    await recommend(page);
    await decideAll(page);
    const before = (await storedState(page)).accessDecisions['h-ar'];
    await page.getByRole('tab', { name: 'Human access', exact: true }).click();
    await changeRow(page, 'h-ar', 'Keep', 'Receivables responsibility is retained for the month-end transition.');
    await expect(page.getByText('SoD conflict · POL-SOD-017: Accounts Receivable Operator and SAP Payment Approval cannot be held together', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Accounts Receivable Operator', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deny Payment Approval', exact: true })).toBeVisible();
    expect((await storedState(page)).accessDecisions['h-ar']).toEqual(before);
    await expect(page.getByRole('button', { name: 'Apply decisions', exact: true }).first()).toBeDisabled();
    await page.getByRole('button', { name: resolution, exact: true }).click();
    await expect(page.getByText('SoD conflict · POL-SOD-017: Accounts Receivable Operator and SAP Payment Approval cannot be held together', { exact: true })).toHaveCount(0);
    const after = await storedState(page);
    expect(after.accessDecisions['h-ar'].decidedAction).toBe(resolution === 'Remove Accounts Receivable Operator' ? 'REMOVE' : 'KEEP');
    expect(after.accessDecisions['h-payment'].decidedAction).toBe(resolution === 'Remove Accounts Receivable Operator' ? 'GRANT' : 'DO_NOT_GRANT');
    await applyDecisions(page);
    await provision(page);
    await expandConnected(page);
    if (resolution === 'Deny Payment Approval') await page.getByLabel('Show unchanged access', { exact: true }).check();
    await expect(accessRow(page, 'h-ar')).toContainText(resolution === 'Remove Accounts Receivable Operator' ? 'Removed' : 'Retained');
    if (resolution === 'Remove Accounts Receivable Operator') await expect(accessRow(page, 'h-payment')).toContainText('Granted');
    else {
      await expect(accessRow(page, 'h-payment')).toHaveCount(0);
      await nav(page, 'Audit trail');
      await expect(accessRow(page, 'h-payment')).toContainText('Do not grant');
      await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
      await expect(accessRow(page, 'h-payment')).toContainText('Not granted');
    }
  });
}

test('agent payment approval is policy-locked and attempts to change it do not mutate the decision', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await page.getByRole('tab', { name: 'AI agent', exact: true }).click();
  const row = accessRow(page, 'a-payment');
  await expect(row).toContainText('Policy-locked');
  await expect(row).toContainText('Not permitted by policy');
  const before = (await storedState(page)).accessDecisions['a-payment'];
  await row.getByRole('button', { name: 'Locked by policy · View policy', exact: true }).click();
  await expect(page.getByText('Payment approval is restricted to human identities. This cannot be overridden.', { exact: true })).toBeVisible();
  expect((await storedState(page)).accessDecisions['a-payment']).toEqual(before);
  await expect(page.locator('[data-change-for="a-payment"]')).toHaveCount(0);
  await assertProductLanguage(page);
});

test('keeping Legacy Finance DB Write updates the manual task scope to the agent only', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await changeRow(page, 'h-legacy', 'Keep', 'Human write access is retained for the approved reporting transition.');
  await decideAll(page);
  await applyDecisions(page);
  await provision(page);
  await expect(page.locator('.legacy-panel')).toContainText('AI agent');
  const state = await storedState(page);
  expect(state.tasks['h-legacy'].status).toBe('Retained');
  expect(state.tasks['a-legacy'].status).toBe('Task open');
  await confirmCompletion(page, false);
  await nav(page, 'Audit trail');
  await expect(accessRow(page, 'h-legacy')).toContainText('Changed from Remove to Keep');
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(accessRow(page, 'h-legacy')).toContainText('Retained');
  await expect(accessRow(page, 'a-legacy')).toContainText('Removed');
  expect((await storedState(page)).tasks['h-legacy'].status).toBe('Retained');
});

test('dates, names, policies, recommendation counts and hidden keyboard controls stay consistent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.story-steps')).toHaveCount(0);
  await expect(page.locator('.app-footer')).toContainText('Today: Tuesday, 13 Oct 2026');
  await expect(page.locator('.user-footer')).toContainText('Patrick Sena');
  await expect(page.locator('.user-footer')).toContainText('Head of Identity Governance');
  await expect(page.locator('.user-footer img[alt="Patrick Sena"]')).toBeVisible();
  await expect(page.locator('.top-avatar img[alt="Patrick Sena"]')).toBeVisible();
  const tasks = page.getByRole('button', { name: /My tasks/ });
  await expect(tasks).toContainText('1');
  await page.keyboard.press('Shift+G');
  const guide = page.getByRole('dialog');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('10');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await assertProductLanguage(page);
  await openSarahEvent(page);
  await expect(page.locator('main')).toContainText('Mover: Finance Analyst → Finance Manager');
  await expect(page.locator('main')).toContainText('Tuesday, 13 October 2026 · 09:00 UTC');
  for (const policy of ['POL-FIN-101', 'POL-RISK-204', 'POL-SOD-017', 'POL-AI-301', 'POL-AI-302', 'POL-AI-303']) await expect(page.locator('main')).toContainText(policy);
  await page.getByRole('button', { name: 'Review access recommendations', exact: true }).first().click();
  async function expectCounts(counts) {
    const tiles = page.locator('.decision-summary > div');
    await expect(tiles).toHaveCount(5);
    for (let index = 0; index < counts.length; index += 1) {
      await expect(tiles.nth(index).locator('strong')).toHaveText(String(counts[index]));
      if (counts[index] === 0) await expect(tiles.nth(index)).toHaveClass(/zero-count/);
    }
  }
  await expectCounts([3, 3, 2, 1, 0]);
  await expect(page.locator('main')).toContainText('Decided 0 of 9');
  await page.getByRole('tab', { name: 'AI agent', exact: true }).click();
  await expectCounts([3, 1, 2, 0, 1]);
  await expect(page.locator('main')).toContainText('Decided 1 of 7');
  await decideAll(page);
  await expect(tasks).not.toContainText('1');
  await page.goto('/?reset=1');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  expect((await storedState(page)).actions).toEqual([]);
  expect(new URL(page.url()).searchParams.has('reset')).toBe(false);
  await assertProductLanguage(page);
});

test('mobile navigation and accessible drawer dismissal retain the existing responsive layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await nav(page, 'Lifecycle events');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Shift+G');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Close details', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close details', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Shift+R');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await assertProductLanguage(page);
});
