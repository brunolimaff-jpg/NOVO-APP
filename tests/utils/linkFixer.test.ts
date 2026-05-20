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

import {
  fixFakeLinks,
  fixFakeLinksHTML,
  extractValidLinks,
} from '../../utils/linkFixer';

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
