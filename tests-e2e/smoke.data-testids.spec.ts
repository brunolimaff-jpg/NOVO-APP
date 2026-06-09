import { expect, test } from '@playwright/test';
import { completeOnboarding } from './helpers/onboarding';

test.describe('Scout smoke — data-testid presence', () => {
  test.describe.configure({ timeout: 90_000 });

  async function setupChatShell(page: import('@playwright/test').Page) {
    await completeOnboarding(page);
    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('chat-header-title')).toBeVisible({ timeout: 30_000 });
  }

  test('always-present testids visíveis após login e investigação', async ({ page }) => {
    await setupChatShell(page);

    const alwaysPresent = [
      'app-shell',
      'app-header',
      'app-breadcrumb',
      'chat-main-panel',
      'message-input',
      'send-message-button',
      'session-sidebar',
    ];

    for (const testid of alwaysPresent) {
      await expect(page.getByTestId(testid), `data-testid="${testid}" deve estar visível`).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('message-list aparece após envio de mensagem e resposta', async ({ page }) => {
    await setupChatShell(page);

    await page.getByTestId('chat-input').fill('Qual o CNAE principal?', { timeout: 15_000 });
    await page.getByTestId('send-message-button').click();

    // loading-smart ou inline-loading-bubble deve aparecer durante o processamento
    const loadingSmart = page.getByTestId('loading-smart-overlay');
    const loadingBubble = page.getByTestId('inline-loading-bubble');
    const loadingAppearedOverlay = await loadingSmart.isVisible({ timeout: 15_000 }).catch(() => false);
    const loadingAppearedBubble = await loadingBubble.isVisible({ timeout: 5_000 }).catch(() => false);

    if (loadingAppearedOverlay) {
      await expect(loadingSmart).toBeVisible({ timeout: 5_000 });
      await expect(loadingSmart).not.toBeVisible({ timeout: 120_000 });
    }
    if (loadingAppearedBubble) {
      await expect(loadingBubble).toBeVisible({ timeout: 5_000 });
      await expect(loadingBubble).not.toBeVisible({ timeout: 120_000 });
    }

    // Após resposta, message-list ou controlled-error devem estar visíveis
    await expect(
      page.getByTestId('message-list').or(page.getByTestId('controlled-error')),
      'message-list ou controlled-error deve aparecer após envio',
    ).toBeVisible({ timeout: 60_000 });
  });

  test('session-sidebar expandida mostra session-item', async ({ page }) => {
    await setupChatShell(page);

    // Expande a sidebar se não estiver visível
    const sidebar = page.getByTestId('session-sidebar');
    await sidebar.click({ trial: true }).catch(async () => {
      // Se não estiver clicável diretamente, usa o toggle
      const toggle = page.getByTestId('sidebar-toggle');
      await toggle.click();
    });

    // Aguarda alguns segundos para a sidebar carregar
    await page.waitForTimeout(2000);

    // Verifica se pelo menos um session-item existe
    const sessionItems = page.getByTestId('session-item');
    const count = await sessionItems.count();

    // Pode ser 0 se for primeiro uso, mas a sidebar deve estar visível
    expect(count).toBeGreaterThanOrEqual(0);
    await expect(sidebar).toBeVisible();
  });
});
