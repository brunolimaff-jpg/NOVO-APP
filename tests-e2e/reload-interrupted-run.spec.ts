// tests-e2e/reload-interrupted-run.spec.ts
import { expect, test } from '@playwright/test';
import { setupRealSupabaseAuthFromEnv } from './helpers/auth';

/**
 * BRU-7 — Alternativa A: recuperação pós-reload.
 *
 * Prova que, após reload durante uma execução ativa:
 * - NÃO há retomada automática do waterfall;
 * - NÃO há falso COMPLETED;
 * - o usuário recebe mensagem explícita de interrupção (quando a sessão
 *   carregada existe) OU o registro permanece persistido (sessão ausente);
 * - o registro persistido nunca é consumido sem aplicação.
 *
 * Exige ambiente real (E2E_REAL_AUTH=1 + E2E_AUTH_PASSWORD), pois o modal
 * de auth é obrigatório pós-prazo. Sem credenciais, o teste é SKIP explícito
 * (não é falha).
 */

const INTERRUPTED_SESSION_ID = 'e2e-reload-session';
const INTERRUPTED_RUN_ID = 'e2e-reload-run';

function requireLiveEnvironment() {
  if (!process.env.E2E_AUTH_PASSWORD || process.env.E2E_REAL_AUTH !== '1') {
    test.skip(
      true,
      'reload-interrupted-run exige E2E_REAL_AUTH=1, E2E_OPERATOR_EMAIL e E2E_AUTH_PASSWORD (ambiente real)',
    );
  }
}

test('reload durante execução ativa: sem retomada, sem falso COMPLETED, interrupção explícita', async ({ page }) => {
  requireLiveEnvironment();

  // Login real: cria a sessão autenticada antes de simular o reload.
  await setupRealSupabaseAuthFromEnv(page);

  // Simula o estado pós-reload: run persistido como ativo, sem contexto local.
  await page.evaluate(
    ({ sid, rid }) => {
      window.sessionStorage.setItem(
        'scout360:active_dossier_run',
        JSON.stringify({
          [sid]: { sessionId: sid, runId: rid, leaseOwner: `${rid}:lease`, clientAttemptId: 'e2e-attempt' },
        }),
      );
    },
    { sid: INTERRUPTED_SESSION_ID, rid: INTERRUPTED_RUN_ID },
  );

  // Recarrega: o boot deve detectar o run persistido sem contexto local.
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 1. Sem retomada automática: nenhuma chamada de geração inicia (stub de rede).
  const llmRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/llm')) llmRequests.push(request.url());
  });
  await page.waitForTimeout(5_000);
  expect(llmRequests, 'reload não pode disparar geração LLM automaticamente').toHaveLength(0);

  // 2. Sem falso COMPLETED: nenhuma mensagem de sucesso de dossiê.
  const successLike = page.locator('[data-testid="bot-message-content"]', {
    hasText: /dossi[êe] (completo|gerado)|conclu[íi]do com sucesso/i,
  });
  await expect(successLike).toHaveCount(0);

  // 3. Overlay de loading não pode indicar geração ativa após o boot.
  const overlay = page.locator('[data-testid="loading-smart-overlay"]');
  await expect(overlay).toHaveCount(0, { timeout: 15_000 });

  // 4. Estado explícito: mensagem de interrupção na sessão OU registro preservado.
  const interruptedMessage = page.locator('[data-testid="bot-message-content"]', {
    hasText: 'interrompida',
  }).first();
  const interruptedVisible = await interruptedMessage
    .isVisible({ timeout: 15_000 })
    .catch(() => false);

  if (interruptedVisible) {
    await expect(interruptedMessage).toContainText('Nenhum dossiê foi marcado como concluído');
  } else {
    // Sessão ausente no load: o registro deve permanecer persistido (nunca
    // consumido sem aplicação).
    const stillPersisted = await page.evaluate(() =>
      window.sessionStorage.getItem('scout360:active_dossier_run'),
    );
    expect(stillPersisted, 'registro não pode ser consumido sem sessão alvo').toContain(INTERRUPTED_RUN_ID);
  }
});
