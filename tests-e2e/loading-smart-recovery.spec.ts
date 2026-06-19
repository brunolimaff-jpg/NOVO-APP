// tests-e2e/loading-smart-recovery.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { E2E_DOSSIER_MIN_CHARS, E2E_DOSSIER_SENTINEL, installFastGeminiStubs } from './helpers/gemini';
import { completeOnboarding, e2eCompanyName, startNewInvestigation } from './helpers/onboarding';

/** Erros de rede/infra + telemetria defensiva Scout360 (console.error intencional, não regressão). */
const ALLOWED_CONSOLE_ERRORS = [
  'Failed to load resource',
  'net::ERR_',
  'ResizeObserver',
  '429',
  '503',
  '[Scout360]',
  'safeMessages ZEROU',
  'MENSAGENS DESAPARECERAM',
];

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

function loadingStopButton(page: import('@playwright/test').Page) {
  return page
    .getByTestId('loading-stop-button')
    .or(page.getByTestId('cofre-overlay').getByRole('button', { name: /interromper/i }));
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

test.describe('Anti-Regressão: LoadingSmart — Recuperação', () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await setupE2EAuth(page, { uniqueOperator: true });
    await installFastGeminiStubs(page);
  });

  test('LoadingSmart aparece e desaparece — estado final é válido', async ({ page }) => {
    await completeOnboarding(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    // Verifica que algum indicador de loading aparece (Cofre, overlay ou inline bubble)
    const loadingIndicator = page
      .getByTestId('cofre-overlay')
      .or(page.getByTestId('loading-smart-overlay'))
      .or(page.getByTestId('inline-loading-bubble'));
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 30_000 });

    await waitForLoadingIndicatorsToHide(page);

    // Após LoadingSmart desaparecer, um estado válido precisa estar presente no painel central.
    await expectValidMainPanelState(page);

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
  });

  test('input inferior permanece acessível durante loading', async ({ page }) => {
    await completeOnboarding(page);

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    // Input deve estar visível durante e após o loading
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });

    await waitForLoadingIndicatorsToHide(page);

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
  });

  test('stop durante loading permite nova investigação em menos de 5s', async ({ page }) => {
    await completeOnboarding(page);

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Stop E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    const stopButton = loadingStopButton(page);
    await expect(stopButton).toBeVisible({ timeout: 30_000 });
    await stopButton.click({ force: true });

    const startedAt = Date.now();
    await startNewInvestigation(page);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 5_000 });
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

    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Loading E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    await waitForLoadingIndicatorsToHide(page);

    expect(unexpectedErrors).toHaveLength(0);
  });
});
