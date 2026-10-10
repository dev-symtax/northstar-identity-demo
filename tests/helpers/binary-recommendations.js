import { expect } from '@playwright/test';
import { accessRow, acceptAll, applyDecisions, decidePayment, nav, recommend } from './iga-flow.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const cases = scope => [
  [`${scope === 'human' ? 'h' : 'a'}-bi`, 'REMOVE', 'Removed'],
  [`${scope === 'human' ? 'h' : 'a'}-legacy`, 'KEEP', 'Retained'],
  [`${scope === 'human' ? 'h' : 'a'}-dashboard`, 'DO_NOT_GRANT', 'Not granted'],
];

export async function exerciseBinaryRecommendations(page, afterReload = async () => {}) {
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);
    const labels = await page.locator('.recommendation-controls').evaluateAll(groups => groups.map(group => [...group.querySelectorAll('button')].map(button => button.textContent)));
    expect(labels).toHaveLength(scope === 'human' ? 8 : 6);
    expect(labels.every(group => JSON.stringify(group) === JSON.stringify(['Accept', 'Reject']))).toBe(true);
    for (const [id, opposite] of cases(scope)) {
      const row = accessRow(page, id);
      const accept = row.getByRole('button', { name: 'Accept', exact: true });
      const reject = row.getByRole('button', { name: 'Reject', exact: true });
      await accept.focus();
      await page.keyboard.press('Tab');
      await expect(reject).toBeFocused();
      await page.keyboard.press('Enter');
      const editor = page.locator(`[data-reject-for="${id}"]`);
      await expect(editor.getByLabel('Decision', { exact: true })).toHaveValue(opposite);
      const comment = editor.getByLabel('Comment', { exact: true });
      await expect(comment).toBeFocused();
      await editor.getByRole('button', { name: 'Record decision', exact: true }).click();
      expect(await comment.evaluate(input => input.validity.valid)).toBe(false);
      expect((await stored(page)).accessDecisions[id].decidedAction).toBeNull();
      await comment.fill(`Recorded rationale for ${id}.`);
      await editor.getByRole('button', { name: 'Record decision', exact: true }).click();
      await page.mouse.move(0, 0);
      await expect(reject).toHaveAttribute('aria-pressed', 'true');
      await expect(reject).toHaveCSS('background-color', 'rgb(251, 241, 240)');
      await expect(accept).toHaveAttribute('aria-pressed', 'false');
      await expect(accept).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(row.locator('.recommendation-controls [aria-pressed="true"]')).toHaveCount(1);
    }
    const before = await stored(page);
    await acceptAll(page, scope);
    for (const [id] of cases(scope)) expect((await stored(page)).accessDecisions[id]).toEqual(before.accessDecisions[id]);
    if (scope === 'human') await decidePayment(page);
    else {
      await expect(accessRow(page, 'a-payment')).toContainText('Locked by policy');
      await expect(accessRow(page, 'a-payment').getByRole('button', { name: /^(Accept|Reject)$/ })).toHaveCount(0);
    }
  }
  const decided = await stored(page);
  await page.reload();
  await afterReload();
  await recommend(page);
  expect(await stored(page)).toEqual(decided);
  await expect(page.getByRole('button', { name: 'Apply decisions', exact: true }).first()).toBeEnabled();
  await applyDecisions(page);
  await expect(page.locator('.provisioning-connected')).toContainText('0 of 7 changes provisioned');
  await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
  await expect(page.locator('.provisioning-toast')).toHaveText('7 of 7 connected changes provisioned successfully. No manual tasks remain.');
  for (const scope of ['human', 'agent']) {
    for (const [id, , status] of cases(scope)) expect((await stored(page)).tasks[id].status).toBe(status);
  }
  await nav(page, 'Audit trail');
  for (const scope of ['human', 'agent']) {
    for (const [id, opposite] of cases(scope)) {
      await expect(accessRow(page, id)).toContainText(`Recorded rationale for ${id}.`);
      expect((await stored(page)).decisionEvidence.filter(record => record.rowId === id).at(-1)).toMatchObject({ decidedAction: opposite, decisionSource: 'rejected-recommendation', comment: `Recorded rationale for ${id}.` });
    }
  }
  await page.keyboard.press('Shift+R');
  await recommend(page);
  for (const scope of ['human', 'agent']) {
    await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
    for (const [id] of cases(scope)) await expect(accessRow(page, id).locator('.recommendation-controls [aria-pressed="true"]')).toHaveCount(0);
  }
}
