import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { buildAuditableSources } from '../../utils/textCleaners';

describe('MarkdownRenderer', () => {
  it('does not render raw HTML when allowRawHtml is false', () => {
    const { container } = render(
      <MarkdownRenderer
        content={'Texto <a href="https://evil.example">clique</a> final'}
        allowRawHtml={false}
      />
    );

    expect(container.querySelector('a[href="https://evil.example"]')).toBeNull();
    expect(container.textContent).toContain('Texto');
  });

  it('still renders markdown links when raw HTML is disabled', () => {
    render(<MarkdownRenderer content={'[Site](https://www.senior.com.br/)'} allowRawHtml={false} />);
    const link = screen.getByRole('link', { name: 'Site' });
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
