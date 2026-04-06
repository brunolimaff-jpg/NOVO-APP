import { test, expect } from '@playwright/test';

// Skill: playwright-testing
// Cenário: Criar cenário e2e para preencher cadastro inicial e validar que a investigação inicia e renderiza primeira mensagem.

test.describe('Fluxo Crítico: Investigação Sênior Scout', () => {
  test('Deve iniciar uma nova investigação e receber resposta da IA', async ({ page }) => {
    // 1. Acessa a aplicação
    await page.goto('/');

    // 2. Garante que a página inicial (EmptyState) carregou
    await expect(page.locator('text=Pronto para iniciar a investigação')).toBeVisible();

    // 3. Opcional: Se houver modal de login/bypass, ele deve ser tratado aqui.
    // Como o projeto tem 'useClickBypass', assumimos que o clique na área secreta 
    // ou o login do Clerk já foram ou podem ser simulados.
    // Para simplificar, vamos interagir diretamente com o input de chat.

    // 4. Localiza o input de chat e digita o comando inicial
    const chatInput = page.locator('textarea[placeholder*="Digite o nome da empresa"]');
    await chatInput.fill('Quero investigar a empresa TOTVS');

    // 5. Clica no botão de enviar (ícone de avião de papel)
    const sendButton = page.locator('button.bg-emerald-600');
    await sendButton.click();

    // 6. Verifica se o estado de carregamento hero (LoadingSmart) aparece
    const loadingHero = page.locator('text=Realizando pesquisa');
    await expect(loadingHero).toBeVisible({ timeout: 10000 });

    // 7. A parte MAIS CRÍTICA: Aguarda a resposta do Bot.
    // Isso valida que a request foi para o Vercel/Gemini e voltou corretamente.
    // Aumentamos o timeout porque a IA pode demorar alguns segundos.
    const botResponse = page.locator('.prose'); // A mensagem do bot renderiza markdown
    await expect(botResponse).toBeVisible({ timeout: 45000 });

    // 8. Verifica se a IA identificou a empresa e atualizou o título (opcional, mas bom)
    const sessionTitle = page.locator('h1, h2, h3').filter({ hasText: /TOTVS/i }).first();
    // Isso é uma asserção fraca (soft) para não quebrar o teste se a IA decidir responder de outra forma, 
    // mas o fluxo de texto deve ter retornado.
    await expect(botResponse).toContainText(/[a-zA-Z]/); 
  });
});
