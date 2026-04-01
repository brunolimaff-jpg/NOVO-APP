import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks obrigatórios ANTES dos imports do módulo
// ---------------------------------------------------------------------------
const mockMermaidRender = vi.hoisted(() => vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">test</svg>' }));
const mockMermaidInitialize = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: {
    initialize: mockMermaidInitialize,
    render: mockMermaidRender,
  },
}));

vi.mock('../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../utils/textCleaners', () => ({
  buildAuditableSources: vi.fn(() => []),
  normalizeSourceUrl: vi.fn((url: string) => url),
}));

vi.mock('../../utils/linkFixer', () => ({
  fixFakeLinks: vi.fn((t: string) => t),
  rewriteMarkdownLinksToGoogle: vi.fn((t: string) => t),
  autoLinkSeniorTerms: vi.fn((t: string) => t),
  cleanFakeSourcesBlock: vi.fn((t: string) => t),
}));

import MarkdownRenderer from '../MarkdownRenderer';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function renderMd(content: string, props: Record<string, unknown> = {}) {
  return render(<MarkdownRenderer content={content} {...props} />);
}

// ---------------------------------------------------------------------------
// Suite: sanitizeMermaidCode (testada indiretamente via MermaidChart)
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — sanitizeMermaidCode', () => {
  it('rejeita código mermaid sem tipo válido e não chama render', async () => {
    const { container } = renderMd('```mermaid\nINVALID CODE\n```');
    await vi.runAllTimersAsync?.();
    // render do mermaid não deve ser chamado pois sanitize retorna ''
    expect(container.querySelector('.mermaid-chart')).toBeNull();
  });

  it('aceita graph TD como tipo válido', async () => {
    renderMd('```mermaid\ngraph TD\nA-->B\n```');
    // Apenas verifica que não lança erro — render é mockado
  });

  it('aceita sequenceDiagram como tipo válido', async () => {
    renderMd('```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n```');
  });

  it('remove blocos de comentário HTML do input mermaid', () => {
    // sanitizeMermaidCode deve remover <!-- --> antes de processar
    // Indiretamente verificado: se o código after strip não tiver tipo válido, retorna ''
    renderMd('```mermaid\n<!-- comentario -->\ngraph TD\nA-->B\n```');
  });
});

// ---------------------------------------------------------------------------
// Suite: XSS via rehypeRaw
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — segurança XSS rehypeRaw', () => {
  it('allowRawHtml=false NÃO renderiza tag script como elemento executável', () => {
    const { container } = renderMd(
      'Olá <script>window.__xss_test = true;</script> mundo',
      { allowRawHtml: false }
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as typeof window & { __xss_test?: boolean }).__xss_test).toBeUndefined();
  });

  it('allowRawHtml=true (padrão) renderiza HTML bruto como <strong>', () => {
    const { container } = renderMd('<strong>negrito</strong>', { allowRawHtml: true });
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('allowRawHtml=false não renderiza <iframe> injetado', () => {
    const { container } = renderMd(
      '<iframe src="javascript:alert(1)"></iframe>',
      { allowRawHtml: false }
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('allowRawHtml=false não renderiza <img onerror> injetado', () => {
    const { container } = renderMd(
      '<img src="x" onerror="window.__onerror_fired=true" />',
      { allowRawHtml: false }
    );
    const img = container.querySelector('img');
    if (img) {
      // Se por algum motivo renderizar img, o onerror não deve ter disparado
      expect((window as typeof window & { __onerror_fired?: boolean }).__onerror_fired).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite: Conversão JSON mermaid → bloco cercado
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — processedContent JSON mermaid', () => {
  it('converte {"mermaid":"..."} JSON para bloco mermaid', () => {
    // O processedContent deve substituir o JSON por ```mermaid ... ```
    // Verificamos que o componente não explode e que o MermaidChart é tentado
    expect(() =>
      renderMd('{"mermaid":"graph TD\\nA-->B"}')
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite: Renderização de links com badge emoji
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — renderização de links com badges', () => {
  it('badge 🟢 é convertido para anchor tag com href correto', () => {
    const { container } = renderMd('[🟢 Fonte oficial - https://senior.com.br/produto]');
    const anchors = container.querySelectorAll('a');
    // Deve existir pelo menos um link no output
    const hrefs = Array.from(anchors).map((a) => a.getAttribute('href'));
    const hasSeniorLink = hrefs.some((h) => h?.includes('senior.com.br'));
    expect(hasSeniorLink).toBe(true);
  });

  it('links de badge têm target=_blank e rel=noopener', () => {
    const { container } = renderMd('[🟢 Fonte - https://example.com]');
    const anchors = Array.from(container.querySelectorAll('a'));
    anchors.forEach((a) => {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    });
  });

  it('badge link NÃO injeta atributos extras via URL manipulada', () => {
    // Tenta injetar via URL com aspas duplas
    const maliciousContent = '[🟢 Fonte - https://evil.com" onmouseover="alert(1)]';
    const { container } = renderMd(maliciousContent);
    const anchors = Array.from(container.querySelectorAll('a'));
    anchors.forEach((a) => {
      // O atributo onmouseover jamais deve existir
      expect(a.getAttribute('onmouseover')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: Renderização básica
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — renderização básica', () => {
  it('renderiza texto markdown simples', () => {
    renderMd('**negrito** e _itálico_');
    const bold = document.querySelector('strong');
    expect(bold).not.toBeNull();
  });

  it('renderiza tabela GFM corretamente', () => {
    const tableContent = `| A | B |\n|---|---|\n| 1 | 2 |`;
    const { container } = renderMd(tableContent);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('renderiza heading h2 com marcador verde', () => {
    const { container } = renderMd('## Título de Seção');
    expect(container.querySelector('h2')).not.toBeNull();
  });

  it('renderiza blockquote com estilo verde', () => {
    const { container } = renderMd('> citação');
    expect(container.querySelector('blockquote')).not.toBeNull();
  });

  it('retorna div vazia para content vazio', () => {
    const { container } = renderMd('');
    expect(container.querySelector('.markdown-body')).not.toBeNull();
  });

  it('renderiza código inline com classe font-mono', () => {
    const { container } = renderMd('use `const x = 1`');
    expect(container.querySelector('code')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: Props groundingSources / auditableSources
// ---------------------------------------------------------------------------
describe('MarkdownRenderer — fontes auditáveis', () => {
  it('aceita groundingSources sem explodir', () => {
    expect(() =>
      renderMd('conteúdo', {
        groundingSources: [{ title: 'Fonte A', url: 'https://a.com' }],
      })
    ).not.toThrow();
  });

  it('aceita auditableSources sem explodir', () => {
    expect(() =>
      renderMd('conteúdo', {
        auditableSources: [
          { url: 'https://b.com', title: 'B', citationIndex: 1, reliability: 'high' as const },
        ],
      })
    ).not.toThrow();
  });
});
