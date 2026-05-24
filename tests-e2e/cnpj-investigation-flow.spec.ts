import { test, expect } from '@playwright/test';

/**
 * Fluxo E2E completo: CNPJ → Lookup → Investigação → Resultado Gemini
 *
 * Uso:
 *   # Local (precisa de npm run dev rodando)
 *   npx playwright test tests-e2e/cnpj-investigation-flow.spec.ts
 *
 *   # Preview do Vercel
 *   BASE_URL=https://seu-preview.vercel.app npx playwright test tests-e2e/cnpj-investigation-flow.spec.ts --config=playwright.config.ts
 *
 * O teste NÃO usa webServer quando BASE_URL é informado (deploy externo).
 */

const TEST_CNPJ_FORMATTED = '04.733.767/0001-80'; // Scheffer (047333767000180)
const GEMINI_TIMEOUT = 120_000; // 2 min — Gemini + RAG + Grounding pode demorar

test.describe('Fluxo CNPJ → Investigação completa', () => {
  test('deve buscar CNPJ, iniciar investigação e receber dossiê da IA', async ({ page }) => {
    // 1. Acessa a aplicação
    await page.goto('/');

    // 2. Aguarda EmptyStateHome carregar
    await expect(page.getByText('Dados do alvo')).toBeVisible({ timeout: 15_000 });

    // 3. Preenche CNPJ
    const cnpjInput = page.getByTestId('investigation-cnpj-input');
    await cnpjInput.fill(TEST_CNPJ_FORMATTED);

    // 4. Clica "Validar CNPJ"
    const validateBtn = page.getByTestId('investigation-cnpj-validate-button');
    await validateBtn.click();

    // 5. Espera lookup completar — dados preenchidos automaticamente
    await expect(page.getByText(/Dados preenchidos automaticamente via Receita Federal/)).toBeVisible({
      timeout: 30_000,
    });

    // 6. Verifica que campos foram preenchidos
    const companyInput = page.getByTestId('investigation-company-input');
    const cityInput = page.getByTestId('investigation-city-input');
    const ufInput = page.getByTestId('investigation-uf-input');

    await expect(companyInput).not.toBeEmpty();
    await expect(cityInput).not.toBeEmpty();
    await expect(ufInput).not.toBeEmpty();

    // 7. Clica "Iniciar investigação completa"
    const submitBtn = page.getByTestId('investigation-submit-button');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // 8. Espera a resposta do Gemini aparecer no chat (.prose = markdown renderizado)
    const botResponse = page.locator('.prose').first();
    await expect(botResponse).toBeVisible({ timeout: GEMINI_TIMEOUT });

    // 9. Valida que o conteúdo não está vazio
    const responseText = await botResponse.innerText();
    expect(responseText.length).toBeGreaterThan(50);

    // 10. Printa resumo no console do teste
    const companyValue = await companyInput.inputValue();
    console.log(`\n✅ PASS`);
    console.log(`   CNPJ: ${TEST_CNPJ_FORMATTED}`);
    console.log(`   Empresa: ${companyValue}`);
    console.log(`   Resposta IA: ${responseText.substring(0, 200)}...`);
  });

  test('deve rejeitar CNPJ inválido', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Dados do alvo')).toBeVisible({ timeout: 15_000 });

    const cnpjInput = page.getByTestId('investigation-cnpj-input');
    await cnpjInput.fill('00.000.000/0000-00');

    // Botão de validar não deve aparecer ou deve estar desabilitado
    const validateBtn = page.getByTestId('investigation-cnpj-validate-button');
    await expect(validateBtn).toBeDisabled();
  });
});
