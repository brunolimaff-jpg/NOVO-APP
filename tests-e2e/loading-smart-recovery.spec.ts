// tests-e2e/loading-smart-recovery.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_DOSSIER_MIN_CHARS, E2E_DOSSIER_SENTINEL, installFastGeminiStubs } from './helpers/gemini';
import { completeOnboarding } from './helpers/onboarding';

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

const LOADING_TIMEOUT_MS = 120_000;

async function expectValidMainPanelState(page: import('@playwright/test').Page) {
  const mainPanel = page.getByTestId('chat-main-panel');
  await expect(mainPanel).toBeVisible({ timeout: 10_000 });

  await expect(mainPanel.getByTestId('controlled-error')).toHaveCount(0);
  await expect(mainPanel.getByTestId('empty-state')).toHaveCount(0);
  await expect(mainPanel.getByTestId('messages-viewport-suspended')).toHaveCount(0);
  await expect(mainPanel.getByTestId('messages-viewport-placeholder')).toHaveCount(0);

  const bot = mainPanel.getByTestId('bot-message-content').last();
  await expect(bot, 'Dossie final precisa estar visivel no painel central').toBeVisible({ timeout: 15_000 });
  await expect(bot).toContainText(E2E_DOSSIER_SENTINEL, { timeout: 15_000 });
  await expect
    .poll(async () => Number(await bot.getAttribute('data-text-length')), {
      message: 'Dossie stubado precisa ser longo para estressar Virtuoso/layout',
    })
    .toBeGreaterThan(E2E_DOSSIER_MIN_CHARS);

  const metrics = await bot.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      display: style.display,
      height: rect.height,
      opacity: Number(style.opacity),
      scrollHeight: el.scrollHeight,
      text: el.textContent?.trim().slice(0, 200) ?? '',
      visibleArea: Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)),
      visibility: style.visibility,
      width: rect.width,
    };
  });

  expect(metrics.width).toBeGreaterThan(300);
  expect(metrics.height).toBeGreaterThan(120);
  expect(metrics.scrollHeight).toBeGreaterThan(120);
  expect(metrics.display).not.toBe('none');
  expect(metrics.visibility).toBe('visible');
  expect(metrics.opacity).toBeGreaterThan(0.9);
  expect(metrics.text).toContain(E2E_DOSSIER_SENTINEL);
  expect(metrics.color).not.toBe(metrics.backgroundColor);
  expect(metrics.visibleArea).toBeGreaterThan(24);
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

    // Verifica que algum indicador de loading aparece (overlay ou inline bubble)
    await expect(
      page.getByTestId('loading-smart-overlay').or(page.getByTestId('inline-loading-bubble'))
    ).toBeVisible({ timeout: 30_000 });

    // Aguarda todos os indicadores de loading desaparecerem
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

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

    // Aguarda todos os indicadores de loading desaparecerem
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

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

    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    expect(unexpectedErrors).toHaveLength(0);
  });
});
