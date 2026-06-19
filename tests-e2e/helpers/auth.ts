import { type Page } from '@playwright/test';

/**
 * Configura bypass de autenticação para testes E2E.
 *
 * Injeta localStorage ANTES do carregamento da página para que
 * OperatorContext e AuthGate pulem a tela de login/cadastro.
 *
 * Usar no topo de cada test ou como fixture global.
 */
interface SetupE2EAuthOptions {
  /** Evita reidratar histórico Supabase de runs anteriores com o mesmo operador fixo. */
  uniqueOperator?: boolean;
}

export async function setupE2EAuth(page: Page, options: SetupE2EAuthOptions = {}) {
  const { uniqueOperator = false } = options;
  await page.addInitScript(({ useUnique }) => {
    const PREFIX = 'scout360:';
    const now = Date.now();
    const suffix = useUnique ? `-${now}-${Math.random().toString(36).slice(2, 8)}` : '';
    const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    // AuthGate: pula modal de migração
    localStorage.setItem(PREFIX + 'auth_skip_until', future);
    localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');

    // OperatorContext: email e nome para sessão guest autenticada
    localStorage.setItem(PREFIX + 'operator_email', `qa.e2e${suffix}@senior.com.br`);
    localStorage.setItem(PREFIX + 'operator_name', 'QA E2E Bot');
    localStorage.setItem(PREFIX + 'operator_id', `op_e2e_bypass${suffix}`);
  }, { useUnique: uniqueOperator });
}

/**
 * Helper: faz login real via Supabase Auth.
 *
 * Alternativa ao bypass quando o teste PRECISA de um usuário autenticado
 * real (ex: testes de sidebar, persistência de dossiê).
 */
export async function loginViaSupabase(page: Page, email: string, password: string) {
  await page.goto('/');

  // Clica em "Entrar" se o modal de login não estiver visível
  const entrarBtn = page.getByRole('button', { name: /entrar/i });
  if (await entrarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await entrarBtn.click();
  }

  // Preenche o formulário de login
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/senha/i).fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();

  // Aguarda o login completar (botão do operador visível)
  await page.getByTestId('operator-menu-button').waitFor({ state: 'visible', timeout: 15_000 });
}
