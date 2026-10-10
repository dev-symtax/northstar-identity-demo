import { test, expect } from '@playwright/test';
import { accessRow, assertProductLanguage, nav, recommend, decideAll, decidePayment, applyDecisions, provision, changeRow } from '../helpers/iga-flow.js';
import { assertLogoConsistency, verifyLogoCatalog } from '../helpers/application-logos.js';

test('Overview Directory contains only core dimensions while Lifecycle events retains movers', async ({ page }) => {
  await page.goto('/');
  const directory = page.locator('.directory-section');
  await expect(directory.getByRole('tab')).toHaveText(['Identities48', 'Applications12', 'AI agents4']);
  await expect(directory).not.toContainText(/Mover/i);
  for (const [name, count, firstRecord] of [['Identities', 48, 'Sarah Miller'], ['Applications', 12, 'SAP S/4HANA'], ['AI agents', 4, 'Finance Operations Agent']]) {
    await directory.getByRole('tab', { name: `${name} ${count}`, exact: true }).click();
    await expect(directory.locator('tbody tr')).toHaveCount(count);
    await expect(directory.locator('tbody tr').first()).toContainText(firstRecord);
  }
  await nav(page, 'Lifecycle events');
  await page.getByRole('button', { name: 'Mover 4', exact: true }).click();
  await expect(page.locator('.workspace-records tbody tr')).toHaveCount(4);
  const sarah = page.locator('[data-record-id="WD-MOV-2026-0842"]');
  await expect(sarah).toContainText('Mover');
  await sarah.getByRole('button').first().click();
  await expect(page.locator('.event-source-label')).toContainText('Workday mover event');
  await expect(page.locator('main')).toContainText('Finance Analyst');
  await expect(page.locator('main')).toContainText('Finance Manager');
});

test('Provisioning immediately shows changed connected rows and filters unchanged rows without changing counts', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await decideAll(page);
  await applyDecisions(page);
  const connected = page.locator('.provisioning-connected');
  const unchanged = page.getByLabel('Show unchanged access');
  const rows = connected.locator('tbody tr');
  const changedIds = ['a-ar', 'a-dashboard', 'h-ar', 'h-budget', 'h-dashboard', 'h-payment', 'h-snow-approver'];
  async function expectChangedRows(completed) {
    await expect(unchanged).not.toBeChecked();
    await expect(rows).toHaveCount(7);
    expect(await rows.evaluateAll(items => items.map(row => row.dataset.rowId).sort())).toEqual(changedIds);
    await expect(rows.first()).toBeVisible();
    await expect(connected).toContainText(`${completed} of 7 changes provisioned`);
    await expect(page.locator('.stats-row')).toContainText(`${completed} of 7`);
  }
  await expectChangedRows(0);
  await unchanged.check();
  await expect(rows).toHaveCount(12);
  await expect(accessRow(page, 'h-sap')).toContainText('No change required');
  await expect(accessRow(page, 'a-payment')).toHaveCount(0);
  await expect(connected).toContainText('0 of 7 changes provisioned');
  await unchanged.uncheck();
  await expectChangedRows(0);
  await provision(page);
  await expectChangedRows(7);
  await unchanged.check();
  await expect(rows).toHaveCount(12);
  await expect(accessRow(page, 'h-sap')).toContainText('Retained');
  await expect(connected).toContainText('7 of 7 changes provisioned');
  await unchanged.uncheck();
  await expectChangedRows(7);
  await page.getByRole('button', { name: 'Hide results', exact: true }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expectChangedRows(7);
  await nav(page, 'Access recommendations');
  await nav(page, 'Provisioning');
  await expectChangedRows(7);
  await page.reload();
  // Reload preserves the existing Overview entry; reopening Sarah resumes Provisioning.
  await nav(page, 'Lifecycle events');
  await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Provisioning', exact: true })).toBeVisible();
  await expectChangedRows(7);
});

test('all sidebar pages are populated, read-only, and their rows open details', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const menu = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(menu.getByRole('button')).toHaveCount(13);
  await expect(menu.getByRole('button', { name: /Recommendations|Provisioning/ })).toHaveCount(0);
  await expect(page.locator('.attention-card')).toContainText('1 mover event needs your decision');
  await nav(page, 'Applications');
  const logoSources = await verifyLogoCatalog(page);
  for (const [name, count] of [['My tasks', 6], ['Lifecycle events', 9], ['Access requests', 7], ['Access certifications', 4], ['Policies', 11], ['Roles', 6], ['AI agents', 4], ['Applications', 12], ['Connectors', 10], ['Workday source', 6], ['Audit trail', 5], ['Reports', 3]]) {
    await nav(page, name);
    const rows = page.locator('.workspace-records tbody tr');
    await expect(rows).toHaveCount(count);
    await assertLogoConsistency(page, logoSources);
    const row = rows.nth(name === 'Lifecycle events' ? 1 : 0);
    await row.getByRole('button').first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await assertLogoConsistency(page, logoSources);
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
  await expect(page.locator('[data-asset-kind="official"]')).toHaveCount(8);
  await expect(page.locator('[data-asset-kind="category"]')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('portraits, profile, favicon and body/control accessibility are consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page).toHaveTitle('Northstar Identity · Meridian Global');
  const tenantLogo = page.locator('.tenant img[alt="Meridian Global"]');
  await expect(tenantLogo).toBeVisible();
  await expect(page.getByRole('img', { name: 'Meridian Global', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Northstar Identity', exact: true })).toBeVisible();
  await expect(page.locator('.tenant')).toContainText('Meridian Global');
  await expect.poll(() => tenantLogo.evaluate(img => img.complete && img.naturalWidth === 2172 && img.naturalHeight === 724)).toBe(true);
  expect(await tenantLogo.evaluate(img => {
    const mark = img.parentElement;
    const style = getComputedStyle(mark);
    const bounds = mark.getBoundingClientRect();
    const image = img.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, background: style.backgroundColor,
      border: style.borderWidth, shadow: style.boxShadow, aspectRatio: image.width / image.height };
  })).toEqual({ width: 31, height: 31, background: 'rgba(0, 0, 0, 0)', border: '0px', shadow: 'none', aspectRatio: 3 });
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
  await decidePayment(page);
  await accessRow(page, 'h-ar').getByRole('button', { name: 'Reject', exact: true }).click();
  editor = page.locator('[data-change-for="h-ar"]');
  await expect(editor.getByLabel('Decision', { exact: true })).toHaveValue('KEEP');
  await editor.getByLabel('Comment', { exact: true }).fill('Receivables responsibilities are retained during transition.');
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
  await expect(page.getByText('POL-SOD-017 prevents Accounts Receivable Operator and SAP Payment Approval from being active together.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep removal', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deny SAP Payment Approval', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply decisions', exact: true })).toBeDisabled();
});

test('unchanged access is hidden, comments are tooltips, and audit filters retain complete records', async ({ page }) => {
  await page.goto('/');
  await recommend(page);
  await changeRow(page, 'h-budget', 'Do not grant', 'Budget approval stays with the Finance Director.');
  await changeRow(page, 'h-bi', 'Remove', 'Finance reporting uses the management dashboard.');
  await decideAll(page);
  await applyDecisions(page);
  await expect(page.getByLabel('Show unchanged access')).not.toBeChecked();
  await expect(page.locator('.provisioning-connected tbody tr')).toHaveCount(7);
  await provision(page);
  await expect(accessRow(page, 'h-sap')).toHaveCount(0);
  await expect(accessRow(page, 'a-payment')).toHaveCount(0);
  await expect(page.locator('.policy-count-line')).toHaveText('1 permission not permitted by policy · POL-AI-303');
  await expect(accessRow(page, 'h-budget')).toHaveCount(0);
  const comment = accessRow(page, 'h-bi').getByRole('button', { name: 'Review comment: Finance reporting uses the management dashboard.' });
  await expect(accessRow(page, 'h-bi')).not.toContainText('Finance reporting uses the management dashboard.');
  await comment.focus();
  await expect(page.getByRole('tooltip')).toHaveText('Finance reporting uses the management dashboard.');
  await page.getByLabel('Show unchanged access').check();
  await expect(accessRow(page, 'h-sap')).toContainText('Retained');
  await nav(page, 'Audit trail');
  for (const [name, count] of [['Key controls', 5], ['Overrides', 2], ['Policy-locked', 1], ['Manual tasks', 3], ['All (17)', 17]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(count);
  }
  await accessRow(page, 'h-payment').getByRole('button', { name: 'SAP Payment Approval', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Patrick Sena' })).toBeVisible();
});
