import { describe, it, expect } from 'vitest';
import { runGuardedGoldPipeline, type GoldPipelineDeps } from '../../../services/llm/gold/gold-pipeline';
import { GOLD_POLICY_CORPUS } from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * BRU-102 — I7 hardening (KEEP_NARROW): após compose → preflight →
 * normalização → verifyGold, qualquer PROMOTED_CLAIM residual impede o
 * avanço para injectCanonicalGoldMermaids (fail-closed). Não generaliza para
 * outras famílias verifier-only.
 *
 * Condição residual real (verificada): o guard de certeza pula partes com
 * NEGATION_PATTERN (qualquer "não"), enquanto o verifier R8 só reconhece
 * KNOWLEDGE_NEGATION (mais estrito) — "Operação internacional confirmada,
 * mas não há registro em Cumaribo." não é neutralizado e o verifier acusa
 * PROMOTED_CLAIM. Sem o gate, o Mermaid rodaria sobre texto inválido.
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
  await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps, undefined, (s) => stages.push({ stage: s }));
  return stages;
}

describe('BRU-102 — I7 hardening: fail-closed pós-Composer antes do Mermaid', () => {
  it('RED: PROMOTED residual (guard pula por negação ampla) → pipeline REJEITA fail-closed antes do Mermaid', async () => {
    await expect(
      runPipeline('### 1. SÍNTESE EXECUTIVA\nOperação internacional confirmada, mas não há registro em Cumaribo.\n'),
    ).rejects.toThrow(/I7FailClosed|PROMOTED_CLAIM residual/i);
  });

  it('GREEN não-regressão: Composer fabrica certeza sem negação → guard neutraliza → pipeline completa (0 residual)', async () => {
    const stages = await runPipeline('### 1. SÍNTESE EXECUTIVA\nOperação internacional confirmada em Cumaribo.\n');
    // o pipeline completou (sem rejeição) e o post-preflight não acusou
    expect(stages.some((s) => s.stage === 'mermaid-inject')).toBe(true);
    expect(stages.some((s) => s.stage === 'verifier-done')).toBe(true);
  });

  it('GREEN: detector ⇒ transformação no caminho real — todas as formas do corpus são neutralizadas', async () => {
    for (const word of GOLD_POLICY_CORPUS.certaintyWords) {
      const stages = await runPipeline(`### 1. SÍNTESE EXECUTIVA\nOperação internacional ${word} em Cumaribo.\n`);
      expect(stages.some((s) => s.stage === 'verifier-done'), `forma "${word}" deveria completar`).toBe(true);
    }
  });

  it('GREEN: negação SEGURA (reconhecida pelo verifier) não dispara fail-closed (é permitida)', async () => {
    const stages = await runPipeline('### 1. SÍNTESE EXECUTIVA\nOperação internacional não está confirmada em Cumaribo.\n');
    expect(stages.some((s) => s.stage === 'verifier-done')).toBe(true);
  });

  it('GREEN: controle não sensível não é tocado pelo guard (continua passando)', async () => {
    const stages = await runPipeline('### 1. SÍNTESE EXECUTIVA\nO contrato do ERP foi confirmado em 2025.\n');
    expect(stages.some((s) => s.stage === 'verifier-done')).toBe(true);
  });
});
