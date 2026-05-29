import { expect, test } from '@playwright/test';

test.describe('Scout smoke - chat shell', () => {
  test.describe.configure({ timeout: 60_000 });

  async function openChatShell(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.getByTestId('greeting-name-input').fill('Bruno');
    await page.getByTestId('greeting-submit-button').click();

    await expect(page.getByTestId('investigation-company-input')).toBeVisible();
    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiab\u00E1');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('chat-header-title')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('messages-scroller')).toBeVisible({ timeout: 30_000 });
  }

  test('deve exibir elementos principais da shell do chat', async ({ page }) => {
    await openChatShell(page);

    await expect(page.getByTestId('sidebar-toggle')).toBeVisible();
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByTestId('send-message-button').or(page.getByTestId('chat-stop-button'))).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('chat-new-investigation-button')).toBeVisible();
    await expect(page.getByTestId('chat-theme-toggle')).toBeVisible();
  });

  test('deve permitir digitar no chat e acionar envio', async ({ page }) => {
    await openChatShell(page);

    await page.getByTestId('chat-input').fill('Quais s\u00E3o os principais riscos fiscais dessa opera\u00E7\u00E3o?', {
      timeout: 40_000,
    });
    await page.getByTestId('send-message-button').click();

    await expect(page.getByTestId('chat-processing-indicator').or(page.getByTestId('chat-stop-button'))).toBeVisible({
      timeout: 15_000,
    });
  });
});
