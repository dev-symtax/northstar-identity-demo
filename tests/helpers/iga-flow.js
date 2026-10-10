import { expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const KEY_RECORDS = ['a-inbound', 'a-legacy', 'a-payment', 'h-legacy', 'h-payment'];
export const REVIEW_COMMENT = 'Approved for Finance Manager duties after conflicting receivables access is removed.';
export const EDIT_COMMENT = 'Budget approval remains with the Finance Director.';
export const COMPLETION_REFERENCE = 'CHG-2026-2059';
export const COMPLETION_NOTE = 'DBA confirmed user and agent database write permissions were revoked and independently verified.';

const prohibited = /\b(?:demo|presenter|synthetic|sample|mock|story)\b|Did we cover|Access starts with context\.|Every permission has a decision\.|Every decision has a reason\.|Consistent governance\. Practical fulfillment\.|Explain the decision\. Prove the control\.|coming soon|Identity intelligence|Two distinct evidence trails|When business context changes, access changes with it\.|People\. Agents\. Applications\.|Change is accelerating\. Control must keep pace\./i;

export async function assertProductLanguage(page) {
  const visibleCopy = await page.evaluate(() => {
    const isVisible = element => {
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
    };
    const hints = [...document.querySelectorAll('[title], [aria-label], [placeholder]')]
      .filter(isVisible)
      .flatMap(element => ['title', 'aria-label', 'placeholder'].map(attribute => element.getAttribute(attribute) || ''));
    return [document.body.innerText, ...hints].join('\n');
  });
  expect(visibleCopy).not.toMatch(prohibited);
  const undersized = await page.locator('main p, main td, main th, main li').evaluateAll(elements => elements.filter(element => parseFloat(getComputedStyle(element).fontSize) < 15).map(element => `${element.tagName}.${element.className} ${getComputedStyle(element).fontSize}: ${element.textContent.slice(0,80)}`));
  expect(undersized).toEqual([]);
  expect(visibleCopy).not.toMatch(/Shift\s*\+\s*[GR]|[?&]reset=1/i);
  // The three-stage manual audit explicitly uses these fulfillment labels;
  // the existing product terminology guard still applies everywhere else.
  const terminologyCopy = visibleCopy.replace(/\bManual fulfillment\b|\bFulfillment (?:method|status)\b/gi, '');
  expect(terminologyCopy).not.toMatch(/\b(?:Inbound|Outbound|Fulfillment|Governance decision|Policy evaluation|Direct application access|Delegated access|High-risk exception|Separation of duties|Never delegated|Workspace date)\b/i);
}

export async function nav(page, name) {
  const item = ['Provisioning', 'Access recommendations'].includes(name)
    ? page.getByRole('button', { name: `Step ${name === 'Provisioning' ? 4 : 3}: ${name}`, exact: true })
    : page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true });
  await item.click();
  await expect(page.locator('main').getByRole('heading', { level: 1 })).toBeVisible();
  await assertProductLanguage(page);
}

export async function openSarahEvent(page) {
  await nav(page, 'Lifecycle events');
  await page.locator('[data-record-id="WD-MOV-2026-0842"]').getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Lifecycle event', exact: true })).toBeVisible();
}

export async function recommend(page) {
  await openSarahEvent(page);
  await page.getByRole('button', { name: 'Review access recommendations', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Access recommendations', exact: true })).toBeVisible();
  await assertProductLanguage(page);
}

export function accessRow(page, id) {
  return page.locator(`[data-row-id="${id}"]`).first();
}

export async function acceptAll(page, scope) {
  await page.getByRole('tab', { name: scope === 'human' ? 'Human access' : 'AI Agent access', exact: true }).click();
  await page.getByRole('button', { name: 'Accept all recommendations', exact: true }).click();
}

export async function decidePayment(page, approve = true, comment = REVIEW_COMMENT) {
  await page.getByRole('tab', { name: 'Human access', exact: true }).click();
  await page.locator('.exception-panel').getByRole('button', { name: approve ? 'Approve' : 'Deny', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Patrick Sena');
  await expect(dialog).toContainText('POL-SOD-017');
  await dialog.getByLabel('Comment', { exact: true }).fill(comment);
  await assertProductLanguage(page);
  await dialog.getByRole('button', { name: approve ? 'Approve' : 'Deny', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Decision recorded for SAP Payment Approval', { exact: true })).toBeVisible();
  await expect(page.getByText('Agent: Not permitted by policy', { exact: true })).toBeVisible();
}

export async function decideAll(page, approve = true) {
  await acceptAll(page, 'human');
  await decidePayment(page, approve);
  await acceptAll(page, 'agent');
}

export async function changeRow(page, id, decision, comment) {
  const row = accessRow(page, id);
  await row.getByRole('button', { name: 'Change', exact: true }).click();
  const form = page.locator(`[data-change-for="${id}"]`);
  // The inline form remains associated with its row if it is rendered as a
  // separate table row, or is nested in the access row itself.
  const editor = await form.count() ? form : row;
  await editor.getByLabel('Decision', { exact: true }).selectOption({ label: decision });
  await editor.getByLabel('Comment', { exact: true }).fill(comment);
  await assertProductLanguage(page);
  await editor.getByRole('button', { name: 'Save change', exact: true }).click();
}

export async function applyDecisions(page) {
  const button = page.getByRole('button', { name: 'Apply decisions', exact: true }).first();
  await expect(button).toBeEnabled();
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Apply access decisions' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('SAP S/4HANA');
  await expect(dialog).toContainText('Finance Hub');
  await expect(dialog).toContainText('Legacy Finance DB');
  const agent = dialog.getByRole('img', { name: 'Finance Operations Agent · AI agent', exact: true });
  await expect(agent).toHaveCount(1);
  await expect(agent).toBeVisible();
  expect(await agent.evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))).toEqual({ width: 28, height: 28 });
  await assertProductLanguage(page);
  await dialog.getByRole('button', { name: 'Apply decisions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Provisioning', exact: true })).toBeVisible();
  await expect(page.locator('.fulfillment-banner h2')).toHaveText('Changes scheduled for Monday, 19 October 2026 · 08:00 UTC.');
  await expect(page.locator('.fulfillment-banner p')).toHaveText('No access has changed yet.');
  await expect(page.getByRole('button', { name: 'Run scheduled provisioning', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Run scheduled provisioning', exact: true })).toHaveClass(/primary/);
  await expect(page.getByRole('button', { name: 'View audit trail', exact: true })).toHaveClass(/secondary/);
  await assertProductLanguage(page);
}

export async function provision(page) {
  await page.getByRole('button', { name: 'Run scheduled provisioning', exact: true }).click();
  await expect(page.locator('.provisioning-toast')).toHaveText(/^\d+ of \d+ connected changes provisioned successfully\. 1 manual task remains\.$/);
  await expectFullyInViewport(page, page.locator('.legacy-panel'));
  await expect(page.locator('.legacy-panel')).toBeVisible();
  await expect(page.locator('.legacy-panel')).toContainText('SN-TASK-004812');
  await expect(page.locator('.legacy-panel')).toContainText('19 October 2026 · 12:00 UTC');
  await expect(page.locator('.app-footer')).toContainText('Today: Tuesday, 13 Oct 2026');
  await expect(page.locator('.provisioning-run-date')).toHaveText('Run date: Monday, 19 Oct 2026 · 08:00 UTC');
  await assertProductLanguage(page);
}

export async function confirmCompletion(page, editable = true) {
  await page.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm completion' });
  const reference = dialog.getByLabel('Completion reference', { exact: true });
  const note = dialog.getByLabel('Verification note', { exact: true });
  expect((await reference.inputValue()).trim()).not.toBe('');
  expect((await note.inputValue()).trim()).not.toBe('');
  if (editable) {
    await reference.fill(COMPLETION_REFERENCE);
    await note.fill(COMPLETION_NOTE);
  }
  await assertProductLanguage(page);
  await dialog.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Lifecycle events', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('[data-record-id="WD-MOV-2026-0842"]')).toContainText('Completed');
  await expect(page.locator('.recorded-toast')).toHaveText('Manual task completed. Sarah Miller’s role change is now complete.');
  await expect(page.getByLabel('Access lifecycle', { exact: true })).toHaveCount(0);
}

export async function downloadAudit(page) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export audit trail', exact: true }).click();
  const download = await event;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

export async function expectFullyInViewport(page, locator) {
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    return !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1;
  }).toBe(true);
}

export async function expandConnected(page) {
  const expand = page.getByRole('button', { name: 'Show results', exact: true });
  if (await expand.count() && await expand.first().isVisible()) await expand.first().click();
}

export async function assertKeyAuditRecords(page, total = 18) {
  await expect(page.getByRole('button', { name: `All (${total})`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(total);
  await page.getByRole('button', { name: 'Key controls', exact: true }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(5);
  expect((await page.locator('.evidence-panel tbody tr').evaluateAll(rows => rows.map(row => row.dataset.rowId))).sort()).toEqual(KEY_RECORDS);
  await expect(accessRow(page, 'h-payment')).toContainText('Patrick Sena');
  await expect(accessRow(page, 'a-payment')).toContainText('Not permitted by policy');
  await expect(accessRow(page, 'a-payment')).toContainText('POL-AI-303');
  await page.getByRole('button', { name: `All (${total})`, exact: true }).click();
  await expect(page.locator('.evidence-panel tbody tr')).toHaveCount(total);
}
