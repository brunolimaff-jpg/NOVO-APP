/**
 * BRU-33 — Seam Gold pós-processamento fail-closed (TDD, mocks injetados).
 *
 * Regras congeladas pelo Planejador (2026-08-08):
 * - Gold entra depois de waterfallFinalText e antes de generateContinuityQuestion;
 * - flag OFF por padrão; apenas falhas INTERNAS do Gold caem silenciosamente
 *   para o dossiê original;
 * - abort do usuário NÃO é fallback (rethrow — preserva CANCELLED);
 * - erros de run-control/lease NÃO são fallback (o fluxo do waterfall preserva
 *   FAILED via assertRunCanContinue);
 * - REAL_PROVIDER_CALLS_IN_TESTS = 0 (todos os deps são mocks).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalAccount, SafeFindingPack } from '../../../../services/llm/gold/gold-contracts';
import type { GuardedGoldPipelineResult } from '../../../../services/llm/gold/gold-pipeline';
import {
  GOLD_DEADLINE_MS,
  tryEnhanceDossierWithGold,
  type GoldRejectionDetail,
  type GoldSeamDeps,
} from '../../../../services/llm/gold/seam/gold-dossier-seam';

const DOSSIER_TEXT = '# DOSSIÊ SCOUT 360\n\nEmpresa alvo: SCHEFFER & CIA LTDA\n\n... dossiê completo ...';
// Gold REAL que passou no GoldContractValidator no reteste canônico
// (Scheffer braço A, V3.2) — usado como fixture elegível.
const GOLD_TEXT = readFileSync(join(__dirname, 'fixtures', 'gold-scheffer-eligible.md'), 'utf8');

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [{ name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' }],
};

function makeGoldResult(overrides: Partial<GuardedGoldPipelineResult> = {}): GuardedGoldPipelineResult {
  return {
    goldBrief: GOLD_TEXT,
    safePack: { findings: [] } as unknown as SafeFindingPack,
    sanitizerEvents: [],
    verification: { passed: true, hardFails: [] },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<GoldSeamDeps> = {}): GoldSeamDeps & {
  runGold: ReturnType<typeof vi.fn>;
  buildCanonical: ReturnType<typeof vi.fn>;
} {
  const runGold = vi.fn(async () => makeGoldResult());
  const buildCanonical = vi.fn(async () => canonical);
  return {
    enabled: true,
    runGold,
    buildCanonical,
    ...overrides,
  } as GoldSeamDeps & { runGold: ReturnType<typeof vi.fn>; buildCanonical: ReturnType<typeof vi.fn> };
}

describe('tryEnhanceDossierWithGold — seam fail-closed', () => {
  it('flag OFF → devolve o dossiê original e NÃO chama nenhum dep', async () => {
    const deps = makeDeps({ enabled: false });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(DOSSIER_TEXT);
    expect(deps.runGold).not.toHaveBeenCalled();
    expect(deps.buildCanonical).not.toHaveBeenCalled();
  });

  it('sem CNPJ → devolve o dossiê original', async () => {
    const deps = makeDeps();
    const out = await tryEnhanceDossierWithGold({
      cnpj: null,
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(DOSSIER_TEXT);
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('BRU-69: upstream indisponível (buildCanonical null) → saída controlada, NENHUM byte do dossiê pré-Gold', async () => {
    const deps = makeDeps({ buildCanonical: vi.fn(async () => null) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).not.toBe(DOSSIER_TEXT);
    expect(out).toContain('Dossiê indisponível');
    expect(out).toContain('SCHEFFER & CIA LTDA');
    expect(out).not.toContain('dossiê completo');
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('BRU-69: erro técnico no gold (LLM error) com Canonical → fallback factual mínimo', async () => {
    const deps = makeDeps({ runGold: vi.fn(async () => { throw new Error('LiteLLM 502'); }) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).not.toBe(DOSSIER_TEXT);
    expect(out).toContain('Saída factual reduzida');
    expect(out).toContain('SCHEFFER & CIA LTDA');
    expect(out).not.toContain('dossiê completo');
  });

  it('BRU-69: timeout interno do gold com Canonical → fallback factual mínimo', async () => {
    const deps = makeDeps({ runGold: vi.fn(async () => { throw Object.assign(new Error('gold timeout'), { name: 'TimeoutError' }); }) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).not.toBe(DOSSIER_TEXT);
    expect(out).toContain('Saída factual reduzida');
    expect(out).not.toContain('dossiê completo');
  });

  it('BRU-69: Verifier FAIL (hard fail) → fallback factual mínimo, zero vazamento do pré-Gold', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({ verification: { passed: false, hardFails: [{ code: 'UNSUPPORTED_PRODUCT_CLAIM', reason: 'x' }] } }),
      ),
    });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).not.toBe(DOSSIER_TEXT);
    expect(out).toContain('Saída factual reduzida');
    expect(out).not.toContain('dossiê completo');
  });

  it('BRU-69: GoldContractValidator FAIL → fallback factual mínimo', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({
          goldBrief: 'texto curto sem seções', // falha word count/seções
        }),
      ),
    });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).not.toBe(DOSSIER_TEXT);
    expect(out).toContain('Saída factual reduzida');
    expect(out).not.toContain('dossiê completo');
  });

  it('gold elegível (Verifier + Contract PASS) → devolve o Gold', async () => {
    const deps = makeDeps();
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(GOLD_TEXT);
    expect(deps.buildCanonical.mock.calls[0][0]).toBe('04.733.767/0001-80');
    expect(deps.buildCanonical.mock.calls[0][1]).toBe('SCHEFFER & CIA LTDA');
    expect(deps.runGold).toHaveBeenCalledTimes(1);
  });

  it('abort do usuário NÃO é fallback — propaga o AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const deps = makeDeps({
      runGold: vi.fn(async () => { throw abortError; }),
    });
    await expect(
      tryEnhanceDossierWithGold({
        cnpj: '04.733.767/0001-80',
        companyName: 'SCHEFFER & CIA LTDA',
        dossierText: DOSSIER_TEXT,
        deps,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('signal do usuário é propagado para buildCanonical e runGold', async () => {
    const deps = makeDeps();
    const controller = new AbortController();
    await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
      signal: controller.signal,
    });
    expect(deps.buildCanonical.mock.calls[0][2]).toBeDefined();
    expect(deps.runGold.mock.calls[0][1]).toBeDefined();
  });

  it('deadline de 330s congelado (GOLD_DEADLINE_MS = 330000, PACOTE 1 BUDGET-LAYERED)', () => {
    expect(GOLD_DEADLINE_MS).toBe(330_000);
  });

  it('prova zero provider: nenhum teste toca fetch/LLM real (mocks apenas)', () => {
    // Guarda declarativa: os deps injetados são vi.fn(); a suíte inteira roda
    // sem importar proxyGenerateContent/LiteLLM — nada de rede.
    expect(vi.mocked(makeDeps().runGold).getMockImplementation()).toBeDefined();
  });

  // ─── BRU-33: reason real + telemetria por etapa (veredito do Planejador) ──

  it('canonical null → onRejected(canonical_null) e telemetria canonical-done resolved:false', async () => {
    const deps = makeDeps({ buildCanonical: vi.fn(async () => null) });
    const stages: string[] = [];
    const rejected: string[] = [];

    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
      onStage: (stage, detail) => stages.push(`${stage}:${detail?.resolved ?? '-'}`),
      onRejected: (reason) => rejected.push(reason),
    });

    expect(out).toContain('Dossiê indisponível');
    expect(out).not.toContain('dossiê completo');
    expect(stages).toEqual(['canonical-done:false', 'output-selected:-']);
    expect(rejected).toEqual(['canonical_null']);
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('Verifier hard fail → onRejected(verifier_fail), contract-done NÃO é emitido', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({
          verification: {
            passed: false,
            hardFails: [
              { code: 'UNSUPPORTED_PRODUCT_CLAIM', reason: 'Frase afirma capacidade/produto/prazo/ROI sem fonte: "Capacidade de armazenagem de 120 mil sacas"' },
            ],
          },
        }),
      ),
    });
    const stages: string[] = [];
    const rejected: Array<{ reason: string; detail?: GoldRejectionDetail }> = [];

    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
      onStage: (stage, detail) => stages.push(`${stage}:${detail?.resolved ?? detail?.passed ?? '-'}`),
      onRejected: (reason, detail) => rejected.push({ reason, detail }),
    });

    expect(out).toContain('Saída factual reduzida');
    expect(out).not.toContain('dossiê completo');
    expect(rejected).toEqual([
      {
        reason: 'verifier_fail',
        detail: {
          hardFails: 1,
          codes: ['UNSUPPORTED_PRODUCT_CLAIM'],
          codeCounts: { UNSUPPORTED_PRODUCT_CLAIM: 1 },
          // LOTE GOLD P0 (TAREFA 4): razão SANITIZADA — prefixo da regra,
          // nunca a frase comercial anexada pelo verifier.
          reasons: ['Frase afirma capacidade/produto/prazo/ROI sem fonte'],
        },
      },
    ]);
    expect(rejected[0].detail).not.toHaveProperty('reason');
    expect(rejected[0].detail).not.toHaveProperty('claim');
    expect(JSON.stringify(rejected[0].detail)).not.toContain('120 mil sacas');
    expect(stages).not.toContain('contract-done:true');
    expect(stages).not.toContain('contract-done:false');
  });

  it('GoldContractValidator FAIL → onRejected(contract_fail) e contract-done passed:false', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () => makeGoldResult({ goldBrief: 'texto curto sem seções' })),
    });
    const rejected: string[] = [];
    const contractStages: string[] = [];

    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
      onStage: (stage, detail) => {
        if (stage === 'contract-done') contractStages.push(`${stage}:${detail?.passed ?? '-'}`);
      },
      onRejected: (reason) => rejected.push(reason),
    });

    expect(out).toContain('Saída factual reduzida');
    expect(out).not.toContain('dossiê completo');
    expect(rejected).toEqual(['contract_fail']);
    expect(contractStages).toEqual(['contract-done:false']);
  });

  it('Gold elegível → emite canonical-done:true e contract-done:true, sem onRejected', async () => {
    const deps = makeDeps();
    const stages: string[] = [];
    const rejected: string[] = [];

    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
      onStage: (stage, detail) => stages.push(`${stage}:${detail?.resolved ?? detail?.passed ?? '-'}`),
      onRejected: (reason) => rejected.push(reason),
    });

    expect(out).toBe(GOLD_TEXT);
    expect(rejected).toEqual([]);
    expect(stages).toEqual(['canonical-done:true', 'contract-done:true', 'output-selected:-']);
    // o onStage do chamador atravessa o runGold (3º argumento) — telemetria do pipeline
    expect(deps.runGold.mock.calls[0][2]).toBeDefined();
  });

  // ─── BRU-69 (B+): adversariais do contrato congelado ───

  it('BRU-69 val.1: verifier_fail com classes reais Scheffer → factual mínimo, zero vazamento do conteúdo reprovado', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({
          verification: {
            passed: false,
            hardFails: [
              { code: 'PROMOTED_CLAIM', reason: 'Colômbia confirmada' },
              { code: 'NEGATIVE_EVIDENCE_AS_ABSENCE', reason: 'ausência de ERP vira dor' },
              { code: 'QSA_AS_DECISOR', reason: 'sócio como decisor' },
            ],
          },
        }),
      ),
    });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toContain('Saída factual reduzida');
    // zero vazamento: nada do dossiê pré-Gold nem do Gold reprovado
    expect(out).not.toContain('dossiê completo');
    expect(out).not.toContain('Colômbia');
    expect(out).not.toContain('ausência');
  });

  it('BRU-69 val.5: factual mínimo NÃO contém PORTA/score/oportunidade/recomendação/ROI/urgência', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({ verification: { passed: false, hardFails: [{ code: 'PROMOTED_CLAIM', reason: 'x' }] } }),
      ),
    });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    for (const forbidden of ['PORTA', 'score', 'Score', 'oportunidade', 'recomendação', 'ROI', 'urgência', 'impacto', 'decisor', 'confirmado']) {
      expect(out).not.toContain(forbidden);
    }
    // conteúdo oficial presente
    expect(out).toContain('SCHEFFER & CIA LTDA');
    expect(out).toContain('04.733.767/0001-80');
    expect(out).toContain('SCHEFFER PARTICIPACOES S/A');
    expect(out).toContain('ELIZEU ZULMAR MAGGI SCHEFFER');
    expect(out).toContain('Sócio-Administrador');
    expect(out).toContain('Não verificado nesta execução');
    expect(out).toContain('Gold não aprovado');
  });

  it('BRU-69 val.4: canonical_null → saída controlada, nenhum byte do dossierText vaza', async () => {
    const deps = makeDeps({ buildCanonical: vi.fn(async () => null) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toContain('Dossiê indisponível');
    for (const word of ['dossiê completo', 'Empresa alvo', 'DOSSIÊ SCOUT']) {
      expect(out).not.toContain(word);
    }
  });

  it('BRU-69: buildCanonical LANÇA erro interno → saída controlada (sem Canonical seguro)', async () => {
    const deps = makeDeps({ buildCanonical: vi.fn(async () => { throw new Error('upstream down'); }) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toContain('Dossiê indisponível');
    expect(out).not.toContain('dossiê completo');
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('BRU-69 telemetria: output-selected distingue gold_pass | factual_minimal | controlled_unavailable', async () => {
    const kinds: Array<string | undefined> = [];
    const collect = (stage: string, detail?: { kind?: string }) => {
      if (stage === 'output-selected') kinds.push(detail?.kind);
    };
    await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80', companyName: 'SCHEFFER & CIA LTDA', dossierText: DOSSIER_TEXT,
      deps: makeDeps(), onStage: collect as never,
    });
    await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80', companyName: 'SCHEFFER & CIA LTDA', dossierText: DOSSIER_TEXT,
      deps: makeDeps({ runGold: vi.fn(async () => makeGoldResult({ verification: { passed: false, hardFails: [{ code: 'PROMOTED_CLAIM', reason: 'x' }] } })) }),
      onStage: collect as never,
    });
    await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80', companyName: 'SCHEFFER & CIA LTDA', dossierText: DOSSIER_TEXT,
      deps: makeDeps({ buildCanonical: vi.fn(async () => null) }), onStage: collect as never,
    });
    expect(kinds).toEqual(['gold_pass', 'factual_minimal', 'controlled_unavailable']);
  });

  it('BRU-69: abort do usuário continua propagando (sem factual nem controlled)', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    const deps = makeDeps({ buildCanonical: vi.fn(async () => { throw abortError; }) });
    await expect(
      tryEnhanceDossierWithGold({
        cnpj: '04.733.767/0001-80', companyName: 'SCHEFFER & CIA LTDA', dossierText: DOSSIER_TEXT, deps,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
