import { test, expect } from '@playwright/test';
import { accessRow, assertProductLanguage, nav, recommend, decideAll, applyDecisions, provision, expandConnected, changeRow } from '../helpers/iga-flow.js';

test('all sidebar pages are populated, read-only, and their rows open details', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(menu.getByRole('button')).toHaveCount(13);
  await expect(menu.getByRole('button', { name: /Recommendations|Provisioning/ })).toHaveCount(0);
  await expect(page.locator('.attention-card')).toContainText('1 mover event needs your decision');
  for (const [name, count] of [['My tasks', 6], ['Lifecycle events', 9], ['Access requests', 7], ['Access certifications', 4], ['Policies', 11], ['Roles', 6], ['AI agents', 4], ['Applications', 12], ['Connectors', 9], ['Workday source', 6], ['Audit trail', 5], ['Reports', 3]]) {
    await nav(page, name);
    const rows = page.locator('.workspace-records tbody tr');
    await expect(rows).toHaveCount(count);
    const row = rows.nth(name === 'Lifecycle events' ? 1 : 0);
    await row.getByRole('button').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('input, textarea, select')).toHaveCount(0);
    await assertProductLanguage(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
  }
  await nav(page, 'Lifecycle events');
  for (const [type, count] of [['Mover', 4], ['Joiner', 3], ['Leaver', 2], ['All', 9]]) {
    await page.getByRole('button', { name: `${type} ${count}`, exact: true }).click();
    await expect(page.locator('.workspace-records tbody tr')).toHaveCount(count);
  }
  await expect(page.locator('.attention-row')).toHaveCount(1);
  await nav(page, 'Applications');
  expect(await page.locator('.workspace-records tbody tr td:nth-child(5)').evaluateAll(cells => cells.reduce((sum, cell) => sum + Number(cell.innerText), 0))).toBe(40);
  await expect(page.locator('[data-asset-kind="category"]')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('portraits, profile, favicon and body/control accessibility are consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page).toHaveTitle('Northstar Identity · Meridian Global');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
  for (const name of ['Patrick Sena', 'Sarah Miller']) {
    const images = page.getByRole('img', { name, exact: true });
    expect(await images.count()).toBeGreaterThanOrEqual(2);
    expect(await images.evaluateAll(items => items.every(image => image.complete && image.naturalWidth === 192 && image.naturalHeight === 192))).toBe(true);
  }
  const directoryImages = page.locator('.directory-table .avatar img');
  await expect(directoryImages).toHaveCount(48);
  await expect.poll(async () => directoryImages.evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 192 && image.naturalHeight === 192))).toBe(true);
  expect(await directoryImages.evaluateAll(images => new Set(images.map(image => image.src)).size)).toBe(48);
  expect(await directoryImages.evaluateAll(images => images.every(image => getComputedStyle(image).objectFit === 'cover'))).toBe(true);
  for (const location of ['header', 'sidebar']) {
    const trigger = page.getByRole('button', { name: `Open Patrick Sena profile · ${location}`, exact: true });
    await trigger.click();
    const profile = page.getByRole('dialog', { name: 'Patrick Sena profile' });
    await expect(profile).toContainText('Patrick Sena');
    await expect(profile).toContainText('Head of Identity Governance');
    await expect(profile).toContainText('Meridian Global');
    await expect(profile).toContainText('patrick.sena@meridianglobal.com');
    await expect(profile.getByRole('img', { name: 'Patrick Sena' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))).toBeGreaterThanOrEqual(15);
  await recommend(page);
  await expect(page.locator('.title-action img[alt="Sarah Miller"]')).toBeVisible();
  const sizes = await page.locator('.recommendation-controls button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.every(height => height >= 40)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.button').first().evaluate(button => getComputedStyle(button).transitionDuration)).toBe('0s');
});

test('Reject requires a comment, reverses the action, records feedback and enforces the SoD guardrail', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await accessRow(page, 'h-bi').getByRole('button', { name: 'Reject', exact: true }).click();
  let editor = page.locator('[data-change-for="h-bi"]');
  await expect(editor.getByLabel('Decision', { exact: true })).toHaveValue('REMOVE');
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  expect(await editor.getByLabel('Comment', { exact: true }).evaluate(input => input.validity.valid)).toBe(false);
  await editor.getByLabel('Comment', { exact: true }).fill('Reporting access is removed for the new management scope.');
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Decision recorded');
  await expect(accessRow(page, 'h-bi')).toContainText('Changed from Keep to Remove');
  await accessRow(page, 'h-ar').getByRole('button', { name: 'Reject', exact: true }).click();
  editor = page.locator('[data-change-for="h-ar"]');
  await expect(editor.getByLabel('Decision', { exact: true })).toHaveValue('KEEP');
  await editor.getByLabel('Comment', { exact: true }).fill('Receivables responsibilities are retained during transition.');
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(page.getByText(/SoD conflict · POL-SOD-017/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove Accounts Receivable Operator', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deny Payment Approval', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply decisions', exact: true })).toBeDisabled();
});

test('unchanged access is hidden, comments are tooltips, and audit filters retain complete records', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await changeRow(page, 'h-budget', 'Do not grant', 'Budget approval stays with the Finance Director.');
  await decideAll(page);
  await applyDecisions(page);
  await expect(page.getByLabel('Show unchanged access')).not.toBeChecked();
  await expect(page.locator('.provisioning-connected tbody tr')).toHaveCount(0);
  await provision(page);
  await expandConnected(page);
  await expect(accessRow(page, 'h-sap')).toHaveCount(0);
  await expect(accessRow(page, 'a-payment')).toHaveCount(0);
  await expect(page.locator('.policy-count-line')).toHaveText('1 permission not permitted by policy · POL-AI-303');
  const comment = accessRow(page, 'h-budget').getByRole('button', { name: 'Review comment: Budget approval stays with the Finance Director.' });
  await expect(accessRow(page, 'h-budget')).not.toContainText('Budget approval stays with the Finance Director.');
  await comment.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Budget approval stays with the Finance Director.');
  await page.getByLabel('Show unchanged access').check();
  await expect(accessRow(page, 'h-sap')).toContainText('Retained');
  await nav(page, 'Audit trail');
  for (const [name, count] of [['Key controls', 5], ['Overrides', 1], ['Policy-locked', 1], ['Manual tasks', 2], ['All (16)', 16]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(count);
  }
  await accessRow(page, 'h-payment').getByRole('button', { name: 'SAP Payment Approval', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Patrick Sena' })).toBeVisible();
});
