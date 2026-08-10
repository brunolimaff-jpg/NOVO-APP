import { expect, test, type Page, type Route } from '@playwright/test';
import { setupE2EAuth } from './helpers/auth';
import { completeOnboarding, dismissMigrationNotice, e2eCompanyName } from './helpers/onboarding';

/**
 * Stub local de ~45k chars (Planejador 2026-08-10 — smoke do pacote
 * GOLD-EXPERIENCE-01: remoção do truncamento não pode reintroduzir freeze
 * com dossiê grande). Não altera o helper llm.ts (fora do escopo) — o stub
 * é definido aqui, com o mesmo formato do helper oficial (sentinel + PORTA
 * + teia + plano) repetido até ~45k.
 */
const SENTINEL = 'SCHEFFER_E2E_SENTINEL';
const LONG_BLOCK = Array.from({ length: 120 }, (_, index) => {
  const n = String(index + 1).padStart(3, '0');
  return `- Evidencia ${n}: ${SENTINEL} confirma secao longa com QSA, fazendas, filiais, governanca, riscos, plano comercial, score e recomendacoes para estressar renderizacao apos remocao do truncamento.`;
}).join('\n');
const DOSSIER_45K = [
  '## Raio-X Operacional',
  `${SENTINEL}: fluxo deterministico longo para validar recuperacao do loading e renderizacao real do painel central.`,
  '[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]',
  '## Teia Societaria',
  LONG_BLOCK,
  '## Plano de Acao',
  LONG_BLOCK,
].join('\n\n');

async function stubLlm45k(route: Route) {
  let payload: { action?: string; config?: { responseMimeType?: string } };
  try {
    payload = route.request().postDataJSON() as typeof payload;
  } catch {
    payload = {};
  }
  if (payload.action === 'generateContent' && payload.config?.responseMimeType !== 'application/json') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: DOSSIER_45K }) });
    return;
  }
  if (payload.action === 'chatSendMessage') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Resposta deterministica.', webVerificationStatus: 'not_applicable' }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
}

/**
 * RUN_ORPHAN A/B — medição de performance do handoff pós-fallback (dossiê grande).
 *
 * Planejador 2026-08-10 (gate revisado): comprovar que o defer dos 3 parsers
 * síncronos (ee7db474/ef1ce50b) elimina o bloqueio da main thread ao renderizar
 * dossiê longo após o fallback, comparado ao HEAD sem defer (0e525593).
 *
 * Evidências coletadas:
 * - long tasks (PerformanceObserver) durante o handoff + maior long task + total
 * - post-render-scheduled → post-render-fired (console scoutDiag)
 * - ticks do heartbeat (DossierRunLifecycle)
 * - UI responde a ação simples após o render do dossiê
 *
 * Uso A/B:
 *   BASE_URL=<deploy-sem-defer> npx playwright test tests-e2e/gold-fallback-perf.spec.ts
 *   BASE_URL=<deploy-com-defer> npx playwright test tests-e2e/gold-fallback-perf.spec.ts
 */
const LOADING_TIMEOUT_MS = 180_000;

async function collectLongTasks(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ maxDuration: number; totalBlocked: number; count: number }>((resolve) => {
        const tasks: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
        // Janela de coleta: do início do submit até 20s depois (render do dossiê)
        setTimeout(() => {
          observer.disconnect();
          resolve({
            maxDuration: tasks.length ? Math.max(...tasks) : 0,
            totalBlocked: tasks.reduce((a, b) => a + b, 0),
            count: tasks.length,
          });
        }, 20_000);
      }),
  );
}

test.describe('RUN_ORPHAN — performance do handoff pós-fallback', () => {
  test.describe.configure({ timeout: 240_000 });

  test('dossiê grande renderiza sem long task > 200ms e UI responde', async ({ page }) => {
    const consoleEvents: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (/tick_started|tick_completed|tick_timeout|post-render-scheduled|post-render-fired|GoldSeam/.test(text)) {
        consoleEvents.push(text.slice(0, 160));
      }
    });

    await setupE2EAuth(page);
    await page.route('**/api/llm**', stubLlm45k);
    // Fallback: AuthGate com prazo vencido (18/06/2026) força o modal de login
    // mesmo com o bypass. Se aparecer, tenta entrar com a sessão local-only
    // (OperatorContext local-only) usando o email pré-preenchido do bypass.
    const loginModal = page.getByRole('button', { name: /^entrar$/i }).first();
    if (await loginModal.isVisible({ timeout: 8_000 }).catch(() => false)) {
      // Abre o modal de login
      await loginModal.click({ force: true });
      // Preenche a senha e submete DENTRO do form (botão "Entrar" do modal)
      const passwordInput = page.getByPlaceholder(/senha/i);
      if (await passwordInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await passwordInput.fill('e2e-bypass');
      }
      const submitInForm = page.locator('form button[type="submit"], form button:has-text("Entrar")').first();
      if (await submitInForm.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await submitInForm.click({ force: true });
      }
    }
    await completeOnboarding(page);
    await dismissMigrationNotice(page);

    // Inicia coleta de long tasks ANTES do submit (handoff inteiro)
    const longTasksPromise = collectLongTasks(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill(e2eCompanyName('Fazenda Perf E2E'));
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click({ force: true });

    // Aguarda o dossiê final renderizar (sentinel do stub)
    const bot = page.getByTestId('bot-message-content').last();
    await expect(bot).toBeVisible({ timeout: LOADING_TIMEOUT_MS });
    await expect(bot).toContainText('SCHEFFER_E2E_SENTINEL', { timeout: 60_000 });

    // Coleta as long tasks
    const longTasks = await longTasksPromise;

    // UI RESPONDE: o input de mensagem fica acessível e recebe digitação
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('message-input').fill('teste de responsividade', { timeout: 10_000 });

    const tickCompletions = consoleEvents.filter((e) => /tick_completed/.test(e)).length;
    const postRenderScheduled = consoleEvents.some((e) => /post-render-scheduled/.test(e));
    const postRenderFired = consoleEvents.some((e) => /post-render-fired/.test(e));

    // Métricas para o relatório (sempre imprime, mesmo se falhar o critério)
    console.log('RUN_ORPHAN_METRICS', JSON.stringify({
      maxLongTaskMs: longTasks.maxDuration,
      totalBlockedMs: longTasks.totalBlocked,
      longTaskCount: longTasks.count,
      tickCompletions,
      postRenderScheduled,
      postRenderFired,
      consoleEventCount: consoleEvents.length,
    }));

    // CRITÉRIO (com defer): nenhuma long task > 200ms durante o handoff.
    // Sem defer (0e525593), espera-se falha aqui — é a evidência do problema.
    expect(longTasks.maxDuration, `Maior long task: ${longTasks.maxDuration}ms`).toBeLessThan(200);
  });
});
