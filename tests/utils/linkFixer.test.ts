import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock apiConfig para controlar o comportamento de isFakeUrl e findSeniorProductUrl
const isFakeUrlMock = vi.hoisted(() => vi.fn());
const findSeniorProductUrlMock = vi.hoisted(() => vi.fn());
const FAKE_DOMAINS_MOCK = vi.hoisted(() => ['exemplo-fake.com', 'fabricado.io']);

vi.mock('../../services/apiConfig', () => ({
  isFakeUrl: isFakeUrlMock,
  findSeniorProductUrl: findSeniorProductUrlMock,
  FAKE_DOMAINS: FAKE_DOMAINS_MOCK,
}));

import { deduplicateSourcesBlock, fixFakeLinks, fixFakeLinksHTML, extractValidLinks } from '../../utils/linkFixer';

describe('fixFakeLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFakeUrlMock.mockReturnValue(false);
    findSeniorProductUrlMock.mockReturnValue(null);
  });

  it('retorna texto inalterado se não há links', () => {
    isFakeUrlMock.mockReturnValue(false);
    const text = 'Texto sem links aqui.';
    expect(fixFakeLinks(text)).toBe(text);
  });

  it('preserva links reais (não fake)', () => {
    isFakeUrlMock.mockReturnValue(false);
    const text = '[Senior ERP](https://www.senior.com.br/erp)';
    expect(fixFakeLinks(text)).toBe(text);
  });

  it('substitui link fake por indicação de fonte não disponível', () => {
    isFakeUrlMock.mockReturnValue(true);
    findSeniorProductUrlMock.mockReturnValue(null);
    const text = '[ERP Senior](https://exemplo-fake.com/erp)';
    const result = fixFakeLinks(text);
    expect(result).toContain('fonte não disponível');
    expect(result).not.toContain('exemplo-fake.com');
  });

  it('substitui link fake pela URL real quando disponível', () => {
    isFakeUrlMock.mockReturnValue(true);
    findSeniorProductUrlMock.mockReturnValue('https://www.senior.com.br/erp');
    const text = '[ERP Senior](https://exemplo-fake.com/erp)';
    const result = fixFakeLinks(text);
    expect(result).toContain('https://www.senior.com.br/erp');
    expect(result).not.toContain('exemplo-fake.com');
  });

  it('retorna string vazia para entrada vazia', () => {
    expect(fixFakeLinks('')).toBe('');
  });

  it('lida com texto nulo/undefined retornando o mesmo valor', () => {
    expect(fixFakeLinks(null as unknown as string)).toBeNull();
  });
});

describe('fixFakeLinksHTML', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFakeUrlMock.mockReturnValue(false);
    findSeniorProductUrlMock.mockReturnValue(null);
  });

  it('preserva links HTML com URLs reais', () => {
    isFakeUrlMock.mockReturnValue(false);
    const html = '<a href="https://www.senior.com.br">Senior</a>';
    expect(fixFakeLinksHTML(html)).toBe(html);
  });

  it('substitui link HTML fake por strong quando não tem URL real', () => {
    isFakeUrlMock.mockReturnValue(true);
    findSeniorProductUrlMock.mockReturnValue(null);
    const html = '<a href="https://fake.io/erp">ERP Senior</a>';
    const result = fixFakeLinksHTML(html);
    expect(result).toContain('<strong');
    expect(result).toContain('ERP Senior');
    expect(result).not.toContain('href');
  });

  it('substitui link HTML fake por URL real quando disponível', () => {
    isFakeUrlMock.mockReturnValue(true);
    findSeniorProductUrlMock.mockReturnValue('https://www.senior.com.br/erp');
    const html = '<a href="https://fake.io/erp">ERP Senior</a>';
    const result = fixFakeLinksHTML(html);
    expect(result).toContain('href="https://www.senior.com.br/erp"');
  });

  it('retorna HTML vazio para entrada vazia', () => {
    expect(fixFakeLinksHTML('')).toBe('');
  });
});

describe('extractValidLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFakeUrlMock.mockReturnValue(false);
  });

  it('extrai links válidos do markdown', () => {
    isFakeUrlMock.mockReturnValue(false);
    const text = 'Veja [documentação](https://docs.senior.com.br) e [blog](https://blog.senior.com.br)';
    const links = extractValidLinks(text);
    expect(links).toHaveLength(2);
    expect(links[0].title).toBe('documentação');
    expect(links[0].url).toBe('https://docs.senior.com.br');
  });

  it('ignora links fake', () => {
    isFakeUrlMock.mockImplementation(url => url.includes('fake'));
    const text = '[Real](https://real.com) e [Fake](https://fake.io/something)';
    const links = extractValidLinks(text);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://real.com');
  });

  it('deduplica links com mesmo URL', () => {
    isFakeUrlMock.mockReturnValue(false);
    const text = '[Link A](https://senior.com.br) e [Link B](https://senior.com.br)';
    const links = extractValidLinks(text);
    expect(links).toHaveLength(1);
  });

  it('retorna array vazio para texto sem links', () => {
    expect(extractValidLinks('Texto sem links.')).toHaveLength(0);
  });

  it('retorna array vazio para texto vazio', () => {
    expect(extractValidLinks('')).toHaveLength(0);
  });
});

describe('deduplicateSourcesBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isFakeUrlMock.mockReturnValue(false);
    findSeniorProductUrlMock.mockReturnValue(null);
  });

  it('remove fontes repetidas mesmo com parametros de tracking', () => {
    const text = [
      'A evidencia aparece inline em [Fonte A](https://example.com/relatorio?utm_source=gemini).',
      '',
      'Fontes:',
      '- Fonte A https://example.com/relatorio/',
      '- Fonte B https://example.com/outra',
    ].join('\n');

    const result = deduplicateSourcesBlock(text);

    expect(result).not.toContain('Fonte A https://example.com/relatorio/');
    expect(result).toContain('Fonte B https://example.com/outra');
  });

  it('considera links HTML e URLs puras no corpo ao deduplicar fontes', () => {
    const text = [
      'Fonte HTML <a href="https://example.com/html">HTML</a> e URL pura https://example.com/pura.',
      '',
      'Fontes:',
      '- HTML https://example.com/html',
      '- Pura https://example.com/pura',
      '- Complementar https://example.com/complementar',
    ].join('\n');

    const result = deduplicateSourcesBlock(text);

    expect(result).not.toContain('- HTML https://example.com/html');
    expect(result).not.toContain('- Pura https://example.com/pura');
    expect(result).toContain('- Complementar https://example.com/complementar');
  });

  it('nao altera rodape gerado ## 📚 Fontes', () => {
    const text = [
      'Corpo com [Site](https://example.com/page).',
      '',
      '## 📚 Fontes',
      '',
      '### Citadas no dossiê',
      '',
      '1. [Site](https://example.com/page)',
      '',
      '### Consultadas pela IA (não citadas inline)',
      '',
      '- [Outra](https://example.com/outra) — grounding',
    ].join('\n');

    expect(deduplicateSourcesBlock(text)).toBe(text);
  });

  it('preserva titulo quando remove URL falsa do bloco de fontes', () => {
    isFakeUrlMock.mockImplementation(url => url.includes('fake'));
    const text = [
      'Texto principal sem fonte.',
      '',
      'Fontes:',
      '- Relatorio setorial relevante (https://fake.io/relatorio)',
    ].join('\n');

    const result = deduplicateSourcesBlock(text);

    expect(result).toContain('Relatorio setorial relevante');
    expect(result).not.toContain('https://fake.io/relatorio');
  });
});
