import { describe, it, expect } from 'vitest';
import { convertMarkdownToHTML } from '../../utils/markdownToHtml';

describe('convertMarkdownToHTML', () => {
  it('converts headings', () => {
    const result = convertMarkdownToHTML('# Title', false);
    expect(result).toContain('<h1>Title</h1>');
  });

  it('converts bold text', () => {
    const result = convertMarkdownToHTML('**bold**', false);
    expect(result).toContain('<strong>bold</strong>');
  });

  it('converts italic text', () => {
    const result = convertMarkdownToHTML('*italic*', false);
    expect(result).toContain('<em>italic</em>');
  });

  it('converts links', () => {
    const result = convertMarkdownToHTML('[Senior](https://senior.com.br)', false);
    expect(result).toContain('href="https://senior.com.br"');
    expect(result).toContain('Senior');
  });

  it('mascara CPF completo no HTML exportado', () => {
    const result = convertMarkdownToHTML('CPF 123.456.789-10', false);
    expect(result).not.toContain('123.456.789-10');
    expect(result).toContain('CPF xxx.xxx.789-xx');
  });

  it('preserves full link with parentheses in URL', () => {
    const url = 'https://example.com/docs/api(v2)/guia?ref=abc(def)';
    const result = convertMarkdownToHTML(`[Documentacao](${url})`, false);
    expect(result).toContain(`href="${url}"`);
  });

  it('blocks AI studio links', () => {
    const result = convertMarkdownToHTML('[Text](https://ai.studio/something)', false);
    expect(result).not.toContain('href=');
    expect(result).toContain('<strong');
  });

  it('converts list items', () => {
    const result = convertMarkdownToHTML('- Item 1\n- Item 2', false);
    expect(result).toContain('<li>Item 1</li>');
    expect(result).toContain('<li>Item 2</li>');
  });

  it('converts PORTA score markers with segment and flags', () => {
    const result = convertMarkdownToHTML('[[PORTA:51:P7:O8:R6:T7:A7:PRD:TRAD]]', false);
    expect(result).toContain('porta-score');
    expect(result).toContain('43');
    expect(result).toContain('Média Compatibilidade');
    expect(result).toContain('PRD');
    expect(result).toContain('TRAD');
    expect(result).toContain('bruto: 72');
  });

  it('keeps backward compatibility with PORTA v1 markers', () => {
    const result = convertMarkdownToHTML('[[PORTA:30:P2:O3:R4:T3:A3]]', false);
    expect(result).toContain('Baixa Compatibilidade');
    expect(result).toContain('PRD');
  });

  it('converts consolidated PORTA feeds into a rendered score card', () => {
    const result = convertMarkdownToHTML(
      `
[[PORTA_FEED_O:[6]:ELOS:[Plantio,Armazenagem,Beneficiamento]]]
[[PORTA_FEED_R:[4]:PRESSOES:[LCDPR]]]
[[PORTA_FEED_T:[6]:T1:[5]:T2:[6]:T3:[7]:STACK:[Planilhas]]]
[[PORTA_FEED_P:[6]:HA:[8500]:CNPJS:[4]:FAT:[R$ 180 mi]]]
[[PORTA_FEED_P_PROXY:FUNC:[650]]]
[[PORTA_FEED_A2:[8]:TIMING:[BOM]:FASE:[Entressafra]]]
[[PORTA_FEED_A:[6]:A1:[5]:A2:[6]:GERACAO:[G1_5]]]
[[PORTA_SEG:[PRD]]]
[[PORTA_FLAG:TRAD:[NAO]:NATUREZA:[PRODUCAO]]]
[[PORTA_FLAG:LOCK:[NAO]]]
[[PORTA_FLAG:NOFIT:[NAO]]]
      `,
      false,
    );

    expect(result).toContain('porta-score');
    expect(result).toContain('58');
    expect(result).toContain('PRD');
    expect(result).toContain('Produtor Rural');
    expect(result).not.toContain('PORTA_FEED');
  });
});
