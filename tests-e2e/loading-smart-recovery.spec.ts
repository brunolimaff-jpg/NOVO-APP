// tests-e2e/loading-smart-recovery.spec.ts
import { expect, test } from '@playwright/test';

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

const LOADING_TIMEOUT_MS = 120_000;

test.describe('Anti-Regressão: LoadingSmart — Recuperação', () => {
  test.describe.configure({ timeout: 180_000 });

  async function completeNameStep(page: import('@playwright/test').Page) {
    await page.goto('/');

    // Dismissa modais de migração/update que bloqueiam interação
    const migrationDismiss = page.getByRole('button', { name: /entendi|começar/i });
    if (await migrationDismiss.isVisible({ timeout: 3000 }).catch(() => false)) {
      await migrationDismiss.click();
      await page.waitForTimeout(500);
    }

    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click({ force: true });
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
    }
  }

  test('LoadingSmart aparece e desaparece — estado final é válido', async ({ page }) => {
    await completeNameStep(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Verifica que LoadingSmart aparece
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).toBeVisible({ timeout: 30_000 });

    // Aguarda LoadingSmart desaparecer (timeout generoso)
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    // Após LoadingSmart desaparecer, um estado válido precisa estar presente
    const hasMessages = await page
      .getByTestId('message-row')
      .first()
      .isVisible()
      .catch(() => false);
    const hasDossier = await page
      .getByTestId('dossier-content')
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .getByTestId('controlled-error')
      .isVisible()
      .catch(() => false);

    expect(
      hasMessages || hasDossier || hasError,
      `LoadingSmart desapareceu mas nenhum estado válido foi renderizado. ` +
        `hasMessages=${hasMessages}, hasDossier=${hasDossier}, hasError=${hasError}`,
    ).toBe(true);

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('input inferior permanece acessível durante loading', async ({ page }) => {
    await completeNameStep(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Input deve estar visível durante e após o loading
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });

    // Aguarda loading terminar
    const loadingSmart = page.getByTestId('loading-smart');
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

    await completeNameStep(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    expect(unexpectedErrors).toHaveLength(0);
  });
});
