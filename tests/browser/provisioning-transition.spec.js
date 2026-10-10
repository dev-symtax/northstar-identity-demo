import { test, expect } from '@playwright/test';
import { EDIT_COMMENT, applyDecisions, rejectRow, decideAll, expectFullyInViewport, nav, recommend } from '../helpers/iga-flow.js';

for (const changes of [7, 6]) {
  test(`provisioning shows committed ${changes}-change success before moving to the manual task`, async ({ page }) => {
    await page.goto('/');
    await recommend(page);
    if (changes === 6) await rejectRow(page, 'h-budget', 'Do not grant', EDIT_COMMENT);
    await decideAll(page);
    await applyDecisions(page);
    const summary = page.locator('.stats-row.three');
    const connected = page.locator('.provisioning-connected');
    const manual = page.locator('.legacy-panel');
    await expect(connected).toContainText(`0 of ${changes} changes provisioned`);
    await page.clock.install({ time: new Date('2026-10-13T09:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-13T09:00:01Z'));
    await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
    await expect(connected).toContainText(`${changes} of ${changes} changes provisioned`);
    await expect(summary).toContainText(`${changes} of ${changes}`);
    await expect(page.locator('.provisioning-toast')).toHaveText(`${changes} of ${changes} connected changes provisioned successfully. 1 manual task remains.`);
    await expect(page.locator('.provisioning-toast')).toBeInViewport();
    await expectFullyInViewport(page, summary);
    await expect(manual).not.toBeInViewport({ ratio: 1 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')));
    expect(saved.fulfillmentStarted).toBe(true);
    expect(saved.legacyTask.status).toBe('Task open');
    expect(Object.values(saved.tasks).filter(task => ['Granted', 'Removed'].includes(task.status))).toHaveLength(changes);
    await page.clock.runFor(500);
    await expectFullyInViewport(page, summary);
    await expect(manual).not.toBeInViewport({ ratio: 1 });
    await page.clock.runFor(500);
    await expectFullyInViewport(page, manual);
    await expect(page.locator('.provisioning-toast')).toBeInViewport();
    await expect(connected.locator('tbody tr')).toHaveCount(changes);
    await expect(page.getByLabel('Show unchanged access')).not.toBeChecked();
    await page.getByLabel('Show unchanged access').check();
    await expect(connected.locator('tbody tr')).toHaveCount(changes + 5);
    await page.getByLabel('Show unchanged access').uncheck();
    await expect(connected.locator('tbody tr')).toHaveCount(changes);
    await expect(connected).toContainText(`${changes} of ${changes} changes provisioned`);
    await page.clock.resume();
    await page.reload();
    await nav(page, 'Lifecycle events');
    await expect(page.getByRole('button', { name: 'Review mover event', exact: true })).toBeVisible();
    await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
    await expectFullyInViewport(page, manual);
    await expect(page.locator('.provisioning-toast')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Run scheduled provisioning', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Show unchanged access')).not.toBeChecked();
    await expect(connected.locator('tbody tr')).toHaveCount(changes);
    await expect(connected).toContainText(`${changes} of ${changes} changes provisioned`);
  });
}

test('leaving provisioning during success cancels the pending manual-task scroll', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await decideAll(page);
  await applyDecisions(page);
  await page.clock.install({ time: new Date('2026-10-13T09:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-13T09:00:01Z'));
  await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
  await expect(page.locator('.provisioning-toast')).toBeVisible();
  await nav(page, 'Lifecycle events');
  await page.clock.runFor(1000);
  await expect(page.locator('main').getByRole('heading', { name: 'Lifecycle events', exact: true, level: 1 })).toBeInViewport();
  await expect(page.locator('.provisioning-toast')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review mover event', exact: true })).toBeVisible();
});
