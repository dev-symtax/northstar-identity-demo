import { test, expect } from '@playwright/test';
import { acceptAll, applyDecisions, rejectRow, confirmCompletion, decideAll, decidePayment, nav, openSarahEvent, provision, recommend } from '../helpers/iga-flow.js';

const sarah = page => page.locator('[data-record-id="WD-MOV-2026-0842"]');
const reviewMover = page => page.getByRole('button', { name: 'Review mover event', exact: true });
async function expectAttention(page, title) {
  await expect(page.locator('.attention-card')).toContainText('NEEDS YOUR ATTENTION');
  await expect(page.locator('.attention-card h2')).toHaveText(title);
  await expect(page.locator('main')).not.toContainText('Mover decisions recorded');
}
async function expectNoAttention(page) {
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.locator('.attention-card')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('NEEDS YOUR ATTENTION');
  await expect(page.locator('main')).not.toContainText('Mover decisions recorded');
  await expect(page.locator('.profile-panel')).toContainText('Finance Manager');
  await expect(page.locator('.directory-section')).toBeVisible();
}

test('Overview attention follows outstanding work, disappears after completion, persists on reload and returns on reset', async ({ page }) => {
  await page.goto('/');
  await expectAttention(page, '1 mover event needs your decision');
  await page.locator('.attention-card').getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lifecycle events', exact: true, level: 1 })).toBeVisible();
  await expect(reviewMover(page)).toBeVisible();
  await recommend(page);
  await acceptAll(page, 'human');
  await acceptAll(page, 'agent');
  await nav(page, 'Overview');
  await expectAttention(page, '1 mover event needs your decision');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')).review)).toBe('pending');
  await recommend(page);
  await decidePayment(page);
  await nav(page, 'Overview');
  await expectAttention(page, '1 mover event ready to apply');
  await page.locator('.attention-card').getByRole('button', { name: 'View event', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lifecycle events', exact: true, level: 1 })).toBeVisible();
  await expect(reviewMover(page)).toBeVisible();
  await recommend(page);
  await applyDecisions(page);
  await nav(page, 'Overview');
  await expectAttention(page, 'Mover changes awaiting effective date');
  await nav(page, 'Lifecycle events');
  await expect(reviewMover(page)).toBeVisible();
  await openSarahEvent(page);
  await nav(page, 'Provisioning');
  await provision(page);
  await nav(page, 'Overview');
  await expectAttention(page, '1 manual task needs completion');
  await page.reload();
  await expectAttention(page, '1 manual task needs completion');
  await nav(page, 'Lifecycle events');
  await expect(reviewMover(page)).toBeVisible();
  await sarah(page).getByRole('button').first().click();
  await confirmCompletion(page);
  await expect(sarah(page)).toContainText('Completed');
  await expect(reviewMover(page)).toHaveCount(0);
  await expect(page.locator('.page-title .title-action')).toHaveCount(0);
  await nav(page, 'Overview');
  await expectNoAttention(page);
  await page.reload();
  await expectNoAttention(page);
  await nav(page, 'Lifecycle events');
  await expect(sarah(page)).toContainText('Completed');
  await expect(reviewMover(page)).toHaveCount(0);
  await sarah(page).getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true, level: 1 })).toBeVisible();
  await nav(page, 'Overview');
  await page.keyboard.press('Shift+R');
  await expectAttention(page, '1 mover event needs your decision');
  await page.reload();
  await expectAttention(page, '1 mover event needs your decision');
  await nav(page, 'Lifecycle events');
  await expect(reviewMover(page)).toBeVisible();
});

test('Overview also clears attention when all selected changes complete without a manual task', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  for (const id of ['h-legacy', 'a-legacy']) {
    await page.getByRole('tab', { name: id.startsWith('h-') ? 'Human access' : 'AI Agent access', exact: true }).click();
    await rejectRow(page, id, 'Keep', 'Legacy access remains an approved business requirement.');
  }
  await decideAll(page);
  await applyDecisions(page);
  await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
  await expect(page.locator('.legacy-panel')).toContainText('Not required');
  await expect(page.locator('.provisioning-toast')).toHaveText('7 of 7 connected changes provisioned successfully. No manual tasks remain.');
  await nav(page, 'Lifecycle events');
  await expect(sarah(page)).toContainText('Completed');
  await expect(reviewMover(page)).toHaveCount(0);
  await nav(page, 'Overview');
  await expectNoAttention(page);
  await page.reload();
  await expectNoAttention(page);
  await nav(page, 'Lifecycle events');
  await expect(reviewMover(page)).toHaveCount(0);
  await sarah(page).getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Audit trail', exact: true, level: 1 })).toBeVisible();
  await page.keyboard.press('Shift+R');
  await expectAttention(page, '1 mover event needs your decision');
  await nav(page, 'Lifecycle events');
  await expect(reviewMover(page)).toBeVisible();
});
