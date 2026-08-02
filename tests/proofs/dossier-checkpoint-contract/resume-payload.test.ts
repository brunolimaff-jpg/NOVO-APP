import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  createDossierServerPipeline,
  DOSSIER_SERVER_PIPELINE_VERSION,
  type DossierServerPipelineOutput,
} from '../../../api/_dossier-server-pipeline';
import { DOSSIER_EVIDENCE_CATEGORIES, type DossierEvidenceContract } from '../../../shared/dossierGatewayContracts';

const PG_BIN = process.env.R1_PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin/psql';
const PG_SOCKET = process.env.R1_PG_SOCKET ?? '';
const PG_PORT = process.env.R1_PG_PORT ?? '';
const PG_DATABASE = process.env.R1_PG_DATABASE ?? '';
const OWNER_ID = process.env.R1_OWNER_ID ?? '11111111-1111-1111-1111-111111111111';
const RUN_NAMESPACE = process.env.R1_RUN_NAMESPACE ?? 'focused';
const FIXED_NOW = 1_725_000_000_000;

if (!PG_SOCKET || !PG_PORT || !PG_DATABASE) {
  throw new Error('R1_PG_SOCKET, R1_PG_PORT e R1_PG_DATABASE são obrigatórios');
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psql(sql: string, allowFailure = false): string {
  try {
    const output = execFileSync(
      PG_BIN,
      ['-X', '-h', PG_SOCKET, '-p', PG_PORT, '-d', PG_DATABASE, '-At', '-v', 'ON_ERROR_STOP=1', '-c', [
        `DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub', ${sqlLiteral(OWNER_ID)}, false); END $$;`,
        sql,
      ].join('\n')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
    return output.split(/\r?\n/).filter(Boolean).at(-1) ?? '';
  } catch (error) {
    if (allowFailure) {
      const stderr = error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr ?? '') : '';
      throw new Error(stderr || (error instanceof Error ? error.message : String(error)), { cause: error });
    }
    throw error;
  }
}

type AttemptIdentity = { attemptId: string; fenceToken: string };
type ResumeState = {
  pipeline_version: string;
  checkpoints: Array<{ step_key: string; step_ordinal: number; output_payload: { stage: string; output: string; conditional: boolean } }>;
  checkpoint_count: number;
};

function seedRun(runId: string): AttemptIdentity {
  psql(`
    INSERT INTO auth.users (id, email)
    VALUES (${sqlLiteral(OWNER_ID)}::uuid, 'r1-owner@example.test')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.profiles (id, operator_id, email, name)
    VALUES (${sqlLiteral(OWNER_ID)}::uuid, 'r1-owner', 'r1-owner@example.test', 'R1 Owner')
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.dossier_runs (run_id, owner_id, operator_id, status, idempotency_key, environment, app_version)
    VALUES (${sqlLiteral(runId)}::uuid, ${sqlLiteral(OWNER_ID)}::uuid, 'r1-owner', 'PENDING', ${sqlLiteral(`r1-${runId}`)}, 'test', 'r1')
    ON CONFLICT (run_id) DO NOTHING;
  `);
  const raw = psql(`SELECT (payload->>'attempt_id') || '|' || (payload->>'fence_token') FROM (SELECT public.begin_dossier_run_attempt(${sqlLiteral(runId)}::uuid, ${sqlLiteral(DOSSIER_SERVER_PIPELINE_VERSION)}, 120) AS payload) AS q;`).split(/\r?\n/).filter(Boolean).at(-1) ?? '';
  const [attemptId, fenceToken] = raw.split('|');
  if (!attemptId || !fenceToken) throw new Error(`attempt inválida: ${raw}`);
  return { attemptId, fenceToken };
}

function recordCheckpoint(runId: string, identity: AttemptIdentity, conditional: boolean, output: string): void {
  psql(`
    SELECT public.record_dossier_run_checkpoint(
      ${sqlLiteral(runId)}::uuid,
      ${sqlLiteral(identity.attemptId)}::uuid,
      ${sqlLiteral(identity.fenceToken)}::uuid,
      ${sqlLiteral(DOSSIER_SERVER_PIPELINE_VERSION)},
      'modulo_teia_identity',
      0,
      jsonb_build_object('stage', 'modulo_teia_identity', 'output', ${sqlLiteral(output)}, 'conditional', ${conditional})
    );
  `);
}

function loadResumeState(runId: string): ResumeState {
  const raw = psql(`SELECT public.get_dossier_run_resume_state(${sqlLiteral(runId)}::uuid, ${sqlLiteral(DOSSIER_SERVER_PIPELINE_VERSION)});`);
  const state = JSON.parse(raw) as ResumeState;
  expect(state.pipeline_version).toBe(DOSSIER_SERVER_PIPELINE_VERSION);
  expect(state.checkpoint_count).toBe(1);
  expect(state.checkpoints[0]?.step_key).toBe('modulo_teia_identity');
  expect(Buffer.byteLength(JSON.stringify(state.checkpoints[0]?.output_payload ?? {}), 'utf8')).toBeLessThan(1_048_576);
  return state;
}

function expectPipelineVersionMismatch(runId: string): void {
  expect(() => psql(`SELECT public.get_dossier_run_resume_state(${sqlLiteral(runId)}::uuid, 'dossier-server-pipeline.incompatible');`, true))
    .toThrow(/PIPELINE_VERSION_MISMATCH/);
}

function evidenceFixture(): DossierEvidenceContract {
  return {
    version: 'dossier-evidence.v1',
    categories: DOSSIER_EVIDENCE_CATEGORIES.map((category, index) => ({
      category,
      present: true,
      itemCount: index + 1,
      sourceCount: index === 1 ? 1 : 0,
    })),
  };
}

function plannerResponse(): string {
  return JSON.stringify({
    queries: Array.from({ length: 12 }, (_, index) => ({
      id: `r1-q-${String(index + 1).padStart(2, '0')}`,
      query: `R1 fonte oficial ${index + 1}`,
      objective: index === 0 ? 'identity_resolution' : 'operational_footprint',
      module: index % 2 === 0 ? 'teia_identity' : 'inteligencia_operacional',
      priority: index < 4 ? 1 : 2,
      expectedSource: index < 4 ? 'A' : 'B',
      homonimRisk: 'baixo',
      rationale: 'Consulta sintética do fechamento de evidência.',
    })),
  });
}

function pipelineInput(runId: string, signal: AbortSignal, conditional: boolean) {
  return {
    runId,
    companyName: 'R1 Empresa Sintética',
    cnpj: '04733767000180',
    context: '[DOSSIER_CONTEXT_VERSION:dossier-context.v1]\nEmpresa: R1 Empresa Sintética\n[CNPJ confirmado no CRM]',
    ...(conditional ? { evidence: evidenceFixture() } : {}),
    correlationId: `r1-${runId}`,
    signal,
  };
}

function stageOutput(stage: string, conditional: boolean): string {
  return `r1-${conditional ? 'conditional' : 'base'}-${stage}`;
}

type RunResult = {
  output: DossierServerPipelineOutput;
  executedStages: string[];
  cachedStageReads: string[];
  searchCalls: number;
  benchmarkCalls: number;
};

async function runResumedScenario(runId: string, conditional: boolean, resume: ResumeState): Promise<RunResult> {
  const executedStages: string[] = [];
  const cachedStageReads: string[] = [];
  let searchCalls = 0;
  let benchmarkCalls = 0;
  const cached = resume.checkpoints[0]?.output_payload.output;
  const llm = async ({ stage }: { stage: string }) => {
    if (stage === 'modulo_teia_identity') {
      cachedStageReads.push(stage);
      return { text: cached ?? stageOutput(stage, conditional), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'cached-checkpoint' };
    }
    executedStages.push(stage);
    if (stage === 'evidence_planner' && conditional) return { text: plannerResponse(), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    if (stage === 'evidence_planner') return { text: 'not-json', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    return { text: stageOutput(stage, conditional), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
  };
  const pipeline = createDossierServerPipeline({
    llm,
    searchEvidence: async () => {
      searchCalls += 1;
      return [{ title: 'R1 fonte', url: 'https://www.gov.br/r1', snippet: 'R1 Empresa Sintética CNPJ 04733767000180 fonte oficial.', provider: 'gemini_grounding' as const }];
    },
    benchmark: async () => {
      benchmarkCalls += 1;
      return 'R1 benchmark sintético';
    },
    now: () => FIXED_NOW,
  });
  const output = await pipeline(pipelineInput(runId, new AbortController().signal, conditional));
  return { output, executedStages, cachedStageReads, searchCalls, benchmarkCalls };
}

async function runContinuousScenario(runId: string, conditional: boolean): Promise<RunResult> {
  const executedStages: string[] = [];
  let searchCalls = 0;
  let benchmarkCalls = 0;
  const llm = async ({ stage }: { stage: string }) => {
    executedStages.push(stage);
    if (stage === 'evidence_planner' && conditional) return { text: plannerResponse(), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    if (stage === 'evidence_planner') return { text: 'not-json', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    return { text: stageOutput(stage, conditional), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
  };
  const pipeline = createDossierServerPipeline({
    llm,
    searchEvidence: async () => {
      searchCalls += 1;
      return [{ title: 'R1 fonte', url: 'https://www.gov.br/r1', snippet: 'R1 Empresa Sintética CNPJ 04733767000180 fonte oficial.', provider: 'gemini_grounding' as const }];
    },
    benchmark: async () => {
      benchmarkCalls += 1;
      return 'R1 benchmark sintético';
    },
    now: () => FIXED_NOW,
  });
  const output = await pipeline(pipelineInput(runId, new AbortController().signal, conditional));
  return { output, executedStages, cachedStageReads: [], searchCalls, benchmarkCalls };
}

function semanticProjection(result: DossierServerPipelineOutput): unknown {
  return {
    version: result.version,
    companyName: result.companyName,
    cnpj: result.cnpj,
    text: result.text,
    modulos: result.modulos,
    evidencePack: {
      ...result.evidencePack,
      collectedAt: '<timestamp>',
      items: result.evidencePack.items.map(item => ({
        ...item,
        sourceResult: { ...item.sourceResult, retrievedAt: '<timestamp>' },
      })),
    },
    evidencePackStatus: result.evidencePackStatus,
    benchmark: result.benchmark,
    benchmarkStatus: result.benchmarkStatus,
    fontes: result.fontes,
    categoryStatuses: result.categoryStatuses,
    usage: result.usage,
    finishReason: result.finishReason,
    runtimeBudget: result.runtimeBudget,
  };
}

async function exerciseResumeScenario(conditional: boolean): Promise<void> {
  const runId = RUN_NAMESPACE === 'target-global'
    ? (conditional ? '11111111-1111-4111-8111-111111111114' : '11111111-1111-4111-8111-111111111115')
    : (conditional ? '11111111-1111-4111-8111-111111111112' : '11111111-1111-4111-8111-111111111113');
  const identity = seedRun(runId);
  const interruptedStages: string[] = [];
  const llm = async ({ stage }: { stage: string }) => {
    interruptedStages.push(stage);
    if (stage === 'modulo_teia_identity') {
      recordCheckpoint(runId, identity, conditional, stageOutput(stage, conditional));
      return { text: stageOutput(stage, conditional), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
    }
    if (stage === 'modulo_teia_deep') throw new Error('CONTROLLED_CRASH_AFTER_CHECKPOINT');
    return { text: stageOutput(stage, conditional), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' };
  };
  const interruptedPipeline = createDossierServerPipeline({ llm, now: () => FIXED_NOW });
  await expect(interruptedPipeline(pipelineInput(runId, new AbortController().signal, conditional))).rejects.toMatchObject({ code: 'SERVER_PIPELINE_STAGE_FAILED', stage: 'modulo_teia_deep' });
  expect(interruptedStages).toEqual(['modulo_teia_identity', 'modulo_teia_deep']);

  const resume = loadResumeState(runId);
  expect(resume.checkpoints[0]?.output_payload.conditional).toBe(conditional);
  expectPipelineVersionMismatch(runId);

  const resumed = await runResumedScenario(runId, conditional, resume);
  const continuous = await runContinuousScenario(`${runId.slice(0, -1)}4`, conditional);

  expect(resumed.cachedStageReads).toEqual(['modulo_teia_identity']);
  expect(resumed.executedStages).not.toContain('modulo_teia_identity');
  expect(resumed.output.text).toBe(continuous.output.text);
  expect(semanticProjection(resumed.output)).toEqual(semanticProjection(continuous.output));
  expect(resumed.searchCalls).toBe(conditional ? 12 : 0);
  expect(resumed.benchmarkCalls).toBe(1);
}

describe('DOSSIER-FLOW 05E.0C-R1 — resume payload contra helper canônico', () => {
  it('retoma o caminho-base sem executar novamente a etapa confirmada', async () => {
    await exerciseResumeScenario(false);
  }, 30_000);

  it('retoma o caminho condicional sem duplicar a etapa confirmada', async () => {
    await exerciseResumeScenario(true);
  }, 30_000);
});
