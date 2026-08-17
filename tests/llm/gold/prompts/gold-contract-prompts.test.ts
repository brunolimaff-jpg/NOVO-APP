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
    // BRU-119: instrução antiga "liste os processos" removida; nova instrução
    // de leitura executiva (wordCount ≥900) presente; relação lateral mantém
    // como linguagem humana
    expect(prompt).toMatch(/leitura executiva/i);
    expect(prompt).toMatch(/n[ãN]O liste processos/i);
    expect(prompt).toMatch(/rela[cç][aã]o lateral/i);
  });

  it('D: Mermaid societário — apenas CNPJs permitidos; relação lateral em linguagem humana (BRU-118 sem enum cru)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    // BRU-118: o prompt NÃO pode ensinar os identificadores técnicos crus —
    // eles ecoam na saída (scaffolding leak P1). Descreve a relação em
    // linguagem humana, preservando a direção ("relação lateral").
    expect(prompt).not.toMatch(/partner_other_cnpj|same_root|direct_pj_relation/);
    expect(prompt).toMatch(/relação lateral/i);
    expect(prompt).toMatch(/JAMAIS chame lateral de "empresa do grupo", "controlada" ou "holding"/i);
    expect(prompt).toMatch(/mesma raiz/i);
  });

  it('E: Prompt exige conteúdo seguro para os mapas (regras de proveniência valem no texto do Gold)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/proveni[eê]ncia/i);
    // BRU-119: "gap/dor/ausência" removido do prompt (linha 147 antiga);
    // regras de proveniência e proibição de "capacidade" permanecem em 152+
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
    // BRU-119: "somente fatos Confirmados" removido; nova instrução de
    // leitura curta/não-lista é o substituto relevante
    expect(prompt).toMatch(/leitura comercial curta|n[ãN]O liste processos/i);
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

  // ─── SCOUT-V7-GOLD-EXPERIENCE-01D (Planejador 2026-08-10) — VISUAL-FIRST ───

  it('01D-1: prompt instrui ordem visual → evidência → interpretação → ação', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/visual.*evid[eê]ncia.*interpreta[cç][aã]o.*a[cç][aã]o/i);
  });

  it('01D-2: prompt limita prosa entre superfícies (1 parágrafo curto ou 2 bullets)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/nunca 5-8 par[aá]grafos/i);
    expect(prompt).toMatch(/1 par[aá]grafo curto \(2-3 frases\)/i);
  });

  it('01D-3: prompt define superfícies por tipo (fluxo→Mermaid, inventário→tabela, fatos→bullets, discovery→pergunta, ação→movimento)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/fluxo\/processo\/rela[cç][aã]o/i);
    expect(prompt).toMatch(/invent[aá]rio\/status\/compara[cç][aã]o/i);
    expect(prompt).toMatch(/bullets\/cards/i);
    expect(prompt).toMatch(/pergunta de discovery/i);
    expect(prompt).toMatch(/pr[oó]ximo movimento/i);
  });

  it('01D-4: prompt usa vocabulário semântico congelado de emojis (confiança nunca só pela cor)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    for (const token of ['✅ Confirmado', '🟠 A validar', '🔴 Risco', '💡 Hip[óo]tese', '🔍 Discovery', '🎯 A[cç][aã]o', '🏢 Empresa', '🔗 Rela[cç][aã]o', '📊 Evid[eê]ncia']) {
      expect(prompt).toMatch(new RegExp(token, 'i'));
    }
    expect(prompt).toMatch(/emoji comunica o tipo, nunca a confian[cç]a sozinha/i);
  });

  it('01D-5: prompt mapeia superfícies das 9 seções (tabelas em Tecnologia/Pessoas/Indicadores/Riscos)', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/4 TECNOLOGIA \(tabela/i);
    expect(prompt).toMatch(/5 PESSOAS-CHAVE \(tabela/i);
    expect(prompt).toMatch(/6 INDICADORES \(tabela/i);
    expect(prompt).toMatch(/8 RISCOS \(tabela/i);
  });

  // ─── BRU-48 (Planejador 2026-08-11) — PROMOTED_CLAIM internacional ───

  it('BRU-48: prompt proíbe "confirmada/✅ Operação confirmada" para internacionalização sem fato Confirmado', () => {
    const prompt = buildComposePrompt({ canonical, safePack: {} as never });
    expect(prompt).toMatch(/INTERNACIONALIZA[cÇ][aã]O \(BRU-48\)/i);
    expect(prompt).toMatch(/fonte institucional\/site ≠ fato Confirmado/i);
    expect(prompt).toMatch(/nunca escreva "Opera[cç][aã]o confirmada"/i);
    expect(prompt).toMatch(/🟠 A validar/i);
    expect(prompt).toMatch(/vale em texto, tabelas E em qualquer diagrama/i);
  });
});
