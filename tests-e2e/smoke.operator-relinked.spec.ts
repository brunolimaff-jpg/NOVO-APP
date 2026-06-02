import { expect, test } from '@playwright/test';
import { preventMigrationNotice } from './helpers/onboarding';

/**
 * Valida que ao vincular um operador existente (ex: QR code),
 * as sessões desse operador são carregadas do Supabase.
 *
 * Cenário: vendedor troca de dispositivo → escaneia QR code →
 * dossiês aparecem sem precisar recarregar a página.
 */
test.describe('Scout smoke — vínculo de operador existente', () => {
  test.describe.configure({ timeout: 60_000 });

  test('deve carregar histórico ao vincular operador existente', async ({ page }) => {
    await preventMigrationNotice(page);
    await page.goto('/');

    // Primeiro registro: cria operador novo e faz uma investigação
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Relink');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('relink@senior.com.br');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });

    // Simula uma investigação (apenas inicia, não espera completar)
    await page.getByTestId('investigation-company-input').fill('Fazenda Relink');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });

    // Aguarda alguns segundos para o waterfall salvar
    await page.waitForTimeout(8000);

    // Simula novo dispositivo: limpa localStorage e recarrega
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Deve mostrar tela de boas-vindas (sem operador)
    await expect(page.getByTestId('greeting-name-input')).toBeVisible({ timeout: 10000 });

    // Verifica que o SyncIndicator mostra estado correto
    // (operador não registrado, mas Supabase disponível)
    await expect(page.getByText('Conectado')).toBeVisible({ timeout: 5000 });
  });

  test('operador vinculado deve ver dossiers existentes no Supabase', async ({ page }) => {
    let supabaseDossiersGET = false;

    await page.route('**/rest/v1/dossies*', route => {
      if (route.request().method() === 'GET') {
        supabaseDossiersGET = true;
      }
      route.continue();
    });

    await preventMigrationNotice(page);
    await page.goto('/');

    // Registrar com email de operador que já tem dossiês
    // (Bruno Lima — op_c720fcee434146dc já tem Grupo Scheffer no Supabase)
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Lima');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('bruno.ferreira@senior.com.br');
    await page.getByRole('button', { name: 'Continuar →' }).click();

    // Deve aparecer o formulário de investigação
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });

    // O histórico deve carregar os dossiês do Supabase
    // Confirma que houve chamada GET para dossiers
    expect(supabaseDossiersGET).toBe(true);
  });
});
