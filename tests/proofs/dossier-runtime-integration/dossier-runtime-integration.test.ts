import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DOSSIER_RUNTIME_LIMITS,
  runDossierRuntime,
  type DossierRuntimeDependencies,
} from '../../../api/_dossier-runtime-orchestrator';
import { DOSSIER_SERVER_PIPELINE_VERSION, type DossierServerPipelineOutput } from '../../../api/_dossier-server-pipeline';
import type { DossierRunRpcCaller, DossierRunRpcName } from '../../../api/_dossier-run-rpc';

vi.mock('../../../api/_dossier-llm-gateway.js', () => ({
  runDossierGateway: vi.fn(async () => ({
    text: 'proof llm output',
    usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
    finishReason: 'stop',
  })),
}));

const RUN_ID = '11111111-1111-4111-8111-111111111111';
type PipelineDeps = Parameters<NonNullable<DossierRuntimeDependencies['pipelineFactory']>>[0];

function output(): DossierServerPipelineOutput {
  return {
    version: DOSSIER_SERVER_PIPELINE_VERSION,
    runId: RUN_ID,
    companyName: 'Scheffer & CIA LTDA',
    text: 'Proof dossier',
    modulos: {},
    evidencePack: { items: [], confidenceProfile: { totalUrls: 0, uniqueUrls: 0, tierACount: 0, tierBCount: 0, tierCCount: 0, tierDCount: 0, modulesCovered: [] }, collectedAt: '2026-08-02T00:00:00.000Z' },
    evidencePackStatus: 'COMPLETED',
    benchmark: '',
    benchmarkStatus: 'UNAVAILABLE',
    fontes: [],
    categoryStatuses: [],
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    finishReason: 'stop',
    stages: [],
    runtimeBudget: { runtimeBudgetMs: 55_000, estimatedWorstCaseMs: 49_000, llmStageCount: 8, llmStageTimeoutMs: 5_000, evidenceCollectionTimeoutMs: 5_000, benchmarkTimeoutMs: 3_000, reconciliationMarginMs: 2_000, status: 'SUFFICIENT' },
    terminalPersistenceAttempted: false,
    clientDependenciesUsed: [],
  };
}

describe('05E.0B runtime integration proof', () => {
  it('prova o grafo vertical server-owned sem rede ou lifecycle legado', async () => {
    const graph: string[] = [];
    const rpcMock = vi.fn(async (name: DossierRunRpcName, body: Record<string, unknown>): Promise<unknown> => {
      graph.push(name);
      if (name === 'begin_dossier_run_attempt') return { run_id: RUN_ID, attempt_id: 'attempt-1', attempt_no: 1, fence_token: 'fence-1', pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION };
      if (name === 'get_dossier_run_resume_state') return { run_id: RUN_ID, pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION, checkpoints: [] };
      if (name === 'record_dossier_run_checkpoint') return { status: 'RECORDED', step_key: body.p_step_key };
      if (name === 'persist_and_complete_dossier_run_attempt') return { status: 'COMPLETED', run_id: RUN_ID, dossier_id: RUN_ID };
      throw new Error(`unexpected proof rpc ${name}`);
    });
    const pipelineFactory = vi.fn((deps: PipelineDeps) => async ({ signal }: { signal: AbortSignal }) => {
      await deps.llm?.({ stage: 'proof-stage', prompt: 'proof', context: 'context', runId: RUN_ID, correlationId: 'proof', signal, timeoutMs: 10 });
      await deps.searchEvidence?.('proof-query', signal);
      await deps.benchmark?.({ companyName: 'Scheffer & CIA LTDA', context: 'context', signal });
      return output();
    });

    const result = await runDossierRuntime(
      { url: 'https://example.supabase.co', token: 'token', anonKey: 'anon' },
      { runId: RUN_ID, companyName: 'Scheffer & CIA LTDA', context: 'context', correlationId: 'proof', signal: new AbortController().signal },
      {
        rpc: rpcMock as unknown as DossierRunRpcCaller,
        pipelineFactory,
        limits: { ...DOSSIER_RUNTIME_LIMITS, applicationDeadlineMs: 1_000, externalCallCutoffMs: 800, finalizationReserveMs: 100, heartbeatIntervalMs: 10_000 },
      },
    );

    expect(result.status).toBe('COMPLETED');
    expect(pipelineFactory).toHaveBeenCalledOnce();
    expect(graph).toEqual([
      'begin_dossier_run_attempt',
      'get_dossier_run_resume_state',
      'record_dossier_run_checkpoint',
      'record_dossier_run_checkpoint',
      'record_dossier_run_checkpoint',
      'persist_and_complete_dossier_run_attempt',
    ]);
    expect(graph).not.toContain('persist_and_complete_dossier_run');
    expect(graph).not.toContain('acquire_dossier_run_lease');
    expect(graph).not.toContain('release_dossier_run_lease');
  });

  it('mantém guard estático de runtime sem browser/storage e handler sem client owner', () => {
    const runtimeSource = readFileSync('api/_dossier-runtime-orchestrator.ts', 'utf8');
    const handlerSource = readFileSync('api/dossier.ts', 'utf8');
    expect(runtimeSource).not.toMatch(/localStorage|indexedDB|idb-keyval|window\.|document\.|services\/storage|features\/dossier|waterfall-orchestrator/);
    expect(handlerSource).not.toMatch(/p_operator_id|leaseOwner|acquire_dossier_run_lease|release_dossier_run_lease|persist_and_complete_dossier_run\b/);
  });
});
