import { type Page } from '@playwright/test';
import {
  evaluateGoldenOperatorPreconditions,
  formatGoldenPreconditionFailure,
  GOLDEN_OPERATOR_PRECONDITION_FAILED,
  shouldCompleteOperatorOnboarding,
  type GoldenOperatorPreconditionObservation,
} from '../../utils/goldenPrecondition';

/** Nomes de fallback que NÃO contam como nome real de operador (PII-safe). */
const fallbackOperatorNames = new Set(['operador', 'usuário', 'usuario']);

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
    let onboardingAttempted = false;

    while (Date.now() < deadline) {
      const observation = await readGoldenPreconditionObservation(page, {
        appShell,
        appHeader,
        operatorMenu,
        greetingCard,
      });
      const report = evaluateGoldenOperatorPreconditions(observation);
      if (report.passed) return;

      // BRU-117 lote 2 (opção B, autorizada pelo Bruno 2026-08-15): login real
      // autenticou, mas o operador ainda não confirmou nome/email (greeting
      // presente = showOperatorGate). Completa o onboarding UMA vez como um
      // usuário real faria — sem mutação de dados/conta QA.
      if (shouldCompleteOperatorOnboarding(observation) && !onboardingAttempted) {
        onboardingAttempted = true;
        await completeOperatorOnboarding(page, email);
        // Ainda não valida aqui: deixa a próxima iteração medir o efeito.
        await page.waitForTimeout(500);
        continue;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        // BRU-117 lote 2: falha DISCRIMINANTE e PII-safe — expõe só as flags
        // estruturais que faltaram (nunca email/nome real/token/storage).
        throw new Error(formatGoldenPreconditionFailure(report));
      }
      await page.waitForTimeout(Math.min(250, remainingMs));
    }

    // O loop pode sair por expiração sem o corpo ter visto remainingMs <= 0
    // (ex.: o waitForTimeout estourou o deadline). Avalia UMA última vez para
    // a falha continuar discriminante (nunca a mensagem genérica antiga).
    const finalObservation = await readGoldenPreconditionObservation(page, {
      appShell,
      appHeader,
      operatorMenu,
      greetingCard,
    });
    const finalReport = evaluateGoldenOperatorPreconditions(finalObservation);
    throw new Error(formatGoldenPreconditionFailure(finalReport));
  } catch (error) {
    // Erro já discriminante (formatGoldenPreconditionFailure) propaga intacto;
    // qualquer outro erro vira falha genérica SEM PII.
    if (error instanceof Error && error.message.startsWith(GOLDEN_OPERATOR_PRECONDITION_FAILED)) throw error;
    throw new Error(
      `${GOLDEN_OPERATOR_PRECONDITION_FAILED}: falha ao autenticar o operador real (detalhe suprimido por PII)`,
      { cause: error },
    );
  }
}

/**
 * Lê as observações estruturais do preflight sem PII. Separado do loop para
 * permitir RED/GREEN unitários (utils/goldenPrecondition.ts) e reuso.
 */
export async function readGoldenPreconditionObservation(
  page: Page,
  locators: {
    appShell: ReturnType<Page['getByTestId']>;
    appHeader: ReturnType<Page['getByTestId']>;
    operatorMenu: ReturnType<Page['locator']>;
    greetingCard: ReturnType<Page['getByTestId']>;
  },
): Promise<GoldenOperatorPreconditionObservation> {
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
    locators.appShell.isVisible().catch(() => false),
    locators.appHeader.isVisible().catch(() => false),
    locators.operatorMenu.isVisible().catch(() => false),
    locators.greetingCard.count().catch(() => 0),
  ]);

  let operatorLabel = '';
  if (menuReady) {
    operatorLabel = (await locators.operatorMenu.getAttribute('title').catch(() => null))?.trim() ?? '';
    if (!operatorLabel) operatorLabel = (await locators.operatorMenu.innerText().catch(() => '')).trim();
  }
  const operatorNameReady =
    operatorLabel.length > 0 && !fallbackOperatorNames.has(operatorLabel.toLocaleLowerCase());

  return { sessionReady, shellReady, headerReady, menuReady, greetingCount, operatorNameReady };
}

/**
 * BRU-117 lote 2 (opção B): completa o onboarding do operador no greeting-card
 * como um usuário real faria. O greeting tem DOIS estados possíveis após o
 * login real — e o `checkEmailExists` do app pode trocar de um para o outro
 * durante o fluxo (mostra "Verificando email..." e depois decide):
 * 1) email já cadastrado no user_context → card "Já existe um cadastro com
 *    este email" com o botão "Vincular este dispositivo" (greeting-link-button,
 *    preserva o display_name existente);
 * 2) email desconhecido → formulário (nome + email + "Continuar").
 * Este helper resolve o estado ATUAL e continua enquanto o greeting persistir
 * (cobre a troca form→link quando o check resolve DEPOIS do submit).
 * Nome fixo com 2+ palavras (o form exige nome e sobrenome); nenhum dado novo
 * externo é criado manualmente — o app persiste via fluxo normal.
 */
export async function completeOperatorOnboarding(page: Page, email: string): Promise<void> {
  const greetingCard = page.getByTestId('greeting-card');
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const cardVisible = await greetingCard.isVisible({ timeout: 500 }).catch(() => false);
    if (!cardVisible) return; // greeting resolvido

    // Estado 1: email já cadastrado → vincula este dispositivo.
    const linkButton = page.getByTestId('greeting-link-button');
    if (await linkButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await linkButton.click();
      await page.waitForTimeout(800);
      continue;
    }

    // Estado 2: formulário → preenche nome (2+ palavras) + email e submete.
    const nameInput = page.getByTestId('greeting-name-input');
    if (await nameInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await nameInput.fill('Operador QA');
      await page.getByTestId('greeting-email-input').fill(email);
      const submit = page.getByTestId('greeting-submit-button');
      if (await submit.isVisible({ timeout: 500 }).catch(() => false)) {
        await submit.click();
      }
      // O checkEmailExists pode trocar o form pelo card de vincular depois do
      // submit — o loop acima resolve esse estado na próxima iteração.
      await page.waitForTimeout(800);
      continue;
    }

    // Transição (ex.: "Verificando email..." no ar) — aguarda estabilizar.
    await page.waitForTimeout(400);
  }
}
