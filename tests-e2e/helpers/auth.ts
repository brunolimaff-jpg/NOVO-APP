import { type Page } from '@playwright/test';

/**
 * Configura bypass de autenticação para testes E2E.
 *
 * Injeta localStorage ANTES do carregamento da página para que
 * OperatorContext e AuthGate pulem a tela de login/cadastro.
 *
 * Usar no topo de cada test ou como fixture global.
 */
export async function setupE2EAuth(page: Page) {
  await page.addInitScript(() => {
    const PREFIX = 'scout360:';
    const now = Date.now();
    const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    // AuthGate: pula modal de migração
    localStorage.setItem(PREFIX + 'auth_skip_until', future);
    localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');

    // OperatorContext: email e nome para sessão guest autenticada
    localStorage.setItem(PREFIX + 'operator_email', 'qa.e2e@senior.com.br');
    localStorage.setItem(PREFIX + 'operator_name', 'QA E2E Bot');
    localStorage.setItem(PREFIX + 'operator_id', 'op_e2e_bypass');
  });
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
export async function setupRealSupabaseAuthFromEnv(page: Page, options: { email?: string } = {}) {
  const email = options.email ?? process.env.E2E_OPERATOR_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;
  if (!email || !password) {
    throw new Error('setupRealSupabaseAuthFromEnv exige E2E_OPERATOR_EMAIL e E2E_AUTH_PASSWORD');
  }

  const preconditionTimeoutMs = 30_000;
  const preconditionCode = 'GOLDEN_OPERATOR_PRECONDITION_FAILED';
  const fallbackOperatorNames = new Set(['operador', 'usuário', 'usuario']);
  const failPrecondition = () => {
    throw new Error(`${preconditionCode}: sessão real, shell autenticado e nome do operador são obrigatórios`);
  };

  try {
    await page.goto('/');

    const openAuth = page.getByRole('button', { name: /entrar|criar minha senha|criar minha conta/i }).first();
    if (await openAuth.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await openAuth.click({ force: true });
    }

    const loginTab = page.getByRole('button', { name: /^entrar$/i }).first();
    if (await loginTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await loginTab.click({ force: true });
    }

    await page.getByPlaceholder(/email/i).fill(email);
    await page.getByPlaceholder(/senha|sua senha/i).fill(password);
    await page.getByRole('button', { name: /^entrar$/i }).last().click({ force: true });

    const deadline = Date.now() + preconditionTimeoutMs;
    const appShell = page.getByTestId('app-shell');
    const appHeader = page.getByTestId('app-header');
    const operatorMenu = page.locator('button[aria-haspopup="menu"]').first();
    const greetingCard = page.getByTestId('greeting-card');

    while (Date.now() < deadline) {
      const [sessionReady, shellReady, headerReady, menuReady, greetingCount] = await Promise.all([
        page
          .evaluate(() => {
            for (let index = 0; index < localStorage.length; index += 1) {
              const key = localStorage.key(index);
              if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
              const raw = localStorage.getItem(key);
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw) as { access_token?: unknown };
                if (typeof parsed.access_token === 'string' && parsed.access_token.trim()) return true;
              } catch {
                // Ignore transient or malformed auth storage entries.
              }
            }
            return false;
          })
          .catch(() => false),
        appShell.isVisible().catch(() => false),
        appHeader.isVisible().catch(() => false),
        operatorMenu.isVisible().catch(() => false),
        greetingCard.count().catch(() => 0),
      ]);

      let operatorLabel = '';
      if (menuReady) {
        operatorLabel = (await operatorMenu.getAttribute('title').catch(() => null))?.trim() ?? '';
        if (!operatorLabel) operatorLabel = (await operatorMenu.innerText().catch(() => '')).trim();
      }
      const hasOperatorName = operatorLabel.length > 0 && !fallbackOperatorNames.has(operatorLabel.toLocaleLowerCase());

      if (sessionReady && shellReady && headerReady && menuReady && greetingCount === 0 && hasOperatorName) return;

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await page.waitForTimeout(Math.min(250, remainingMs));
    }

    failPrecondition();
  } catch {
    throw new Error(
      `${preconditionCode}: sessão real, shell autenticado, Greeting ausente e nome do operador são obrigatórios`,
    );
  }
}
