import { test } from '@playwright/test';
import { exerciseBinaryRecommendations } from '../helpers/binary-recommendations.js';

test('both scopes expose two controls with opposite outcomes, required rationale, keyboard access and persistent downstream decisions', async ({ page }) => {
  await page.goto('/');
  await exerciseBinaryRecommendations(page);
});
