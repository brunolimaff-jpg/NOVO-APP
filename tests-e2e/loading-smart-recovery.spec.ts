// tests-e2e/loading-smart-recovery.spec.ts
import { expect, test } from '@playwright/test';
import { installFastGeminiStubs } from './helpers/gemini';
import { completeOnboarding } from './helpers/onboarding';

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

const LOADING_TIMEOUT_MS = 120_000;

async function expectValidMainPanelState(page: import('@playwright/test').Page) {
  const mainPanel = page.getByTestId('chat-main-panel');
  await expect(mainPanel).toBeVisible({ timeout: 10_000 });

  await expect(
    mainPanel
      .getByTestId('message-row')
      .first()
      .or(mainPanel.getByTestId('dossier-content'))
      .or(mainPanel.getByTestId('controlled-error'))
      .or(mainPanel.getByTestId('empty-state'))
      .first(),
    'Painel central deve mostrar mensagem, dossie, erro controlado ou empty-state depois que o loading some',
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('Anti-Regressão: LoadingSmart — Recuperação', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await installFastGeminiStubs(page);
  });

  test('LoadingSmart aparece e desaparece — estado final é válido', async ({ page }) => {
    await completeOnboarding(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Verifica que LoadingSmart aparece
    const loadingSmart = page.getByTestId('loading-smart-overlay');
    await expect(loadingSmart).toBeVisible({ timeout: 30_000 });

    // Aguarda LoadingSmart desaparecer (timeout generoso)
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    // Após LoadingSmart desaparecer, um estado válido precisa estar presente no painel central.
    await expectValidMainPanelState(page);

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('input inferior permanece acessível durante loading', async ({ page }) => {
    await completeOnboarding(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Input deve estar visível durante e após o loading
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });

    // Aguarda loading terminar
    const loadingSmart = page.getByTestId('loading-smart-overlay');
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('sem erro silencioso no console durante loading', async ({ page }) => {
    const unexpectedErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        if (!ALLOWED_CONSOLE_ERRORS.some(a => msg.text().includes(a))) {
          unexpectedErrors.push(msg.text());
        }
      }
    });

    await completeOnboarding(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    const loadingSmart = page.getByTestId('loading-smart-overlay');
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    expect(unexpectedErrors).toHaveLength(0);
  });
});
