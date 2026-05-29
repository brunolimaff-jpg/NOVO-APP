import { describe, expect, it } from 'vitest';
import { buildPrintReportHtml, renderMarkdownForPrint } from '../../utils/printExport';

describe('printExport', () => {
  it('renderiza tabelas, headings longos e listas sem emojis quebrados', () => {
    const html = renderMarkdownForPrint(`
# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL MUITO LONGA PARA QUEBRAR LINHA

| Elo | Status | Evidência |
|-----|--------|-----------|
| Usina de etanol | ✅ | RRP Energia em Tapurah |

- **Tese:** Grupo Piccini entrou em biocombustíveis.
- **Risco:** ERP Senior não confirmado.
`);

    expect(html).toContain('<h1>');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Elo</th>');
    expect(html).toContain('<td>Usina de etanol</td>');
    expect(html).toContain('<ul>');
    expect(html).not.toContain('🦅');
    expect(html).not.toContain('✅');
  });

  it('preserva links markdown com query string no HTML impresso', () => {
    const html = renderMarkdownForPrint('[Fonte BNDES](https://example.com/noticia?empresa=piccini&fonte=bndes)');

    expect(html).toContain('href="https://example.com/noticia?empresa=piccini&amp;fonte=bndes"');
  });

  it('preserva links markdown com parênteses na URL', () => {
    const html = renderMarkdownForPrint('[Verbete](https://pt.wikipedia.org/wiki/Lucas_do_Rio_Verde_(Mato_Grosso))');

    expect(html).toContain('href="https://pt.wikipedia.org/wiki/Lucas_do_Rio_Verde_(Mato_Grosso)"');
    expect(html).not.toContain('(Mato_Grosso))</p>');
  });

  it('renderiza tabelas GFM sem barras laterais', () => {
    const html = renderMarkdownForPrint(`
Elo | Status | Evidência
--- | --- | ---
Plantio próprio | Sim | 90k ha
Armazenagem própria | Sim | Kepler Weber
`);

    expect(html).toContain('<table>');
    expect(html).toContain('<th>Elo</th>');
    expect(html).toContain('<td>Plantio próprio</td>');
    expect(html).toContain('<td>Kepler Weber</td>');
  });

  it('mantém Mermaid legível quando a CDN falhar', () => {
    const html = buildPrintReportHtml({
      title: 'Grupo Piccini',
      content: '```mermaid\ngraph LR\nA["Fiscal/Planilha" -.-> B["Armazenagem (Kepler Weber)"]\n```',
    });

    expect(html).toContain('class="mermaid"');
    expect(html).toContain('window.__scoutMermaidFallback');
    expect(html).toContain('data-render-status');
    expect(html).toContain('A[&quot;Fiscal/Planilha&quot;] -.-&gt; B[&quot;Armazenagem (Kepler Weber)&quot;]');
  });

  it('gera documento HTML de impressão com CSS e fontes', () => {
    const html = buildPrintReportHtml({
      title: 'Grupo Piccini',
      subtitle: '30 de abril de 2026',
      content: '# Resumo\n\nTexto do dossiê.',
      sources: [
        {
          title: 'BNDES',
          url: 'https://agenciadenoticias.bndes.gov.br/centro-oeste/BNDES-financia-usina-de-etanol-de-milho-em-Mato-Grosso-com-R%24-1-bi/',
        },
      ],
    });

    expect(html).toContain('@page');
    expect(html).toContain('Salvar como PDF');
    expect(html).toContain('Grupo Piccini');
    expect(html).toContain('Fontes e Referências');
    expect(html).toContain('https://agenciadenoticias.bndes.gov.br/');
    expect(html).not.toContain('🦅');
  });

  it('não exporta CPF completo no HTML impresso', () => {
    const html = buildPrintReportHtml({
      title: 'Grupo Piccini',
      content: 'Sócio produtor rural CPF 123.456.789-10.',
    });

    expect(html).not.toContain('123.456.789-10');
    expect(html).toContain('CPF xxx.xxx.789-xx');
  });
});
