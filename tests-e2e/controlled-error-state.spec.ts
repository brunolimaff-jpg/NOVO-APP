// tests-e2e/controlled-error-state.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { completeOnboarding, e2eCompanyName } from './helpers/onboarding';

test.describe('Anti-Regressão: Erro Controlado', () => {
  test.describe.configure({ timeout: 120_000 });

  function interceptGeminiApi(page: import('@playwright/test').Page) {
    return page.route('**/api/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });
  }

  async function startFailingInvestigation(page: import('@playwright/test').Page) {
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Erro E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    await expect(page.getByTestId('error-message-card')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: 15_000 });
  }

  test('falha de API não gera tela branca', async ({ page }) => {
    await setupE2EAuth(page);
    await completeOnboarding(page);
    await interceptGeminiApi(page);

    await startFailingInvestigation(page);

    // O shell principal continua visível
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15_000 });

    // O painel central não está vazio
    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 15_000 });

    // Erro capturado internamente pelo processMessage e exibido como ErrorMessageCard no chat
    await expect(page.getByTestId('error-message-card')).toBeVisible({ timeout: 20_000 });

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
  });

  test('LoadingSmart não fica infinito após falha', async ({ page }) => {
    await setupE2EAuth(page);
    await completeOnboarding(page);
    await interceptGeminiApi(page);

    await startFailingInvestigation(page);
  });

  test('usuário consegue interagir após falha', async ({ page }) => {
    await setupE2EAuth(page);
    await completeOnboarding(page);
    await interceptGeminiApi(page);

    await startFailingInvestigation(page);

    // Input deve estar habilitado para nova tentativa
    const chatInput = page.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 15_000 });
    await expect(chatInput).toBeEnabled({ timeout: 15_000 });
  });
});
