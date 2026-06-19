import { test, expect } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { installAllE2EStubs } from './helpers/cnpj-stub';

const TEST_CNPJ_FORMATTED = '04.733.767/0001-80'; // Scheffer (04733767000180)
const GEMINI_TIMEOUT = 45_000; // 45s maximo com stubs (resposta instantanea)

test.describe('Fluxo CNPJ → Investigação completa', () => {
  test('deve buscar CNPJ, iniciar investigação e receber dossiê da IA', async ({ page }) => {
    await setupE2EAuth(page);
    await installAllE2EStubs(page);

    await page.goto('/');

    // 1. Aguarda EmptyStateHome carregar
    await expect(page.getByText('Dados do alvo')).toBeVisible({ timeout: 15_000 });

    // 2. Preenche CNPJ
    const cnpjInput = page.getByTestId('investigation-cnpj-input');
    await cnpjInput.fill(TEST_CNPJ_FORMATTED);

    // 3. Clica "Validar CNPJ"
    const validateBtn = page.getByTestId('investigation-cnpj-validate-button');
    await validateBtn.click({ force: true });

    // 4. Espera lookup completar — dados preenchidos via stub
    await expect(page.getByText(/Dados preenchidos automaticamente via Receita Federal/)).toBeVisible({
      timeout: 15_000,
    });

    // 5. Verifica campos preenchidos
    const companyInput = page.getByTestId('investigation-company-input');
    const cityInput = page.getByTestId('investigation-city-input');
    const ufInput = page.getByTestId('investigation-uf-input');

    await expect(companyInput).not.toBeEmpty();
    await expect(cityInput).not.toBeEmpty();
    await expect(ufInput).not.toBeEmpty();

    // 6. Clica "Iniciar investigação completa"
    const submitBtn = page.getByTestId('investigation-submit-button');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click({ force: true });

    // 7. Espera resposta do bot (via stub deterministico)
    const botResponse = page.getByTestId('bot-message-content').first();
    await expect(botResponse).toBeVisible({ timeout: GEMINI_TIMEOUT });

    // 8. Valida conteudo nao vazio
    const responseText = await botResponse.innerText();
    expect(responseText.length).toBeGreaterThan(50);

    console.log(`\n✅ PASS (stubbed)`);
    console.log(`   CNPJ: ${TEST_CNPJ_FORMATTED}`);
    console.log(`   Empresa: ${await companyInput.inputValue()}`);
    console.log(`   Resposta IA: ${responseText.substring(0, 200)}...`);
  });

  test('deve rejeitar CNPJ inválido', async ({ page }) => {
    await setupE2EAuth(page);
    await installAllE2EStubs(page);
    await page.goto('/');
    await expect(page.getByText('Dados do alvo')).toBeVisible({ timeout: 15_000 });

    const cnpjInput = page.getByTestId('investigation-cnpj-input');
    await cnpjInput.fill('00.000.000/0000-00');

    const validateBtn = page.getByTestId('investigation-cnpj-validate-button');
    await expect(validateBtn).toBeDisabled();
  });
});
