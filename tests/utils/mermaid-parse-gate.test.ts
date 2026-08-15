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
