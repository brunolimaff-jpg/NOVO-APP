import { test, expect } from '@playwright/test';
import { e2eOperatorEmail, preventMigrationNotice } from './helpers/onboarding';

test.describe('Scout smoke - greeting', () => {
  test('deve permitir entrar pelo onboarding inicial', async ({ page }) => {
    // Previne o modal de migração setando a flag antes de carregar
    await preventMigrationNotice(page);
    await page.goto('/');

    await expect(page.getByTestId('greeting-card')).toBeVisible();
    await expect(page.getByTestId('greeting-name-input')).toBeVisible();

    await page.getByTestId('greeting-name-input').fill('Bruno Lima');
    await page.getByTestId('greeting-email-input').fill(e2eOperatorEmail('qa.greeting'));
    await page.getByTestId('greeting-submit-button').click();

    await expect(page.getByTestId('greeting-card')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('investigation-company-input')).toBeVisible();
  });
});
