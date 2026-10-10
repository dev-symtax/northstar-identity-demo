import { test } from '@playwright/test';
import { exerciseApprovalFirstSod, exerciseKeepFirstSod } from '../helpers/sod-dependency.js';

test('approval first requires removal and permits only explicit safe resolutions, including reload and reset', async ({ page }) => {
  await page.goto('/');
  await exerciseApprovalFirstSod(page);
});

for (const resolution of ['Remove Accounts Receivable Operator', 'Deny SAP Payment Approval']) {
  test(`receivables kept first requires ${resolution}, persists and reaches valid provisioning and audit`, async ({ page }) => {
    await page.goto('/');
    await exerciseKeepFirstSod(page, resolution);
  });
}
