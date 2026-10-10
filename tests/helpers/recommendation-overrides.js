import { expect } from '@playwright/test';
import {
  accessRow, acceptAll, applyDecisions, changeRow, confirmCompletion,
  decidePayment, downloadAudit, nav, provision, recommend,
} from './iga-flow.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const dashboardComment = scope => `${scope === 'human' ? 'Sarah' : 'The agent'} does not require the management dashboard.`;
const keepComment = scope => `Read-only reporting remains approved for the ${scope}.`;
const dashboardId = scope => `${scope === 'human' ? 'h' : 'a'}-dashboard`;
const reportingId = scope => scope === 'human' ? 'h-bi' : 'a-reports';

async function assertSelections(page, scope, method) {
  const row = accessRow(page, dashboardId(scope));
  await expect(row).toContainText('Changed from Grant to Do not grant');
  await expect(row).toContainText(dashboardComment(scope));
  await expect(row.getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(row.getByRole('button', { name: 'Reject', exact: true })).toHaveClass(/danger/);
  await expect(row.getByRole('button', { name: 'Reject', exact: true })).toHaveCSS('background-color', 'rgb(251, 241, 240)');
  await expect(row.getByRole('button', { name: 'Reject', exact: true })).toHaveCSS('color', 'rgb(156, 79, 75)');
  await expect(row.getByRole('button', { name: 'Accept', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(row.getByRole('button', { name: 'Change', exact: true })).toHaveAttribute('aria-pressed', String(method === 'Change'));
  const reporting = accessRow(page, reportingId(scope));
  await expect(reporting).toContainText(keepComment(scope));
  await expect(reporting.getByRole('button', { name: 'Change', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(reporting.getByRole('button', { name: 'Accept', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const accepted = accessRow(page, scope === 'human' ? 'h-sap' : 'a-bi');
  await expect(accepted.getByRole('button', { name: 'Accept', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(accepted.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
}

// Reused by the normal browser suite and the exported HTML with networking disabled.
export async function exerciseRecommendationOverrides(page, method, afterReload = async () => {}) {
  await recommend(page);
  await expect(page.getByRole('tab', { name: 'AI Agent access', exact: true })).toContainText('AI Agent access');
  await expect(page.getByRole('tab', { name: 'AI agent', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'AI agents', exact: true })).toBeVisible();
  for (const scope of ['human', 'agent']) {
    await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
    await accessRow(page, scope === 'human' ? 'h-sap' : 'a-bi').getByRole('button', { name: 'Accept', exact: true }).click();
    await changeRow(page, reportingId(scope), 'Keep', keepComment(scope));
    if (method === 'Change') {
      await changeRow(page, dashboardId(scope), 'Do not grant', dashboardComment(scope));
    } else {
      await accessRow(page, dashboardId(scope)).getByRole('button', { name: 'Reject', exact: true }).click();
      const form = page.locator(`[data-change-for="${dashboardId(scope)}"]`);
      await expect(form.getByLabel('Decision', { exact: true })).toHaveValue('DO_NOT_GRANT');
      await form.getByLabel('Comment', { exact: true }).fill(dashboardComment(scope));
      await form.getByRole('button', { name: 'Save change', exact: true }).click();
    }
    await assertSelections(page, scope, method);
    const before = await stored(page);
    await acceptAll(page, scope);
    await assertSelections(page, scope, method);
    const after = await stored(page);
    for (const [id, model] of Object.entries(before.accessDecisions)) {
      if (model.decidedAction) {
        expect(after.accessDecisions[id]).toEqual(model);
        expect(after.decisionEvidence.filter(record => record.rowId === id)).toEqual(before.decisionEvidence.filter(record => record.rowId === id));
      } else if (id.startsWith(scope === 'human' ? 'h-' : 'a-') && id !== 'h-payment') {
        expect(after.accessDecisions[id]).toMatchObject({ decidedAction: model.recommendedAction, decisionSource: 'accepted-recommendation' });
      }
    }
    expect(after.accessDecisions[dashboardId(scope)].decisionSource).toBe(method === 'Change' ? 'manual-override' : 'rejected-recommendation');
    await accessRow(page, dashboardId(scope)).getByRole('button', { name: 'Change', exact: true }).click();
    await expect(page.locator(`[data-change-for="${dashboardId(scope)}"]`).getByLabel('Comment', { exact: true })).toHaveValue(dashboardComment(scope));
    await page.locator(`[data-change-for="${dashboardId(scope)}"]`).getByRole('button', { name: 'Cancel', exact: true }).click();
    if (scope === 'human') {
      expect(after.accessDecisions['h-payment'].decidedAction).toBeNull();
      await decidePayment(page);
    }
  }
  const beforeReload = await stored(page);
  await page.reload();
  await afterReload();
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
    await assertSelections(page, scope, method);
    await acceptAll(page, scope);
  }
  expect(await stored(page)).toEqual(beforeReload);
  await page.getByRole('button', { name: 'Apply decisions', exact: true }).first().click();
  const confirmation = page.getByRole('dialog', { name: 'Apply access decisions' });
  await expect(confirmation.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Do not grant', exact: true }) })).toContainText('2');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await applyDecisions(page);
  await expect(page.locator('.provisioning-connected tbody tr')).toHaveCount(5);
  for (const id of ['h-dashboard', 'a-dashboard']) await expect(accessRow(page, id)).toHaveCount(0);
  await provision(page);
  const provisioned = await stored(page);
  for (const id of ['h-dashboard', 'a-dashboard']) expect(provisioned.tasks[id].status).toBe('Not granted');
  expect(provisioned.tasks['a-payment'].status).toBe('Not permitted by policy');
  await nav(page, 'Audit trail');
  for (const scope of ['human', 'agent']) {
    const row = accessRow(page, dashboardId(scope));
    await expect(row).toContainText('Do not grant');
    await expect(row).toContainText('Changed from Grant to Do not grant');
    await expect(row).toContainText(dashboardComment(scope));
  }
  const bundle = await downloadAudit(page);
  for (const scope of ['human', 'agent']) {
    expect(bundle.accessDecisions.find(record => record.rowId === dashboardId(scope))).toMatchObject(beforeReload.accessDecisions[dashboardId(scope)]);
    expect(bundle.decisionEvidence.filter(record => record.rowId === dashboardId(scope)).at(-1)).toMatchObject(beforeReload.accessDecisions[dashboardId(scope)]);
    expect(bundle.provisioningEvidence.find(record => record.rowId === dashboardId(scope))).toMatchObject({ status: 'Not granted', method: 'Grant withheld by access decision' });
  }
  await nav(page, 'Lifecycle events');
  await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Provisioning', exact: true, level: 1 })).toBeVisible();
  await confirmCompletion(page);
  expect((await stored(page)).legacyTask.status).toBe('Completed');
  await page.keyboard.press('Shift+R');
  expect((await stored(page)).accessDecisions).toEqual({});
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
    const row = accessRow(page, dashboardId(scope));
    await expect(row).toContainText('Recommended');
    await expect(row.getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(row.getByRole('button', { name: 'Change', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect((await stored(page)).accessDecisions[dashboardId(scope)]).toMatchObject({ decidedAction: null, comment: '', decisionSource: 'undecided' });
  }
}
