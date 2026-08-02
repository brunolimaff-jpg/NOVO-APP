import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DOSSIER_RUNTIME_LIMITS,
  runDossierRuntime,
  type DossierRuntimeDependencies,
} from '../../api/_dossier-runtime-orchestrator';
import { DOSSIER_SERVER_PIPELINE_VERSION, DossierServerPipelineError, type DossierServerPipelineOutput } from '../../api/_dossier-server-pipeline';
import type { DossierRunRpcCaller, DossierRunRpcName } from '../../api/_dossier-run-rpc';

vi.mock('../../api/_dossier-llm-gateway.js', () => ({
  runDossierGateway: vi.fn(async () => ({
    text: 'LLM stage output',
    usage: { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 5 },
    finishReason: 'stop',
  })),
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const AUTH = { url: 'https://example.supabase.co', token: 'token', anonKey: 'anon' };
type PipelineFactoryDependencies = Parameters<NonNullable<DossierRuntimeDependencies['pipelineFactory']>>[0];

function output(): DossierServerPipelineOutput {
  return {
    version: DOSSIER_SERVER_PIPELINE_VERSION,
    runId: RUN_ID,
    companyName: 'Scheffer & CIA LTDA',
    cnpj: '04733767000180',
    text: 'Dossiê server-owned de teste.',
    modulos: {},
    evidencePack: {
      items: [],
      confidenceProfile: { totalUrls: 0, uniqueUrls: 0, tierACount: 0, tierBCount: 0, tierCCount: 0, tierDCount: 0, modulesCovered: [] },
      collectedAt: '2026-08-02T00:00:00.000Z',
    },
    evidencePackStatus: 'COMPLETED',
    benchmark: '',
    benchmarkStatus: 'UNAVAILABLE',
    fontes: [],
    categoryStatuses: [],
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    finishReason: 'stop',
    stages: [],
    runtimeBudget: {
      runtimeBudgetMs: 55_000,
      estimatedWorstCaseMs: 49_000,
      llmStageCount: 8,
      llmStageTimeoutMs: 5_000,
      evidenceCollectionTimeoutMs: 5_000,
      benchmarkTimeoutMs: 3_000,
      reconciliationMarginMs: 2_000,
      status: 'SUFFICIENT',
    },
    terminalPersistenceAttempted: false,
    clientDependenciesUsed: [],
  };
}

function limits(overrides: Partial<typeof DOSSIER_RUNTIME_LIMITS> = {}) {
  return {
    ...DOSSIER_RUNTIME_LIMITS,
    applicationDeadlineMs: 1_000,
    externalCallCutoffMs: 800,
    finalizationReserveMs: 100,
    retryBackoffMs: 1,
    maxAggregateRetryBudgetMs: 100,
    retryWorkloadBudgetMs: 100,
    heartbeatIntervalMs: 10_000,
    heartbeatRpcTimeoutMs: 20,
    finalizationRpcTimeoutMs: 50,
    ...overrides,
  };
}

type RpcTrace = { name: DossierRunRpcName; body: Record<string, unknown>; signal: AbortSignal };

function rpcHarness(options: {
  attemptBodies?: Array<{ attempt_id: string; attempt_no: number; fence_token: string }>;
  resume?: () => unknown;
  onCall?: (name: DossierRunRpcName, body: Record<string, unknown>) => unknown;
} = {}) {
  const traces: RpcTrace[] = [];
  const checkpoints: Record<string, unknown>[] = [];
  const attempts = options.attemptBodies ?? [
    { attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1' },
    { attempt_id: 'attempt-2', attempt_no: 2, fence_token: 'fence-2' },
  ];
  let beginCalls = 0;
  const rpcMock = vi.fn(async (name: DossierRunRpcName, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> => {
    traces.push({ name, body, signal });
    if (options.onCall) {
      const custom = options.onCall(name, body);
      if (custom !== undefined) return custom;
    }
    if (name === 'begin_dossier_run_attempt') {
      const attempt = attempts[Math.min(beginCalls++, attempts.length - 1)];
      return { run_id: RUN_ID, pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION, ...attempt };
    }
    if (name === 'get_dossier_run_resume_state') {
      return options.resume?.() ?? {
        run_id: RUN_ID,
        status: 'RUNNING',
        pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION,
        checkpoints,
      };
    }
    if (name === 'record_dossier_run_checkpoint') {
      checkpoints.push({
        checkpoint_id: `checkpoint-${checkpoints.length + 1}`,
        attempt_id: body.p_attempt_id,
        step_key: body.p_step_key,
        step_ordinal: body.p_step_ordinal,
        output_payload: body.p_output_payload,
      });
      return { status: 'RECORDED' };
    }
    if (name === 'schedule_dossier_run_retry') return { status: 'RETRY_SCHEDULED' };
    if (name === 'cancel_dossier_run_attempt') return { status: 'CANCELLED' };
    if (name === 'fail_dossier_run_attempt') return { status: 'FAILED' };
    if (name === 'persist_and_complete_dossier_run_attempt') return { status: 'COMPLETED', run_id: RUN_ID, dossier_id: RUN_ID };
    if (name === 'renew_dossier_run_attempt_lease') return { attempt_id: body.p_attempt_id, fence_token: body.p_fence_token };
    throw new Error(`unexpected RPC ${name}`);
  });
  const rpc = rpcMock as unknown as DossierRunRpcCaller;
  return { rpc, traces, checkpoints };
}

function runtimeInput(signal: AbortSignal) {
  return {
    runId: RUN_ID,
    companyName: 'Scheffer & CIA LTDA',
    cnpj: '04733767000180',
    context: '[DOSSIER_CONTEXT_VERSION:dossier-context.v1]\nEmpresa: Scheffer & CIA LTDA',
    correlationId: 'corr-runtime-test',
    signal,
  };
}

function helperFactory(run: () => Promise<void> | void = async () => undefined) {
  return vi.fn((dependencies: PipelineFactoryDependencies) => async (input: { signal: AbortSignal }) => {
    await dependencies.llm?.({
      stage: 'stage-a',
      prompt: 'prompt',
      context: 'context',
      runId: RUN_ID,
      correlationId: 'corr-runtime-test',
      signal: input.signal,
      timeoutMs: 10,
    });
    await dependencies.searchEvidence?.('query-a', input.signal);
    await dependencies.benchmark?.({ companyName: 'Scheffer & CIA LTDA', context: 'context', signal: input.signal });
    await run();
    return output();
  });
}

describe('server-owned dossier runtime orchestrator', () => {
  it('executa helper uma vez, usa tentativa/fence do RPC e persiste atomicamente no final', async () => {
    const harness = rpcHarness({ attemptBodies: [{ attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1' }] });
    const pipelineFactory = helperFactory();
    const result = await runDossierRuntime(AUTH, runtimeInput(new AbortController().signal), {
      rpc: harness.rpc,
      pipelineFactory,
      limits: limits(),
    });

    expect(result).toMatchObject({ runId: RUN_ID, dossierId: RUN_ID, status: 'COMPLETED', attemptNo: 1 });
    expect(pipelineFactory).toHaveBeenCalledOnce();
    expect(harness.traces.map(trace => trace.name)).toEqual([
      'begin_dossier_run_attempt',
      'get_dossier_run_resume_state',
      'record_dossier_run_checkpoint',
      'record_dossier_run_checkpoint',
      'record_dossier_run_checkpoint',
      'persist_and_complete_dossier_run_attempt',
    ]);
    expect(harness.traces.every(trace => !('p_operator_id' in trace.body))).toBe(true);
    expect(harness.traces.find(trace => trace.name === 'persist_and_complete_dossier_run_attempt')?.body).toMatchObject({
      p_attempt_id: 'attempt-1',
      p_fence_token: 'fence-1',
      p_run_id: RUN_ID,
    });
  });

  it('agenda retry por erro transitório, retoma checkpoint e não duplica chamada LLM concluída', async () => {
    const harness = rpcHarness({ attemptBodies: [
      { attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1' },
      { attempt_id: 'attempt-2', attempt_no: 2, fence_token: 'fence-2' },
    ] });
    let executions = 0;
    const pipelineFactory = helperFactory(async () => {
      executions += 1;
      if (executions === 1) throw new DossierServerPipelineError('SERVER_PIPELINE_STAGE_FAILED', 'transient', 'stage-a', true);
    });
    const sleep = vi.fn(async () => undefined);
    const result = await runDossierRuntime(AUTH, runtimeInput(new AbortController().signal), {
      rpc: harness.rpc,
      pipelineFactory,
      sleep,
      limits: limits(),
    });

    expect(result.attemptNo).toBe(2);
    expect(pipelineFactory).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    expect(harness.traces.map(trace => trace.name)).toContain('schedule_dossier_run_retry');
    expect(harness.traces.filter(trace => trace.name === 'persist_and_complete_dossier_run_attempt')).toHaveLength(1);
    const gatewayModule = await import('../../api/_dossier-llm-gateway');
    expect(gatewayModule.runDossierGateway).toHaveBeenCalledOnce();
  });

  it('cancela via RPC terminal independente do sinal da requisição e não persiste resultado', async () => {
    const controller = new AbortController();
    const harness = rpcHarness({ attemptBodies: [{ attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1' }] });
    const pipelineFactory = vi.fn((dependencies: PipelineFactoryDependencies) => async (input: { signal: AbortSignal }) => {
      controller.abort();
      await expect(Promise.resolve(dependencies.llm?.({
        stage: 'stage-a', prompt: 'prompt', context: 'context', runId: RUN_ID, correlationId: 'corr-runtime-test', signal: input.signal, timeoutMs: 10,
      }))).rejects.toBeDefined();
      throw new DossierServerPipelineError('SERVER_PIPELINE_CANCELLED', 'cancelled', 'stage-a', false);
    });

    await expect(runDossierRuntime(AUTH, runtimeInput(controller.signal), {
      rpc: harness.rpc,
      pipelineFactory,
      limits: limits(),
    })).rejects.toMatchObject({ code: 'RUN_CANCEL_REQUESTED', cancellationConfirmed: true });
    expect(harness.traces.map(trace => trace.name)).toContain('cancel_dossier_run_attempt');
    expect(harness.traces.map(trace => trace.name)).not.toContain('persist_and_complete_dossier_run_attempt');
  });

  it('finaliza falha não retentável e preserva o erro primário', async () => {
    const harness = rpcHarness({ attemptBodies: [{ attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1' }] });
    const pipelineFactory = vi.fn(() => async () => {
      throw new DossierServerPipelineError('SERVER_PIPELINE_STAGE_FAILED', 'invalid stage', 'stage-a', false);
    });

    await expect(runDossierRuntime(AUTH, runtimeInput(new AbortController().signal), {
      rpc: harness.rpc,
      pipelineFactory,
      limits: limits(),
    })).rejects.toMatchObject({ code: 'SERVER_PIPELINE_STAGE_FAILED', stage: 'stage-a' });
    expect(harness.traces.map(trace => trace.name)).toContain('fail_dossier_run_attempt');
    expect(harness.traces.map(trace => trace.name)).not.toContain('persist_and_complete_dossier_run_attempt');
  });

  it('mantém o call graph de generate sem lifecycle legado ou autoridade de cliente', () => {
    const source = readFileSync('api/_dossier-runtime-orchestrator.ts', 'utf8');
    expect(source).not.toMatch(/acquire_dossier_run_lease|release_dossier_run_lease|persist_and_complete_dossier_run\b|mark_dossier_run_cancelled|get_own_dossier_run|localStorage|indexedDB|window\.|document\./);
  });
});
