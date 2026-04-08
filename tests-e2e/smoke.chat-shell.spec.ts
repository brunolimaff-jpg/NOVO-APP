import { test, expect } from '@playwright/test';

async function openChatShell(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('greeting-name-input').fill('Bruno');
  await page.getByTestId('greeting-submit-button').click();

  await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
  await page.getByTestId('investigation-city-input').fill('Cuiabá');
  await page.getByTestId('investigation-uf-input').fill('MT');
  await page.getByTestId('investigation-submit-button').click();

  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 20000 });
}

test.describe('Scout smoke - chat shell', () => {
  test('deve exibir elementos principais da shell do chat', async ({ page }) => {
    await openChatShell(page);

    await expect(page.getByTestId('sidebar-toggle')).toBeVisible();
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(
      page.getByTestId('chat-send-button').or(page.getByTestId('chat-stop-button'))
    ).toBeVisible();
    await expect(page.getByTestId('chat-new-investigation-button')).toBeVisible();
    await expect(page.getByTestId('chat-theme-toggle')).toBeVisible();
  });

  test('deve permitir digitar no chat e acionar envio', async ({ page }) => {
    await openChatShell(page);

    await page.getByTestId('chat-input').fill('Quais são os principais riscos fiscais dessa operação?', { timeout: 40000 });
    await page.getByTestId('chat-send-button').click();

    await expect(
      page.getByTestId('chat-processing-indicator').or(page.getByTestId('chat-stop-button'))
    ).toBeVisible({ timeout: 15000 });
  });
});
