// tests-e2e/blank-center-panel-regression.spec.ts
import { expect, test } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { E2E_DOSSIER_MIN_CHARS, E2E_DOSSIER_SENTINEL, installFastLlmStubs } from './helpers/llm';
import {
  completeOnboarding,
  dismissMigrationNotice,
  e2eCompanyName,
  preventMigrationNotice,
} from './helpers/onboarding';

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

test.describe('Anti-Regressão: Painel Central Branco', () => {
  test.describe.configure({ timeout: 120_000 });

  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    await setupE2EAuth(page);
    await installFastLlmStubs(page);

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err));
  });

  async function fullOnboard(page: import('@playwright/test').Page) {
    await completeOnboarding(page);
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName());
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });
    await expect(page.getByTestId('loading-smart-overlay').or(page.getByTestId('inline-loading-bubble'))).toBeVisible({
      timeout: 30_000,
    });
  }

  async function collectDiagnostics(page: import('@playwright/test').Page) {
    const breadcrumb = await page
      .getByTestId('app-breadcrumb')
      .textContent()
      .catch(() => '(ausente)');
    const mainPanel = await page
      .getByTestId('chat-main-panel')
      .textContent()
      .catch(() => '(ausente)');
    const messageRows = await page
      .getByTestId('message-row')
      .count()
      .catch(() => -1);
    const loadingSmart = await page
      .getByTestId('loading-smart-overlay')
      .isVisible()
      .catch(() => false);
    const inlineBubble = await page
      .getByTestId('inline-loading-bubble')
      .isVisible()
      .catch(() => false);
    const controlledError = await page
      .getByTestId('controlled-error')
      .isVisible()
      .catch(() => false);
    const emptyState = await page
      .getByTestId('empty-state')
      .isVisible()
      .catch(() => false);
    const botMetrics = await page
      .getByTestId('chat-main-panel')
      .getByTestId('bot-message-content')
      .last()
      .evaluate(el => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return {
          height: rect.height,
          opacity: Number(style.opacity),
          textLength: Number(el.getAttribute('data-text-length') || 0),
          visibleArea: Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)),
          visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
          width: rect.width,
        };
      })
      .catch(() => null);

    return {
      url: page.url(),
      breadcrumb: breadcrumb?.trim() ?? '(ausente)',
      mainPanelPreview: (mainPanel?.trim() ?? '(ausente)').substring(0, 200),
      messageRowCount: messageRows,
      loadingSmartVisible: loadingSmart,
      inlineBubbleVisible: inlineBubble,
      anyLoadingVisible: loadingSmart || inlineBubble,
      controlledErrorVisible: controlledError,
      emptyStateVisible: emptyState,
      botMetrics,
      consoleErrors: [...consoleErrors],
      pageErrors: pageErrors.map(e => e.message),
    };
  }

  async function expectVisibleLongBotContent(page: import('@playwright/test').Page) {
    const panel = page.getByTestId('chat-main-panel');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('loading-smart-overlay')).not.toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('inline-loading-bubble')).not.toBeVisible({ timeout: 120_000 });
    await expect(panel.getByTestId('empty-state')).toHaveCount(0);
    await expect(panel.getByTestId('controlled-error')).toHaveCount(0);
    await expect(panel.getByTestId('messages-viewport-placeholder')).toHaveCount(0);
    await expect(panel.getByTestId('messages-viewport-suspended')).toHaveCount(0);

    const bot = panel.getByTestId('bot-message-content').last();
    await expect(bot).toBeVisible({ timeout: 15_000 });
    await expect(bot).toContainText(E2E_DOSSIER_SENTINEL);
    await expect
      .poll(async () => Number(await bot.getAttribute('data-text-length')), {
        message: 'Dossie precisa ser longo para reproduzir o risco real de painel branco',
      })
      .toBeGreaterThan(E2E_DOSSIER_MIN_CHARS);

    const metrics = await bot.evaluate(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
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
    expect(metrics.visibleArea).toBeGreaterThan(24);
  }

  test('app abre sem tela branca — shell visível', async ({ page }) => {
    await preventMigrationNotice(page);
    await page.goto('/');

    await dismissMigrationNotice(page);

    // O shell principal sempre renderiza
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15_000 });

    // Verifica que pelo menos um destes está visível (dependendo do estado da app):
    // greeting, investigation home, chat shell, ou chat-main-panel
    const hasGreeting = await page
      .getByTestId('greeting-card')
      .isVisible()
      .catch(() => false);
    const hasHome = await page
      .getByTestId('investigation-company-input')
      .isVisible()
      .catch(() => false);
    const hasChat = await page
      .getByTestId('chat-input')
      .isVisible()
      .catch(() => false);
    const hasMainPanel = await page
      .getByTestId('chat-main-panel')
      .isVisible()
      .catch(() => false);

    expect(
      hasGreeting || hasHome || hasChat || hasMainPanel,
      `Nenhum elemento de shell encontrado. greeting=${hasGreeting} home=${hasHome} chat=${hasChat} panel=${hasMainPanel}`,
    ).toBe(true);

    // Sem pageerror durante a abertura
    expect(pageErrors).toHaveLength(0);
  });

  test('painel central nunca fica vazio com sessão ativa', async ({ page }) => {
    await fullOnboard(page);

    await expectVisibleLongBotContent(page);

    // Verifica se o breadcrumb tem empresa ativa
    const breadcrumb = page.getByTestId('app-breadcrumb');
    const hasBreadcrumbText = await breadcrumb.isVisible().catch(() => false);

    if (hasBreadcrumbText) {
      const breadcrumbText = await breadcrumb.textContent();
      const hasCompany = breadcrumbText && breadcrumbText.includes('→');

      if (hasCompany) {
        const diagnostics = await collectDiagnostics(page);

        expect(
          diagnostics.botMetrics?.visible &&
            diagnostics.botMetrics.visibleArea > 24 &&
            diagnostics.botMetrics.textLength > E2E_DOSSIER_MIN_CHARS,
          `PAINEL BRANCO DETECTADO!\nDiagnóstico: ${JSON.stringify(diagnostics, null, 2)}`,
        ).toBe(true);
      }
    }
  });

  test('sem console.error no fluxo principal', async ({ page }) => {
    await fullOnboard(page);
    await expectVisibleLongBotContent(page);

    const unexpectedErrors = consoleErrors.filter(
      err => !ALLOWED_CONSOLE_ERRORS.some(allowed => err.includes(allowed)),
    );

    if (unexpectedErrors.length > 0) {
      const diagnostics = await collectDiagnostics(page);
      console.error('Diagnóstico:', JSON.stringify(diagnostics, null, 2));
    }

    expect(unexpectedErrors).toHaveLength(0);
  });
});
