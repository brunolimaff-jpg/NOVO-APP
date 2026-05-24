// tests/services/war-room/sources.test.ts
// Unit tests for source extraction and hallucination detection

import { describe, it, expect } from 'vitest';
import {
  extractGroundingSources,
  detectHallucinatedUrls,
  enforceBankingAnchors,
} from '../../../services/war-room/sources';

describe('extractGroundingSources', () => {
  it('returns empty array for null response', () => {
    expect(extractGroundingSources(null)).toEqual([]);
  });

  it('returns empty array for undefined response', () => {
    expect(extractGroundingSources(undefined)).toEqual([]);
  });

  it('returns empty array when no candidates', () => {
    expect(extractGroundingSources({})).toEqual([]);
  });

  it('returns empty array when no grounding chunks', () => {
    const response = { candidates: [{ groundingMetadata: {} }] };
    expect(extractGroundingSources(response)).toEqual([]);
  });

  it('extracts sources from grounding chunks', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/doc1', title: 'Document 1' } },
              { web: { uri: 'https://example.com/doc2', title: 'Document 2' } },
            ],
          },
        },
      ],
    };
    expect(extractGroundingSources(response)).toEqual([
      { title: 'Document 1', url: 'https://example.com/doc1' },
      { title: 'Document 2', url: 'https://example.com/doc2' },
    ]);
  });

  it('deduplicates URLs with the same URI', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/doc1', title: 'First' } },
              { web: { uri: 'https://example.com/doc1', title: 'Duplicate' } },
              { web: { uri: 'https://example.com/doc2', title: 'Second' } },
            ],
          },
        },
      ],
    };
    const sources = extractGroundingSources(response);
    expect(sources).toHaveLength(2);
    expect(sources).toContainEqual({ title: 'First', url: 'https://example.com/doc1' });
    expect(sources).toContainEqual({ title: 'Second', url: 'https://example.com/doc2' });
  });

  it('skips chunks without URI', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.com/doc1', title: 'Doc 1' } },
              { web: { title: 'No URI' } },
            ],
          },
        },
      ],
    };
    expect(extractGroundingSources(response)).toEqual([
      { title: 'Doc 1', url: 'https://example.com/doc1' },
    ]);
  });

  it('skips invalid URIs gracefully', () => {
    const response = {
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'ht!tp://invalid uri', title: 'Bad' } },
              { web: { uri: 'https://valid.com/doc', title: 'Good' } },
            ],
          },
        },
      ],
    };
    const sources = extractGroundingSources(response);
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toBe('https://valid.com/doc');
  });
});

describe('detectHallucinatedUrls', () => {
  const ragMatches = [
    { url: 'https://documentacao.senior.com.br/erp/compras' },
    { url: 'https://documentacao.senior.com.br/financeiro' },
  ];

  it('returns empty array when all URLs are in ragMatches', () => {
    const text =
      'Veja mais em https://documentacao.senior.com.br/erp/compras e https://documentacao.senior.com.br/financeiro';
    expect(detectHallucinatedUrls(text, ragMatches)).toEqual([]);
  });

  it('detects URL not present in ragMatches', () => {
    const text = 'Consulte https://documentacao.senior.com.br/erp/hcm';
    const result = detectHallucinatedUrls(text, ragMatches);
    expect(result).toContain('https://documentacao.senior.com.br/erp/hcm');
  });

  it('returns empty array when text has no senior doc URLs', () => {
    const text = 'Resposta generica sem URLs da documentacao.';
    expect(detectHallucinatedUrls(text, ragMatches)).toEqual([]);
  });

  it('filters only invalid URLs when mixed valid and invalid', () => {
    const text = [
      'URL valida: https://documentacao.senior.com.br/erp/compras',
      'URL invalida: https://documentacao.senior.com.br/rh/folha',
    ].join('\n');
    const result = detectHallucinatedUrls(text, ragMatches);
    expect(result).toEqual(['https://documentacao.senior.com.br/rh/folha']);
    expect(result).not.toContain('https://documentacao.senior.com.br/erp/compras');
  });

  it('treats all URLs as hallucinated when ragMatches is empty', () => {
    const text = 'URL: https://documentacao.senior.com.br/erp/compras';
    expect(detectHallucinatedUrls(text, [])).toContain(
      'https://documentacao.senior.com.br/erp/compras',
    );
  });

  it('ignores non-senior domains', () => {
    const text = 'Google docs em https://docs.google.com/doc e doc Senior em https://documentacao.senior.com.br/erp/compras';
    const result = detectHallucinatedUrls(text, ragMatches);
    expect(result).toEqual([]);
  });

  it('cleans closing parentheses from URLs', () => {
    const text = '(veja https://documentacao.senior.com.br/erp/compras)';
    expect(detectHallucinatedUrls(text, ragMatches)).toEqual([]);
  });
});

describe('enforceBankingAnchors', () => {
  it('returns empty string for falsy input', () => {
    expect(enforceBankingAnchors('')).toBe('');
  });

  it('does not append canonical block when all canonical conditions are met', () => {
    const text = [
      '### Mapeamento canônico: ERP Banking vs TOTVS',
      'ERP Banking da Senior: pagamento eletrônico abrangente.',
      'Referência: https://documentacao.senior.com.br/gestaoempresarialerp/processos-automaticos/166-integracao-erp-banking.htm',
    ].join('\n');
    const result = enforceBankingAnchors(text);
    // Should not append a second canonical block
    const matches = result.match(/Mapeamento canônico/g);
    expect(matches).toHaveLength(1);
    // Output should equal input (no append)
    expect(result).toBe(text);
  });

  it('does not duplicate canonical section when full block already present', () => {
    const text = [
      'Resposta sobre banking.',
      '',
      '### Mapeamento canônico: ERP Banking vs TOTVS',
      '- ERP Banking da Senior: pagamento eletrônico abrangente (ACH, cartões e transferências), conciliação e ecossistema financeiro embarcado.',
      '- TOTVS (Protheus): excelente registro online de títulos e boletos via API, reduzindo dependência de CNAB em cenários específicos.',
      '- Leitura correta no comparativo: quando houver menção a Banking, contraste explícito entre API de boletos/títulos e governança de pagamentos/conciliação do ERP Banking.',
      '',
      '### Referência explícita: ERP Banking',
      '- Integração ERP x ERP Banking: https://documentacao.senior.com.br/gestaoempresarialerp/processos-automaticos/166-integracao-erp-banking.htm',
      '- Módulo ERP Banking (Senior X Platform): https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm',
    ].join('\n');
    const result = enforceBankingAnchors(text);
    const matches = result.match(/Mapeamento canônico/g);
    expect(matches).toHaveLength(1);
  });

  it('appends canonical block when banking is absent', () => {
    const text = 'Resposta sobre integração de sistemas sem mencionar banking.';
    const result = enforceBankingAnchors(text);
    expect(result).toContain('Mapeamento canônico');
    expect(result).toContain('ERP Banking da Senior');
  });

  it('appends canonical block when banking links are missing', () => {
    const text = 'O ERP Banking é um módulo importante.';
    // Has banking mention but no canonical mapping or links
    const result = enforceBankingAnchors(text);
    expect(result).toContain('Mapeamento canônico');
  });

  it('normalizes "senior compensa" to "ERP Banking da Senior comprova"', () => {
    const text = 'Senior compensa no mercado financeiro.';
    const result = enforceBankingAnchors(text);
    expect(result).toContain('ERP Banking da Senior comprova');
  });

  it('normalizes "senior bank" to "ERP Banking da Senior"', () => {
    const text = 'O Senior Bank oferece solucoes.';
    const result = enforceBankingAnchors(text);
    expect(result).toContain('ERP Banking da Senior');
    expect(result).not.toContain('Senior Bank');
  });

  it('returns trimmed output', () => {
    const text = '  texto com espacos  ';
    const result = enforceBankingAnchors(text);
    expect(result).toBe(result.trim());
  });
});
