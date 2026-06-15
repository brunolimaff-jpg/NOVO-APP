import { test, expect } from '@playwright/test';
import { e2eOperatorEmail } from './helpers/onboarding';

test.describe('Scout smoke - greeting', () => {
  test('deve permitir entrar pelo onboarding inicial', async ({ page }) => {
    // Seta flags de auth no localStorage sem preencher operator_email,
    // para que a tela de boas-vindas apareca sem usuario existente
    await page.addInitScript(() => {
      const PREFIX = 'scout360:';
      localStorage.setItem(PREFIX + 'auth_skip_until', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');
    });
    await page.goto('/');

    await expect(page.getByTestId('greeting-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('greeting-name-input')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('greeting-name-input').fill('Bruno Lima');
    await page.getByTestId('greeting-email-input').fill(e2eOperatorEmail('qa.greeting'));
    await page.getByTestId('greeting-submit-button').click({ force: true });

    await expect(page.getByTestId('greeting-card')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
  });
});
