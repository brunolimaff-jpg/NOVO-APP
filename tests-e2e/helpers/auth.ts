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
  email?: string;
  name?: string;
}

export async function setupE2EAuth(page: Page, options: SetupE2EAuthOptions = {}) {
  const { uniqueOperator = false } = options;
  const baseEmail = options.email ?? process.env.E2E_OPERATOR_EMAIL ?? 'qa.e2e@senior.com.br';
  const operatorName = options.name ?? process.env.E2E_OPERATOR_NAME ?? 'QA E2E Bot';

  await page.addInitScript(
    ({ useUnique, baseEmail, operatorName }) => {
      const PREFIX = 'scout360:';
      const now = Date.now();
      const suffix = useUnique ? `-${now}-${Math.random().toString(36).slice(2, 8)}` : '';
      const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      const [localPart, domain = 'senior.com.br'] = baseEmail.split('@');
      const operatorEmail = useUnique ? `${localPart}${suffix}@${domain}` : baseEmail;

      localStorage.setItem(PREFIX + 'auth_skip_until', future);
      localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');
      localStorage.setItem(PREFIX + 'operator_email', operatorEmail);
      localStorage.setItem(PREFIX + 'operator_name', operatorName);
      localStorage.setItem(PREFIX + 'operator_id', `op_e2e_bypass${suffix}`);
    },
    { useUnique: uniqueOperator, baseEmail, operatorName },
  );
}

/**
 * Helper: faz login real via Supabase Auth.
 */
export async function loginViaSupabase(page: Page, email: string, password: string) {
  await page.goto('/');

  const entrarBtn = page.getByRole('button', { name: /entrar/i });
  if (await entrarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await entrarBtn.click();
  }

  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/senha/i).fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();

  await page.getByTestId('operator-menu-button').waitFor({ state: 'visible', timeout: 15_000 });
}
