/**
 * SCOUT-V7-GOLD-RUNTIME-QUALITY-01 — testes determinísticos do pacote
 * (Planejador 2026-08-09): alinhamento semântico dos prompts Compact/Composer
 * com o PROMPT_SPEC.md (drift detectado: runtime omitia regras de conflitos e
 * não promoção). Nenhum schema/sanitizer/verifier alterado.
 */
import { describe, expect, it } from 'vitest';
import { buildCompactPrompt, buildComposePrompt } from '../../../../services/llm/gold/prompts/gold-contract-prompts';
import type { CanonicalAccount } from '../../../../services/llm/gold/gold-contracts';
import { sanitizeFindingPack } from '../../../../services/llm/gold/finding-sanitizer';
import { frontierPackSchema, rawFindingPackSchema } from '../../../../services/llm/gold/gold-contracts';

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: null,
  headOfficeLegalName: null,
  directPjPartners: [],
  qsaPeople: [],
};

/** Dossiê contraditório (caso Scheffer): internacionalização não confirmada vs presença na Colômbia. */
const CONTRADICTORY_DOSSIER = [
  '# DOSSIÊ',
  'Teia societária: Não encontrada confirmação pública de registro legal, sócio ou operação no exterior.',
  'DNA Operacional: Operação multiestado com presença confirmada em MT e Colômbia (Cumaribo).',
].join('\n');

describe('SCOUT-V7-GOLD-RUNTIME-QUALITY-01 — prompts alinhados ao PROMPT_SPEC', () => {
  it('1: Prompt Compact contém regra explícita de conflitos e não promoção de status', () => {
    const prompt = buildCompactPrompt({ canonical, dossier: CONTRADICTORY_DOSSIER });
    expect(prompt).toMatch(/conflicts/i);
    expect(prompt).toMatch(/nunca promova pista\/infer[eê]ncia para Confirmado/i);
    expect(prompt).toMatch(/n[aã]o escolha silenciosamente/i);
    expect(prompt).toMatch(/"uma fonte menciona X" n[aã]o equivale a "X est[aá] confirmado"/i);
  });

  it('2: Prompt Composer recebe conflicts do Frontier e contém regra de não promoção', () => {
    const frontier = {
      module: 'gold-compactor',
      accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
      facts: [],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: ['Internacionalização: dossiê diz não confirmada no exterior; outra seção cita presença na Colômbia.'],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as never;
    const prompt = buildComposePrompt({ canonical, safePack: frontier });
    expect(prompt).toContain('conflicts');
    expect(prompt).toMatch(/CONFLICTS \(do Frontier\) é RESTRIÇÃO/i);
    expect(prompt).toMatch(/nunca pode ser afirmado como Confirmado/i);
  });

  it('3: conflicts atravessa raw → safe → frontier sem ser apagado (contradição preservada)', () => {
    const raw = rawFindingPackSchema.parse({
      module: 'gold-compactor',
      accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
      facts: [{ id: 'f1', entity: 'GRUPO SCHEFFER', claim: 'Operação multiestado com presença confirmada em MT e Colômbia (Cumaribo).', status: 'Confirmado', source: 'Dossiê Scout 360', kind: 'operation', process: null }],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: ['Internacionalização: não confirmada no exterior (Teia) vs presença na Colômbia (DNA Operacional).'],
      openQuestions: [],
      discardedClaims: [],
    });

    const safe = sanitizeFindingPack(raw, canonical);
    expect(safe.conflicts).toHaveLength(1);

    const { originalPack: _op, discardedClaims: _dc, sanitizerEvents, ...frontierRest } = safe;
    const frontier = frontierPackSchema.parse({ ...frontierRest, sanitizerEvents: sanitizerEvents.map(({ before: _b, ...e }) => e) });
    expect(frontier.conflicts).toHaveLength(1);
    expect(frontier.conflicts[0]).toMatch(/n[aã]o confirmada no exterior/);
  });
});
