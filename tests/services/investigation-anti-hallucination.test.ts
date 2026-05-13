import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/clientLookupService', () => ({
  benchmarkClientes: vi.fn(),
  formatarParaPrompt: vi.fn(() => ''),
  formatarComexParaPrompt: vi.fn(() => ''),
  lookupCliente: vi.fn(),
}));

describe('buildExtraContext anti-hallucination guard', () => {
  it('deve injetar guard quando docs-rag contém SEM DOCUMENTAÇÃO ENCONTRADA', async () => {
    const { buildExtraContext } = await import('../../services/gemini/investigation-orchestration');

    const result = buildExtraContext({
      clienteData: null,
      comexData: null,
      ragContext: 'Proposta real',
      ragDocsContext: '[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]',
      concorrentesContext: '',
      portaContext: '',
    });

    expect(result).toContain('AVISO DE SEGURANÇA');
    expect(result).toContain('NÃO complete com conhecimento próprio');
    expect(result).toContain('⚠️ [DOCS RAG]');
  });

  it('não deve injetar guard quando docs-rag tem conteúdo real', async () => {
    const { buildExtraContext } = await import('../../services/gemini/investigation-orchestration');

    const result = buildExtraContext({
      clienteData: null,
      comexData: null,
      ragContext: '',
      ragDocsContext: '### ERP: Módulo Fiscal\nConteúdo real\n(Fonte: https://doc.senior.com.br/fiscal)',
      concorrentesContext: '',
      portaContext: '',
    });

    expect(result).not.toContain('AVISO DE SEGURANÇA');
    expect(result).toContain('[DOCS RAG]');
    expect(result).not.toContain('⚠️');
  });

  it('não deve injetar guard quando só proposals RAG está vazio', async () => {
    const { buildExtraContext } = await import('../../services/gemini/investigation-orchestration');

    const result = buildExtraContext({
      clienteData: null,
      comexData: null,
      ragContext: '[SEM DADOS DE PROPOSTAS ENCONTRADOS — NÃO complete com suposições.]',
      ragDocsContext: '### ERP: Módulo Fiscal\nTexto real',
      concorrentesContext: '',
      portaContext: '',
    });

    expect(result).not.toContain('AVISO DE SEGURANÇA');
    expect(result).toContain('⚠️ [CONTEXTO RAG]');
    expect(result).toContain('[DOCS RAG]');
  });

  it('deve injetar guard quando docs-rag é string vazia', async () => {
    const { buildExtraContext } = await import('../../services/gemini/investigation-orchestration');

    const result = buildExtraContext({
      clienteData: null,
      comexData: null,
      ragContext: 'Proposta ok',
      ragDocsContext: '',
      concorrentesContext: '',
      portaContext: '',
    });

    expect(result).toContain('AVISO DE SEGURANÇA');
  });

  it('não deve injetar guard quando ambos RAGs estão ok', async () => {
    const { buildExtraContext } = await import('../../services/gemini/investigation-orchestration');

    const result = buildExtraContext({
      clienteData: { encontrado: true, ok: true, query: 'Test Ltda', results: [] },
      comexData: null,
      ragContext: '[Proposta: p1.pdf]\nTexto da proposta',
      ragDocsContext: '### ERP: Módulo Fiscal\nTexto real',
      concorrentesContext: 'Concorrentes: TOTVS',
      portaContext: 'Porta: PRD',
    });

    expect(result).not.toContain('AVISO DE SEGURANÇA');
    expect(result).not.toContain('⚠️');
    expect(result).toContain('Proposta: p1.pdf');
    expect(result).toContain('Módulo Fiscal');
    expect(result).toContain('Concorrentes: TOTVS');
  });
});
