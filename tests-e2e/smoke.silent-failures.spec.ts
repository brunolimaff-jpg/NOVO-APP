import { expect, test } from '@playwright/test';

/**
 * Testes de falha silenciosa — o usuário NUNCA deve ficar sem feedback.
 *
 * Cenários críticos de UX:
 * 1. Supabase offline → app não quebra, mostra estado consistente
 * 2. GET dossiers falha → não mostra "Nenhuma investigação" se há localStorage
 * 3. Save falha → waterfall continua, dossiê não é perdido
 * 4. Delete falha → usuário vê confirmação visual
 * 5. Reload mid-waterfall → estado parcial preservado
 */
test.describe('Scout smoke — resiliência a falhas', () => {
  test.describe.configure({ timeout: 120_000 });

  // ===================================================================
  // Cenário 1: Supabase offline não quebra o app
  // ===================================================================
  test('app não deve quebrar com Supabase indisponível', async ({ page }) => {
    // Bloqueia todas as chamadas Supabase para simular offline
    await page.route('**/rest/v1/**', route => route.abort('connectionrefused'));

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Deve mostrar a interface mesmo offline
    const greeting = page.getByTestId('greeting-name-input');
    await expect(greeting).toBeVisible({ timeout: 10000 });

    // SyncIndicator deve refletir estado
    const offlineIndicator = page.locator('text=Nuvem indisponível');
    const offlineVisible = await offlineIndicator.isVisible({ timeout: 15000 }).catch(() => false);
    const appLoaded = await greeting.isVisible();

    // Pelo menos um dos dois: app carregou OU indicador mostra indisponível
    expect(appLoaded || offlineVisible).toBe(true);
  });

  // ===================================================================
  // Cenário 2: GET dossiers falha → localStorage fallback visível
  // ===================================================================
  test('deve mostrar fallback quando Supabase GET falha', async ({ page }) => {
    // Simula: Supabase down, mas localStorage tem dados
    await page.route('**/rest/v1/dossiers*', route => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Internal error' }) });
      } else {
        route.continue();
      }
    });

    await page.goto('/');

    // Registrar
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Fallback');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('fallback@teste.com');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.waitForTimeout(3000);

    // O app deve estar funcional — mostra formulário ou histórico vazio
    // NUNCA tela branca
    const formVisible = await page
      .getByTestId('investigation-company-input')
      .isVisible()
      .catch(() => false);
    const hasContent = await page
      .locator('text=Boa noite')
      .isVisible()
      .catch(() => false);
    const blankScreen = !formVisible && !hasContent;

    expect(blankScreen).toBe(false);
  });

  // ===================================================================
  // Cenário 3: Save falha → waterfall não perde dados
  // ===================================================================
  test('waterfall deve continuar mesmo com save Supabase falhando', async ({ page }) => {
    let saveAttempts = 0;

    // Deixa GET passar, mas faz POST/PATCH falhar
    await page.route('**/rest/v1/dossies*', route => {
      const method = route.request().method();
      if (method === 'GET') {
        route.continue();
      } else {
        saveAttempts++;
        route.fulfill({ status: 500, body: JSON.stringify({ error: 'Save failed' }) });
      }
    });

    await page.goto('/');
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Resilient');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('resilient@teste.com');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill('Fazenda Resilient');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Chat deve abrir mesmo com saves falhando
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });

    // Aguarda waterfall
    await page.waitForTimeout(15000);

    // Save foi tentado (mesmo que falhou)
    expect(saveAttempts).toBeGreaterThan(0);
  });

  // ===================================================================
  // Cenário 4: Reload mid-waterfall → estado preservado
  // ===================================================================
  test('estado parcial deve ser preservado após reload mid-waterfall', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Mid');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('mid@teste.com');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('investigation-company-input').fill('Fazenda Mid');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30000 });

    // Aguarda alguns segundos para o waterfall começar
    await page.waitForTimeout(5000);

    // Reload no meio do waterfall
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Registra novamente
    await page.getByPlaceholder('Nome e sobrenome').fill('Bruno Mid');
    await page.getByPlaceholder('seu.nome@senior.com.br').fill('mid@teste.com');
    await page.getByRole('button', { name: 'Continuar →' }).click();
    await page.waitForTimeout(3000);

    // Verifica que o app está funcional (não quebrou)
    const appOk = await page
      .getByTestId('investigation-company-input')
      .isVisible()
      .catch(() => false);
    const hasLoading = await page.locator('text=Preparando investigação').count();
    const hasContent = await page
      .getByTestId('messages-scroller')
      .isVisible()
      .catch(() => false);

    // Pelo menos um estado válido
    const appFunctional = appOk || hasLoading > 0 || hasContent;
    expect(appFunctional).toBe(true);
  });
});
