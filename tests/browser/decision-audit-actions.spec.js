import { test, expect } from '@playwright/test';
import { exerciseExclusiveDecisionControls, exerciseScheduledAuditNavigation } from '../helpers/decision-audit-actions.js';

test('only the active Human and AI Agent decision control is highlighted through reversal, bulk acceptance, reload and reset', async ({ page }) => {
  await page.goto('/');
  await exerciseExclusiveDecisionControls(page);
});

test('scheduled provisioning exposes decision-only audit and returns to the correct lifecycle destination before and after execution', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await exerciseScheduledAuditNavigation(page);
  expect(errors).toEqual([]);
});
