import { test, expect } from '@playwright/test';
import { accessRow, applyDecisions, rejectRow, confirmCompletion, decideAll, expectFullyInViewport, nav, provision, recommend } from '../helpers/iga-flow.js';

const reviewTask = page => page.getByRole('button', { name: 'Review task', exact: true });
const taskCount = page => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'My tasks', exact: true }).locator('.nav-count');

async function expectTaskState(page, count) {
  await expect(taskCount(page)).toHaveText(String(count));
  await expect(page.locator('.workspace-records .section-title')).toContainText(`${count} open ${count === 1 ? 'task' : 'tasks'}`);
  if (count) await expect(reviewTask(page)).toBeEnabled();
  else {
    await expect(reviewTask(page)).toHaveCount(0);
    await expect(page.locator('.page-title .title-action')).toHaveCount(0);
  }
}

test('confirmation uses the shared agent icon and preserves application alignment, row height and decision counts', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await decideAll(page);
  await nav(page, 'Audit trail');
  const artwork = await accessRow(page, 'a-inbound').getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true }).locator('svg').evaluate(element => element.outerHTML);
  await recommend(page);
  for (const changedUsage of [false, true]) {
    if (changedUsage) {
      await page.getByRole('tab', { name: 'AI Agent access', exact: true }).click();
      await rejectRow(page, 'a-inbound', 'Remove', 'Agent usage is temporarily suspended.');
    }
    await page.getByRole('button', { name: 'Apply decisions', exact: true }).first().click();
    const panel = page.getByRole('dialog', { name: 'Apply access decisions', exact: true });
    const applications = panel.getByRole('table', { name: 'Decisions by application', exact: true });
    const agentRow = applications.getByRole('row').filter({ hasText: 'Finance Operations Agent' });
    const icon = agentRow.getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true });
    await expect(icon).toHaveCount(1);
    await expect(icon).toHaveAttribute('data-identity-type', 'agent');
    await expect(agentRow.locator('[data-application]')).toHaveCount(0);
    await expect(agentRow.getByRole('cell').last()).toHaveText('1');
    expect(await icon.locator('svg').evaluate(element => element.outerHTML)).toBe(artwork);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await applications.locator('tbody tr').evaluateAll(rows => rows.map(row => {
      const cell = row.cells[0];
      const tile = cell.querySelector('.application-tile, .agent-tile').getBoundingClientRect();
      const text = cell.querySelector('.application-name, .agent-name').lastElementChild.getBoundingClientRect();
      return { name: cell.innerText, width: tile.width, height: tile.height, left: tile.left, gap: text.left - tile.right, padding: getComputedStyle(cell).padding, rowHeight: row.getBoundingClientRect().height };
    }));
    for (const metric of metrics) {
      expect(metric.width).toBe(28);
      expect(metric.height).toBe(28);
      expect(metric.left).toBeCloseTo(metrics[0].left, 1);
      expect(metric.gap).toBe(8);
      expect(metric.padding).toBe('13px 17px');
    }
    // Baseline measured in this same table before the agent icon was added.
    expect(metrics.map(metric => metric.rowHeight)).toEqual([73.5, 73.5, 73.5, 77.5, 73.5, 50.5]);
    const records = await applications.locator('tbody tr td:last-child').allTextContents();
    expect(records.reduce((sum, count) => sum + Number(count), 0)).toBe(16);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('northstar-identity-demo-v1')).applied)).toBe(false);
  }
});

test('My tasks follows outstanding review and manual work, preserves completed history on reload and restores action on reset', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'My tasks');
  await expectTaskState(page, 1);
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(6);
  await reviewTask(page).click();
  await expect(page.getByRole('heading', { name: 'Lifecycle event', exact: true })).toBeVisible();
  await recommend(page);
  await decideAll(page);
  await nav(page, 'My tasks');
  await expectTaskState(page, 0);
  await expect(page.locator('[data-record-id="TASK-0842"]')).toContainText('Approved');
  await nav(page, 'Lifecycle events');
  await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
  await nav(page, 'Access recommendations');
  await applyDecisions(page);
  await provision(page);
  await nav(page, 'My tasks');
  await expectTaskState(page, 1);
  const manual = page.locator('[data-record-id="SN-TASK-004812"]');
  await expect(manual).toContainText('Task open');
  await expect(manual).toContainText('User and AI agent');
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(7);
  await page.reload();
  await nav(page, 'My tasks');
  await expectTaskState(page, 1);
  await reviewTask(page).click();
  await expect(page.getByRole('heading', { name: 'Provisioning', exact: true })).toBeVisible();
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await confirmCompletion(page);
  await nav(page, 'My tasks');
  await expectTaskState(page, 0);
  await expect(manual).toContainText('Completed');
  await manual.getByRole('button').first().click();
  const history = page.getByRole('dialog', { name: 'Remove Finance database write access', exact: true });
  await expect(history).toContainText('Martin Keller');
  await expect(history).toContainText('CHG-2026-2059');
  await expect(history.locator('input, textarea, select')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await nav(page, 'My tasks');
  await expectTaskState(page, 0);
  await expect(manual).toContainText('Completed');
  await page.keyboard.press('Shift+R');
  await nav(page, 'My tasks');
  await expectTaskState(page, 1);
  await expect(manual).toHaveCount(0);
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(6);
});

test('My tasks has no outstanding action after provisioning when no manual task was selected', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await decideAll(page);
  for (const id of ['h-legacy', 'a-legacy']) {
    await page.getByRole('tab', { name: id.startsWith('h-') ? 'Human access' : 'AI Agent access', exact: true }).click();
    await rejectRow(page, id, 'Keep', 'Legacy access remains an approved business requirement.');
  }
  await applyDecisions(page);
  await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
  await nav(page, 'My tasks');
  await expectTaskState(page, 0);
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(6);
  await page.reload();
  await nav(page, 'My tasks');
  await expectTaskState(page, 0);
});
