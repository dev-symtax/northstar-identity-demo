import { expect } from '@playwright/test';
import { accessRow, acceptAll, changeRow, confirmCompletion, decideAll, downloadAudit, nav, provision, recommend } from './iga-flow.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const selectScope = (page, scope) => page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
const taskRow = (page, stage) => page.locator(`[data-record-id="MF-SN-TASK-004812-${stage}"]`);
async function expectCounters(page, values) {
  const counters = page.locator('.decision-summary > div');
  await expect(counters).toHaveCount(5);
  for (const [index, value] of values.entries()) {
    await expect(counters.nth(index).locator('strong')).toHaveText(String(value));
    if (value === 0) await expect(counters.nth(index)).toHaveClass(/zero-count/);
  }
}

export async function exerciseCountersAndManualStages(page, afterReload = async () => {}) {
  await recommend(page);
  const apply = page.getByRole('button', { name: 'Apply decisions', exact: true }).first();
  await expect(apply).toBeDisabled();
  await expect(apply).toHaveClass(/secondary/);
  for (const scope of ['human', 'agent']) {
    await selectScope(page, scope);
    const prefix = scope === 'human' ? 'h' : 'a';
    const initial = scope === 'human' ? [3, 3, 2, 1, 0] : [3, 1, 2, 0, 1];
    await expectCounters(page, initial);
    await changeRow(page, `${prefix}-bi`, 'Remove', `${scope} reporting moved to the management dashboard.`);
    await expectCounters(page, initial.map((value, index) => index === 0 ? value - 1 : index === 2 ? value + 1 : value));
    await changeRow(page, `${prefix}-dashboard`, 'Do not grant', `${scope} management access is withheld.`);
    const changed = [2, scope === 'human' ? 2 : 0, 3, scope === 'human' ? 1 : 0, scope === 'human' ? 0 : 1];
    await expectCounters(page, changed);
    await acceptAll(page, scope);
    await expectCounters(page, changed);
    await expect(accessRow(page, `${prefix}-dashboard`).getByRole('button', { name: 'Reject', exact: true })).toHaveClass(/danger/);
  }
  await decideAll(page);
  await selectScope(page, 'human');
  await expectCounters(page, [2, 3, 3, 0, 0]);
  await expect(apply).toBeEnabled();
  await expect(apply).toHaveClass(/primary/);
  await page.mouse.move(0, 0);
  await expect(apply).toHaveCSS('background-color', 'rgb(11, 122, 110)');
  const decisions = (await stored(page)).accessDecisions;
  await nav(page, 'Overview');
  await recommend(page);
  await expectCounters(page, [2, 3, 3, 0, 0]);
  await page.reload();
  await afterReload();
  await recommend(page);
  await expectCounters(page, [2, 3, 3, 0, 0]);
  await selectScope(page, 'agent');
  await expectCounters(page, [2, 0, 3, 0, 1]);
  expect((await stored(page)).accessDecisions).toEqual(decisions);
  await apply.click();
  const confirmation = page.getByRole('dialog', { name: 'Apply access decisions' });
  const actionRows = confirmation.getByRole('table', { name: 'Decisions by action' }).locator('tbody tr');
  for (const [label, count] of [['Keep', 4], ['Grant', 3], ['Remove', 6], ['Not permitted by policy', 1], ['Do not grant', 2]]) {
    const row = actionRows.filter({ has: page.getByText(label, { exact: true }) });
    await expect(row.locator('td').last()).toHaveText(String(count));
  }
  await confirmation.getByRole('button', { name: 'Apply decisions', exact: true }).click();
  await expect(page.locator('.fulfillment-banner h2')).toHaveText('Changes scheduled for Monday, 19 October 2026 · 08:00 UTC.');
  await expect(page.locator('.fulfillment-banner p')).toHaveText('No access has changed yet.');
  await expect(page.locator('.legacy-panel')).toContainText('19 October 2026 · 12:00 UTC');
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All (16)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const id of ['h-legacy', 'a-legacy']) {
    for (const text of ['Remove', 'Controlled manual task', 'Martin Keller', 'SN-TASK-004812', '19 October 2026 · 12:00 UTC', 'Scheduled']) await expect(accessRow(page, id)).toContainText(text);
  }
  await accessRow(page, 'h-legacy').getByRole('button', { name: 'Legacy Finance DB Write', exact: true }).click();
  const obligation = page.getByRole('dialog');
  for (const text of ['Fulfillment method', 'Assigned owner', 'ServiceNow task', 'Fulfillment status', 'Scheduled', 'POL-FIN-101']) await expect(obligation).toContainText(text);
  await page.keyboard.press('Escape');
  await expect(taskRow(page, 'completed')).toHaveCount(0);
  const scheduled = await downloadAudit(page);
  expect(scheduled.manualFulfillmentEvidence).toEqual([]);
  expect(scheduled.provisioningEvidence).toEqual([]);
  await page.getByRole('button', { name: 'Return to provisioning', exact: true }).click();
  await provision(page);
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await expect(page.getByRole('button', { name: 'All (17)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const text of ['Manual fulfillment', 'Open', 'Martin Keller', 'SN-TASK-004812', '08:00:00', '19 October 2026 · 12:00 UTC']) await expect(taskRow(page, 'initiated')).toContainText(text);
  const opened = await downloadAudit(page);
  expect(opened.decisionEvidence).toEqual(scheduled.decisionEvidence);
  expect(opened.legacyTask.status).toBe('Task open');
  await page.getByRole('button', { name: 'Manual tasks', exact: true }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(accessRow(page, 'h-legacy')).toContainText('Task open');
  await expect(accessRow(page, 'a-legacy')).toContainText('Task open');
  await page.getByRole('button', { name: 'Return to lifecycle events', exact: true }).click();
  const sarah = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await sarah.getByRole('button').first().click();
  await confirmCompletion(page, false);
  await sarah.getByRole('button').first().click();
  for (const tab of ['Decisions', 'Provisioning']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('button', { name: 'All (18)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Manual tasks', exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(4);
    for (const text of ['Completed by Martin Keller, verified by Patrick Sena', 'Completed within SLA', 'CHG-2026-1042', 'DBA-VERIFY-0842', '11:42:00']) await expect(taskRow(page, 'completed')).toContainText(text);
    await expect(taskRow(page, 'initiated')).toContainText('Open');
    await page.getByRole('button', { name: 'Key controls', exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: 'All (18)', exact: true }).click();
  }
  await taskRow(page, 'completed').getByRole('button', { name: 'Legacy Finance DB Write', exact: true }).click();
  const completion = page.getByRole('dialog');
  for (const text of ['Completed by', 'Verified by', 'Change reference', 'CHG-2026-1042', 'Verification reference', 'DBA-VERIFY-0842', '11:42:00', 'SLA due', 'Completed within SLA']) await expect(completion).toContainText(text);
  await page.keyboard.press('Escape');
  const completed = await downloadAudit(page);
  expect(completed.decisionEvidence).toEqual(scheduled.decisionEvidence);
  expect(completed.manualFulfillmentEvidence[0]).toEqual(opened.manualFulfillmentEvidence[0]);
  expect(completed.manualFulfillmentEvidence[1]).toMatchObject({ completedBy: 'Martin Keller', verifiedBy: 'Patrick Sena', timestamp: '2026-10-19T11:42:00.000Z' });
  await page.reload();
  await afterReload();
  await nav(page, 'Lifecycle events');
  await expect(sarah).toContainText('Completed');
  await sarah.getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'All (18)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await stored(page)).manualFulfillmentEvidence).toEqual(completed.manualFulfillmentEvidence);
  await page.keyboard.press('Shift+R');
  expect((await stored(page)).manualFulfillmentEvidence).toEqual([]);
  await recommend(page);
  await expectCounters(page, [3, 3, 2, 1, 0]);
}
