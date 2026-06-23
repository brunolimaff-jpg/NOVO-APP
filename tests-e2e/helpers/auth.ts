import { expect, type Page } from '@playwright/test';

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
 *
 * O preview com guest + migration banner mostra greeting/onboarding — não o AuthModal.
 * Pré-configura operator_email, remove auth_skip_until e abre o modal via banner se necessário.
 */
export async function loginViaSupabase(page: Page, email: string, password: string) {
  const PREFIX = 'scout360:';

  await page.addInitScript(
    ({ migrationSeenKey, operatorEmailKey, authSkipKey, targetEmail }) => {
      localStorage.setItem(migrationSeenKey, 'true');
      localStorage.setItem(operatorEmailKey, targetEmail);
      localStorage.removeItem(authSkipKey);
    },
    {
      migrationSeenKey: `${PREFIX}supabase_migration_seen`,
      operatorEmailKey: `${PREFIX}operator_email`,
      authSkipKey: `${PREFIX}auth_skip_until`,
      targetEmail: email,
    },
  );

  await page.goto('/');

  await page
    .getByText(/verificando sessão/i)
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);

  const authEmailInput = page.getByPlaceholder('seu@email.com');
  if (!(await authEmailInput.isVisible({ timeout: 8_000 }).catch(() => false))) {
    const openModalBtn = page.getByRole('button', { name: /criar minha conta/i });
    if (await openModalBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await openModalBtn.click();
    }
  }

  await authEmailInput.waitFor({ state: 'visible', timeout: 20_000 });

  const entrarTab = page.getByRole('button', { name: /^entrar$/i }).first();
  if (await entrarTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await entrarTab.click();
  }

  await authEmailInput.fill(email);
  await page.getByPlaceholder(/sua senha/i).fill(password);
  await page
    .locator('form')
    .filter({ has: authEmailInput })
    .getByRole('button', { name: /^entrar$/i })
    .click();

  await expect(page.getByPlaceholder('seu@email.com')).toBeHidden({ timeout: 30_000 });
  await page.getByText('Conectado', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
}

export async function setupRealSupabaseAuthFromEnv(page: Page, options: { email?: string } = {}) {
  const password = process.env.E2E_AUTH_PASSWORD;
  if (!password) {
    throw new Error('E2E_AUTH_PASSWORD is required when E2E_REAL_AUTH=1');
  }

  const email = options.email ?? process.env.E2E_OPERATOR_EMAIL;
  if (!email) {
    throw new Error('E2E_OPERATOR_EMAIL is required when E2E_REAL_AUTH=1');
  }

  await loginViaSupabase(page, email, password);
}
