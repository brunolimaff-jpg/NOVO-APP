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

  it('4: Prompt Composer instrui mermaid (fluxo da operação + teia societária) com regra anti-invenção', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Mermaid/i);
    expect(prompt).toMatch(/FLUXO DA OPERA[cÇ][aÃ]O/i);
    expect(prompt).toMatch(/TEIA SOCIET[aÁ]RIA/i);
    expect(prompt).toMatch(/nunca invente etapa, empresa, CNPJ, rela[cç][aã]o ou seta/i);
    expect(prompt).toMatch(/apenas fatos do conteúdo seguro/i);
  });

  it('5: Prompt Composer instrui tabela "Matriz de CNPJs" na Estrutura Societária com CNPJs só do conteúdo seguro', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Matriz de CNPJs/i);
    expect(prompt).toMatch(/empresa \| CNPJ \| papel/i);
    expect(prompt).toMatch(/ESTRUTURA SOCIET[aÁ]RIA/i);
    expect(prompt).toMatch(/n[aã]o invente CNPJ\/nome\/papel|nunca invente CNPJ, nome ou papel/i);
  });

  // ─── SCOUT-V7-GOLD-DEADLINE-180: gates A-G do Planejador (2026-08-09) ───

  it('A: Prompt Composer exige Matriz de CNPJs na seção 3 (whitelist de 4 fontes)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Matriz de CNPJs/i);
    expect(prompt).toMatch(/conta alvo do CANONICAL/i);
    expect(prompt).toMatch(/headOfficeCnpj != null/i);
    expect(prompt).toMatch(/directPjPartners/i);
    expect(prompt).toMatch(/safePack\.relationships/i);
  });

  it('B: Prompt pede 1-2 Mermaid QUANDO houver evidência suficiente (1º fluxo, 2º teia)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/1-2 diagramas Mermaid/i);
    expect(prompt).toMatch(/FLUXO DA OPERA[cÇ][aÃ]O/i);
    expect(prompt).toMatch(/TEIA SOCIET[aÁ]RIA/i);
    expect(prompt).toMatch(/omita-o em vez de inventar/i);
  });

  it('C: Arestas também precisam ser sustentadas — nenhum processo criado só para completar fluxo', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/ARESTAS S[aÃ]O AFIRMA[cÇ][oÕ]ES/i);
    expect(prompt).toMatch(/a aresta tamb[eé]m precisa estar sustentada/i);
    expect(prompt).toMatch(/N[aÃ]O invente a cadeia/i);
    expect(prompt).toMatch(/sem causalidade\/ordem n[aã]o comprovada/i);
  });

  it('D: Mermaid societário — apenas CNPJs permitidos; partner_other_cnpj permanece relação lateral', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/partner_other_cnpj = rela[cç][aã]o lateral/i);
    expect(prompt).toMatch(/JAMAIS chame lateral de "empresa do grupo", "controlada" ou "holding"/i);
    expect(prompt).toMatch(/same_root = mesma raiz/i);
  });

  it('E: Texto Mermaid preserva as regras existentes (sem gap/capacidade/ROI/prazo/integração/middleware)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/termos sens[ií]veis, "gap"\/"lacuna" e aus[eê]ncia-virada-lacuna s[aã]o proibidos tamb[eé]m dentro dos mermaid/i);
    expect(prompt).toMatch(/capacidade.*proibida|PROIBIDA em qualquer forma/i);
  });

  it('F: Fixture com evidência operacional suficiente → permite pelo menos 1 Mermaid válido', () => {
    // safePack com fatos Confirmados de campo, beneficiamento e trading: o
    // prompt deve permitir o fluxo (instrução de incluir quando suportado).
    const frontier = {
      module: 'gold-compactor',
      accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Cultivo de soja confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Beneficiamento de algodão confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
        { id: 'f3', entity: 'SCHEFFER & CIA LTDA', claim: 'Commerce trading confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as never;
    const prompt = buildComposePrompt({ canonical, safePack: frontier });
    expect(prompt).toMatch(/1-2 diagramas Mermaid/i);
    expect(prompt).toMatch(/se houver fatos confirmados de cultivo, beneficiamento e trading, o fluxo DEVE existir/i);
  });

  it('G: Fixture sem evidência operacional → prompt não obriga inventar diagrama', () => {
    // safePack vazio: a instrução deve condicionar à evidência ("quando o
    // conteúdo seguro permitir") e exigir omissão em vez de invenção.
    const frontier = {
      module: 'gold-compactor',
      accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
      facts: [],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as never;
    const prompt = buildComposePrompt({ canonical, safePack: frontier });
    expect(prompt).toMatch(/quando o conteúdo seguro permitir/i);
    expect(prompt).toMatch(/se um diagrama n[aã]o tiver suporte, omita-o em vez de inventar/i);
  });
});
