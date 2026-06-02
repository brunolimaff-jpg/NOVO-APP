// tests-e2e/blank-center-panel-regression.spec.ts
import { expect, test } from '@playwright/test';
import { completeOnboarding, dismissMigrationNotice, preventMigrationNotice } from './helpers/onboarding';

const ALLOWED_CONSOLE_ERRORS = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];

test.describe('Anti-Regressão: Painel Central Branco', () => {
  test.describe.configure({ timeout: 120_000 });

  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    pageErrors.length = 0;

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err));
  });

  async function fullOnboard(page: import('@playwright/test').Page) {
    await completeOnboarding(page);
    // Preenche formulario de investigacao mas NAO submete (depende da API Gemini)
    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
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
    const controlledError = await page
      .getByTestId('controlled-error')
      .isVisible()
      .catch(() => false);
    const emptyState = await page
      .getByTestId('empty-state')
      .isVisible()
      .catch(() => false);

    return {
      url: page.url(),
      breadcrumb: breadcrumb?.trim() ?? '(ausente)',
      mainPanelPreview: (mainPanel?.trim() ?? '(ausente)').substring(0, 200),
      messageRowCount: messageRows,
      loadingSmartVisible: loadingSmart,
      controlledErrorVisible: controlledError,
      emptyStateVisible: emptyState,
      consoleErrors: [...consoleErrors],
      pageErrors: pageErrors.map(e => e.message),
    };
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

    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 30_000 });

    // Aguarda estabilização (8s é o limite definido no spec)
    await page.waitForTimeout(8_000);

    // Verifica se o breadcrumb tem empresa ativa
    const breadcrumb = page.getByTestId('app-breadcrumb');
    const hasBreadcrumbText = await breadcrumb.isVisible().catch(() => false);

    if (hasBreadcrumbText) {
      const breadcrumbText = await breadcrumb.textContent();
      const hasCompany = breadcrumbText && breadcrumbText.includes('→');

      if (hasCompany) {
        // Se tem empresa ativa no breadcrumb, o painel NUNCA pode estar vazio
        const hasContent = await page
          .getByTestId('message-row')
          .first()
          .isVisible()
          .catch(() => false);
        const hasLoading = await page
          .getByTestId('loading-smart-overlay')
          .isVisible()
          .catch(() => false);
        const hasError = await page
          .getByTestId('controlled-error')
          .isVisible()
          .catch(() => false);
        const hasEmptyState = await page
          .getByTestId('empty-state')
          .isVisible()
          .catch(() => false);

        const diagnostics = await collectDiagnostics(page);

        expect(
          hasContent || hasLoading || hasError || hasEmptyState,
          `PAINEL BRANCO DETECTADO!\nDiagnóstico: ${JSON.stringify(diagnostics, null, 2)}`,
        ).toBe(true);
      }
    }
  });

  test('sem console.error no fluxo principal', async ({ page }) => {
    await fullOnboard(page);

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
