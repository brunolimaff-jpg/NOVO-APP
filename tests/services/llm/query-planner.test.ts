import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planQueries, type EntityResolution } from '../../../services/llm/query-planner';

/**
 * BRU-157 P1 — Fallback V1 silencioso no PipelineV2 quando o LLM devolve JSON
 * de plano inválido (evidência run 3f0e7569: erro `invalid_union` do Zod no
 * retorno do planQueries). Causa raiz: o erro de validação propagava direto
 * para o orchestrator, que caía no fallback V1 sem tentar recuperar.
 *
 * Contrato pino desta missão (REAL_PROVIDER_CALLS=0 — só mocks):
 *   - 1 JSON inválido no planner → UMA recuperação (re-chamada do LLM com os
 *     issues de validação anexados ao prompt) antes de desistir;
 *   - recuperação bem-sucedida → planQueries resolve (V2 segue, sem fallback);
 *   - recuperação esgotada → erro explícito + scoutDiag.warn com o motivo;
 *   - JSON com fence markdown ```json já é reparado (parse existente).
 */

const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

const ENTITY: EntityResolution = {
  cnpjRaiz: '12345678000190',
  razaoSocial: 'Acme Agro S.A.',
  cnaePrincipal: '0111',
  segmentoInferido: 'agropecuaria',
  estadoOperacao: [],
};

function makeQuery(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'q-01',
    query: 'Acme Agro hectares Mato Grosso',
    objective: 'identity_resolution',
    module: 'teia_identity',
    priority: 1,
    expectedSource: 'A',
    homonimRisk: 'baixo',
    rationale: 'resolve a identidade societária da Acme Agro no MT',
    ...overrides,
  };
}

function makePlanJson(count = 12, queryOverrides: Record<string, unknown> = {}): string {
  const queries = Array.from({ length: count }, (_, i) =>
    makeQuery({ id: `q-${String(i + 1).padStart(2, '0')}`, ...queryOverrides }),
  );
  return JSON.stringify({ queries });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('planQueries — recuperação de plano inválido (BRU-157 P1)', () => {
  it('RED: 1ª resposta com campo fora do enum não cai direto no erro — tenta 1 recuperação e resolve', async () => {
    const callLLM = vi
      .fn()
      // 1ª chamada: JSON parseável mas com homonimRisk fora do enum -> ZodError
      .mockResolvedValueOnce(makePlanJson(12, { homonimRisk: 'inesperado' }))
      // 2ª chamada: resposta corrigida -> resolve
      .mockResolvedValueOnce(makePlanJson(12));

    const plan = await planQueries(ENTITY, callLLM);

    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(plan.queries).toHaveLength(12);
    expect(plan.queries[0].id).toBe('q-01');
    expect(plan.segmento).toBe('agropecuaria');
  });

  it('recuperação esgotada: rejeita com motivo e emite warn explícito (nunca silencioso)', async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(makePlanJson(12, { priority: 99 }))
      .mockResolvedValueOnce(makePlanJson(12, { priority: 99 }));

    await expect(planQueries(ENTITY, callLLM)).rejects.toThrow(/inválido|rejeitado|falhou|valida/i);
    expect(callLLM).toHaveBeenCalledTimes(2);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'QueryPlanner',
      expect.stringMatching(/recupera|correção|correcao|falhou/i),
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('2ª chamada de recuperação recebe os issues de validação anexados ao prompt', async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce(makePlanJson(12, { homonimRisk: 'fora-do-enum' }))
      .mockResolvedValueOnce(makePlanJson(12));

    await planQueries(ENTITY, callLLM);

    const secondPrompt = callLLM.mock.calls[1][0] as string;
    expect(secondPrompt).toContain('homonimRisk');
    expect(secondPrompt).toMatch(/rejeitad|inválid|corrig/i);
  });

  it('JSON dentro de fence markdown ```json já é aceito (reparo de parse existente)', async () => {
    const callLLM = vi
      .fn()
      .mockResolvedValueOnce('```json\n' + makePlanJson(12) + '\n```');

    const plan = await planQueries(ENTITY, callLLM);

    expect(callLLM).toHaveBeenCalledTimes(1);
    expect(plan.queries).toHaveLength(12);
  });
});
