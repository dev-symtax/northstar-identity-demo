import { expect } from '@playwright/test';
import { REVIEW_COMMENT, accessRow, acceptAll, applyDecisions, rejectRow, confirmCompletion, decidePayment, downloadAudit, nav, provision, recommend } from './iga-flow.js';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const retainedComment = 'Month-end receivables responsibility is retained.';

export async function exerciseApprovalFirstSod(page) {
  await recommend(page);
  await decidePayment(page);
  const approved = await saved(page);
  expect(approved.accessDecisions['h-ar']).toMatchObject({ decidedAction: 'REMOVE', decisionSource: 'policy-required' });
  expect(approved.tasks).toEqual({});
  await expect(accessRow(page, 'h-ar')).toContainText('Required by POL-SOD-017');
  await expect(accessRow(page, 'h-payment')).toContainText('Approved · Activates after conflicting access is removed');
  await acceptAll(page, 'human');
  expect((await saved(page)).accessDecisions['h-ar']).toEqual(approved.accessDecisions['h-ar']);
  for (const resolution of ['Keep removal', 'Deny SAP Payment Approval']) {
    await rejectRow(page, 'h-ar', 'Keep', retainedComment);
    const alert = page.locator('.recommendation-sod');
    await expect(alert).toContainText('POL-SOD-017 prevents Accounts Receivable Operator and SAP Payment Approval from being active together.');
    expect((await saved(page)).accessDecisions['h-ar']).toEqual(approved.accessDecisions['h-ar']);
    await expect(page.getByRole('button', { name: 'Apply decisions', exact: true }).first()).toBeDisabled();
    await alert.getByRole('button', { name: resolution, exact: true }).click();
    if (resolution === 'Keep removal') expect((await saved(page)).accessDecisions['h-ar']).toEqual(approved.accessDecisions['h-ar']);
  }
  await expect(accessRow(page, 'h-ar')).not.toContainText('Required by POL-SOD-017');
  await expect(accessRow(page, 'h-ar').getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const denied = await saved(page);
  expect(denied.accessDecisions['h-payment'].decidedAction).toBe('DO_NOT_GRANT');
  expect(denied.accessDecisions['h-ar'].decidedAction).toBe('KEEP');
  await page.reload();
  await recommend(page);
  expect(await saved(page)).toEqual(denied);
  await expect(accessRow(page, 'h-ar')).not.toContainText('Required by POL-SOD-017');
  await acceptAll(page, 'human');
  expect((await saved(page)).accessDecisions['h-ar']).toEqual(denied.accessDecisions['h-ar']);
  await acceptAll(page, 'agent');
  await applyDecisions(page);
  await provision(page);
  expect((await saved(page)).tasks['h-ar'].status).toBe('Retained');
  expect((await saved(page)).tasks['h-payment'].status).toBe('Not granted');
  await confirmCompletion(page);
  await nav(page, 'Audit trail');
  await expect(accessRow(page, 'h-payment')).toContainText('SAP Payment Approval denied. POL-SOD-017 conflict resolved;');
  await page.keyboard.press('Shift+R');
  await recommend(page);
  expect((await saved(page)).review).toBe('pending');
  expect((await saved(page)).accessDecisions['h-ar'].decidedAction).toBeNull();
}

export async function exerciseKeepFirstSod(page, resolution) {
  await recommend(page);
  await expect(page.locator('.exception-panel')).toContainText('SOD CONFLICT · REVIEW REQUIRED');
  await expect(page.locator('main')).not.toContainText('POLICY VIOLATION');
  await expect(accessRow(page, 'h-ar')).toContainText('Recommended');
  await rejectRow(page, 'h-ar', 'Keep', retainedComment);
  const kept = (await saved(page)).accessDecisions['h-ar'];
  await expect(accessRow(page, 'h-ar').getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await acceptAll(page, 'human');
  expect((await saved(page)).accessDecisions['h-ar']).toEqual(kept);
  await page.locator('.exception-panel').getByRole('button', { name: 'Approve', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review SAP Payment Approval' });
  await expect(dialog).toContainText('Accounts Receivable Operator must be removed before SAP Payment Approval can be activated.');
  await expect(dialog).toContainText('Current conflicting access');
  await expect(dialog).toContainText('Recommended resolution');
  await expect(dialog).toContainText('Remove conflicting access');
  await expect(dialog).toContainText('No access changes until the scheduled provisioning run.');
  await dialog.getByLabel('Comment', { exact: true }).fill(REVIEW_COMMENT);
  await dialog.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('SAP Payment Approval cannot be approved while Accounts Receivable Operator is kept.');
  await expect(dialog).toContainText('POL-SOD-017 prevents both entitlements from being active together.');
  expect((await saved(page)).review).toBe('pending');
  expect((await saved(page)).accessDecisions['h-ar']).toEqual(kept);
  await expect(page.getByRole('button', { name: 'Apply decisions', exact: true }).first()).toBeDisabled();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 900 });
  await dialog.locator('.recommendation-sod').scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const label of ['Remove Accounts Receivable Operator', 'Deny SAP Payment Approval']) {
    const bounds = await dialog.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  }
  await page.setViewportSize(viewport);
  await dialog.getByRole('button', { name: resolution, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const approved = resolution === 'Remove Accounts Receivable Operator';
  const resolved = await saved(page);
  expect(resolved.accessDecisions['h-payment'].decidedAction).toBe(approved ? 'GRANT' : 'DO_NOT_GRANT');
  expect(resolved.accessDecisions['h-ar'].decidedAction).toBe(approved ? 'REMOVE' : 'KEEP');
  expect(resolved.tasks).toEqual({});
  expect(resolved.fulfillmentEvidence).toEqual([]);
  const assertOutcome = async () => {
    if (approved) {
      await expect(accessRow(page, 'h-ar')).toContainText('Required by POL-SOD-017');
      await expect(accessRow(page, 'h-payment')).toContainText('Approved · Activates after conflicting access is removed');
    } else {
      await expect(accessRow(page, 'h-ar')).not.toContainText('Required by POL-SOD-017');
      await expect(accessRow(page, 'h-ar')).toContainText(retainedComment);
      await expect(accessRow(page, 'h-ar').getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  };
  await assertOutcome();
  await page.reload();
  await recommend(page);
  await assertOutcome();
  expect(await saved(page)).toEqual(resolved);
  await acceptAll(page, 'human');
  expect((await saved(page)).accessDecisions['h-ar']).toEqual(resolved.accessDecisions['h-ar']);
  await acceptAll(page, 'agent');
  await expect(accessRow(page, 'a-payment')).toContainText('Policy-locked');
  await applyDecisions(page);
  await expect(page.locator('.access-bottom')).toContainText(approved ? 'must be removed before SAP Payment Approval can be activated' : 'cannot be held together');
  await provision(page);
  const executed = await saved(page);
  if (approved) {
    const removal = executed.fulfillmentEvidence.find(record => record.rowId === 'h-ar');
    const activation = executed.fulfillmentEvidence.find(record => record.rowId === 'h-payment');
    expect(removal.status).toBe('Removed');
    expect(activation.status).toBe('Granted');
    expect(Date.parse(removal.timestamp)).toBeLessThan(Date.parse(activation.timestamp));
    expect(activation.dependency.completionReference).toBe(removal.reference);
  } else {
    expect(executed.tasks['h-ar'].status).toBe('Retained');
    expect(executed.tasks['h-payment'].status).toBe('Not granted');
  }
  await expect(page.locator('.provisioning-connected')).toContainText(approved ? '7 of 7 changes provisioned' : '5 of 5 changes provisioned');
  await confirmCompletion(page);
  await nav(page, 'Audit trail');
  await expect(accessRow(page, 'h-payment')).toContainText(approved ? 'SAP Payment Approval approved conditionally.' : 'SAP Payment Approval denied. POL-SOD-017 conflict resolved;');
  await accessRow(page, 'h-payment').getByRole('button', { name: 'SAP Payment Approval', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('SoD policy');
  await expect(page.getByRole('dialog')).toContainText('Conflicting entitlement');
  await expect(page.getByRole('dialog')).toContainText('Accounts Receivable Operator');
  await page.keyboard.press('Escape');
  const bundle = await downloadAudit(page);
  const record = bundle.decisionEvidence.filter(entry => entry.rowId === 'h-payment').at(-1);
  expect(record.policyId).toBe('POL-RISK-204');
  expect(record.decidedBy).toBe('Patrick Sena · Head of Identity Governance');
  expect(record.sod).toMatchObject({ policyId: 'POL-SOD-017', conflictingEntitlement: 'Accounts Receivable Operator', required: approved });
  expect(bundle.decisionEvidence.some(entry => entry.rowId === 'h-ar' && entry.decidedAction === 'KEEP' && entry.comment === retainedComment)).toBe(true);
  await page.keyboard.press('Shift+R');
  await recommend(page);
  expect((await saved(page)).accessDecisions['h-ar'].decidedAction).toBeNull();
  expect((await saved(page)).review).toBe('pending');
  await expect(accessRow(page, 'h-ar')).not.toContainText('Required by POL-SOD-017');
}
