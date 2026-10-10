import { test, expect } from '@playwright/test';
import { exerciseCountersAndManualStages } from '../helpers/decision-counters-manual-stages.js';

test('effective counters, primary Apply and all three manual audit stages persist through the full lifecycle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await exerciseCountersAndManualStages(page);
  expect(errors).toEqual([]);
});
