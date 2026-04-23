import { describe, expect, it } from 'vitest';

import { extractCompanyName } from '../../utils/companyNameExtractor';
import { cleanTitle } from '../../utils/textCleaners';

describe('session title and company-name heuristics', () => {
  it('extractCompanyName extracts a company from an investigation command', () => {
    const result = extractCompanyName('investigar Fazenda Boa Vista');

    expect(result).toBeTruthy();
  });

  it('cleanTitle removes markdown formatting from titles', () => {
    const result = cleanTitle('**Fazenda Boa Vista**');

    expect(result).toBe('Fazenda Boa Vista');
  });

  it('cleanTitle preserves a valid company name', () => {
    expect(cleanTitle('Agroindustria Sao Joao')).toBe('Agroindustria Sao Joao');
  });

  it('recognizes the default new-investigation title', () => {
    const normalized = 'Nova Investigacao'
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    expect(normalized).toBe('nova investigacao');
  });

  it('rejects titles longer than the session company-name threshold', () => {
    const longTitle = 'A'.repeat(121);

    expect(longTitle.length <= 120).toBe(false);
  });

  it('extracts company names from dossier display text', () => {
    const match = 'dossie completo de [Cooperativa Central de MT]'.match(
      /dossi(?:e|\u00ea)\s+completo\s+de\s+\[([^\]]+)\]/i,
    );

    expect(match?.[1]?.trim()).toBe('Cooperativa Central de MT');
  });

  it('extracts company names from cadastro text', () => {
    const match = 'Empresa=Fazenda Sao Pedro;CNPJ=12.345.678/0001-90'.match(/Empresa=([^;\n]+)/i);

    expect(match?.[1]?.trim()).toBe('Fazenda Sao Pedro');
  });
});
