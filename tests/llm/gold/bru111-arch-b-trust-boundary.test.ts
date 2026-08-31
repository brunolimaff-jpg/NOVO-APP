import { describe, it, expect } from 'vitest';
import { runGuardedGoldPipeline, type GoldPipelineDeps } from '../../../services/llm/gold/gold-pipeline';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * ARCH-B (BRU-111) — Pre-deterministic Trust Boundary.
 *
 * Invariante: post-preflight/normalization hardFails > 0 → deterministic
 * builder NÃO executa → fail-closed com códigos observáveis.
 *
 * Hoje o gate pré-Mermaid (gold-pipeline.ts) reage apenas a PROMOTED_CLAIM;
 * hard fails de outras famílias (QSA_GOVERNANCE_CLAIM, RELATIONSHIP_INVERTED,
 * WRONG_ESTABLISHMENT_TYPE, ...) atravessam para o builder e são amplificados
 * pelo Mermaid/tabelas.
 */
const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

function rawPack(): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
    facts: [{ id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Cultivo próprio de soja.', status: 'Confirmado', source: 'Site institucional', kind: 'operation' }],
    relationships: [], technologySignals: [], people: [], metrics: [], conflicts: [], openQuestions: [], discardedClaims: [],
  };
}

async function runPipeline(composeText: string) {
  const stages: Array<{ stage: string }> = [];
  const deps: GoldPipelineDeps = {
    compact: async () => rawPack(),
    compose: async () => composeText,
  };
  try {
    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps, undefined, (s) => stages.push({ stage: s }));
    return { stages, error: null };
  } catch (err) {
    return { stages, error: err as Error };
  }
}

describe('BRU-111 ARCH-B — Pre-deterministic Trust Boundary (fail-closed p/ qualquer hard fail)', () => {
  it('GREEN: hard fail residual NÃO-PROMOTED (WRONG_ESTABLISHMENT_TYPE) bloqueia o builder (fail-closed)', async () => {
    // A conta é Filial (canonical); afirmar "é a matriz" com CNPJ da conta
    // dispara WRONG_ESTABLISHMENT_TYPE no verifier — agora QUALQUER hard fail
    // residual pós-normalização impede o Mermaid.
    const { stages, error } = await runPipeline('### 1. SÍNTESE EXECUTIVA\nA SCHEFFER & CIA LTDA (04.733.767/0001-80) é a matriz do grupo.\n');
    expect(error).not.toBeNull();
    expect((error as Error).message).toMatch(/GoldI7FailClosed/);
    expect((error as Error).message).toContain('WRONG_ESTABLISHMENT_TYPE');
    expect(stages.some((s) => s.stage === 'i7-fail-closed')).toBe(true);
    expect(stages.some((s) => s.stage === 'mermaid-inject')).toBe(false);
  });

  it('GREEN: RELATIONSHIP_INVERTED também bloqueia o builder', async () => {
    // Relação invertida: a conta não pode participar do capital da PJ direta.
    const { stages, error } = await runPipeline('### 1. SÍNTESE EXECUTIVA\nA SCHEFFER & CIA LTDA participa do capital da SCHEFFER PARTICIPACOES S/A.\n');
    expect(error).not.toBeNull();
    expect((error as Error).message).toMatch(/GoldI7FailClosed/);
    expect((error as Error).message).toContain('RELATIONSHIP_INVERTED');
    expect(stages.some((s) => s.stage === 'i7-fail-closed')).toBe(true);
    expect(stages.some((s) => s.stage === 'mermaid-inject')).toBe(false);
  });

  it('GREEN (não-regressão): sem hard fail residual o builder roda e o pipeline completa', async () => {
    const { stages } = await runPipeline('### 1. SÍNTESE EXECUTIVA\nA operação agrícola é verticalizada no Mato Grosso.\n');
    expect(stages.some((s) => s.stage === 'mermaid-inject')).toBe(true);
    expect(stages.some((s) => s.stage === 'verifier-done')).toBe(true);
  });
});
