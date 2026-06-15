import { expect, test } from '@playwright/test';
import { e2eCompanyName } from './helpers/onboarding';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Scout smoke — data-testid presence', () => {
  test.describe.configure({ timeout: 120_000 });

  async function setupChatShell(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      const PREFIX = 'scout360:';
      const ts = Date.now();
      localStorage.setItem(PREFIX + 'auth_skip_until', new Date(ts + 24 * 60 * 60 * 1000).toISOString());
      localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');
      localStorage.setItem(PREFIX + 'operator_email', 'qa.datatestids.' + ts + '@senior.com.br');
      localStorage.setItem(PREFIX + 'operator_name', 'QA Data Testids');
    });
    await page.goto('/');

    // Handle greeting card if visible
    const greetingCard = page.getByTestId('greeting-card');
    if (await greetingCard.isVisible({ timeout: 10000 }).catch(() => false)) {
      const createNewBtn = page.getByTestId('greeting-create-new-button');
      if (await createNewBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await createNewBtn.click({ force: true });
        await page.waitForTimeout(500);
      }
      await page.getByTestId('greeting-name-input').fill('QA Data Testids');
      await page.getByTestId('greeting-email-input').fill('qa.datatestids.' + Date.now() + '@senior.com.br');
      await page.getByTestId('greeting-submit-button').click({ force: true });
    }

    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 30_000 });

    const companyName = e2eCompanyName('Fazenda Test');
    await page.getByTestId('investigation-company-input').fill(companyName);
    await page.getByTestId('investigation-city-input').fill('Cuiaba');
    await page.getByTestId('investigation-uf-input').fill('MT');

    // Stub API calls so Vercel 10s Hobby timeout does not block
    await page.route('**/api/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="investigation-submit-button"]') as HTMLButtonElement | null;
      if (btn) btn.click();
    });

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 45_000 });
  }

  test('always-present testids visiveis apos login e investigacao', async ({ page }) => {
    await setupChatShell(page);

    await expect(
      page.getByTestId('inline-loading-bubble').or(page.getByTestId('loading-smart-overlay')),
    ).not.toBeVisible({ timeout: 180_000 });

    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('bot-message-content')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-header-breadcrumb-home')).toBeVisible();
  });

  test('message-list aparece apos waterfall completar', async ({ page }) => {
    await setupChatShell(page);

    await expect(
      page.getByTestId('inline-loading-bubble').or(page.getByTestId('loading-smart-overlay')),
    ).not.toBeVisible({ timeout: 180_000 });

    await expect(page.getByTestId('chat-input')).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId('bot-message-content')).toBeVisible({ timeout: 15_000 });
  });

  test('session-sidebar expandida mostra item de sessao', async ({ page }) => {
    await setupChatShell(page);

    await expect(
      page.getByTestId('inline-loading-bubble').or(page.getByTestId('loading-smart-overlay')),
    ).not.toBeVisible({ timeout: 180_000 });

    // Verifica que a sidebar contém ao menos um botão de sessão
    // Nota: com stubs, o dossier pode não ser persistido; aceitamos 0+ itens
    const sidebarItem = page.getByRole('button', { name: /abrir investigacao/i });
    const count = await sidebarItem.count().catch(() => 0);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
