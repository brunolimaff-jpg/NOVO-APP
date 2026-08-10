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

  it('4: Prompt Composer NÃO escreve Mermaid — fornece conteúdo seguro para o builder determinístico', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/N[ÃA]O escreva c[óo]digo Mermaid/i);
    expect(prompt).toMatch(/builder determin[ií]stico/i);
    expect(prompt).toMatch(/conte[úu]do seguro/i);
    expect(prompt).toMatch(/Mapa do Caos/i);
    expect(prompt).toMatch(/Teia Societ[aá]ria/i);
    expect(prompt).toMatch(/Caminho da Venda/i);
    expect(prompt).toMatch(/SUBSTITU[ÍI]DO/i);
  });

  it('5: Prompt Composer instrui tabela "Tabela de CNPJs" (SEM "Matriz de CNPJs") na Estrutura Societária com CNPJs só do conteúdo seguro', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Tabela de CNPJs/i);
    // SEMANTICS-FIX (Planejador 2026-08-10): "Matriz de CNPJs" como nome de
    // tabela confunde o modelo com tipo cadastral (WRONG_ESTABLISHMENT_TYPE).
    // O prompt não pode conter a expressão literal.
    expect(prompt).not.toMatch(/Matriz de CNPJs/i);
    expect(prompt).toMatch(/empresa \| CNPJ \| papel/i);
    expect(prompt).toMatch(/ESTRUTURA SOCIET[aÁ]RIA/i);
    expect(prompt).toMatch(/n[aã]o invente CNPJ\/nome\/papel|nunca invente CNPJ, nome ou papel/i);
  });

  // ─── SCOUT-V7-GOLD-DEADLINE-180: gates A-G do Planejador (2026-08-09) ───

  it('A: Prompt Composer exige Tabela de CNPJs (sem "Matriz de CNPJs") na seção 3 (whitelist de 4 fontes)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Tabela de CNPJs/i);
    expect(prompt).not.toMatch(/Matriz de CNPJs/i);
    expect(prompt).toMatch(/conta alvo do CANONICAL/i);
    expect(prompt).toMatch(/headOfficeCnpj != null/i);
    expect(prompt).toMatch(/directPjPartners/i);
    expect(prompt).toMatch(/safePack\.relationships/i);
  });

  it('B: Prompt delega os 3 mapas ao builder determinístico (1º Mapa do Caos, 2º teia, 3º Caminho da Venda)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Mapa do Caos na se[çc][aã]o 2/i);
    expect(prompt).toMatch(/Teia Societ[aá]ria na se[çc][aã]o 3/i);
    expect(prompt).toMatch(/Caminho da Venda na se[çc][aã]o 9/i);
    expect(prompt).toMatch(/graph LR/i);
  });

  it('C: Prompt exige conteúdo seguro por seção para os mapas (sem inventar fluxo/aresta)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/somente fatos Confirmados/i);
    expect(prompt).toMatch(/sem gap\/dor\/aus[eê]ncia/i);
    expect(prompt).toMatch(/rela[cç][aã]o lateral/i);
  });

  it('D: Mermaid societário — apenas CNPJs permitidos; partner_other_cnpj permanece relação lateral', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/partner_other_cnpj = rela[cç][aã]o lateral/i);
    expect(prompt).toMatch(/JAMAIS chame lateral de "empresa do grupo", "controlada" ou "holding"/i);
    expect(prompt).toMatch(/same_root = mesma raiz/i);
  });

  it('E: Prompt exige conteúdo seguro para os mapas (regras de proveniência valem no texto do Gold)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/proveni[eê]ncia/i);
    expect(prompt).toMatch(/gap\/dor\/aus[eê]ncia/i);
    expect(prompt).toMatch(/capacidade.*proibida|PROIBIDA em qualquer forma/i);
  });

  it('F: Fixture com evidência operacional suficiente → o prompt instrui o conteúdo dos mapas (fatos confirmados)', () => {
    // safePack com fatos Confirmados de campo, beneficiamento e trading: o
    // prompt deve instruir a listagem do conteúdo seguro que sustenta o Mapa
    // do Caos (operações confirmadas), que o builder transforma em diagrama.
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
    expect(prompt).toMatch(/Mapa do Caos na se[çc][aã]o 2/i);
    expect(prompt).toMatch(/somente fatos Confirmados/i);
    expect(prompt).toMatch(/N[ÃA]O escreva c[óo]digo Mermaid/i);
  });

  it('G: Fixture sem evidência operacional → prompt não obriga o Composer a produzir diagrama', () => {
    // safePack vazio: o Composer não escreve Mermaid; o builder decide os
    // mapas com base no conteúdo. O prompt apenas exige conteúdo seguro.
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
    expect(prompt).toMatch(/N[ÃA]O escreva c[óo]digo Mermaid/i);
    expect(prompt).toMatch(/SUBSTITU[ÍI]DO/i);
  });

  it('H: Prompt instrui visual com emoji NO HEADING DEPOIS do nome (não quebra contrato de seções)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/### 1\. S[ÍI]NTESE EXECUTIVA 🎯/i);
    expect(prompt).toMatch(/### 3\. ESTRUTURA SOCIET[ÁA]RIA 🏛️/i);
    expect(prompt).toMatch(/o emoji DEPOIS n[aã]o quebra o match/i);
    expect(prompt).toMatch(/par[aá]grafos curtos/i);
    expect(prompt).toMatch(/emoji para mascarar afirma[cç][aã]o n[aã]o sustentada/i);
  });

  // ─── SCOUT-V7-GOLD-EXPERIENCE-01 (Planejador 2026-08-10) ───
  // Experiência visual: 3 papéis de Mermaid, legenda com classes, QSA agregado
  // (nunca lista nominal), Caminho da Venda, ausência não vira oportunidade.

  it('EXP-1: Prompt fixa os 3 papéis visuais dos Mermaid (Mapa do Caos, Teia, Caminho da Venda)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/Mapa do Caos/i);
    expect(prompt).toMatch(/Teia Societ[aá]ria|teia societ[aá]ria/i);
    expect(prompt).toMatch(/Caminho da Venda/i);
  });

  it('EXP-2: Prompt delega os Mermaid ao builder determinístico (gramática visual padrão do Scout)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/builder determin[ií]stico/i);
    expect(prompt).toMatch(/gram[aá]tica visual padr[aã]o do Scout/i);
    expect(prompt).toMatch(/graph LR/i);
  });

  it('EXP-3: Prompt PROÍBE lista nominal de pessoas do QSA (só indicador agregado)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    // QSA agregado obrigatório
    expect(prompt).toMatch(/QSA/i);
    expect(prompt).toMatch(/cadastrais, n[ãa]o decisores|n[ãa]o decisores/i);
    // Proibição explícita de listar pessoas individualmente
    expect(prompt).toMatch(/n[ãa]o liste|proibido listar|nunca liste/i);
    expect(prompt).toMatch(/individual|nominal|por extenso/i);
  });

  it('EXP-3b: Prompt envia apenas quantidade QSA (do CANONICAL), preserva pessoa official/report', () => {
    // EXPERIENCE-01C (fix Planejador): a contagem QSA vem do canonical
    // (fonte cadastral), NUNCA do safePack.people. Aqui o canonical tem 2
    // pessoas no QSA mas o safePack tem 1 qsa + 1 official: o prompt deve
    // mostrar "2 pessoas no QSA" (canônico), excluir o nome QSA e manter o
    // papel funcional.
    const canonicalComQsa: CanonicalAccount = {
      ...canonical,
      qsaPeople: [
        { name: 'PESSOA QSA CANONICA 1', role: 'Sócio' },
        { name: 'PESSOA QSA CANONICA 2', role: 'Sócio' },
      ],
    };
    const frontier = {
      module: 'gold-compactor',
      accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
      facts: [], relationships: [], technologySignals: [], metrics: [], conflicts: [], openQuestions: [], sanitizerEvents: [], sanitized: true,
      people: [
        { id: 'qsa-1', personName: 'NOME QSA QUE NAO DEVE ATRAVESSAR', role: 'Sócio', roleBasis: 'qsa', status: 'Confirmado', source: 'QSA oficial' },
        { id: 'official-1', personName: 'RESPONSAVEL FUNCIONAL CONFIRMADO', role: 'Diretor de Operações', roleBasis: 'official', status: 'Confirmado', source: 'Relatório oficial' },
      ],
    } as never;
    const prompt = buildComposePrompt({ canonical: canonicalComQsa, safePack: frontier });
    // contagem canônica (2), não a do safePack (1)
    expect(prompt).toContain('👥 2 pessoas no QSA');
    expect(prompt).not.toContain('👥 1 pessoas no QSA');
    // nomes QSA nunca atravessam (nem do safePack nem do canonical)
    expect(prompt).not.toContain('NOME QSA QUE NAO DEVE ATRAVESSAR');
    expect(prompt).not.toContain('PESSOA QSA CANONICA 1');
    expect(prompt).not.toContain('PESSOA QSA CANONICA 2');
    expect(prompt).toContain('RESPONSAVEL FUNCIONAL CONFIRMADO');
  });

  it('EXP-4: Caminho da Venda contém evidência, hipótese, discovery, validação e movimento comercial', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/evid[eê]ncia/i);
    expect(prompt).toMatch(/hip[óo]tese/i);
    expect(prompt).toMatch(/discovery/i);
    expect(prompt).toMatch(/validad[ao]|valida[cç][aã]o/i);
    expect(prompt).toMatch(/movimento comercial/i);
  });

  it('EXP-5: Ausência de módulo/tecnologia NÃO vira oportunidade automaticamente no Caminho da Venda', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/n[ãa]o saltar de aus[eê]ncia/i);
    expect(prompt).toMatch(/oportunidade/i);
  });
});
