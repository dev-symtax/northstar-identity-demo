import { test, expect } from '@playwright/test';
import { REVIEW_COMMENT, accessRow, acceptAll, applyDecisions, assertProductLanguage, rejectRow, decidePayment, expandConnected, nav, provision, recommend } from '../helpers/iga-flow.js';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
const humanApprovals = state => state.decisionEvidence.filter(record => record.rowId === 'h-payment' && record.decidedAction === 'GRANT');

test('payment approval confirms the saved decision, survives navigation and reload, and reaches provisioning and audit once', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await acceptAll(page, 'human');
  await page.locator('.exception-panel').getByRole('button', { name: 'Approve', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review SAP Payment Approval' });
  await review.getByLabel('Comment', { exact: true }).fill('');
  await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(review.getByRole('alert')).toHaveText('Enter a comment before recording the decision.');
  await expect(page.locator('.recommendation-toast')).toHaveCount(0);
  expect((await stored(page)).review).toBe('pending');
  await page.keyboard.press('Escape');
  await decidePayment(page);
  await expect(page.locator('.recommendation-toast')).toHaveText('Decision recorded for SAP Payment Approval.');
  const approved = await stored(page);
  expect(approved.accessDecisions['h-payment']).toMatchObject({ decidedAction: 'GRANT', status: 'Accepted', comment: REVIEW_COMMENT });
  expect(humanApprovals(approved)).toHaveLength(1);
  const assertSavedReview = async () => {
    await expect(page.locator('.exception-panel .badge')).toHaveText('Approved');
    await expect(page.locator('.exception-panel').getByRole('button', { name: /^(Approve|Deny)$/ })).toHaveCount(0);
    await expect(accessRow(page, 'h-payment')).toContainText('Accepted');
    await expect(accessRow(page, 'h-payment')).toContainText('Grant');
    await expect(accessRow(page, 'h-payment').getByRole('button', { name: 'Review', exact: true })).toBeVisible();
  };
  await assertSavedReview();
  await nav(page, 'Provisioning');
  await nav(page, 'Access recommendations');
  await assertSavedReview();
  await page.reload();
  await recommend(page);
  await assertSavedReview();
  expect((await stored(page)).accessDecisions['h-payment']).toEqual(approved.accessDecisions['h-payment']);
  // Reconfirming an existing decision is a no-op, including its evidence and toast.
  await accessRow(page, 'h-payment').getByRole('button', { name: 'Review', exact: true }).click();
  await expect(review.getByLabel('Comment', { exact: true })).toHaveValue(REVIEW_COMMENT);
  await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('.recommendation-toast')).toHaveCount(0);
  expect(humanApprovals(await stored(page))).toEqual(humanApprovals(approved));
  await acceptAll(page, 'agent');
  await expect(accessRow(page, 'a-payment')).toContainText('Not permitted by policy');
  await applyDecisions(page);
  await expandConnected(page);
  await expect(accessRow(page, 'h-payment')).toContainText('Scheduled');
  await provision(page);
  await expandConnected(page);
  await expect(accessRow(page, 'h-payment')).toContainText('Granted');
  expect((await stored(page)).tasks['a-payment'].status).toBe('Not permitted by policy');
  await nav(page, 'Audit trail');
  await expect(accessRow(page, 'h-payment')).toContainText(REVIEW_COMMENT);
  await expect(accessRow(page, 'h-payment')).toContainText('Grant');
  await expect(accessRow(page, 'a-payment')).toContainText('Not permitted by policy');
  expect(humanApprovals(await stored(page))).toHaveLength(1);
  await assertProductLanguage(page);
});

test('recommendation spacing, agent action alignment and audit identity icons are consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await recommend(page);
  const checkResourceSpacing = async () => {
    const gaps = await page.locator('.decisions-panel .resource-cell').evaluateAll(cells => cells.map(cell => {
      const tile = cell.querySelector('.application-tile').getBoundingClientRect();
      const text = cell.querySelector('div').getBoundingClientRect();
      return { gap: text.left - tile.right, width: tile.width, height: tile.height };
    }));
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap).toEqual({ gap: 12, width: 28, height: 28 });
  };
  await checkResourceSpacing();
  await page.getByRole('tab', { name: 'AI Agent access', exact: true }).click();
  await checkResourceSpacing();
  const usage = accessRow(page, 'a-inbound');
  await expect(usage).not.toContainText('Recommended');
  const aligned = async () => usage.evaluate(element => {
    const badge = element.querySelector('.recommendation-usage-actions > .badge').getBoundingClientRect();
    const buttons = [...element.querySelectorAll('.recommendation-controls button')].map(button => button.getBoundingClientRect());
    return Math.abs(badge.right - buttons.at(-1).right) < 1 && buttons.every(button => button.height >= 40 && Math.abs(button.top - buttons[0].top) < 1);
  });
  expect(await aligned()).toBe(true);
  await usage.getByRole('button', { name: 'Accept', exact: true }).click();
  const assertAcceptedUsage = async (manual = false) => {
    await expect(usage).not.toContainText('Accepted');
    await expect(usage.getByText('Keep', { exact: true })).toHaveCount(1);
    await expect(usage.locator('.recommendation-usage-actions > .badge')).toHaveClass(/green/);
    await expect(usage.getByRole('button', { name: 'Accept', exact: true })).toHaveAttribute('aria-pressed', String(!manual));
    await expect(usage.getByRole('button', { name: 'Reject', exact: true })).toHaveAttribute('aria-pressed', String(manual));
    if (manual) await expect(usage.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled();
    else await expect(usage.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
    expect((await stored(page)).accessDecisions['a-inbound']).toMatchObject({ status: 'Accepted', decidedAction: 'KEEP' });
    expect(await aligned()).toBe(true);
  };
  await assertAcceptedUsage();
  await page.reload();
  await recommend(page);
  await page.getByRole('tab', { name: 'AI Agent access', exact: true }).click();
  await assertAcceptedUsage();
  await rejectRow(page, 'a-inbound', 'Remove', 'Agent usage is temporarily suspended.');
  await expect(usage).toContainText('Changed from Keep to Remove');
  await expect(usage).toContainText('Agent usage is temporarily suspended.');
  await rejectRow(page, 'a-inbound', 'Keep', 'Agent usage remains approved.');
  await assertAcceptedUsage(true);
  await expect(usage).toContainText('Agent usage remains approved.');
  expect(await aligned()).toBe(true);
  await nav(page, 'Audit trail');
  const icon = accessRow(page, 'a-inbound').getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true });
  await expect(icon).toBeVisible();
  expect(await icon.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))).toEqual({ width: 28, height: 28 });
  const artwork = await icon.locator('svg').evaluate(element => element.outerHTML);
  for (const id of ['a-inbound', 'a-payment']) {
    await accessRow(page, id).locator('.audit-access .table-link').click();
    const drawerIcon = page.getByRole('dialog').getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true });
    await expect(drawerIcon).toBeVisible();
    expect(await drawerIcon.locator('svg').evaluate(element => element.outerHTML)).toBe(artwork);
    await page.keyboard.press('Escape');
  }
  await accessRow(page, 'a-payment').getByRole('button', { name: 'View policy POL-AI-303', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await assertProductLanguage(page);
  await page.keyboard.press('Shift+R');
  await recommend(page);
  await page.getByRole('tab', { name: 'AI Agent access', exact: true }).click();
  await expect(usage.getByText('Keep', { exact: true })).toHaveCount(1);
  await expect(usage.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled();
  expect((await stored(page)).accessDecisions['a-inbound']).toMatchObject({ status: 'Recommended', decidedAction: null });
});
