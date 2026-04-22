import { test, expect } from '@playwright/test';

async function completeGreeting(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('greeting-name-input').fill('Bruno');
  await page.getByTestId('greeting-submit-button').click();
  await expect(page.getByTestId('investigation-company-input')).toBeVisible();
}

test.describe('Scout smoke - investigation shell', () => {
  test('deve preencher investigação inicial e abrir a shell do chat', async ({ page }) => {
    await completeGreeting(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiab\u00E1');
    await page.getByTestId('investigation-uf-input').fill('MT');

    await page.getByTestId('investigation-submit-button').click();

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('chat-header-title')).toBeVisible();
    await expect(page.getByTestId('messages-scroller')).toBeVisible();
  });
});
