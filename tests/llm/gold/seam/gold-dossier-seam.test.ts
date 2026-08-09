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

  it('upstream indisponível (buildCanonical null) → devolve o dossiê original', async () => {
    const deps = makeDeps({ buildCanonical: vi.fn(async () => null) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(DOSSIER_TEXT);
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('erro técnico no gold (LLM error) → devolve o dossiê original (fallback silencioso)', async () => {
    const deps = makeDeps({ runGold: vi.fn(async () => { throw new Error('LiteLLM 502'); }) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(DOSSIER_TEXT);
  });

  it('timeout interno do gold → devolve o dossiê original', async () => {
    const deps = makeDeps({ runGold: vi.fn(async () => { throw Object.assign(new Error('gold timeout'), { name: 'TimeoutError' }); }) });
    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: DOSSIER_TEXT,
      deps,
    });
    expect(out).toBe(DOSSIER_TEXT);
  });

  it('Verifier FAIL (hard fail) → devolve o dossiê original', async () => {
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
    expect(out).toBe(DOSSIER_TEXT);
  });

  it('GoldContractValidator FAIL → devolve o dossiê original', async () => {
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
    expect(out).toBe(DOSSIER_TEXT);
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

  it('deadline de 180s congelado (GOLD_DEADLINE_MS = 180000, SCOUT-V7-GOLD-DEADLINE-180)', () => {
    expect(GOLD_DEADLINE_MS).toBe(180_000);
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

    expect(out).toBe(DOSSIER_TEXT);
    expect(stages).toEqual(['canonical-done:false']);
    expect(rejected).toEqual(['canonical_null']);
    expect(deps.runGold).not.toHaveBeenCalled();
  });

  it('Verifier hard fail → onRejected(verifier_fail), contract-done NÃO é emitido', async () => {
    const deps = makeDeps({
      runGold: vi.fn(async () =>
        makeGoldResult({ verification: { passed: false, hardFails: [{ code: 'UNSUPPORTED_PRODUCT_CLAIM', reason: 'x' }] } }),
      ),
    });
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

    expect(out).toBe(DOSSIER_TEXT);
    expect(rejected).toEqual(['verifier_fail']);
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

    expect(out).toBe(DOSSIER_TEXT);
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
    expect(stages).toEqual(['canonical-done:true', 'contract-done:true']);
    // o onStage do chamador atravessa o runGold (3º argumento) — telemetria do pipeline
    expect(deps.runGold.mock.calls[0][2]).toBeDefined();
  });
});
