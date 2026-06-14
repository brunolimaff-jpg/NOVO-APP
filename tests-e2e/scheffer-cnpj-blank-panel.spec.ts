import { expect, test } from '@playwright/test';
import { E2E_DOSSIER_MIN_CHARS, E2E_DOSSIER_SENTINEL, installFastGeminiStubs } from './helpers/gemini';
import { completeOnboarding, dismissMigrationNotice, preventMigrationNotice } from './helpers/onboarding';

const SCHEFFER_CNPJ = '04.733.767/0001-80';
const OPERATOR_NAME = process.env.E2E_OPERATOR_NAME ?? 'E2E Operator';
const OPERATOR_EMAIL = process.env.E2E_OPERATOR_EMAIL ?? 'e2e.operator@senior.com.br';

test.describe('Scheffer CNPJ — painel após waterfall (stub)', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await installFastGeminiStubs(page);
    await preventMigrationNotice(page);
  });

  test('04.733.767/0001-80 completa loading e exibe dossiê no painel', async ({ page }) => {
    await completeOnboarding(page, { name: OPERATOR_NAME, email: OPERATOR_EMAIL });
    await dismissMigrationNotice(page);

    await page.getByTestId('investigation-cnpj-input').fill(SCHEFFER_CNPJ);
    await page.getByTestId('investigation-cnpj-validate-button').click();
    await expect(page.getByTestId('investigation-company-input')).not.toHaveValue('', { timeout: 20_000 });

    await page.getByTestId('investigation-city-input').fill('Chapecó');
    await page.getByTestId('investigation-uf-input').fill('SC');
    await page.getByTestId('investigation-submit-button').click();

    await expect(page.getByTestId('loading-smart-overlay').or(page.getByTestId('inline-loading-bubble'))).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: 120_000 });

    const panel = page.getByTestId('chat-main-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('messages-viewport-suspended')).toHaveCount(0);
    await expect(panel.getByTestId('messages-viewport-placeholder')).toHaveCount(0);

    await expect
      .poll(async () => panel.getByTestId('messages-viewport-placeholder').count(), { timeout: 5_000 })
      .toBe(0);
    await expect.poll(async () => panel.getByTestId('messages-viewport-suspended').count(), { timeout: 5_000 }).toBe(0);

    const bot = panel.getByTestId('bot-message-content').last();
    await expect(bot).toBeVisible({ timeout: 20_000 });
    await expect(bot).toContainText(E2E_DOSSIER_SENTINEL);
    await expect
      .poll(async () => Number(await bot.getAttribute('data-text-length')))
      .toBeGreaterThan(E2E_DOSSIER_MIN_CHARS);

    const staticFallback = panel.getByTestId('messages-static-fallback');
    const virtuoso = panel.locator('[data-scout-virtuoso="timeline"]');
    expect((await staticFallback.count()) + (await virtuoso.count())).toBeGreaterThan(0);
  });
});
