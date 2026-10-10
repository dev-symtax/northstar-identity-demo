import { expect } from '@playwright/test';
import {
  accessRow, acceptAll, applyDecisions, changeRow, confirmCompletion,
  decideAll, downloadAudit, expectFullyInViewport, nav, provision, recommend,
} from './iga-flow.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const selectScope = (page, scope) => page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();

async function assertOneSelection(page, id, selected) {
  await page.mouse.move(0, 0);
  const controls = accessRow(page, id).locator('.recommendation-controls');
  await expect(controls.locator('[aria-pressed="true"]')).toHaveCount(selected ? 1 : 0);
  for (const name of ['Accept', 'Change', 'Reject']) {
    const button = controls.getByRole('button', { name, exact: true });
    await expect(button).toHaveAttribute('aria-pressed', String(selected === name));
    await expect(button).toHaveCSS('background-color', selected === name ? name === 'Reject' ? 'rgb(251, 241, 240)' : 'rgb(230, 244, 241)' : 'rgb(255, 255, 255)');
  }
}

export async function exerciseExclusiveDecisionControls(page, afterReload = async () => {}) {
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await selectScope(page, scope);
    const id = `${scope === 'human' ? 'h' : 'a'}-dashboard`;
    const row = accessRow(page, id);
    await assertOneSelection(page, id, null);
    await row.getByRole('button', { name: 'Accept', exact: true }).click();
    await assertOneSelection(page, id, 'Accept');
    await row.getByRole('button', { name: 'Reject', exact: true }).click();
    const editor = page.locator(`[data-change-for="${id}"]`);
    await editor.getByLabel('Comment', { exact: true }).fill(`${scope} dashboard access is not required.`);
    await editor.getByRole('button', { name: 'Save change', exact: true }).click();
    await assertOneSelection(page, id, 'Reject');
    const rejected = (await stored(page)).accessDecisions[id];
    expect(rejected).toMatchObject({ decidedAction: 'DO_NOT_GRANT', decisionSource: 'rejected-recommendation', comment: `${scope} dashboard access is not required.` });
    await acceptAll(page, scope);
    await assertOneSelection(page, id, 'Reject');
    expect((await stored(page)).accessDecisions[id]).toEqual(rejected);
    await row.getByRole('button', { name: 'Accept', exact: true }).click();
    await assertOneSelection(page, id, 'Accept');
    await changeRow(page, id, 'Grant', `${scope} management reporting was manually confirmed.`);
    await assertOneSelection(page, id, 'Change');
    await changeRow(page, id, 'Do not grant', `${scope} access is withheld after a manual review.`);
    await assertOneSelection(page, id, 'Reject');
    const changed = (await stored(page)).accessDecisions[id];
    expect(changed).toMatchObject({ decidedAction: 'DO_NOT_GRANT', decisionSource: 'manual-override', comment: `${scope} access is withheld after a manual review.` });
    await acceptAll(page, scope);
    expect((await stored(page)).accessDecisions[id]).toEqual(changed);
    await assertOneSelection(page, id, 'Reject');
  }
  const saved = await stored(page);
  await nav(page, 'Overview');
  await recommend(page);
  await page.reload();
  await afterReload();
  await recommend(page);
  expect(await stored(page)).toEqual(saved);
  for (const scope of ['human', 'agent']) {
    await selectScope(page, scope);
    await assertOneSelection(page, `${scope === 'human' ? 'h' : 'a'}-dashboard`, 'Reject');
    expect(await page.locator('.recommendation-controls').evaluateAll(groups => groups.every(group => group.querySelectorAll('[aria-pressed="true"]').length <= 1))).toBe(true);
  }
  await page.keyboard.press('Shift+R');
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await selectScope(page, scope);
    await assertOneSelection(page, `${scope === 'human' ? 'h' : 'a'}-dashboard`, null);
  }
}

async function assertPreRunAudit(page, saved) {
  await expect(page.getByLabel('Access lifecycle', { exact: true })).toBeVisible();
  await expect(page.locator('.audit-actions .button')).toHaveText(['Return to provisioning', 'Export audit trail']);
  await expect(page.getByRole('button', { name: 'Return to provisioning', exact: true })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Export audit trail', exact: true })).toHaveClass(/secondary/);
  await expect(page.getByRole('button', { name: 'Return to lifecycle events', exact: true })).toHaveCount(0);
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(16);
  await page.getByLabel('Show full history').check();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(saved.decisionEvidence.length);
  await page.getByLabel('Show full history').uncheck();
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No provisioning records', exact: true })).toBeVisible();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(0);
  await expect(page.locator('[data-audit-category="controlled-task"]')).toHaveCount(0);
  const bundle = await downloadAudit(page);
  expect(bundle.provisioningEvidence).toEqual([]);
  expect(bundle.manualFulfillmentEvidence).toEqual([]);
  expect(bundle.lifecycleEvidence).toEqual([]);
  expect(bundle.legacyTask).toBeNull();
  expect(bundle.decisionEvidence).toHaveLength(saved.decisionEvidence.length);
  expect(await stored(page)).toEqual(saved);
}

export async function exerciseScheduledAuditNavigation(page, afterReload = async () => {}) {
  await recommend(page);
  await decideAll(page);
  await applyDecisions(page);
  const saved = await stored(page);
  expect(saved).toMatchObject({ applied: true, fulfillmentStarted: false, tasks: {}, fulfillmentEvidence: [], manualFulfillmentEvidence: [], legacyTask: null });
  await expect(page.locator('.page-title .audit-actions .button')).toHaveText(['Run scheduled provisioning', 'View audit trail']);
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await assertPreRunAudit(page, saved);
  await page.getByRole('button', { name: 'Return to provisioning', exact: true }).click();
  await expect(page.locator('.provisioning-connected')).toContainText('0 of 7 changes provisioned');
  await expect(page.getByRole('button', { name: 'Run scheduled provisioning', exact: true })).toHaveClass(/primary/);
  expect(await stored(page)).toEqual(saved);
  await page.reload();
  await afterReload();
  await nav(page, 'Lifecycle events');
  const mover = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await mover.getByRole('button').first().click();
  await nav(page, 'Provisioning');
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await assertPreRunAudit(page, saved);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.page-title .audit-actions .button').evaluateAll(buttons => buttons.every(button => {
    const box = button.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth;
  }))).toBe(true);
  await page.getByRole('button', { name: 'Return to provisioning', exact: true }).click();
  expect(await page.locator('.page-title .audit-actions .button').evaluateAll(buttons => buttons.every(button => {
    const box = button.getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth;
  }))).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await provision(page);
  const executed = await stored(page);
  expect(executed.fulfillmentEvidence).toHaveLength(16);
  await expect(page.getByRole('button', { name: 'View audit trail', exact: true })).toHaveClass(/primary/);
  await page.getByRole('button', { name: 'View audit trail', exact: true }).click();
  await expect(page.locator('.audit-actions .button')).toHaveText(['Return to lifecycle events', 'Export audit trail']);
  await expect(page.getByRole('button', { name: 'Return to provisioning', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Provisioning', exact: true }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(16);
  expect(await stored(page)).toEqual(executed);
  await page.getByRole('button', { name: 'Return to lifecycle events', exact: true }).click();
  await expect(mover).toContainText('Manual task open');
  await mover.getByRole('button').first().click();
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await confirmCompletion(page);
  await mover.getByRole('button').first().click();
  await expect(page.getByRole('button', { name: 'Return to lifecycle events', exact: true })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'Return to provisioning', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-audit-category="controlled-task"]')).toHaveCount(1);
  await page.keyboard.press('Shift+R');
  expect(await stored(page)).toMatchObject({ applied: false, fulfillmentStarted: false, decisionEvidence: [], fulfillmentEvidence: [], manualFulfillmentEvidence: [] });
}
