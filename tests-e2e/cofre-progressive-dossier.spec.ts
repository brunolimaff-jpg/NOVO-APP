// tests-e2e/cofre-progressive-dossier.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { E2E_DOSSIER_MIN_CHARS, E2E_DOSSIER_SENTINEL, installFastGeminiStubs } from './helpers/gemini';
import { completeOnboarding, dismissMigrationNotice, e2eCompanyName } from './helpers/onboarding';

test.use({ storageState: { cookies: [], origins: [] } });

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

const LOADING_TIMEOUT_MS = 120_000;
/** POST_API_SAFETY_TIMEOUT_MS (10s) + DISSOLVE_DURATION_MS (350ms) após loading terminar */
const COFRE_DISSOLVE_TIMEOUT_MS = 15_000;

async function waitForLoadingIndicatorsToHide(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
  await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });
  const cofre = page.getByTestId('cofre-overlay');
  if (await cofre.isVisible().catch(() => false)) {
    await expect(cofre).toBeHidden({ timeout: COFRE_DISSOLVE_TIMEOUT_MS });
  }
}

async function expectValidMainPanelState(page: import('@playwright/test').Page) {
  const mainPanel = page.getByTestId('chat-main-panel');
  await expect(mainPanel).toBeVisible({ timeout: 15_000 });

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

test.describe('Cofre + dossiê progressivo — anti-regressão P0', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await setupE2EAuth(page, { uniqueOperator: true });
    await installFastGeminiStubs(page);
  });

  test('LoadingSmart aparece e desaparece — estado final é válido', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    await expect(
      page
        .getByTestId('cofre-overlay')
        .or(page.getByTestId('loading-smart-overlay'))
        .or(page.getByTestId('inline-loading-bubble'))
        .first(),
    ).toBeVisible({
      timeout: 30_000,
    });

    await waitForLoadingIndicatorsToHide(page);
    await expectValidMainPanelState(page);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
  });

  test('input inferior permanece acessível durante loading', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    const loadingDuring = page
      .getByTestId('cofre-overlay')
      .or(page.getByTestId('loading-smart-overlay'))
      .or(page.getByTestId('inline-loading-bubble'));
    await expect(loadingDuring.first()).toBeVisible({ timeout: 30_000 });

    // Composer visível, mas bloqueado enquanto gera (isLoading / Cofre)
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-input')).toBeDisabled();

    await waitForLoadingIndicatorsToHide(page);
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-input')).toBeEnabled({ timeout: 15_000 });
  });

  test('Cofre overlay aparece em investigação dossier e dissolve com dossiê stubado', async ({ page }) => {
    await completeOnboarding(page);
    await dismissMigrationNotice(page);

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Cofre E2E'));
    await page.getByTestId('investigation-city-input').fill('Chapecó');
    await page.getByTestId('investigation-uf-input').fill('SC');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    const loading = page
      .getByTestId('cofre-overlay')
      .or(page.getByTestId('loading-smart-overlay'))
      .or(page.getByTestId('inline-loading-bubble'));
    await expect(loading.first()).toBeVisible({ timeout: 30_000 });

    const cofre = page.getByTestId('cofre-overlay');
    if (await cofre.isVisible().catch(() => false)) {
      await expect(cofre).toHaveAttribute('data-cofre-phase', /entering|visible|dissolving/);
    }

    await waitForLoadingIndicatorsToHide(page);
    await expectValidMainPanelState(page);
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
    await dismissMigrationNotice(page);

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    await waitForLoadingIndicatorsToHide(page);
    expect(unexpectedErrors).toHaveLength(0);
  });
});
