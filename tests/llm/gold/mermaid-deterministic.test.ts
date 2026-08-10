/**
 * SCOUT-V7-GOLD-EXPERIENCE-01C — CANONICAL MERMAID (Planejador 2026-08-10).
 *
 * O Composer não escreve mais Mermaid livre. Um builder determinístico
 * (injectCanonicalGoldMermaids) monta os 3 mapas com a gramática/paleta
 * literal já existente no Scout:
 *   - graph LR (nunca flowchart TD / graph TD / graph TB);
 *   - classDef core/satellite/danger/warning/neutral (valores literais);
 *   - labels curtos entre aspas;
 *   - classes declaradas em linhas separadas no fim;
 *   - sem <br/> e sem emoji dentro do código Mermaid.
 *
 * Gates do contrato (Planejador 2026-08-10):
 *   - nenhum Gold contém flowchart TD, graph TD ou graph TB;
 *   - todos os Mermaid começam em graph LR;
 *   - todos usam literalmente a paleta atual core/satellite/danger/warning/neutral;
 *   - nenhuma tag <br/> no source Mermaid;
 *   - nenhum emoji dentro do código Mermaid;
 *   - labels seguem o padrão atual, curtos e quotados;
 *   - classes ficam em linhas separadas no fim;
 *   - Mapa do Caos renderiza usando o mesmo estilo do sistema atual;
 *   - Teia usa apenas empresas/relações permitidas e zero QSA nominal;
 *   - Caminho da Venda usa o mesmo estilo visual atual;
 *   - buildComposePrompt() não contém nenhum nome vindo de canonical.qsaPeople;
 *   - pessoa official/report permanece disponível;
 *   - regressão com o Gold ruim: ausência de WMS/TMS não vira fragmentação/
 *     planilhas/dor/risco/recomendação de produto sem evidência positiva.
 */
import { describe, expect, it } from 'vitest';
import {
  injectCanonicalGoldMermaids,
  MERMAID_CANONICAL_PALETTE,
} from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { buildComposePrompt } from '../../../services/llm/gold/prompts/gold-contract-prompts';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [
    { name: 'CAROLINA SCHEFFER', role: 'Sócia-Administradora' },
    { name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' },
  ],
};

/** Gold ruim real da rodada e0caa57f: Mermaid livre com flowchart TD, emoji, <br/> e QSA nominal. */
const BAD_GOLD = `# Gold Brief

### 1. SÍNTESE EXECUTIVA 🎯

### 2. PERFIL 🏭
Operação verticalizada.

\`\`\`mermaid
flowchart TD
    A[🌾 Cultivo Próprio<br/>220-230 mil ha] --> B[🏭 Beneficiamento Industrial<br/>10 UBAs]
    B --> C[🚛 Trading & Escoamento]
    C --> D1[📌 Frota Própria<br/>(Indício forte)]
    class A core;
\`\`\`

### 3. ESTRUTURA SOCIETÁRIA 🏛️
A estrutura é centrada na SCHEFFER & CIA LTDA (04.733.767/0001-80). A holding SCHEFFER PARTICIPAÇÕES S/A (11.021.773/0001-70) figura como sócia.

\`\`\`mermaid
flowchart LR
    A["SCHEFFER & CIA LTDA<br/>CNPJ 04.733.767/0001-80<br/>Filial Operacional"]
    B["SCHEFFER PARTICIPAÇÕES S/A<br/>CNPJ 11.021.773/0001-70<br/>Sócia (Holding)"]
    B -->|partner_other_cnpj| A
\`\`\`

### 4. TECNOLOGIA 💻
74 módulos Senior ativos.

### 5. PESSOAS-CHAVE 👥
Carolina, Elizeu, Gilliard, Gislayne e Guilherme Scheffer são os sócios-administradores cadastrais.

### 6. INDICADORES 📊
Área cultivada: 220.000 - 230.000 hectares.

### 7. SINAIS 🚨
Sinal 1: ausência de TMS → processo potencialmente fragmentado.

### 8. RISCOS ⚠️
Risco: gestão de logística via planilhas ou sistemas pontuais.

### 9. PRÓXIMOS PASSOS 🧭
Ações: mapear oportunidades.
`;

function makeSafePack(overrides: Partial<SafeFindingPack> = {}): SafeFindingPack {
  return {
    module: 'gold-compactor',
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
        claim: 'Cultivo próprio de soja, milho e algodão confirmado.',
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
      {
        id: 'f2',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Beneficiamento em 10 UBAs confirmado.',
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
      {
        id: 'f3',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Frota própria para escoamento confirmada.',
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
      {
        id: 'f4',
        entity: 'SCHEFFER & CIA LTDA',
        claim: '74 módulos Senior ativos no CRM interno.',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'technology',
        process: null,
      },
    ],
    relationships: [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: '11.021.773/0001-70',
        relationType: 'direct_pj_relation',
        status: 'Confirmado',
        source: 'socio-search',
        evidence: null,
      },
    ],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
    ...overrides,
  } as SafeFindingPack;
}

describe('SCOUT-V7-GOLD-EXPERIENCE-01C — CANONICAL MERMAID', () => {
  it('RED 1: Gold atual viola o contrato visual (flowchart TD, emoji, <br/>)', () => {
    expect(BAD_GOLD).toMatch(/flowchart\s+TD|graph\s+TD|graph\s+TB/i);
    expect(BAD_GOLD).toMatch(/<br\s*\/?>/i);
    // emoji dentro de nó Mermaid
    expect(BAD_GOLD).toMatch(/A\[🌾/);
  });

  it('RED 2: Gold ruim com sinônimos de fragilidade é capturado pela R10 fortalecida', () => {
    // Regressão semântica: "processo potencialmente fragmentado" e "planilhas
    // ou sistemas pontuais" — antes da R10 fortalecida (EXPERIENCE-01C) esses
    // sinônimos passavam despercebidos; agora são ABSENCE_DERIVED_WEAKNESS.
    const result = verifyGold(BAD_GOLD, canonical, makeSafePack());
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('GREEN 3: builder produz graph LR + paleta canônica + labels quotados + classes no fim', () => {
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, makeSafePack());
    // nenhum diagrama proibido
    expect(gold).not.toMatch(/flowchart\s+TD|graph\s+TD|graph\s+TB/i);
    expect(gold).not.toMatch(/<br\s*\/?>/i);
    // todo mermaid começa com graph LR
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toMatch(/graph\s+LR/);
      // paleta canônica literal
      expect(block).toContain(MERMAID_CANONICAL_PALETTE.core);
      expect(block).toContain(MERMAID_CANONICAL_PALETTE.satellite);
      expect(block).toContain(MERMAID_CANONICAL_PALETTE.danger);
      expect(block).toContain(MERMAID_CANONICAL_PALETTE.warning);
      expect(block).toContain(MERMAID_CANONICAL_PALETTE.neutral);
      // sem emoji dentro do código mermaid
      expect(block).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      // classes em linhas separadas no fim
      expect(block).toMatch(/class\s+\w[\w,]*\s+\w+;/);
    }
  });

  it('GREEN 4: Teia usa apenas empresas/CNPJs permitidos e zero QSA nominal', () => {
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, makeSafePack());
    const teia = gold.match(/```mermaid\n([\s\S]*?)```/g)?.find((b) => b.includes('SCHEFFER')) ?? '';
    expect(teia).toContain('04.733.767/0001-80');
    expect(teia).toContain('11.021.773/0001-70');
    // nenhum nome de pessoa QSA no diagrama
    expect(teia).not.toContain('CAROLINA');
    expect(teia).not.toContain('ELIZEU');
  });

  it('GREEN 5: buildComposePrompt NÃO contém nomes de canonical.qsaPeople (leak fechado)', () => {
    const frontier = makeSafePack() as never;
    const prompt = buildComposePrompt({ canonical, safePack: frontier });
    expect(prompt).not.toContain('CAROLINA SCHEFFER');
    expect(prompt).not.toContain('ELIZEU ZULMAR MAGGI SCHEFFER');
  });

  it('GREEN 5b: qsaCount vem do CANONICAL (não do safePack) — contagem exata no prompt', () => {
    // O canonical tem 2 pessoas no QSA; o safePack.people NÃO tem nenhuma
    // pessoa QSA. A contagem do prompt deve ser 2 (fonte canônica), não 0.
    const frontier = makeSafePack() as never;
    const prompt = buildComposePrompt({ canonical, safePack: frontier });
    expect(prompt).toContain('👥 2 pessoas no QSA');
    expect(prompt).not.toContain('👥 0 pessoas no QSA');
  });

  it('GREEN 7: Mapa do Caos NÃO cria aresta sem evidência (fato A + fato B confirmados → nós sem seta)', () => {
    const pack = makeSafePack({
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Cultivo de soja confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: 'Beneficiamento de algodão confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const chaos = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[0] ?? '';
    // Os processos aparecem como nós, mas NENHUMA aresta entre eles
    expect(chaos).toContain('Cultivo de soja confirmado');
    expect(chaos).toContain('Beneficiamento de algodão confirmado');
    // SEM aresta inventada entre processos (==> ou --> entre nós B)
    expect(chaos).not.toMatch(/B\d+\s*(?:==>|-->|-.->)\s*B\d+/);
    // SEM ligação arbitrária de tecnologia a processo
    expect(chaos).not.toMatch(/B\d+\s*-\.->\s*C\d+/);
    expect(chaos).not.toMatch(/C\d+\s*<-\s*B\d+/);
  });

  it('GREEN 7b: métrica NÃO vira elo operacional no Mapa do Caos', () => {
    const pack = makeSafePack({
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Cultivo de soja confirmado.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', claim: '2.700 colaboradores.', status: 'Confirmado', source: 'Fonte externa', kind: 'metric', process: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const chaos = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[0] ?? '';
    expect(chaos).not.toContain('2.700 colaboradores');
    expect(chaos).toContain('Cultivo de soja confirmado');
  });

  it('GREEN 8: Teia com relação Pista inicial vira nó "A validar" SEM seta + legenda determinística', () => {
    const pack = makeSafePack({
      relationships: [
        { id: 'r1', entity: 'SCHEFFER & CIA LTDA', relatedEntity: '99.999.999/0001-99', relationType: 'partner_other_cnpj', status: 'Pista inicial', source: 'socio-search', evidence: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const teia = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[1] ?? '';
    // Nó com incerteza em texto
    expect(teia).toContain('(A validar)');
    // O nó da pista (A3) NÃO tem seta — mas a matriz (A1) e o partner (A2)
    // legítimos têm (==> para a conta alvo)
    const pistaLine = teia.split('\n').find((l) => l.includes('A3'));
    expect(pistaLine).not.toMatch(/==>|-->|-\.->/);
    // SEM declaração duplicada do mesmo nó
    const a3Decls = teia.match(/A3\[/g) ?? [];
    expect(a3Decls.length).toBe(1);
    // Legenda determinística presente FORA do fence (B3.1)
    expect(teia).not.toContain('Legenda');
    expect(gold).toContain('*Legenda:');
  });

  it('GREEN 9: Teia com relação Confirmado vira seta (direct_pj_relation ==> ; lateral -.->)', () => {
    const pack = makeSafePack({
      relationships: [
        { id: 'r1', entity: 'SCHEFFER & CIA LTDA', relatedEntity: '11.021.773/0001-70', relationType: 'direct_pj_relation', status: 'Confirmado', source: 'socio-search', evidence: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const teia = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[1] ?? '';
    expect(teia).toMatch(/==>/);
  });

  it('GREEN 10: os 3 Mermaid determinísticos passam pelo sanitizeMermaidCode (runtime do renderer)', async () => {
    // O renderer de produção aplica sanitizeMermaidCode (utils/mermaid.ts)
    // antes de chamar mermaid.parse() — foi um parse error que originou esta
    // rodada. Os mapas do builder devem passar pela mesma sanitização sem
    // erro e preservar a gramática canônica (graph LR + paleta literal).
    // (O parse REAL da lib mermaid exige DOMPurify, indisponível no Node;
    // o sanitizer é a barreira compartilhada que o runtime executa.)
    const { sanitizeMermaidCode } = await import('../../../utils/mermaid');
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, makeSafePack());
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      const code = block.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
      const sanitized = sanitizeMermaidCode(code);
      // sanitização não corrompe a gramática canônica
      expect(sanitized).toMatch(/graph\s+LR/);
      expect(sanitized).not.toMatch(/flowchart\s+TD|graph\s+TD|graph\s+TB/);
      expect(sanitized).not.toMatch(/<br\s*\/?>/i);
    }
  });

  it('GREEN 11: Teia sem nome empresarial usa label "CNPJ ..." (sem duplicar CNPJ no label)', () => {
    const pack = makeSafePack({
      relationships: [
        { id: 'r1', entity: 'SCHEFFER & CIA LTDA', relatedEntity: '12.345.678/0001-90', relationType: 'partner_other_cnpj', status: 'Confirmado', source: 'socio-search', evidence: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const teia = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[1] ?? '';
    expect(teia).toContain('CNPJ 12.345.678/0001-90');
    // label não repete o CNPJ duas vezes
    expect(teia).not.toMatch(/12\.345\.678\/0001-90 — 12\.345\.678\/0001-90/);
  });

  it('RED 12: Gold ruim passa a ser REPROVADO pelo verifier (regressão semântica do 01C)', () => {
    const result = verifyGold(BAD_GOLD, canonical, makeSafePack());
    expect(result.passed).toBe(false);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
  });

  it('GREEN 6: verifier sobre o Gold com Mermaid determinístico reprova fragilidade derivada no corpo', () => {
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, makeSafePack());
    // o builder substitui os Mermaid mas NÃO é um sanitizador de texto:
    // as frases de fragilidade do corpo (seções 7/8) permanecem e DEVEM ser
    // reprovadas pela R10 fortalecida (regressão semântica do 01C).
    expect(gold).not.toMatch(/flowchart\s+TD|graph\s+TD|graph\s+TB|<br\s*\/?>/i);
    const result = verifyGold(gold, canonical, makeSafePack());
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  // ─── R10 parametrizada (BLOQUEADOR 4 do Planejador 2026-08-10) ───
  // cada sinônimo novo falha individualmente SEM proveniência; e passa
  // individualmente COM fato Confirmado + fonte externa correspondente.

  const WEAKNESS_SYNONYMS = [
    'processo potencialmente fragmentado',
    'processos manuais',
    'planilhas ou sistemas pontuais',
    'sem sistema centralizado',
    'sem gestão centralizada',
    'dependência de sistemas manuais',
    'ponto de fragilidade',
    'fragilidade operacional',
  ];

  it.each(WEAKNESS_SYNONYMS)('R10-param: "%s" falha SEM proveniência', (phrase) => {
    const gold = `# Gold\n\n### 7. SINAIS 🚨\nSinal 1: ${phrase}.\n`;
    const result = verifyGold(gold, canonical, makeSafePack());
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it.each([
    // pares REALMENTE equivalentes por categoria (B4)
    ['processo potencialmente fragmentado', 'A auditoria oficial confirmou processo fragmentado de expedição.'],
    ['processos manuais', 'A auditoria oficial confirmou processo manual de expedição.'],
    ['planilhas ou sistemas pontuais', 'A auditoria oficial confirmou controle por planilha na expedição.'],
    ['sem sistema centralizado', 'A auditoria oficial confirmou operação sem sistema centralizado de logística.'],
    ['sem gestão centralizada', 'A auditoria oficial confirmou operação sem sistema centralizado de logística.'],
    ['dependência de sistemas manuais', 'A auditoria oficial confirmou dependência de planilhas manuais.'],
  ])('R10-param: "%s" PASSA com fato Confirmado + fonte externa da MESMA categoria', (phrase, claim) => {
    const pack = makeSafePack({
      facts: [
        { id: 'f-aud', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
      ],
    });
    const gold = `# Gold\n\n### 7. SINAIS 🚨\nSinal 1: ${phrase}.\n`;
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it.each([
    // evidência externa EXISTE mas é de OUTRA categoria → continua FAIL (B4)
    ['sem sistema centralizado', 'Processo de certificação anual auditado.'],
    // direção semântica: "sistema centralizado" é o OPOSTO de "sem sistema centralizado"
    ['sem sistema centralizado', 'Sistema centralizado de folha de pagamento auditado.'],
    ['processo potencialmente fragmentado', 'Processo manual de expedição auditado.'],
    ['dependência de sistemas manuais', 'Sistema centralizado de folha de pagamento auditado.'],
    ['planilhas ou sistemas pontuais', 'Sistema centralizado de folha de pagamento auditado.'],
  ])('R10-param: "%s" FALHA mesmo com evidência externa de outra categoria/direção', (phrase, claim) => {
    const pack = makeSafePack({
      facts: [
        { id: 'f-aud', entity: 'SCHEFFER & CIA LTDA', claim, status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
      ],
    });
    const gold = `# Gold\n\n### 7. SINAIS 🚨\nSinal 1: ${phrase}.\n`;
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('R10-param: evidência de OUTRA EMPRESA não libera a frase da conta (entity-aware B4)', () => {
    // Gold fala de SCHEFFER; a evidência de manualidade pertence à EMPRESA
    // LATERAL (outra entidade) → NÃO pode liberar a frase (sem empréstimo).
    const pack = makeSafePack({
      facts: [
        { id: 'f-lateral', entity: 'EMPRESA LATERAL XYZ', claim: 'Processo manual de expedição auditado.', status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
      ],
    });
    const gold = '# Gold\n\n### 7. SINAIS 🚨\nSinal 1: processos manuais.\n';
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('R10-param: frase com DUAS categorias falha se só UMA tem evidência (multi-claim B4)', () => {
    // Gold: "sem sistema centralizado E com processos manuais" (2 claims R10).
    // SafePack só comprova a centralização; manualidade SEM evidência →
    // a sentença inteira deve ser reprovada (fato verdadeiro não autoriza
    // outra afirmação não comprovada).
    const pack = makeSafePack({
      facts: [
        { id: 'f-cent', entity: 'SCHEFFER & CIA LTDA', claim: 'A operação está sem sistema centralizado de logística.', status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
      ],
    });
    const gold = '# Gold\n\n### 7. SINAIS 🚨\nSinal 1: sem sistema centralizado e com processos manuais.\n';
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('R10-param: frase com DUAS categorias passa com evidência para AMBAS (multi-claim B4)', () => {
    // SafePack comprova centralização E manualidade (mesma entidade, fontes
    // externas) → a frase composta passa (todas as categorias cobertas).
    const pack = makeSafePack({
      facts: [
        { id: 'f-cent', entity: 'SCHEFFER & CIA LTDA', claim: 'A operação está sem sistema centralizado de logística.', status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
        { id: 'f-man', entity: 'SCHEFFER & CIA LTDA', claim: 'Processo manual de expedição auditado.', status: 'Confirmado', source: 'Auditoria oficial', kind: 'operation', process: null },
      ],
    });
    const gold = '# Gold\n\n### 7. SINAIS 🚨\nSinal 1: sem sistema centralizado e com processos manuais.\n';
    const result = verifyGold(gold, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'ABSENCE_DERIVED_WEAKNESS')).toBe(false);
    expect(result.passed).toBe(true);
  });

  it('GREEN 13: legenda fica FORA do fence Mermaid (texto markdown após o bloco), nos 3 mapas', () => {
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, makeSafePack());
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    // Nenhum bloco Mermaid contém a palavra "Legenda" dentro do fence
    for (const block of blocks) {
      expect(block).not.toContain('Legenda');
    }
    // A legenda aparece APÓS cada fence (fora), nos 3 mapas
    const legendCount = (gold.match(/\*Legenda:/g) ?? []).length;
    expect(legendCount).toBeGreaterThanOrEqual(3);
  });

  it('GREEN 14: canonical não é rebaixado por relação fraca do SafePack (B3.2)', () => {
    // O CNPJ 11.021.773/0001-70 é directPjPartner do canonical (Confirmado).
    // Uma relação Pista inicial no SafePack para o MESMO CNPJ NÃO pode
    // rebaixar o nó para "(A validar)" nem mudar a classe para neutral.
    const pack = makeSafePack({
      relationships: [
        { id: 'r1', entity: 'SCHEFFER & CIA LTDA', relatedEntity: '11.021.773/0001-70', relationType: 'partner_other_cnpj', status: 'Pista inicial', source: 'socio-search', evidence: null },
      ],
    });
    const gold = injectCanonicalGoldMermaids(BAD_GOLD, canonical, pack);
    const teia = gold.match(/```mermaid\n([\s\S]*?)```/g)?.[1] ?? '';
    // nó canônico SEM "(A validar)"
    const partnerLine = teia.split('\n').find((l) => l.includes('SCHEFFER PARTICIPACOES'));
    expect(partnerLine).not.toContain('A validar');
    // relação canônica permanece (==> para a conta)
    expect(teia).toMatch(/==>/);
    // classe do partner continua satellite (não neutral)
    expect(teia).toMatch(/class\s+A2 satellite/);
    expect(teia).not.toMatch(/class\s+A2 neutral/);
  });
});
