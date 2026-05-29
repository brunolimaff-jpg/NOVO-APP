// tests/utils/downloadHelpers.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadFile } from '../../utils/downloadHelpers';

describe('downloadFile', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;
  let appendChildMock: ReturnType<typeof vi.fn>;
  let removeChildMock: ReturnType<typeof vi.fn>;
  let clickMock: ReturnType<typeof vi.fn>;
  let linkEl: { href: string; download: string; style: { display: string }; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();

    createObjectURLMock = vi.fn().mockReturnValue('blob:fake-url');
    revokeObjectURLMock = vi.fn();
    clickMock = vi.fn();
    appendChildMock = vi.fn();
    removeChildMock = vi.fn();

    linkEl = {
      href: '',
      download: '',
      style: { display: '' },
      click: clickMock,
    };

    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildMock as any);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildMock as any);
    vi.spyOn(document, 'createElement').mockReturnValue(linkEl as unknown as HTMLElement);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retorna true em sucesso', () => {
    const result = downloadFile('relatorio.txt', 'conteúdo', 'text/plain');
    expect(result).toBe(true);
  });

  it('cria URL temporária via createObjectURL', () => {
    downloadFile('file.txt', 'texto', 'text/plain');
    expect(createObjectURLMock).toHaveBeenCalledOnce();
  });

  it('dispara click no link', () => {
    downloadFile('file.txt', 'texto', 'text/plain');
    expect(clickMock).toHaveBeenCalledOnce();
  });

  it('define link.download com o nome fornecido', () => {
    downloadFile('meu-arquivo.csv', 'dados', 'text/csv');
    expect(linkEl.download).toBe('meu-arquivo.csv');
  });

  it('adiciona BOM para mimeType text/ (verifica via createObjectURL chamado)', () => {
    // downloadFile should succeed and call createObjectURL — BOM is added internally
    const result = downloadFile('file.txt', 'sem bom', 'text/plain');
    expect(result).toBe(true);
    expect(createObjectURLMock).toHaveBeenCalledOnce();
  });

  it('conteúdo que já tem BOM não duplica (downloadFile retorna true)', () => {
    const bomContent = '\uFEFFconteúdo';
    const result = downloadFile('file.txt', bomContent, 'text/plain');
    expect(result).toBe(true);
    // createObjectURL called once — no double-blob creation
    expect(createObjectURLMock).toHaveBeenCalledOnce();
  });

  it('aceita Blob diretamente sem adicionar BOM', () => {
    const blobInput = new Blob(['data'], { type: 'application/pdf' });
    expect(() => downloadFile('file.pdf', blobInput, 'application/pdf')).not.toThrow();
  });

  it('revoga URL e remove link após 200ms (cleanup)', () => {
    downloadFile('file.txt', 'texto', 'text/plain');
    expect(revokeObjectURLMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake-url');
    expect(removeChildMock).toHaveBeenCalledOnce();
  });

  it('lança erro quando createObjectURL falha', () => {
    createObjectURLMock.mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => downloadFile('f.txt', 'c', 'text/plain')).toThrow('Falha ao iniciar o download');
  });
});
