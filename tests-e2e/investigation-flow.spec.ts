import { test, expect } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { installFastGeminiStubs } from './helpers/gemini';

test.describe('Fluxo Crítico: Investigação Sênior Scout', () => {
  test('Deve iniciar uma nova investigação e receber resposta da IA', async ({ page }) => {
    await setupE2EAuth(page);
    await installFastGeminiStubs(page);

    await page.goto('/');

    // 1. Garante que a página inicial carregou
    await expect(page.locator('text=Pronto para iniciar a investigação')).toBeVisible({ timeout: 15_000 });

    // 2. Localiza o input de chat e digita o comando inicial
    const chatInput = page.getByLabel('Campo de mensagem');
    await chatInput.fill('Quero investigar a empresa TOTVS');

    // 3. Clica no botão de enviar
    const sendButton = page.getByLabel('Enviar mensagem');
    await sendButton.click({ force: true });

    // 4. Verifica estado de carregamento
    const loadingHero = page.locator('text=Realizando pesquisa');
    await expect(loadingHero).toBeVisible({ timeout: 15000 });

    // 5. Aguarda resposta do Bot (via stub deterministico)
    const botResponse = page.locator('.prose');
    await expect(botResponse).toBeVisible({ timeout: 30_000 });

    // 6. Verifica conteudo nao vazio
    const responseText = await botResponse.innerText();
    expect(responseText.length).toBeGreaterThan(5);

    console.log(`\n✅ PASS (stubbed)`);
    console.log(`   Resposta IA: ${responseText.substring(0, 200)}...`);
  });
});
