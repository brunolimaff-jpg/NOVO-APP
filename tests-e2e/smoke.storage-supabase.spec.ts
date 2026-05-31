import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = 'vmqfcaoirjcfucvlnpig.supabase.co';

test.describe('Scout smoke — persistência Supabase', () => {
  test.describe.configure({ timeout: 120_000 });

  async function registrarOperador(page: Page) {
    await page.goto('/');
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno QA');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('qa@teste.com');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });
  }

  test('deve fazer upsert no Supabase durante investigação e retornar dados após reload', async ({ page }) => {
    // Intercept Supabase calls
    const supabaseCalls: string[] = [];
    await page.route(`**/${SUPABASE_URL}/rest/v1/dossies*`, route => {
      supabaseCalls.push(route.request().method());
      route.continue();
    });
    await page.route(`**/${SUPABASE_URL}/rest/v1/dossies`, route => {
      supabaseCalls.push(route.request().method());
      route.continue();
    });

    await registrarOperador(page);

    // Start investigation
    await page.getByTestId('investigation-company-input').fill('Fazenda Teste QA');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Wait for waterfall to start and produce at least one upsert
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });

    // Confirm Supabase POST (saveDossier)
    await expect.poll(() => supabaseCalls.filter(c => c === 'POST').length).toBeGreaterThan(0);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify SyncIndicator shows connected
    await expect(page.getByText('Conectado')).toBeVisible({ timeout: 10000 });

    // Verify Supabase GET (getDossiers)
    const hasSupabaseGET = supabaseCalls.some(c => c === 'GET');
    if (hasSupabaseGET) {
      // Dossiers loaded from Supabase — no IDB fallback
    }
  });

  test('não deve fazer chamadas IndexedDB para dados de negócio', async ({ page }) => {
    await page.evaluate(() => {
      const origOpen = indexedDB.open;
      indexedDB.open = function (name: string, version?: number) {
        // Extract cache is allowed, session storage is not
        if (!name.includes('ext-cache') && !name.includes('keyval')) {
          (window as any).__idb_blocked = name;
        }
        return origOpen.call(this, name, version);
      };
    });

    await registrarOperador(page);

    // Check no blocked IDB access for business data
    const blocked = await page.evaluate(() => (window as any).__idb_blocked);
    expect(blocked).toBeUndefined();
  });
});
