import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { buildAuditableSources } from '../../utils/textCleaners';

describe('MarkdownRenderer', () => {
  it('converts raw HTML links to markdown links for rendering', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'Texto <a href="https://www.senior.com.br/">clique</a> final'}
        allowRawHtml={false}
      />
    );

    const link = container.querySelector('a[href="https://www.senior.com.br/"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toBe('clique ↗');
    expect(container.textContent).toContain('Texto');
  });

  it('does not render non-link raw HTML when allowRawHtml is false', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'Texto <script>alert(1)</script> final'}
        allowRawHtml={false}
      />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('Texto');
  });

  it('still renders markdown links when raw HTML is disabled', () => {
    render(<MarkdownRenderer content={'[Site](https://www.senior.com.br/)'} allowRawHtml={false} />);
    const link = screen.getByRole('link', { name: /^Site/ });
    expect(link).toHaveAttribute('href', 'https://www.senior.com.br/');
  });

  it('keeps stable citation indices from auditable sources', () => {
    const content = '[Fonte A](https://www.senior.com.br/a) e [Fonte B](https://www.senior.com.br/b)';
    const auditableSources = buildAuditableSources(content, []);
    const { container } = render(
      <MarkdownRenderer content={content} allowRawHtml={false} auditableSources={auditableSources} />
    );

    expect(container.textContent).toContain('[1]');
    expect(container.textContent).toContain('[2]');
  });

  it('renderiza citação numérica como superscript sem duplicar link em tabela', () => {
    const content = '| Evidência |\n| --- |\n| 90k ha [1.4](https://www.bndes.gov.br/noticia) [4] |';
    const auditableSources = buildAuditableSources(content, [
      { title: 'BNDES', url: 'https://www.bndes.gov.br/noticia', verification: 'grounding' },
    ]);
    const { container } = render(
      <MarkdownRenderer content={content} allowRawHtml={false} auditableSources={auditableSources} />
    );

    expect(container.textContent).toContain('90k ha');
    expect(container.textContent).toContain('[1]');
    expect(container.textContent).not.toContain('[1.4]');
    expect(container.textContent).not.toContain('[4]');
    expect(container.querySelectorAll('a[href="https://www.bndes.gov.br/noticia"]')).toHaveLength(1);
  });

  it('oculta o bloco visual de BLOCO DE FEEDS PORTA inteiro como proteção de render', () => {
    render(
      <MarkdownRenderer
        content={'### 📊 BLOCO DE FEEDS PORTA\n\n- Nota O sugerida: 9'}
        allowRawHtml={false}
      />
    );

    expect(screen.queryByText(/BLOCO DE FEEDS PORTA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nota O sugerida: 9/i)).not.toBeInTheDocument();
  });
});
