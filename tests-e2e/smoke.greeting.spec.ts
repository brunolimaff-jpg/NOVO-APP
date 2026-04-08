import { test, expect } from '@playwright/test';

test.describe('Scout smoke - greeting', () => {
  test('deve permitir entrar pelo onboarding inicial', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('greeting-card')).toBeVisible();
    await expect(page.getByTestId('greeting-name-input')).toBeVisible();

    await page.getByTestId('greeting-name-input').fill('Bruno');
    await page.getByTestId('greeting-submit-button').click();

    await expect(page.getByTestId('greeting-card')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('investigation-company-input')).toBeVisible();
  });
});
