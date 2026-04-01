// tests/utils/markdownLinks.test.ts
import { describe, it, expect } from 'vitest';
import { rewriteMarkdownLinksToGoogle } from '../../utils/markdownLinks';

describe('rewriteMarkdownLinksToGoogle', () => {
  it('retorna string vazia para input vazio', () => {
    expect(rewriteMarkdownLinksToGoogle('')).toBe('');
  });

  it('preserva texto sem links', () => {
    const text = 'Texto sem nenhum link aqui.';
    expect(rewriteMarkdownLinksToGoogle(text)).toBe(text);
  });

  it('mantém link de citação com ícone [🔗](url) intacto', () => {
    const text = 'Fonte [🔗](https://ibge.gov.br/artigo)';
    const result = rewriteMarkdownLinksToGoogle(text);
    expect(result).toBe(text);
  });

  it('usa URL oficial para produto Senior mapeado', () => {
    const text = '[erp](https://qualquer-url.com)';
    const result = rewriteMarkdownLinksToGoogle(text);
    expect(result).toContain('https://www.senior.com.br/solucoes/gestao-empresarial-erp');
  });

  it('usa URL oficial para HCM', () => {
    const text = '[hcm](https://qualquer.com)';
    const result = rewriteMarkdownLinksToGoogle(text);
    expect(result).toContain('gestao-de-pessoas-hcm');
  });

  it('mantém link original para URL externa válida não mapeada', () => {
    const text = '[Portal do Agro](https://canalrural.uol.com.br/artigo)';
    const result = rewriteMarkdownLinksToGoogle(text);
    expect(result).toBe(text);
  });

  it('mantém links com "Senior" no label intactos (não gera link de busca)', () => {
    const text = '[Senior Sistemas](https://www.senior.com.br)';
    const result = rewriteMarkdownLinksToGoogle(text);
    // Should return original match (no google search URL generated)
    expect(result).toBe(text);
  });

  it('processa múltiplos links no mesmo texto', () => {
    const text = '[erp](https://any.com) e [hcm](https://any2.com)';
    const result = rewriteMarkdownLinksToGoogle(text);
    expect(result).toContain('gestao-empresarial-erp');
    expect(result).toContain('gestao-de-pessoas-hcm');
  });
});
