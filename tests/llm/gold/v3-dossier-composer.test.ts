import { describe, expect, it } from 'vitest';
import {
  DOSSIER_V3_SECTIONS,
  canonicalFactsFromTeiaText,
  composeDossierV3,
  type DossierV3CanonicalFact,
} from '../../../services/llm/gold/v3-dossier-composer';

/**
 * BRU-155 — Gold Quality V3 (TDD causal, REAL_PROVIDER_CALLS=0).
 *
 * Compositor determinístico da saída final V3 (oracle
 * EXECUTIVE_LEAN_DOSSIER_OUTPUT_CONTRACT_V3): exatamente 8 seções na ordem
 * canônica, máximo 1 mermaid, reconciliação de fatos canônicos do mapa
 * societário contra a narrativa, ausência explícita ("Não encontrado") e
 * preservação de fontes/proveniência. Nenhuma chamada a provider.
 */

const RAW_TEIA_MODULE = [
  '# 🎯 DOSSIÊ: TEIA SOCIETÁRIA E MASSA REAL - GRUPO X',
  '**📋 VISÃO GERAL DO GRUPO ECONÔMICO REAL**',
  '**Cabeça do Grupo:** Scheffer & Cia Ltda (Matriz: Sapezal/MT) e Maggi Scheffer Participações Ltda (Holding).',
  '**Total de CNPJs mapeados:** 38 (incluindo filiais operacionais, holdings e veículos de serviços).',
  '',
  '### 🏢 TABELA MESTRA DE CNPJs (PRINCIPAIS VEÍCULOS)',
  '',
  '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
  '|------|--------------|-----------------|-------|-----------|',
  '| 00.543.145/0001-39 | Scheffer & Cia Ltda | Matriz Operacional | Receita Federal / QSA | OFICIAL |',
  '| 11.021.773/0001-70 | SCHEFFER PARTICIPACOES S/A | Holding Controladora | QSA oficial | OFICIAL |',
  '',
  '### 📊 MAPA DE PODER SOCIETÁRIO',
  '',
  '```mermaid',
  'graph LR',
  'Holding["Maggi Scheffer Participações"] ==> Operacao["Scheffer & Cia"]',
  '```',
].join('\n');

const RAW_OPERACIONAL_MODULE = [
  '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL - SCHEFFER & CIA LTDA',
  '',
  '**🎯 RADAR DE ESTRUTURA E CAPEX**',
  '- **DNA Operacional:** Conglomerado agroindustrial verticalizado.',
  '- **Pegada de Chão:** Opera mais de 210.000 hectares distribuídos em unidades no Mato Grosso.',
  '',
  '### 🗺️ MAPA DO CAOS OPERACIONAL',
  '',
  '```mermaid',
  'graph LR',
  'Campo ==> Silos',
  'Silos ==> UBA',
  '```',
].join('\n');

const RAW_TECH_MODULE = [
  '# 🦅 DOSSIÊ SCOUT 360: BORDAS DE CONTROLE - SCHEFFER & CIA LTDA',
  '',
  '- **Stack identificado:** ERP Senior Sapiens, SimpleFarm Agro e Operis.',
  '- **Gap crítico em logística de execução:** WMS/TMS.',
].join('\n');

const RAW_RISCO_MODULE = [
  '# 🦅 DOSSIÊ SCOUT 360: RISCOS & COMPLIANCE - SCHEFFER & CIA LTDA',
  '',
  '- **Risco:** passivo trabalhista relevante pela sazonalidade de safra.',
  '- **Sinal de compra:** pressão fiscal recorrente na vertical de bioinsumos.',
].join('\n');

const RAW_CAMINHO_MODULE = [
  '# 🎯 CAMINHO DE VENDA: SCHEFFER & CIA LTDA',
  '',
  '## Alvo Prioritário',
  'Orquestração logística de pátio e transporte.',
  '',
  '## Wedge Recomendado',
  '- **Porta de entrada:** SimpleFarm + balança.',
  '- **Próximo passo:** reunião com o COO.',
].join('\n');

function rawModulesNarrative(): string {
  return [RAW_TEIA_MODULE, RAW_OPERACIONAL_MODULE, RAW_TECH_MODULE, RAW_RISCO_MODULE, RAW_CAMINHO_MODULE].join(
    '\n\n---\n\n',
  );
}

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function buildFacts(count: number): DossierV3CanonicalFact[] {
  return Array.from({ length: count }, (_, i) => {
    const base = String(i + 1).padStart(8, '0');
    return {
      cnpj: formatCnpj(`${base}0001${String(i + 1).padStart(2, '0')}`),
      legalName: `Empresa Grupo X ${i + 1} Ltda`,
      confidence: 'strong',
      source: 'Receita Federal / QSA',
      relationshipScope: i === 0 ? 'group_link' : 'partner_other_cnpj',
    };
  });
}

describe('composeDossierV3 — contrato V3 estrutural (oracle)', () => {
  it('produz exatamente as 8 seções V3, na ordem canônica, sem duplicar', () => {
    const facts = buildFacts(2);
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: rawModulesNarrative(),
      canonicalFacts: facts,
    });

    expect(result.sections).toEqual([...DOSSIER_V3_SECTIONS]);

    const indexes = DOSSIER_V3_SECTIONS.map(section => result.text.indexOf(`## ${section}`));
    expect(indexes.every(index => index !== -1)).toBe(true);
    expect(indexes.every((index, i) => i === 0 || index > indexes[i - 1])).toBe(true);

    // Seções não podem duplicar o próprio título no corpo (composer reemite).
    const sectionTitleCount = DOSSIER_V3_SECTIONS.map(
      section => (result.text.split(`## ${section}`).length - 1),
    );
    expect(sectionTitleCount.every(count => count === 1)).toBe(true);
  });

  it('mantém no máximo 1 diagrama mermaid por dossiê (V3 regra obrigatória)', () => {
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: rawModulesNarrative(), // 2 mermaid fenced blocks na entrada
      canonicalFacts: buildFacts(2),
    });

    expect((result.text.match(/```mermaid/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('CNPJs do mapa aparecem em tabela macro única com total, fonte e confiança', () => {
    const facts = buildFacts(2);
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: RAW_TEIA_MODULE,
      canonicalFacts: facts,
    });

    expect(result.text).toContain('| CNPJ |');
    for (const fact of facts) {
      expect(result.text).toContain(fact.cnpj as string);
    }
    expect(result.text).toContain('Total de CNPJs na tabela canônica: 2');
  });
});

describe('composeDossierV3 — ausência degrada explicitamente (não silenciosa)', () => {
  it('narrativa vazia produz as 8 seções com "Não encontrado" explícito', () => {
    const result = composeDossierV3({
      companyName: 'Empresa X',
      narrative: '',
      canonicalFacts: [],
      missingModules: ['Bordas de Controle', 'Riscos & Compliance', 'Benchmark de mercado'],
    });

    for (const section of DOSSIER_V3_SECTIONS) {
      expect(result.text).toContain(`## ${section}`);
    }
    expect(result.text).toContain('Não encontrado');
    expect(result.reconciliation.consolidatedAbsences.length).toBeGreaterThan(0);
  });

  it('seção sem contexto de cliente Senior não inventa similar — declara não identificado', () => {
    const result = composeDossierV3({
      companyName: 'Empresa X',
      narrative: RAW_TEIA_MODULE,
      canonicalFacts: buildFacts(1),
      seniorContext: '',
    });

    const seniorSection = result.text.split('## Cliente Senior parecido')[1]?.split('## Caminho da venda')[0] ?? '';
    expect(seniorSection.trim().length).toBeGreaterThan(0);
    expect(seniorSection.toLowerCase()).toContain('não');
  });

  it('ausência de um módulo específico não inventa conteúdo — consolida ausência na seção correta', () => {
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: [RAW_TEIA_MODULE, RAW_OPERACIONAL_MODULE].join('\n\n---\n\n'), // sem tech/risco/caminho
      canonicalFacts: buildFacts(1),
      missingModules: ['Bordas de Controle', 'Riscos & Compliance', 'Caminho de Venda'],
    });

    const techSection = result.text.split('## Tecnologia e sistemas')[1]?.split('## Dores e sinais de compra')[0] ?? '';
    expect(techSection).toContain('Não encontrado');
  });
});

describe('composeDossierV3 — reconciliação de fatos canônicos antes da publicação', () => {
  it('mapa canônico com 18 CNPJs não termina narrativa afirmando 2', () => {
    const facts = buildFacts(18);
    const narrative = [
      '# 🎯 DOSSIÊ: TEIA SOCIETÁRIA E MASSA REAL - GRUPO X',
      '**Visão geral do grupo econômico real**',
      'O grupo possui apenas 2 CNPJs ativos.',
      '**Total de CNPJs mapeados:** 2',
    ].join('\n');

    const result = composeDossierV3({ companyName: 'Grupo X', narrative, canonicalFacts: facts });

    expect(result.reconciliation.narrativeCnpjTotalMismatch).toBe(true);
    expect(result.reconciliation.canonicalTotalCnpjs).toBe(18);
    expect(result.text).not.toContain('Total de CNPJs mapeados: 2');
    expect(result.text).not.toContain('apenas 2 CNPJs ativos');
    expect(result.text).toContain('Total de CNPJs na tabela canônica: 18');
    for (const fact of facts) {
      expect(result.text).toContain(fact.cnpj as string);
    }
  });

  it('narrativa que nega CNPJ de fato canônico é reconciliada (SCHEFFER PARTICIPACOES)', () => {
    const narrative = [
      '# 🎯 DOSSIÊ: TEIA SOCIETÁRIA E MASSA REAL - SCHEFFER',
      'SCHEFFER PARTICIPACOES S/A não teve o CNPJ confirmado nas fontes disponíveis.',
    ].join('\n');

    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative,
      canonicalFacts: [
        {
          cnpj: '11.021.773/0001-70',
          legalName: 'SCHEFFER PARTICIPACOES S/A',
          confidence: 'strong',
          source: 'QSA oficial',
          relationshipScope: 'group_link',
        },
      ],
    });

    expect(result.reconciliation.contradictoryClaimsRemoved).toBeGreaterThan(0);
    expect(result.text).not.toContain('não teve o CNPJ confirmado');
    expect(result.text).toContain('11.021.773/0001-70');
  });
});

describe('composeDossierV3 — grounding a montante não desaparece silenciosamente', () => {
  it('preserva fontes/proveniência recebidas do fluxo (título + URL)', () => {
    const sources = [
      {
        title: 'BNDES financia usina de etanol em MT',
        url: 'https://agenciadenoticias.bndes.gov.br/noticia/1',
        verification: 'grounding' as const,
      },
    ];

    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: RAW_TEIA_MODULE,
      canonicalFacts: buildFacts(1),
      groundingSources: sources,
    });

    expect(result.reconciliation.groundingPreservedCount).toBe(1);
    expect(result.text).toContain('https://agenciadenoticias.bndes.gov.br/noticia/1');
    expect(result.text).toContain('BNDES financia usina de etanol em MT');
  });
});

describe('canonicalFactsFromTeiaText', () => {
  it('extrai fatos canônicos da Tabela Mestre de CNPJs do módulo teia', () => {
    const facts = canonicalFactsFromTeiaText(RAW_TEIA_MODULE);

    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      legalName: 'Scheffer & Cia Ltda',
      cnpj: '00.543.145/0001-39',
      confidence: 'strong',
    });
    expect(facts[1]).toMatchObject({
      legalName: 'SCHEFFER PARTICIPACOES S/A',
      cnpj: '11.021.773/0001-70',
      source: 'QSA oficial',
    });
  });

  it('não inventa CNPJ para veículo estrangeiro sem número confirmado', () => {
    const text = [
      '### 🏢 TABELA MESTRA DE CNPJs',
      '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
      '|------|--------------|-----------------|-------|-----------|',
      '| CNPJ NAO CONFIRMADO | Scheffer Colombia SAS | Op. Internacional | Fonte pública | INFERIDA |',
    ].join('\n');

    const facts = canonicalFactsFromTeiaText(text);
    expect(facts).toHaveLength(1);
    expect(facts[0].cnpj).toBeNull();
    expect(facts[0].confidence).toBe('weak');
  });
});
