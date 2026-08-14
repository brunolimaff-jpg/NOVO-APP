import { describe, it, expect } from 'vitest';
import {
  runGuardedGoldPipeline,
  downgradeUnsupportedCertainty,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';
import { matchesConfirmedVocabulary, neutralizeConfirmedVocabulary, GOLD_POLICY_CORPUS } from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * LOTE GOLD STRUCTURAL I7 — POST-COMPOSER CLEAN BOUNDARY (despacho do
 * Planejador, 2026-08-14): NENHUM PROMOTED_CLAIM produzido pelo Composer pode
 * atravessar a fronteira pós-compose. O Composer pode errar à vontade; a
 * saída inválida NÃO atravessa a boundary (neutralização na saída do Composer,
 * ANTES do Mermaid). Equivalência detector ↔ transformação (inclui
 * "confirmadamente" — gap do RCA-05). Verifier permanece como barreira
 * residual fail-closed (I4).
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
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    discardedClaims: [],
  };
}

async function runPipeline(composeText: string) {
  const stages: Array<{ stage: string; detail?: { codes?: string[]; hardFails?: number } }> = [];
  const deps: GoldPipelineDeps = {
    compact: async () => rawPack(),
    compose: async () => composeText,
  };
  const result = await runGuardedGoldPipeline(
    { canonical, dossier: 'dossiê legado' },
    deps,
    undefined,
    (stage, detail) => stages.push({ stage, detail: detail as never }),
  );
  return { stages, result };
}

describe('I7 — POST-COMPOSER CLEAN BOUNDARY', () => {
  it('RED: Composer fabrica "confirmada" sensível (singular) → post-preflight sem PROMOTED e goldBrief limpo', async () => {
    const { stages, result } = await runPipeline(
      '### 1. SÍNTESE EXECUTIVA\nOperação internacional confirmada em Cumaribo.\n',
    );
    const post = stages.find((s) => s.stage === 'diagnostics-post-preflight');
    expect(post?.detail?.codes ?? []).not.toContain('PROMOTED_CLAIM');
    expect(result.goldBrief).not.toContain('confirmada');
  });

  it('RED: Composer fabrica plural "confirmadas" e "confirmadamente" → atravessam neutralizados', async () => {
    const { stages, result } = await runPipeline(
      '### 1. SÍNTESE EXECUTIVA\nOperações internacionais confirmadas em Cumaribo.\nOperação internacional confirmadamente ativa em Cumaribo.\n',
    );
    const post = stages.find((s) => s.stage === 'diagnostics-post-preflight');
    expect(post?.detail?.codes ?? []).not.toContain('PROMOTED_CLAIM');
    expect(result.goldBrief).not.toMatch(/confirmad/);
  });

  it('equivalência detector ↔ transformação: toda forma detectada é neutralizada pelo guard', () => {
    for (const word of GOLD_POLICY_CORPUS.certaintyWords) {
      expect(matchesConfirmedVocabulary(`Operação ${word} em Cumaribo.`)).toBe(true);
      expect(neutralizeConfirmedVocabulary(`Operação ${word} em Cumaribo.`)).not.toContain(word.replace(/mente$/, 'm'));
    }
    // gap do RCA-05: o replacement parcial não pegava "confirmadamente"
    const downgraded = downgradeUnsupportedCertainty('Operação internacional confirmadamente ativa em Cumaribo.');
    expect(downgraded).not.toContain('confirmadamente');
  });

  it('não-regressão: negação em tema sensível NÃO é tocada pelo guard (RED C do LOTE GOLD P0)', () => {
    const texto = 'Operação internacional não está confirmada em Cumaribo.';
    const downgraded = downgradeUnsupportedCertainty(texto);
    expect(downgraded).toBe(texto);
  });

  it('não-regressão: texto sem tema sensível permanece byte-a-byte inalterado', () => {
    const texto = 'Cultivo próprio de soja na unidade de Sapezal.';
    expect(downgradeUnsupportedCertainty(texto)).toBe(texto);
  });

  it('não-regressão: afirmação em tema NÃO sensível com "confirmado" NÃO é rebaixada (guarda de tema)', () => {
    const texto = 'O contrato do ERP foi confirmado em 2025.';
    expect(downgradeUnsupportedCertainty(texto)).toBe(texto);
  });
});
