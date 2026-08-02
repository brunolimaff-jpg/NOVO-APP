import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  DossierPersistenceError,
  persistAndCompleteDossierRunAttempt,
  type PersistAndCompleteDossierAttemptInput,
} from '../../api/_dossier-persistence';
import { DOSSIER_SERVER_PIPELINE_VERSION, type DossierServerPipelineOutput } from '../../api/_dossier-server-pipeline';
import type { DossierRunRpcCaller, DossierRunRpcName } from '../../api/_dossier-run-rpc';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceContract } from '../../shared/dossierGatewayContracts';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_ID = 'attempt-1';
const FENCE_TOKEN = 'fence-1';
const AUTH = { url: 'https://example.supabase.co', token: 'user-token', anonKey: 'anon-key' };

function evidenceFixture(): DossierEvidenceContract {
  return {
    version: 'dossier-evidence.v1',
    categories: DOSSIER_EVIDENCE_CATEGORIES.map((category, index) => ({
      category,
      present: index < 2,
      itemCount: index < 2 ? 1 : 0,
      sourceCount: index === 0 ? 1 : 0,
    })),
    sanitizedContextDigest: `sha256:${'a'.repeat(64)}`,
  };
}

function pipelineOutput(overrides: Partial<DossierServerPipelineOutput> = {}): DossierServerPipelineOutput {
  return {
    version: DOSSIER_SERVER_PIPELINE_VERSION,
    runId: RUN_ID,
    companyName: 'Empresa Teste',
    cnpj: '12345678000195',
    text: 'Conteúdo persistível.',
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
    ...overrides,
  };
}

function input(overrides: Partial<PersistAndCompleteDossierAttemptInput> = {}): PersistAndCompleteDossierAttemptInput {
  return {
    runId: RUN_ID,
    attemptId: ATTEMPT_ID,
    fenceToken: FENCE_TOKEN,
    pipelineVersion: DOSSIER_SERVER_PIPELINE_VERSION,
    dossierId: RUN_ID,
    companyName: 'Empresa Teste',
    cnpj: '12345678000195',
    pipelineOutput: pipelineOutput(),
    ...overrides,
  };
}

function rpcHarness(response: unknown = { status: 'COMPLETED', run_id: RUN_ID, dossier_id: RUN_ID }) {
  const calls: Array<{ name: DossierRunRpcName; body: Record<string, unknown>; signal: AbortSignal }> = [];
  const mock = vi.fn(async (name: DossierRunRpcName, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> => {
    calls.push({ name, body, signal });
    return response;
  });
  return { rpc: mock as unknown as DossierRunRpcCaller, calls };
}

describe('persistência terminal do attempt server-owned', () => {
  it('chama exatamente a RPC atômica com attempt/fence e conteúdo canônico', async () => {
    const harness = rpcHarness();
    const result = await persistAndCompleteDossierRunAttempt(AUTH, input({ evidence: evidenceFixture() }), new AbortController().signal, harness.rpc);

    expect(result).toEqual({ runId: RUN_ID, dossierId: RUN_ID, status: 'COMPLETED' });
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.name).toBe('persist_and_complete_dossier_run_attempt');
    expect(harness.calls[0]?.body).toMatchObject({
      p_run_id: RUN_ID,
      p_attempt_id: ATTEMPT_ID,
      p_fence_token: FENCE_TOKEN,
      p_pipeline_version: DOSSIER_SERVER_PIPELINE_VERSION,
      p_dossier_id: RUN_ID,
      p_title: 'Empresa Teste',
      p_modo_principal: 'investigacao',
    });
    expect(harness.calls[0]?.body).not.toHaveProperty('p_operator_id');
    expect((harness.calls[0]?.body.p_content as { messages: Array<{ text: string }> }).messages[1]?.text).toContain('Conteúdo persistível.');
  });

  it('persiste somente metadados de evidência sanitizados', async () => {
    const harness = rpcHarness();
    const evidence = evidenceFixture();
    await persistAndCompleteDossierRunAttempt(AUTH, input({ evidence }), new AbortController().signal, harness.rpc);

    const persisted = (harness.calls[0]?.body.p_content as { evidence?: DossierEvidenceContract }).evidence;
    expect(persisted).toEqual(evidence);
    expect(JSON.stringify(harness.calls[0]?.body)).not.toContain('rawSourceText');
  });

  it('não chama a RPC quando o output tem versão divergente ou request já abortado', async () => {
    const versionHarness = rpcHarness();
    await expect(persistAndCompleteDossierRunAttempt(AUTH, input({ pipelineOutput: pipelineOutput({ version: 'other-version' as never }) }), new AbortController().signal, versionHarness.rpc)).rejects.toMatchObject({
      code: 'PIPELINE_VERSION_MISMATCH',
      retryable: false,
    });
    expect(versionHarness.calls).toHaveLength(0);

    const controller = new AbortController();
    controller.abort();
    const abortHarness = rpcHarness();
    await expect(persistAndCompleteDossierRunAttempt(AUTH, input(), controller.signal, abortHarness.rpc)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(abortHarness.calls).toHaveLength(0);
  });

  it('mapeia erro RPC e não expõe detalhes do upstream', async () => {
    const harness = rpcHarness();
    const error = new Error('secret upstream token');
    const rpcError = Object.assign(error, { code: 'PERSISTENCE_FAILED', retryable: true, status: 503, stage: 'persistence' });
    const failingRpc: DossierRunRpcCaller = vi.fn(async () => { throw rpcError; });

    await expect(persistAndCompleteDossierRunAttempt(AUTH, input(), new AbortController().signal, failingRpc)).rejects.toSatisfy((value: unknown) => {
      expect(value).toBeInstanceOf(DossierPersistenceError);
      expect((value as Error).message).not.toContain('secret upstream token');
      return (value as DossierPersistenceError).code === 'PERSISTENCE_FAILED';
    });
    expect(harness.calls).toHaveLength(0);
  });

  it('rejeita resposta terminal que não confirma COMPLETED/identidade', async () => {
    const harness = rpcHarness({ status: 'RUNNING', run_id: RUN_ID, dossier_id: RUN_ID });
    await expect(persistAndCompleteDossierRunAttempt(AUTH, input(), new AbortController().signal, harness.rpc)).rejects.toMatchObject({
      code: 'PERSISTENCE_FAILED',
      retryable: true,
    });
  });

  it('mantém o endpoint sem lifecycle legado no caminho generate', () => {
    const source = readFileSync('api/dossier.ts', 'utf8');
    expect(source).not.toMatch(/acquire_dossier_run_lease|release_dossier_run_lease|persist_and_complete_dossier_run\b|mark_dossier_run_cancelled|fail_dossier_run\b/);
    expect(source).toContain('runDossierRuntime');
  });
});
