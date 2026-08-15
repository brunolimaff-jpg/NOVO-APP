import { describe, it, expect } from 'vitest';
import mermaid from 'mermaid';
import { sanitizeMermaidCode } from '../../utils/mermaid';
import { injectCanonicalGoldMermaids } from '../../services/llm/gold/mermaid/mermaid-deterministic';
import type { CanonicalAccount, SafeFindingPack } from '../../services/llm/gold/gold-contracts';

/**
 * BRU-108 — GATE DE PARSE REAL (release gate).
 *
 * O teste antigo validava apenas `sanitizeMermaidCode` (string); os parse
 * errors do run 2fe72ab3 passaram no CI porque o parser REAL do Mermaid
 * nunca era executado. Este gate roda `mermaid.parse()` (mesma lib do
 * runtime, 10.9.6) sobre os blocos sanitizados que o renderer de produção
 * executa de verdade.
 */
describe('BRU-108 — gate de parse REAL do Mermaid (runtime)', () => {
  it('o bloco REAL do run 2fe72ab3 (nó C1 com parênteses + pipes) parseia após sanitize', async () => {
    const realBlock = [
      'graph LR',
      'classDef core fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;',
      'A0["Operação principal"]',
      'B1["CNAE principal: 0115-6/00 - Cultivo de soja"]',
      'C1["GRUPO SCHEFFER: ERP Core (Backoffice): Senior Sistemas mencionado | GRUPO SCHEFFER: Satélites Operacionais: GATec (Gestão Agrícola, Beneficiamento de Algodão, Commerce Trading, Gestão de Frota, Apontamentos Mobile, BI, Mapfy Basic, Operações Arrendamento Mercantil, Sistema Geográfico de Informações, Gestão de Custos Gerenciais, Gestão de Manutenção Industrial, Gestão de Relacionamento com Fornecedor) mencionado | GRUPO SCHEFFER: A Ruptura Crítica: Ausência de TMS/WMS Senior mencionada no CRM, apesar de frota própria e operação multiestado/internacional - reconciliação logística manual ou em sistema paralelo | GRUPO SCHEFFER: Sistema de Gestão: Base tecnológica robusta no ecossistema Senior (ERP, HCM, GATec) | GRUPO SCHEFFER: Maturidade de RH: ALTA - HCM Senior contratado com 16 módulos ativos (Ponto, Medicina, SST, Recrutamento, Desempenho, Remuneração, Admissão Digital, Moods)"]',
      'class A0 core;',
      'class C1 warning;',
    ].join('\n');

    const sanitized = sanitizeMermaidCode(realBlock);
    // o sanitizer NÃO pode corromper o label citado com pipes internos
    expect(sanitized).toContain('C1["GRUPO SCHEFFER: ERP Core (Backoffice)');
    await expect(mermaid.parse(sanitized)).resolves.not.toThrow();
  });

  it('RED 1a: sem o fix, parênteses dentro de label citado com pipes quebra o parse', async () => {
    // Sanidade: um label com parênteses SEM pipes dentro parseia direto,
    // mas o C1 real (com pipes + parênteses) só passa depois do fix do
    // quotePipeEdgeLabelSpecialChars — coberto pelo teste acima. Aqui
    // garantimos que o pipeline completo (builder → sanitize → parse)
    // também passa.
    const block = [
      'graph LR',
      'C1["ERP Core (Backoffice) | Satélites: GATec (Gestão Agrícola, Frota)"]',
      'class C1 warning;',
    ].join('\n');
    await expect(mermaid.parse(sanitizeMermaidCode(block))).resolves.not.toThrow();
  });

  it('1b: aresta do Caminho da Venda com rótulo usa sintaxe canônica == texto ==>', async () => {
    const sales = [
      'graph LR',
      'A["Evidência segura"] ==> B["Hipótese comercial"]',
      'C ==> D{"Problema confirmado?"}',
      'D ==> Sim ==> E["Definir sponsor e owner"]',
      'D ==> Não ==> H["Nutrir ou encerrar hipótese"]',
      'class A core;',
      'class D warning;',
    ].join('\n');
    const sanitized = sanitizeMermaidCode(sales);
    expect(sanitized).not.toMatch(/--\s*Sim\s*==>/);
    await expect(mermaid.parse(sanitized)).resolves.not.toThrow();
  });

  it('gate: os 3 Mermaid determinísticos do builder parseiam após sanitize', async () => {
    const canonical: CanonicalAccount = {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      headOfficeCnpj: null,
      directPjPartners: [],
      qsaPeople: [],
    };
    const pack: SafeFindingPack = {
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Plantio próprio confirmado: 220–230 mil ha em duas safras; CNAE principal 0115-6/00 (Cultivo de soja)', status: 'Confirmado', source: 'x', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Beneficiamento de algodão (UBA/pluma) confirmado via módulo GATec no CRM Senior', status: 'Confirmado', source: 'x', process: null },
        { id: 'f3', entity: 'SCHEFFER & CIA LTDA', kind: 'technology', claim: 'ERP Core (Backoffice): Senior Sistemas | Satélites: GATec (Gestão Agrícola, Beneficiamento de Algodão, Frota) | Maturidade RH: ALTA (Ponto, Medicina)', status: 'Confirmado', source: 'x', process: null },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;
    const badGold = '### 1. SÍNTESE EXECUTIVA\n\n### 2. PERFIL\n\n### 3. ESTRUTURA SOCIETÁRIA\n\n### 4. TECNOLOGIA\n\n### 5. PESSOAS-CHAVE\n\n### 6. INDICADORES\n\n### 7. SINAIS\n\n### 8. RISCOS\n\n### 9. PRÓXIMOS PASSOS';
    const gold = injectCanonicalGoldMermaids(badGold, canonical, pack);
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const code = block.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
      const sanitized = sanitizeMermaidCode(code);
      await expect(mermaid.parse(sanitized)).resolves.not.toThrow();
    }
  });
});

/**
 * ARCH-D (BRU-113) — Canonical Render Contract.
 *
 * Invariante: para Mermaid Gold, o builder determinístico é o owner da
 * gramática e o renderer faz sanitização MÍNIMA de segurança + parse/render
 * real — sem repair semântico do source do próprio builder.
 *
 * Fixtures adversariais obrigatórias (do despacho): parênteses, pipes, aspas,
 * CNPJ, acentos, labels longos, rótulos Sim/Não e conteúdo real GATec.
 */
describe('BRU-113 ARCH-D — caminho canônico Gold: builder → parse REAL (sem repair semântico)', () => {
  const GOLD_CANONICAL: CanonicalAccount = {
    inputCnpj: '04.733.767/0001-80',
    legalName: 'SCHEFFER & CIA LTDA',
    establishmentType: 'Filial',
    rootCnpj: '04.733.767',
    headOfficeCnpj: null,
    directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
    qsaPeople: [],
  };

  function makePack(facts: Array<{ claim: string; kind: string }>): SafeFindingPack {
    return {
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: facts.map((f, i) => ({
        id: `f${i}`,
        entity: 'SCHEFFER & CIA LTDA',
        claim: f.claim,
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: f.kind as 'operation',
        process: null,
      })),
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;
  }

  const HEADERS = '### 1. SÍNTESE EXECUTIVA\n\n### 2. PERFIL\n\n### 3. ESTRUTURA SOCIETÁRIA\n\n### 4. TECNOLOGIA\n\n### 5. PESSOAS-CHAVE\n\n### 6. INDICADORES\n\n### 7. SINAIS\n\n### 8. RISCOS\n\n### 9. PRÓXIMOS PASSOS';

  async function parseGoldBlocks(gold: string): Promise<void> {
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const code = block.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
      // sanitização MÍNIMA de segurança (sem repair semântico)
      const minimal = sanitizeMermaidCode(code);
      await expect(mermaid.parse(minimal), `parse real falhou para bloco:\n${code}`).resolves.not.toThrow();
    }
  }

  it('parênteses + pipes + aspas + acentos: labels com GATec (Gestão Agrícola, ...)', async () => {
    const gold = injectCanonicalGoldMermaids(
      HEADERS,
      GOLD_CANONICAL,
      makePack([
        { claim: 'Plantio próprio de 220–230 mil ha em duas safras; CNAE 0115-6/00 (Cultivo de soja)', kind: 'operation' },
        { claim: 'Beneficiamento de algodão (UBA/pluma) confirmado via módulo GATec no CRM Senior', kind: 'operation' },
        { claim: 'ERP Core (Backoffice): Senior Sistemas | GATec (Gestão Agrícola, Beneficiamento, Frota) | Maturidade RH: ALTA', kind: 'technology' },
      ]),
    );
    await parseGoldBlocks(gold);
  });

  it('CNPJ formatado nos labels da Teia', async () => {
    const gold = injectCanonicalGoldMermaids(HEADERS, GOLD_CANONICAL, makePack([
      { claim: 'Cultivo próprio de soja em larga escala', kind: 'operation' },
      { claim: 'Beneficiamento de algodão em pluma (UBA)', kind: 'operation' },
    ]));
    await parseGoldBlocks(gold);
  });

  it('rótulos Sim/Não do Caminho da Venda (sintaxe canônica == texto ==>)', async () => {
    const gold = injectCanonicalGoldMermaids(HEADERS, GOLD_CANONICAL, makePack([
      { claim: 'Cultivo próprio de soja em larga escala', kind: 'operation' },
      { claim: 'Beneficiamento de algodão em pluma (UBA)', kind: 'operation' },
    ]));
    expect(gold).toMatch(/==>\s*Sim\s*==>/);
    expect(gold).toMatch(/==>\s*Não\s*==>/);
    await parseGoldBlocks(gold);
  });

  it('conteúdo real GATec do incidente BRU-108 (labels longos com pipes)', async () => {
    const gold = injectCanonicalGoldMermaids(
      HEADERS,
      GOLD_CANONICAL,
      makePack([
        { claim: 'Cultivo próprio de soja, milho e algodão em larga escala', kind: 'operation' },
        { claim: 'Beneficiamento de algodão em pluma (UBA)', kind: 'operation' },
        {
          claim: 'GRUPO SCHEFFER: ERP Core (Backoffice): Senior Sistemas mencionado | GRUPO SCHEFFER: Satélites Operacionais: GATec (Gestão Agrícola, Beneficiamento de Algodão, Commerce Trading, Gestão de Frota, Apontamentos Mobile, BI, Mapfy Basic, Operações Arrendamento Mercantil, Sistema Geográfico de Informações, Gestão de Custos Gerenciais, Gestão de Manutenção Industrial, Gestão de Relacionamento com Fornecedor) mencionado | GRUPO SCHEFFER: A Ruptura Crítica: Ausência de TMS/WMS Senior mencionada no CRM, apesar de frota própria e operação multiestado/internacional - reconciliação logística manual ou em sistema paralelo | GRUPO SCHEFFER: Sistema de Gestão: Base tecnológica robusta no ecossistema Senior (ERP, HCM, GATec) | GRUPO SCHEFFER: Maturidade de RH: ALTA - HCM Senior contratado com 16 módulos ativos (Ponto, Medicina, SST, Recrutamento, Desempenho, Remuneração, Admissão Digital, Moods)',
          kind: 'technology',
        },
      ]),
    );
    await parseGoldBlocks(gold);
  });

  it('labels longos do Mapa do Caos (claims integrais)', async () => {
    const gold = injectCanonicalGoldMermaids(
      HEADERS,
      GOLD_CANONICAL,
      makePack([
        { claim: 'Verticalização confirmada: Cultivo (soja/milho/algodão) + beneficiamento de algodão + armazenagem própria', kind: 'operation' },
        { claim: 'Infraestrutura Crítica: Beneficiamento de algodão (UBA/pluma) confirmado via módulo GATec; armazenagem própria inferida pela escala e pelo módulo Operis contratado', kind: 'operation' },
        { claim: 'Arsenal Logístico/Aéreo: Frota própria confirmada via GATec Gestão de Frota; quantidade de caminhões/bitrens — não encontrada publicamente', kind: 'operation' },
      ]),
    );
    await parseGoldBlocks(gold);
  });
});

describe('BRU-113 ARCH-D — caracterização: builder é owner da gramática (sem repair semântico)', () => {
  it('os 3 Mermaid do builder parseiam DIRETO (sem sanitize) — renderer só faz segurança mínima', async () => {
    const canonical: CanonicalAccount = {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      headOfficeCnpj: null,
      directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
      qsaPeople: [],
    };
    const pack: SafeFindingPack = {
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Plantio próprio de 220–230 mil ha em duas safras; CNAE 0115-6/00 (Cultivo de soja)', status: 'Confirmado', source: 'x', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Beneficiamento de algodão (UBA/pluma) confirmado via módulo GATec', status: 'Confirmado', source: 'x', process: null },
        { id: 'f3', entity: 'SCHEFFER & CIA LTDA', kind: 'technology', claim: 'ERP Core (Backoffice) | GATec (Gestão Agrícola, Beneficiamento, Frota)', status: 'Confirmado', source: 'x', process: null },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;
    const HEADERS = '### 1. SÍNTESE EXECUTIVA\n\n### 2. PERFIL\n\n### 3. ESTRUTURA SOCIETÁRIA\n\n### 4. TECNOLOGIA\n\n### 5. PESSOAS-CHAVE\n\n### 6. INDICADORES\n\n### 7. SINAIS\n\n### 8. RISCOS\n\n### 9. PRÓXIMOS PASSOS';
    const gold = injectCanonicalGoldMermaids(HEADERS, canonical, pack);
    const blocks = gold.match(/```mermaid\n([\s\S]*?)```/g) ?? [];
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of blocks) {
      const code = block.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
      // SEM sanitize — o source do builder já é gramática canônica válida
      await expect(mermaid.parse(code), `parse REAL sem sanitize falhou:\n${code}`).resolves.not.toThrow();
    }
  });
});
