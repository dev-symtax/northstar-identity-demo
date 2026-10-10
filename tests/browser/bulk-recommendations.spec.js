import { test, expect } from '@playwright/test';
import { exerciseRecommendationOverrides } from '../helpers/recommendation-overrides.js';

for (const method of ['Change', 'Reject']) {
  test(`bulk acceptance preserves ${method} selections for human and agent access through reload, provisioning, audit and reset`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await exerciseRecommendationOverrides(page, method);
    expect(errors).toEqual([]);
  });
}
