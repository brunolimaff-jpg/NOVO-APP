import { describe, it, expect } from 'vitest';
import {
  runGuardedGoldPipeline,
  buildFrontierProbeText,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';
import { buildDynamicValueChainTable, normalizeDiscoveryQuestion } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import type { CanonicalAccount, RawFindingPack, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * RCA-03 (despacho do Planejador, 2026-08-14) — QUESTION MODALITY.
 * Fase 2: REDs com a frase REAL do run dc932b75. Uma pergunta legítima de
 * discovery NÃO pode produzir PROMOTED_CLAIM no diagnostics-pre-compose nem
 * quando reinjetada na coluna Validar; uma AFIRMAÇÃO real DEVE continuar
 * acusando. Verifier intocado.
 */
const PERGUNTA_COLOMBIA_REAL =
  'A operação na Colômbia (Cumaribo) possui registro legal confirmado? Qual é a estrutura societária e operacional no país?';
const PERGUNTA_ARMAZENAGEM_REAL = 'O grupo possui armazenagem própria? Se sim, qual a capacidade?';
const AFIRMACAO_REAL = 'Operação na Colômbia está confirmada.';

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

function rawPack(openQuestions: string[]): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [
      {
        id: 'f1',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Cultivo próprio de soja na unidade de Sapezal.',
        status: 'Confirmado',
        source: 'Site institucional',
        kind: 'operation',
      },
    ],
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions,
    discardedClaims: [],
  };
}

function baseSafePack(openQuestions: string[]): SafeFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [],
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions,
    sanitizerEvents: [],
    sanitized: true,
  } as unknown as SafeFindingPack;
}

async function runProbePreCompose(openQuestions: string[]) {
  const stages: Array<{ stage: string; detail?: { hardFails?: number; codes?: string[] } }> = [];
  const deps: GoldPipelineDeps = {
    compact: async () => rawPack(openQuestions),
    compose: async () => 'Texto neutro do composer.',
  };
  await runGuardedGoldPipeline(
    { canonical, dossier: 'dossiê legado' },
    deps,
    undefined,
    (stage, detail) => stages.push({ stage, detail: detail as never }),
  );
  return stages;
}

describe('RCA-03 — QUESTION MODALITY (frase real do run dc932b75)', () => {
  it('RED A: pergunta legítima sobre comprovação de operação internacional NÃO produz PROMOTED_CLAIM no pre-compose', async () => {
    const stages = await runProbePreCompose([PERGUNTA_COLOMBIA_REAL, PERGUNTA_ARMAZENAGEM_REAL]);
    const pre = stages.find((s) => s.stage === 'diagnostics-pre-compose');
    expect(pre).toBeDefined();
    expect(pre?.detail?.hardFails).toBe(0);
  });

  it('RED B: a mesma pergunta reinjetada na coluna Validar NÃO fabrica PROMOTED_CLAIM', () => {
    const safePack = baseSafePack([PERGUNTA_COLOMBIA_REAL]);
    const table = buildDynamicValueChainTable(safePack, 'industrial_geral');
    expect(table).not.toBeNull();
    expect(table).not.toContain('confirmad');
    const result = verifyGold(table ?? '', canonical, safePack);
    expect(result.hardFails.filter((h) => h.code === 'PROMOTED_CLAIM')).toHaveLength(0);
  });

  it('RED C: uma AFIRMAÇÃO real sobre a Colômbia DEVE continuar PROMOTED_CLAIM', () => {
    const result = verifyGold(AFIRMACAO_REAL, canonical, baseSafePack([]));
    expect(result.hardFails.map((h) => h.code)).toContain('PROMOTED_CLAIM');
  });

  it('RED D (não-regressão H1): claim AFIRMATIVO com "confirmada" sensível continua acusando no pre-compose', async () => {
    const pack = rawPack([]);
    pack.facts = [
      {
        id: 'f-sens',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Operação internacional confirmada em Cumaribo.',
        status: 'Confirmado',
        // fonte fora da lista fraca do sanitizer — atravessa intacto
        source: 'Registro legal estrangeiro',
        kind: 'operation',
      },
    ];
    const stages: Array<{ stage: string; detail?: { codes?: string[] } }> = [];
    const deps: GoldPipelineDeps = {
      compact: async () => pack,
      compose: async () => 'Texto neutro do composer.',
    };
    await runGuardedGoldPipeline(
      { canonical, dossier: 'dossiê legado' },
      deps,
      undefined,
      (stage, detail) => stages.push({ stage, detail: detail as never }),
    );
    const pre = stages.find((s) => s.stage === 'diagnostics-pre-compose');
    expect(pre?.detail?.codes).toContain('PROMOTED_CLAIM');
  });

  it('RED E: normalizeDiscoveryQuestion neutraliza certeza apenas em interrogativas; o probe textual não fabrica afirmação', () => {
    expect(normalizeDiscoveryQuestion(PERGUNTA_COLOMBIA_REAL)).not.toContain('confirmad');
    expect(normalizeDiscoveryQuestion(PERGUNTA_COLOMBIA_REAL)).toContain('?');
    expect(normalizeDiscoveryQuestion(AFIRMACAO_REAL)).toBe(AFIRMACAO_REAL);

    const probe = buildFrontierProbeText({
      ...baseSafePack([PERGUNTA_COLOMBIA_REAL]),
      sanitizerEvents: [],
    } as never);
    expect(probe).not.toContain('confirmad');
  });
});
