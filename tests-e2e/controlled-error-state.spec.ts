// tests-e2e/controlled-error-state.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { completeOnboarding, dismissMigrationNotice, e2eCompanyName } from './helpers/onboarding';

test.describe('Anti-Regressão: Erro Controlado', () => {
  test.describe.configure({ timeout: 180_000 });

  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await setupE2EAuth(page, { uniqueOperator: true });
    await page.route('**/api/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });
  });

  async function startFailingInvestigation(page: import('@playwright/test').Page) {
    const company = page.getByTestId('investigation-company-input');
    const city = page.getByTestId('investigation-city-input');
    const uf = page.getByTestId('investigation-uf-input');

    await expect(company).toBeVisible({ timeout: 15_000 });
    await company.fill(e2eCompanyName('Fazenda Erro E2E'));
    await expect(city).toBeVisible({ timeout: 15_000 });
    await city.fill('Cuiabá');
    await expect(uf).toBeVisible({ timeout: 15_000 });
    await uf.fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    await expect(page.getByTestId('error-message-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: 15_000 });
  }

  test('falha de API não gera tela branca', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);
    await startFailingInvestigation(page);

    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('error-message-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
  });

  test('LoadingSmart não fica infinito após falha', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);
    await startFailingInvestigation(page);
  });

  test('usuário consegue interagir após falha', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);
    await startFailingInvestigation(page);

    const chatInput = page.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });
    await expect(chatInput).toBeEnabled({ timeout: 15_000 });
  });
});
