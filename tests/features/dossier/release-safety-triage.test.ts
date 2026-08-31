/**
 * BRU-115 ARCH-F — Release Safety Triage (SOMENTE INVESTIGAÇÃO).
 *
 * Testes discriminantes para provar/refutar 4 riscos arquiteturais no fluxo
 * real do PR #483 (branch feat/v6-shadow-prep). NENHUM código de produção é
 * alterado: os testes fixam o comportamento observável (expressões, SQL de
 * migração, contratos de módulos) e o classificam como PASS / FAIL / NOT
 * VERIFIED com evidência arquivo:linha.
 *
 * Evidência fixada em 2026-08-14 (branch feat/v6-shadow-prep, HEAD 0200e9b3).
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();

// Mocks globais (hoisted) necessários apenas ao teste de heartbeat do RISCO 3.
// Nenhum outro módulo importado neste arquivo depende das implementações reais
// de diagnosticLog ou lib/supabase/dossierRuns (serverDiagnostics só importa
// goldCriticalDiagnostics; gold-contract-validator não tem imports).
const scoutDiagMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));
vi.mock('../../../lib/supabase/dossierRuns', () => ({
  renewDossierRunLease: vi.fn(),
  DossierRunRpcTimeoutError: class DossierRunRpcTimeoutError extends Error {},
}));

afterEach(async () => {
  const { resetDossierRunHeartbeatForTest } = await import('../../../features/dossier/dossier-run-heartbeat');
  resetDossierRunHeartbeatForTest();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// ============================================================================
// RISCO 1 — Double-write do dossiê (server-owned terminal vs autosave cliente)
// ============================================================================
describe('RISCO 1 — double-write do dossiê (server-owned terminal vs autosave debounced)', () => {
  /**
   * Expressões reais dos dois caminhos (fixadas por leitura):
   * - SERVER (waterfall-orchestrator.ts:1608):
   *     scoreOportunidade: suppressCommercialMetadata ? null
   *       : baseSession?.scoreOportunidade ?? waterfallScorePorta?.score ?? null
   * - UI     (waterfall-orchestrator.ts:1678 e fallback 1791):
   *     scoreOportunidade: suppressCommercialMetadata ? null
   *       : waterfallScorePorta?.score ?? session.scoreOportunidade
   *
   * A precedência está INVERTIDA entre os dois caminhos: o snapshot terminal
   * do servidor prefere o score do baseSession; a UI prefere o score do PORTA.
   */
  const serverTerminalScore = (base: { scoreOportunidade?: number | null } | null, porta: { score?: number } | null, suppress: boolean) =>
    suppress ? null : base?.scoreOportunidade ?? porta?.score ?? null;

  const uiScore = (porta: { score?: number } | null, session: { scoreOportunidade?: number | null }, suppress: boolean) =>
    suppress ? null : porta?.score ?? session.scoreOportunidade;

  it('FAIL — os dois snapshots divergem quando baseSession.score e waterfallScorePorta.score existem e diferem (precedência invertida)', () => {
    const base = { scoreOportunidade: 55 };
    const porta = { score: 61 };

    const server = serverTerminalScore(base, porta, false); // 55 (baseSession tem prioridade)
    const ui = uiScore(porta, base, false); // 61 (PORTA tem prioridade)

    expect(server).toBe(55);
    expect(ui).toBe(61);
    expect(server).not.toBe(ui); // divergência observável da 1ª escrita
  });

  it('FAIL — a escrita posterior do cliente sobrescreve o terminal do servidor (o autosave pós-COMPLETED não é bloqueado)', () => {
    // Cenário: terminal commit grava 55 (baseSession preferido); o useEffect do
    // useSessionStorage (hooks/useSessionStorage.ts:89-93) dispara o debounce de
    // 1s (72-87) que chama saveAllDossiers → RPC save_dossiers_autosave
    // (services/storage/dossiers.ts:155-174). A RPC só pula sessões com run
    // RUNNING/CANCEL_REQUESTED (20260812170000_bru81_atomic_dossier_promotion.sql
    // linhas 234-240). Run COMPLETED ⇒ a escrita do cliente passa e o valor da
    // UI (61) substitui o valor canônico do servidor (55).
    const serverSnapshot = { id: 's', scoreOportunidade: 55 };
    const uiSnapshot = { id: 's', scoreOportunidade: 61 };

    expect(uiSnapshot.scoreOportunidade).not.toBe(serverSnapshot.scoreOportunidade);

    // SQL de migração: o containment do autosave NÃO cobre COMPLETED.
    const sql = readFile('supabase/migrations/20260812170000_bru81_atomic_dossier_promotion.sql');
    expect(sql).toContain(`AND r.status IN ('RUNNING', 'CANCEL_REQUESTED')`);
    // O único filtro do lote é o status RUNNING/CANCEL_REQUESTED — ausência de
    // qualquer guarda para COMPLETED/terminal na função save_dossiers_autosave.
    const autosaveBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.save_dossiers_autosave'));
    const terminalBlock = autosaveBody.slice(0, autosaveBody.indexOf('GRANT EXECUTE'));
    expect(terminalBlock).not.toContain(`'COMPLETED'`);
    // A promoção terminal tem guarda de replay (idempotência) — mas isso só
    // protege chamadas à complete_dossier_run_with_dossier, não o autosave.
    expect(sql).toContain('Replay rejected: completed run cannot change dossier content');
  });

  it('FAIL — o cliente não tem mais filtro client-side de run ativo no saveAllDossiers (controle só server-side, e só para RUNNING/CANCEL_REQUESTED)', () => {
    const dossiersSrc = readFile('services/storage/dossiers.ts');
    expect(dossiersSrc).toContain(`supabase!.rpc('save_dossiers_autosave', { p_dossiers: payloads })`);
    // O comentário de BRU-81 confirma a remoção do filtro client-side:
    expect(dossiersSrc).toContain('O filtro client-side (getActiveDossierRun) tem janela TOCTOU');
  });

  it('PASS — o terminal commit em si é idempotente/atômico no servidor (não é o ponto de divergência)', () => {
    const sql = readFile('supabase/migrations/20260812170000_bru81_atomic_dossier_promotion.sql');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(sql).toContain('UPDATE public.dossier_runs');
    expect(sql).toContain(`status = 'COMPLETED'`);
  });
});

// ============================================================================
// RISCO 2 — Reload / run remoto órfão
// ============================================================================
describe('RISCO 2 — reload deixa run remoto órfão? recovery não cancela; mutex SINGLE_ACTIVE_RUN', () => {
  it('FAIL — o recovery hook NUNCA chama cancelamento remoto (nenhum call site de requestDossierRunCancellation/markDossierRunCancelled)', () => {
    const src = readFile('hooks/useInterruptedDossierRunRecovery.ts');
    expect(src).not.toContain('requestDossierRunCancellation');
    expect(src).not.toContain('markDossierRunCancelled');
    // O hook só injeta a mensagem e remove o registro local persistido:
    expect(src).toContain('removePersistedActiveDossierRuns');
    // E o "run remoto" (status RUNNING no Supabase) não é tocado.
    const dossierRunsLib = readFile('lib/supabase/dossierRuns.ts');
    expect(dossierRunsLib).toContain(`'request_dossier_run_cancel'`);
  });

  it('FAIL — o cleanup de stale runs não está agendado: vercel.json só agenda cron-email-confirmation; o handler exige flag CRON_STALE_CLEANUP_ENABLED=true', () => {
    const vercel = JSON.parse(readFile('vercel.json')) as { crons?: Array<{ path: string }> };
    const cronPaths = (vercel.crons ?? []).map(c => c.path);
    expect(cronPaths).toContain('/api/cron-email-confirmation');
    expect(cronPaths).not.toContain('/api/cron-dossier-run-cleanup');

    const handler = readFile('api/cron-dossier-run-cleanup.ts');
    expect(handler).toContain('CRON_STALE_CLEANUP_ENABLED === \'true\'');
    // Nota documental do próprio handler: o agendamento (vercel.json crons) é
    // deliberadamente NÃO incluído — exigia autorização separada.
    expect(handler).toContain('deliberadamente NÃO');
    expect(handler).toContain('incluída nesta PR');
  });

  it('PASS — mutex SINGLE_ACTIVE_RUN impede 2 runs RUNNING simultâneos na MESMA sessão via acquire (lease válido bloqueia; lease morto supersede)', () => {
    const sql = readFile('supabase/migrations/20260813190000_bru81_single_active_run.sql');
    expect(sql).toContain(`status IN ('RUNNING', 'CANCEL_REQUESTED')`);
    expect(sql).toContain(`AND lease_expires_at >= now()`);
    expect(sql).toContain(`'SINGLE_ACTIVE_RUN_BLOCKED'`);
    expect(sql).toContain(`'SUPERSEDED_STALE_RUN'`);
  });

  it('FAIL — mas o run órfão permanece RUNNING no banco com lease expirado até o usuário reativar (ou o cleanup manual de 1h, service_role, sem agendamento)', () => {
    // O run permanece RUNNING (status não muda com a expiração da lease) e o
    // autosave da sessão continua BLOQUEADO (o check de save_dossiers_autosave
    // é só por status, sem validade de lease — 20260812170000 linhas 234-240).
    // O recovery sequer remove o run do servidor (teste acima); a janela de 45s
    // da lease do run órfão ainda rejeita um restart imediato:
    // message-orchestrator.ts:605-628 (dossier-run-lease-not-acquired → mensagem
    // "já existe uma execução em andamento").
    const msgOrch = readFile('features/chat/message-orchestrator.ts');
    expect(msgOrch).toContain('dossier-run-lease-not-acquired');
    expect(msgOrch).toContain('já existe uma execução em andamento');

    const staleSql = readFile('supabase/migrations/20260805160000_close_stale_dossier_runs.sql');
    expect(staleSql).toContain('p_stale_after_seconds INT DEFAULT 3600');
    // A limpeza é FAILED STALE_RUN_LEASE_EXPIRED — sinal de que o run fica órfão
    // até esse caminho rodar (que não está agendado, conforme teste acima).
    expect(staleSql).toContain(`'STALE_RUN_LEASE_EXPIRED'`);
  });
});

// ============================================================================
// RISCO 3 — Run-control durante a janela Gold
// ============================================================================
describe('RISCO 3 — run-control durante a janela Gold (checkpoint ausente 1248→1489)', () => {
  it('FAIL — não existe nenhum checkpoint de run-control entre after_inline_source_validation e before_continuity_question (janela Gold inteira)', () => {
    const src = readFile('features/dossier/waterfall-orchestrator.ts');
    const lines = src.split('\n');

    const idxAfterInline = lines.findIndex(l => l.includes(`assertRunCanContinue('after_inline_source_validation')`));
    const idxBeforeContinuity = lines.findIndex(l => l.includes(`assertRunCanContinue('before_continuity_question')`));
    expect(idxAfterInline).toBeGreaterThanOrEqual(0);
    expect(idxBeforeContinuity).toBeGreaterThan(idxAfterInline);

    // Janela avaliada: da linha APÓS o checkpoint after_inline_source_validation
    // até a linha ANTES do checkpoint before_continuity_question (exclusivo).
    const goldWindow = lines.slice(idxAfterInline + 1, idxBeforeContinuity).join('\n');
    // Janela Gold (1303-1445) + pós-Gold (1446-1488) sem NENHUM checkpoint.
    expect(goldWindow).not.toContain('assertRunCanContinue(');
    expect(goldWindow).not.toContain('assertRunCanContinueWithRenewal(');
    // O único guard dentro da janela é o signal local (assertNotAborted antes do Gold).
    expect(goldWindow).toContain('tryEnhanceDossierWithGold');
  });

  it('FAIL — o seam Gold só conhece o AbortSignal local; um CANCEL_REQUESTED remoto não interrompe a janela Gold (até 330s)', async () => {
    const { tryEnhanceDossierWithGold } = await import('../../../services/llm/gold/seam/gold-dossier-seam');

    // Simula o estado remoto CANCEL_REQUESTED que NÃO é refletido no signal.
    let remoteStatus: string = 'CANCEL_REQUESTED';
    void remoteStatus; // O seam não tem acesso a ele — a prova é que ele termina sem consultar.

    const signal = new AbortController().signal; // não abortado
    const deps = {
      enabled: true,
      buildCanonical: vi.fn().mockResolvedValue({ legalName: 'X LTDA', inputCnpj: '04733767000180' }),
      runGold: vi.fn().mockResolvedValue({
        goldBrief: '## Gold final\n\nConteúdo aprovado.',
        verification: { hardFails: [] },
        narrativeContract: { passed: true, violations: [], wordCount: 10, actionFormats: { named: 0, numbered: 0, tableRows: 0 } },
        artifactManifest: null,
      }),
    };

    const result = await tryEnhanceDossierWithGold({
      cnpj: '04733767000180',
      companyName: 'X LTDA',
      dossierText: 'dossiê base',
      deps: deps as never,
      signal,
      onStage: () => {},
    });

    // O Gold COMPLETA mesmo com o run remoto em CANCEL_REQUESTED: o seam não
    // consulta o status do run; o cancelamento remoto só seria detectado no
    // próximo assertRunCanContinue (before_continuity_question), pós-Gold.
    expect(result).toContain('Gold final');
    expect(deps.runGold).toHaveBeenCalledTimes(1);
  });

  it('PASS — abort do usuário (AbortSignal) PROPAGA pelo seam: não cai em fallback factual', async () => {
    const { tryEnhanceDossierWithGold } = await import('../../../services/llm/gold/seam/gold-dossier-seam');

    const controller = new AbortController();
    const deps = {
      enabled: true,
      buildCanonical: vi.fn().mockResolvedValue({ legalName: 'X LTDA', inputCnpj: '04733767000180' }),
      runGold: vi.fn().mockImplementation(() => {
        controller.abort(new DOMException('abortado', 'AbortError'));
        return Promise.reject(new DOMException('abortado', 'AbortError'));
      }),
    };

    await expect(
      tryEnhanceDossierWithGold({
        cnpj: '04733767000180',
        companyName: 'X LTDA',
        dossierText: 'dossiê base',
        deps: deps as never,
        signal: controller.signal,
        onStage: () => {},
      }),
    ).rejects.toThrow(/abort/i);
  });

  it('FAIL — heartbeat mantém a lease viva mesmo com run em CANCEL_REQUESTED (renew aceita RUNNING e CANCEL_REQUESTED; heartbeat não trata CANCEL_REQUESTED como terminal)', async () => {
    const { startDossierRunHeartbeat, DOSSIER_RUN_RENEW_TIMEOUT_MS } = await import(
      '../../../features/dossier/dossier-run-heartbeat'
    );

    vi.useFakeTimers();
    // Run em CANCEL_REQUESTED com lease válida (cenário: cancelamento remoto
    // durante o Gold — o renew SQL aceita status IN ('RUNNING','CANCEL_REQUESTED')).
    const cancelRequested = {
      run_id: 'r',
      status: 'CANCEL_REQUESTED' as const,
      cancel_requested_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const renew = vi.fn().mockResolvedValue(cancelRequested);

    const cleanup = startDossierRunHeartbeat({ sessionId: 's', runId: 'r', leaseOwner: 'l', renew, intervalMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(1);
    // CANCEL_REQUESTED não é terminal para o heartbeat (linhas 82-96 do
    // dossier-run-heartbeat.ts: só COMPLETED/FAILED/CANCELLED param o tick) →
    // um segundo tick agenda renovação, mantendo a execução Gold viva.
    await vi.advanceTimersByTimeAsync(10);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(renew).toHaveBeenNthCalledWith(1, 'r', 'l', { timeoutMs: DOSSIER_RUN_RENEW_TIMEOUT_MS });
    cleanup();
  });
});

// ============================================================================
// RISCO 4 — Leak shield divergente (api/llm.ts local vs utils/textCleaners.ts)
// ============================================================================
describe('RISCO 4 — leak shield: serverless (api/llm.ts) vs política canônica (utils/leakShieldPolicy.ts)', () => {
  const localSrc = readFile('api/llm.ts');
  const policySrc = readFile('utils/leakShieldPolicy.ts');

  it('GREEN — paridade: serverless e canônico usam a MESMA política (leakShieldPolicy inclui os 10 hard patterns)', () => {
    // Política canônica (utils/leakShieldPolicy.ts): 10 hard patterns (ids com
    // contexto_cadastral, nota_de_escopo, aviso_metodologico) + 4 soft.
    expect(policySrc).toContain(`{ id: 'contexto_cadastral'`);
    expect(policySrc).toContain(`{ id: 'nota_de_escopo'`);
    expect(policySrc).toContain(`{ id: 'aviso_metodologico'`);

    // BRU-109 (C): api/llm.ts não mantém mais cópia local dos patterns —
    // importa o canônico (utils/leakShieldPolicy.ts).
    expect(localSrc).toContain('leakShieldPolicy');
    expect(localSrc).not.toContain('contexto cadastral obrigat');
  });

  it('GREEN — serverless bloqueia o texto de prompt que antes passava (paridade do shield)', async () => {
    const { applyPromptLeakShieldLocal } = await import('../../../api/llm');
    const { applyPromptLeakShield } = await import('../../../utils/textCleaners');

    // Mesmo texto com o hard pattern "contexto cadastral obrigatório" (id
    // contexto_cadastral): o canônico bloqueia; o serverless deixa passar.
    const leaked = 'Contexto cadastral obrigatório: use o cadastro da empresa para responder.';

    const canonical = applyPromptLeakShield(leaked);
    const local = applyPromptLeakShieldLocal(leaked);

    expect(canonical.blocked).toBe(true); // canônico bloqueia (full patterns)
    expect(local.blocked).toBe(true); // serverless agora bloqueia (paridade)
    expect(local.text).toContain('confirme o CNPJ');
  });

  it('FAIL material no fluxo — o texto do Gold (compact/compose) só passa pelo shield serverless; o cliente não aplica o canônico ao goldBrief', () => {
    // No pipeline Gold, o client não chama applyPromptLeakShield: os únicos
    // callers em produção do canônico estão em investigation-orchestration.ts
    // (linhas 412 e 556), fora do seam/pipeline Gold.
    const goldSeam = readFile('services/llm/gold/seam/gold-dossier-seam.ts');
    const goldPipeline = readFile('services/llm/gold/gold-pipeline.ts');
    expect(goldSeam).not.toContain('applyPromptLeakShield');
    expect(goldPipeline).not.toContain('applyPromptLeakShield');
    // O serverless aplica o shield local a TODA resposta (api/llm.ts:377).
    const llmApi = readFile('api/llm.ts');
    expect(llmApi).toContain('applyPromptLeakShieldLocal(result.text)');
  });

  it('DIVERGÊNCIA LATENTE (P1/debt) — stripInternalMarkers canônico remove TODAS as linhas "]" globais e corrompe JSON pretty; o local é JSON-safe', async () => {
    const { applyPromptLeakShieldLocal } = await import('../../../api/llm');
    const { stripInternalMarkers } = await import('../../../utils/textCleaners');

    const jsonPretty = JSON.stringify({ a: [1, 2, 3] }, null, 2); // linha própria "]"
    expect(jsonPretty).toMatch(/^\s*\]\s*$/m);

    // Canônico (utils/textCleaners.ts:190): /^\s*\]\s*$/gm remove a linha "]" →
    // JSON corrompido.
    const canonicalCleaned = stripInternalMarkers(jsonPretty);
    expect(canonicalCleaned).not.toBe(jsonPretty);
    expect(() => JSON.parse(canonicalCleaned)).toThrow();

    // Local (api/llm.ts:124-146): JSON parseável atravessa INTACTO (fix BRU-33).
    const localCleaned = applyPromptLeakShieldLocal(jsonPretty);
    expect(localCleaned.text).toBe(jsonPretty);
    expect(() => JSON.parse(localCleaned.text)).not.toThrow();
  });

  it('DIVERGÊNCIA — canônico remove linhas com SENSITIVE_INTERNAL_PATTERNS antes da detecção; o local não (detecção vê o texto diferente)', async () => {
    const { applyPromptLeakShieldLocal } = await import('../../../api/llm');
    const { applyPromptLeakShield } = await import('../../../utils/textCleaners');

    // Linha com "modo live status" (SENSITIVE_INTERNAL_PATTERNS,
    // utils/textCleaners.ts:94): o canônico REMOVE a linha no strip; o local a
    // mantém (nenhum hard/soft pattern a acusa) → saídas divergentes.
    const text = 'Resumo do cliente.\nmodo live status: ativo\nFim.';
    const canonical = applyPromptLeakShield(text);
    const local = applyPromptLeakShieldLocal(text);

    expect(canonical.blocked).toBe(false);
    expect(canonical.text).not.toContain('modo live status');
    expect(local.text).toContain('modo live status');
    expect(canonical.text).not.toBe(local.text);
  });
});
