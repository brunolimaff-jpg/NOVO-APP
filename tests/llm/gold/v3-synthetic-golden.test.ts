import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOSSIER_V3_SECTIONS,
  composeDossierV3,
  type DossierV3CanonicalFact,
} from '../../../services/llm/gold/v3-dossier-composer';

/**
 * BRU-155 — Golden sintético V3 (REAL_PROVIDER_CALLS=0).
 *
 * Compõe os 5 módulos crus reais do caso Scheffer (fixtures) na estrutura
 * final V3. Nenhuma chamada a provider: o composer é determinístico. O
 * "mapa canônico" entra como fatos estruturados válidos (como viriam da
 * busca BrasilAPI/socio-search), não como a tabela do módulo LLM.
 */

const MODULES_ROOT = resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'dossier',
  'scheffer-04733767000180',
  'modules',
);

function loadModule(relative: string): string {
  return readFileSync(resolve(MODULES_ROOT, relative), 'utf8').replace(/^\uFEFF/, '');
}

const NARRATIVE = [
  loadModule('01-raio-x-operacional.md'),
  loadModule('02-tech-stack.md'),
  loadModule('03-compliance-risco-fiscal.md'),
  loadModule('04-teia-societaria-massa-real.md'),
  loadModule('05-rh-sst-gestao-pessoas.md'),
].join('\n\n---\n\n');

// CNPJs com dígito verificador válido (check digit computado).
const CANONICAL_FACTS: DossierV3CanonicalFact[] = [
  {
    cnpj: '00.543.145/0001-39',
    legalName: 'Scheffer & Cia Ltda',
    confidence: 'strong',
    source: 'Receita Federal / QSA',
    relationshipScope: 'group_link',
  },
  {
    cnpj: '11.021.773/0001-70',
    legalName: 'SCHEFFER PARTICIPACOES S/A',
    confidence: 'strong',
    source: 'QSA oficial',
    relationshipScope: 'group_link',
  },
  {
    cnpj: '10.457.067/0001-03',
    legalName: 'Maggi Scheffer Participações Ltda',
    confidence: 'strong',
    source: 'Receita Federal / QSA',
    relationshipScope: 'group_link',
  },
];

const GROUNDING = [
  {
    title: 'Scheffer avança na agricultura regenerativa',
    url: 'https://valor.globo.com/agronegocios/noticia/2023/05/15/scheffer-avanca-na-agricultura-regenerativa.ghtml',
    verification: 'grounding' as const,
  },
  {
    title: 'Grupo Scheffer é referência em agricultura regenerativa',
    url: 'https://www.noticiasagricolas.com.br/noticias/algodao/317537-grupo-scheffer-e-referencia-em-agricultura-regenerativa-e-producao-de-algodao.html',
    verification: 'grounding' as const,
  },
];

describe('Golden sintético V3 (sem provider real)', () => {
  it('a composição final respeita o contrato V3: 8 seções na ordem, máximo 1 mermaid', () => {
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: NARRATIVE,
      canonicalFacts: CANONICAL_FACTS,
      groundingSources: GROUNDING,
    });

    expect(result.sections).toEqual([...DOSSIER_V3_SECTIONS]);

    const indexes = DOSSIER_V3_SECTIONS.map(section => result.text.indexOf(`## ${section}`));
    expect(indexes.every(index => index !== -1)).toBe(true);
    expect(indexes.every((index, i) => i === 0 || index > indexes[i - 1])).toBe(true);

    expect((result.text.match(/```mermaid/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('preserva fatos-chave do caso Scheffer na saída final V3', () => {
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: NARRATIVE,
      canonicalFacts: CANONICAL_FACTS,
      groundingSources: GROUNDING,
    });

    const text = result.text;
    expect(text).toContain('SCHEFFER & CIA LTDA');
    expect(text).toContain('210.000 hectares');
    expect(text).toContain('11.021.773/0001-70');
    expect(text).toContain('00.543.145/0001-39');
    // Proveniência preservada (título + URL reais das fixtures).
    expect(text).toContain('https://valor.globo.com/agronegocios/noticia/2023/05/15');
    expect(text.toLowerCase()).toContain('agricultura regenerativa');
    expect(result.reconciliation.groundingPreservedCount).toBe(2);
  });

  it('tabela canônica não contradiz narrativa — sem remoção espúria quando o mapa não é a menor fonte', () => {
    const result = composeDossierV3({
      companyName: 'SCHEFFER & CIA LTDA',
      narrative: NARRATIVE,
      canonicalFacts: CANONICAL_FACTS,
      groundingSources: GROUNDING,
    });

    // O módulo teia afirma "Total de CNPJs mapeados: 38" — o mapa canônico tem 3.
    // 38 > 3 não é subestimação: a narrativa pode saber mais que o recorte estruturado.
    expect(result.reconciliation.narrativeCnpjTotalMismatch).toBe(false);
    expect(result.reconciliation.contradictoryClaimsRemoved).toBe(0);
    expect(result.text).toContain('Total de CNPJs na tabela canônica: 3');
  });
});
