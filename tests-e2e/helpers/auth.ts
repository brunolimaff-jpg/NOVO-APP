import { expect, type Page } from '@playwright/test';

interface E2EAuthOptions {
  email?: string;
  name?: string;
  uniqueOperator?: boolean;
}

export function e2eOperatorIdentity(options: E2EAuthOptions = {}) {
  const suffix = options.uniqueOperator ? `.${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : '';
  const email = options.email ?? `qa.e2e${suffix}@senior.com.br`;
  const name = options.name ?? 'QA E2E Bot';
  const operatorId = `op_e2e_${email.replace(/[^a-z0-9]/gi, '_').slice(0, 32)}`;
  return { email, name, operatorId };
}

/**
 * Configura bypass de autenticação para testes E2E.
 *
 * Injeta localStorage ANTES do carregamento da página para que
 * OperatorContext e AuthGate pulem a tela de login/cadastro.
 *
 * Usar no topo de cada test ou como fixture global.
 */
export async function setupE2EAuth(page: Page, options: E2EAuthOptions = {}) {
  if (process.env.E2E_REAL_AUTH === '1') {
    await setupRealSupabaseAuthFromEnv(page, { email: options.email });
    return;
  }

  const identity = e2eOperatorIdentity(options);
  await page.addInitScript(({ email, name, operatorId }) => {
    const PREFIX = 'scout360:';
    const now = Date.now();
    const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    // AuthGate: pula modal de migração
    localStorage.setItem(PREFIX + 'auth_skip_until', future);
    localStorage.setItem(PREFIX + 'supabase_migration_seen', 'true');

    // OperatorContext: email e nome para sessão guest autenticada
    localStorage.setItem(PREFIX + 'operator_email', email);
    localStorage.setItem(PREFIX + 'operator_name', name);
    localStorage.setItem(PREFIX + 'operator_id', operatorId);
  }, identity);
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

  await page.goto('/');

  if (await page.getByTestId('operator-menu-button').isVisible({ timeout: 5_000 }).catch(() => false)) {
    return;
  }

  const openAuth = page
    .getByRole('button', { name: /entrar|criar minha senha|criar minha conta(?: agora)?/i })
    .first();
  await expect(openAuth, 'botão para abrir autenticação real precisa aparecer').toBeVisible({ timeout: 30_000 });
  await openAuth.click({ force: true });

  const loginTab = page.getByRole('button', { name: /^entrar$/i }).first();
  if (await loginTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await loginTab.click({ force: true });
  }

  const emailInput = page.getByPlaceholder(/email/i).first();
  const passwordInput = page.getByPlaceholder(/senha|sua senha/i).first();
  await expect(emailInput, 'modal de login precisa abrir com campo de email').toBeVisible({ timeout: 15_000 });
  await emailInput.fill(email, { timeout: 5_000 });
  await expect(passwordInput, 'modal de login precisa abrir com campo de senha').toBeVisible({ timeout: 5_000 });
  await passwordInput.fill(password, { timeout: 5_000 });

  const submitLogin = page.getByRole('button', { name: /^entrar$/i }).last();
  await expect(submitLogin, 'botão Entrar do modal precisa estar visível').toBeVisible({ timeout: 5_000 });
  await submitLogin.click({ force: true, timeout: 5_000 });

  const errorLocator = page.getByText(/email ou senha incorretos/i);
  const successLocator = page.getByTestId('operator-menu-button');

  await Promise.race([
    successLocator.waitFor({ state: 'visible', timeout: 30_000 }),
    errorLocator.waitFor({ state: 'visible', timeout: 30_000 }),
  ]);

  if (await errorLocator.isVisible()) {
    throw new Error('Login falhou: email ou senha incorretos');
  }
}
