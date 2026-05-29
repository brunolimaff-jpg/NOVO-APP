// tests-e2e/controlled-error-state.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Anti-Regressão: Erro Controlado', () => {
  test.describe.configure({ timeout: 120_000 });

  async function quickOnboard(page: import('@playwright/test').Page) {
    await page.goto('/');

    // Dismissa modais de migração/update que bloqueiam interação
    const migrationDismiss = page.getByRole('button', { name: 'Entendi, começar' });
    if (await migrationDismiss.isVisible({ timeout: 5000 }).catch(() => false)) {
      await migrationDismiss.click({ force: true });
      await page.waitForTimeout(1000);
    }

    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click({ force: true });
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
    }
  }

  function interceptGeminiApi(page: import('@playwright/test').Page) {
    return page.route('**/api/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });
  }

  test('falha de API não gera tela branca', async ({ page }) => {
    await interceptGeminiApi(page);

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Aguarda o loading aparecer e desaparecer (erro controlado aparece no lugar)
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: 30_000 });

    // O shell principal continua visível
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });

    // O painel central não está vazio
    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 10_000 });

    // Erro capturado internamente pelo processMessage e exibido como ErrorMessageCard no chat
    await expect(page.getByTestId('error-message-card')).toBeVisible({ timeout: 20_000 });

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('LoadingSmart não fica infinito após falha', async ({ page }) => {
    await interceptGeminiApi(page);

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Loading NÃO pode ficar visível por mais de 30s após falha
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: 30_000 });
  });

  test('usuário consegue interagir após falha', async ({ page }) => {
    await interceptGeminiApi(page);

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Aguarda loading desaparecer
    await expect(page.getByTestId('loading-smart')).not.toBeVisible({ timeout: 30_000 });

    // Input deve estar habilitado para nova tentativa
    const chatInput = page.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // Verifica se NÃO está disabled (pode tentar de novo)
    const isDisabled = await chatInput.isDisabled();
    expect(isDisabled).toBe(false);
  });
});
