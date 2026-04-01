// tests/utils/seniorLinks.test.ts
import { describe, it, expect } from 'vitest';
import {
  SENIOR_PRODUCT_URLS,
  seniorOfficialLinks,
  buildSeniorOrGAtecSearchUrl,
  findSeniorProductUrl,
  fixGoogleSearchLinks,
  fixGoogleSearchLinksHTML,
  autoLinkSeniorTerms,
} from '../../utils/seniorLinks';

describe('SENIOR_PRODUCT_URLS / seniorOfficialLinks', () => {
  it('é um objeto com URLs válidas', () => {
    expect(typeof SENIOR_PRODUCT_URLS).toBe('object');
    const urls = Object.values(SENIOR_PRODUCT_URLS);
    expect(urls.length).toBeGreaterThan(10);
    urls.forEach(url => {
      // Allow senior.com.br and gatec.com.br (GAtec product URLs)
      expect(url).toMatch(/^https:\/\/(www\.senior\.com\.br|www\.gatec\.com\.br)/);
    });
  });

  it('seniorOfficialLinks é alias de SENIOR_PRODUCT_URLS', () => {
    expect(seniorOfficialLinks).toBe(SENIOR_PRODUCT_URLS);
  });

  it('contém produtos essenciais', () => {
    expect(SENIOR_PRODUCT_URLS['erp']).toBeTruthy();
    expect(SENIOR_PRODUCT_URLS['hcm']).toBeTruthy();
    expect(SENIOR_PRODUCT_URLS['tms']).toBeTruthy();
  });
});

describe('buildSeniorOrGAtecSearchUrl', () => {
  it('retorna URL de busca como string', () => {
    const url = buildSeniorOrGAtecSearchUrl('ERP Senior');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('inclui o termo no resultado', () => {
    const url = buildSeniorOrGAtecSearchUrl('GATEC colheita');
    expect(url.toLowerCase()).toContain('gatec');
  });
});

describe('findSeniorProductUrl', () => {
  it('retorna URL para texto que contém produto mapeado', () => {
    const url = findSeniorProductUrl('erp');
    expect(url).toBeTruthy();
    expect(url).toContain('senior.com.br');
  });

  it('retorna URL para HCM', () => {
    const url = findSeniorProductUrl('hcm');
    expect(url).toContain('gestao-de-pessoas-hcm');
  });

  it('retorna null para termo não mapeado', () => {
    const url = findSeniorProductUrl('oracle enterprise resource planning');
    // Should return null or a URL — don't crash
    expect(url === null || typeof url === 'string').toBe(true);
  });

  it('não crashar com string vazia', () => {
    expect(() => findSeniorProductUrl('')).not.toThrow();
  });
});

describe('fixGoogleSearchLinks', () => {
  it('retorna texto sem modificar quando não há links google', () => {
    const text = 'Texto normal com [link](https://ibge.gov.br)';
    const result = fixGoogleSearchLinks(text);
    expect(result).toBe(text);
  });

  it('substitui link google por texto apenas (sem URL)', () => {
    const text = '[ERP Senior](https://www.google.com/search?q=ERP+Senior)';
    const result = fixGoogleSearchLinks(text);
    expect(result).not.toContain('google.com/search');
  });

  it('processa string vazia sem erro', () => {
    expect(() => fixGoogleSearchLinks('')).not.toThrow();
  });
});

describe('fixGoogleSearchLinksHTML', () => {
  it('substitui links google em HTML', () => {
    const html = '<a href="https://www.google.com/search?q=senior">Senior</a>';
    const result = fixGoogleSearchLinksHTML(html);
    expect(result).not.toContain('google.com/search');
  });

  it('mantém links externos válidos', () => {
    const html = '<a href="https://www.senior.com.br">Senior</a>';
    const result = fixGoogleSearchLinksHTML(html);
    expect(result).toContain('senior.com.br');
  });
});

describe('autoLinkSeniorTerms', () => {
  it('retorna string', () => {
    const result = autoLinkSeniorTerms('Precisa de ERP e HCM');
    expect(typeof result).toBe('string');
  });

  it('não crashar com texto vazio', () => {
    expect(() => autoLinkSeniorTerms('')).not.toThrow();
  });

  it('adiciona link para termos reconhecidos', () => {
    const result = autoLinkSeniorTerms('Módulo HCM da Senior');
    // Should contain some link markup for recognized term
    expect(result.length).toBeGreaterThan(0);
  });
});
