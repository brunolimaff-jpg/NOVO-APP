import { describe, expect, it } from 'vitest';
import { runCanonicalPipelineProof } from '../../../scripts/proofs/dossier-300s-runtime/pipeline-harness';
import {
  APPLICATION_DEADLINE_MS,
  EXTERNAL_CALL_CUTOFF_MS,
  FINALIZATION_RESERVE_MS,
  PLATFORM_HARD_CAP_MS,
  acceptResponse,
  abortRequest,
  acquireLease,
  assertNoOrphanLease,
  canStartExternalCall,
  childTimeoutBoundedByRemainingBudget,
  createBudgetState,
  createVirtualClock,
  markPersistence,
  recordStage,
  releaseLease,
  sanitizeLogPayload,
} from '../../../scripts/proofs/dossier-300s-runtime/budget-model';

describe('05E.0A — modelo local de runtime 300s', () => {
  it('congela hard cap, application deadline e reserva de finalização', () => {
    expect(PLATFORM_HARD_CAP_MS).toBe(300_000);
    expect(APPLICATION_DEADLINE_MS).toBe(270_000);
    expect(FINALIZATION_RESERVE_MS).toBe(30_000);
    expect(EXTERNAL_CALL_CUTOFF_MS).toBe(240_000);
  });

  it.each([20_000, 50_000, 120_000])('aceita chamada sintética de %ims com orçamento agregado', latencyMs => {
    const state = createBudgetState();
    const event = recordStage(state, {
      name: `provider-${latencyMs}`,
      kind: 'external',
      expectedMs: latencyMs,
      hardTimeoutMs: latencyMs,
      retryBudgetMs: 0,
      bodyReadMs: 0,
    });
    expect(event.status).toBe('COMPLETED');
    expect(event.endedAtMs).toBe(latencyMs);
    expect(event.remainingFinalizationReserveMs).toBe(EXTERNAL_CALL_CUTOFF_MS - latencyMs);
  });

  it('aceita caminho serial que termina antes de 240s e preserva 30s', () => {
    const state = createBudgetState();
    for (let index = 0; index < 3; index += 1) {
      expect(
        recordStage(state, {
          name: `serial-${index + 1}`,
          kind: 'external',
          expectedMs: 80_000,
          hardTimeoutMs: 80_000,
          retryBudgetMs: 0,
          bodyReadMs: 0,
        }).status,
      ).toBe('COMPLETED');
    }
    expect(state.clock.now()).toBe(240_000);
    expect(canStartExternalCall(1, state.clock.now())).toBe(false);
    expect(childTimeoutBoundedByRemainingBudget(10_000, 239_000)).toBe(1_000);
  });

  it('recusa nova chamada quando o application deadline foi alcançado', () => {
    const state = createBudgetState();
    state.clock.advance(APPLICATION_DEADLINE_MS);
    const event = recordStage(state, {
      name: 'provider-after-deadline',
      kind: 'external',
      expectedMs: 1,
      hardTimeoutMs: 1,
      retryBudgetMs: 0,
      bodyReadMs: 0,
    });
    expect(event.status).toBe('REJECTED_NO_BUDGET');
    expect(state.completed).toBe(false);
  });

  it('inclui body-read no orçamento e não aceita headers rápidos com body lento', () => {
    const state = createBudgetState();
    state.clock.advance(239_000);
    const event = recordStage(state, {
      name: 'headers-before-body-after-cutoff',
      kind: 'external',
      expectedMs: 500,
      hardTimeoutMs: 500,
      retryBudgetMs: 0,
      bodyReadMs: 1_000,
    });
    expect(event.status).toBe('REJECTED_NO_BUDGET');
    expect(event.endedAtMs).toBe(239_000);
  });

  it('bloqueia retry cujo agregado não cabe no orçamento restante', () => {
    const state = createBudgetState();
    state.clock.advance(230_000);
    const event = recordStage(state, {
      name: 'retry-aggregate-cap',
      kind: 'external',
      expectedMs: 5_000,
      hardTimeoutMs: 5_000,
      retryBudgetMs: 10_000,
      bodyReadMs: 0,
    });
    expect(event.status).toBe('REJECTED_NO_BUDGET');
    expect(state.clock.now()).toBe(230_000);
  });

  it('modela lote paralelo pela duração do maior item, sem inventar paralelismo no caminho errado', () => {
    const batchDurations = [200, 350, 500, 100];
    const parallelBatchMs = Math.max(...batchDurations);
    expect(parallelBatchMs).toBe(500);
    expect(batchDurations.reduce((sum, value) => sum + value, 0)).toBe(1_150);
  });

  it('propaga cancelamento durante provider e libera lease', () => {
    const state = createBudgetState();
    acquireLease(state);
    state.clock.advance(20_000);
    abortRequest(state);
    expect(state.aborted).toBe(true);
    expect(state.completed).toBe(false);
    expect(assertNoOrphanLease(state)).toBe(true);
  });

  it('propaga cancelamento durante persistência e não marca COMPLETED', () => {
    const state = createBudgetState();
    acquireLease(state);
    state.clock.advance(220_000);
    abortRequest(state);
    expect(state.persistenceConfirmed).toBe(false);
    expect(state.completed).toBe(false);
    expect(state.leaseReleased).toBe(true);
  });

  it('protege a reserva contra persistência lenta', () => {
    const state = createBudgetState();
    state.clock.advance(260_000);
    const event = recordStage(state, {
      name: 'slow-persistence',
      kind: 'finalization',
      expectedMs: 15_000,
      hardTimeoutMs: 15_000,
      retryBudgetMs: 0,
      bodyReadMs: 0,
    });
    expect(event.status).toBe('REJECTED_NO_BUDGET');
    expect(state.completed).toBe(false);
  });

  it('reconcilia conclusão ambígua sem declarar COMPLETED', () => {
    const state = createBudgetState();
    acquireLease(state);
    markPersistence(state, 'UNKNOWN');
    releaseLease(state);
    expect(state.reconciled).toBe(true);
    expect(state.completed).toBe(false);
    expect(assertNoOrphanLease(state)).toBe(true);
  });

  it('não deixa lease órfã ao atingir o deadline e rejeita resposta posterior', () => {
    const state = createBudgetState();
    acquireLease(state);
    state.clock.advance(APPLICATION_DEADLINE_MS);
    abortRequest(state);
    markPersistence(state, 'CONFIRMED');
    state.clock.advance(1);
    expect(acceptResponse(state)).toBe(false);
    expect(assertNoOrphanLease(state)).toBe(true);
  });

  it('remove prompt, conteúdo, token e segredo dos logs sintéticos', () => {
    const safe = sanitizeLogPayload({
      stage: 'finalization',
      prompt: 'não deve aparecer',
      content: 'não deve aparecer',
      tokenCount: 42,
      secret: 'não deve aparecer',
      remainingMs: 123,
    });
    expect(safe).toEqual({ stage: 'finalization', remainingMs: 123 });
  });

  it('exercita diretamente o helper canônico com adapters locais e sem dependências do cliente', async () => {
    const proof = await runCanonicalPipelineProof(createVirtualClock());
    expect(proof.outputStatus).toBe('COMPLETED');
    expect(proof.providerCalls.map(call => call.stage)).toEqual([
      'modulo_teia_identity',
      'modulo_teia_deep',
      'modulo_operacao',
      'modulo_tech',
      'modulo_riscos',
      'modulo_venda',
      'evidence_planner',
      'final_consolidation',
    ]);
    expect(proof.providerCalls).toHaveLength(8);
    expect(proof.searchCalls).toHaveLength(12);
    expect(proof.benchmarkCalls).toBe(1);
    expect(proof.clientDependenciesUsed).toEqual([]);
    expect(proof.terminalPersistenceAttempted).toBe(false);
    expect(proof.virtualDurationMs).toBeLessThan(50_000);
  });

  it('expõe que recovery PORTA/retry não está no helper canônico, sem escondê-lo no resultado', async () => {
    const proof = await runCanonicalPipelineProof(createVirtualClock());
    const stageNames = proof.stages.map(stage => stage.name);
    expect(stageNames.some(name => /retry|reconcil|porta/i.test(name))).toBe(false);
  });
});
