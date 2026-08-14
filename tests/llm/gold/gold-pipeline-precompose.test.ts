import { describe, it, expect } from 'vitest';
import {
  runGuardedGoldPipeline,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * RCA-02 (despacho do Planejador, 2026-08-14): fronteira discriminante
 * PRÉ-COMPOSER. O estágio `diagnostics-pre-compose` mede, com o verifyGold
 * (fonte ÚNICA de política, sem regex paralela), se o material que dispara
 * PROMOTED_CLAIM/RELATIONSHIP_INVERTED já chega no Frontier (H1) ou nasce
 * no texto do Composer (H2). Telemetria estrutural: codes/codeCounts/hardFails
 * apenas — nunca reason/claim/conteúdo.
 *
 * REDs permanentes: devem falhar no baseline e4f9c0f2 (o estágio ainda não
 * existe) e ficar verdes apenas com a observabilidade implementada no
 * pipeline. Verifier/sanitizer/prompts NÃO são tocados.
 */
const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

function rawPack(facts: RawFindingPack['facts'], openQuestions: string[] = []): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts,
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions,
    discardedClaims: [],
  };
}

interface StageRecord {
  stage: string;
  detail?: { hardFails?: number; codes?: string[]; codeCounts?: Record<string, number> };
}

async function runStages(facts: RawFindingPack['facts'], composeText: string, openQuestions: string[] = []): Promise<StageRecord[]> {
  const stages: StageRecord[] = [];
  const deps: GoldPipelineDeps = {
    compact: async () => rawPack(facts, openQuestions),
    compose: async () => composeText,
  };
  await runGuardedGoldPipeline(
    { canonical, dossier: 'dossiê legado' },
    deps,
    undefined,
    (stage, detail) => {
      stages.push({ stage, detail: detail as StageRecord['detail'] });
    },
  );
  return stages;
}

function findStage(stages: StageRecord[], name: string): StageRecord | undefined {
  return stages.find((s) => s.stage === name);
}

const NEUTRAL_FACT = {
  id: 'f1',
  entity: 'SCHEFFER & CIA LTDA',
  claim: 'Cultivo próprio de soja na unidade de Sapezal.',
  status: 'Confirmado' as const,
  source: 'Site institucional',
  kind: 'operation' as const,
};

describe('RCA-02 — fronteira diagnostics-pre-compose (probe semântico pré-Composer)', () => {
  it('RED 1 (H2): Frontier limpo + Composer introduz "confirmada" sensível → pre-compose = 0 e post-preflight acusa PROMOTED_CLAIM', async () => {
    const stages = await runStages(
      [NEUTRAL_FACT],
      '### 1. SÍNTESE EXECUTIVA\nOperação internacional confirmada em Cumaribo.\n',
    );

    const pre = findStage(stages, 'diagnostics-pre-compose');
    expect(pre).toBeDefined();
    expect(pre?.detail?.hardFails).toBe(0);

    const post = findStage(stages, 'diagnostics-post-preflight');
    expect(post?.detail?.codes).toContain('PROMOTED_CLAIM');
  });

  it('RED 2 (H1 PROMOTED): claim Confirmado com "confirmada" em tema sensível chega ao Frontier → pre-compose acusa PROMOTED_CLAIM', async () => {
    const stages = await runStages(
      [
        {
          id: 'f-sens',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'Operação internacional confirmada em Cumaribo.',
          status: 'Confirmado',
          // Fonte fora da lista fraca do sanitizer (site institucional/release/
          // menção) — o claim atravessa o sanitize INTACTO e chega ao Frontier.
          source: 'Registro legal estrangeiro',
          kind: 'operation',
        },
      ],
      'Texto neutro do composer.',
    );

    const pre = findStage(stages, 'diagnostics-pre-compose');
    expect(pre).toBeDefined();
    expect(pre?.detail?.codes).toContain('PROMOTED_CLAIM');
  });

  it('RED 3 (H1 INVERTED): relação invertida no Frontier → pre-compose acusa RELATIONSHIP_INVERTED; a direção correta não acusa', async () => {
    const invertida = await runStages(
      [
        {
          id: 'f-inv',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'A SCHEFFER & CIA LTDA participa do capital da SCHEFFER PARTICIPACOES S/A.',
          status: 'Confirmado',
          source: 'Receita Federal',
          kind: 'relationship',
        },
      ],
      'Texto neutro do composer.',
    );
    const preInv = findStage(invertida, 'diagnostics-pre-compose');
    expect(preInv).toBeDefined();
    expect(preInv?.detail?.codes).toContain('RELATIONSHIP_INVERTED');

    const correta = await runStages(
      [
        {
          id: 'f-ok',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'A SCHEFFER PARTICIPACOES S/A participa do capital da SCHEFFER & CIA LTDA.',
          status: 'Confirmado',
          source: 'Receita Federal',
          kind: 'relationship',
        },
      ],
      'Texto neutro do composer.',
    );
    const preOk = findStage(correta, 'diagnostics-pre-compose');
    expect(preOk).toBeDefined();
    expect(preOk?.detail?.codes ?? []).not.toContain('RELATIONSHIP_INVERTED');
  });

  it('RED 4 (adversarial): Frontier neutro não fabrica semântica → pre-compose = 0', async () => {
    const stages = await runStages(
      [NEUTRAL_FACT],
      'Texto neutro do composer.',
      ['Quem é o principal concorrente regional da operação?'],
    );

    const pre = findStage(stages, 'diagnostics-pre-compose');
    expect(pre).toBeDefined();
    expect(pre?.detail?.hardFails).toBe(0);
  });
});
