// tests/utils/chunkRetry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CHUNK_RELOAD_PENDING_KEY,
  isChunkLoadError,
  loadOptionalChunk,
  loadWithChunkRetry,
} from '../../utils/chunkRetry';

describe('isChunkLoadError', () => {
  it('detecta falha de import dinâmico do Vite', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
  });

  it('ignora erros genéricos', () => {
    expect(isChunkLoadError(new Error('Network down'))).toBe(false);
  });
});

describe('loadOptionalChunk', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna o módulo quando o chunk opcional carrega', async () => {
    const result = await loadOptionalChunk(() => Promise.resolve({ default: 'Mermaid' }));
    expect(result).toEqual({ default: 'Mermaid' });
  });

  it('degrada sem reload quando o chunk opcional falha', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    const result = await loadOptionalChunk(() =>
      Promise.reject(new Error('Failed to fetch dynamically imported module')),
    );

    expect(result).toBeNull();
    expect(reloadMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CHUNK_RELOAD_PENDING_KEY)).toBeNull();
  });

  it('relança erros que não são de carregamento de chunk', async () => {
    await expect(loadOptionalChunk(() => Promise.reject(new Error('Network down')))).rejects.toThrow('Network down');
  });
});

describe('loadWithChunkRetry', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna resultado do loader em sucesso', async () => {
    const loader = vi.fn().mockResolvedValue({ default: 'MyComponent' });
    const result = await loadWithChunkRetry(loader);
    expect(result).toEqual({ default: 'MyComponent' });
  });

  it('limpa sessionStorage guard em sucesso', async () => {
    sessionStorage.setItem('scout-chunk-reload-attempted', '1');
    await loadWithChunkRetry(() => Promise.resolve('ok'));
    expect(sessionStorage.getItem('scout-chunk-reload-attempted')).toBeNull();
  });

  it('relança erro não-chunk normalmente', async () => {
    const err = new Error('Unexpected module error');
    const loader = vi.fn().mockRejectedValue(err);
    await expect(loadWithChunkRetry(loader)).rejects.toThrow('Unexpected module error');
  });

  it('relança ChunkLoadError após retry já tentado', async () => {
    sessionStorage.setItem('scout-chunk-reload-attempted', '1');
    const chunkError = new Error('ChunkLoadError: Loading chunk 5 failed');
    const loader = vi.fn().mockRejectedValue(chunkError);

    await expect(loadWithChunkRetry(loader)).rejects.toThrow('ChunkLoadError');
    // Guard should be cleared after giving up
    expect(sessionStorage.getItem('scout-chunk-reload-attempted')).toBeNull();
  });

  it('tenta reload e retorna promise pendente na primeira ChunkLoadError', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    const chunkError = new Error('Failed to fetch dynamically imported module');
    const loader = vi.fn().mockRejectedValue(chunkError);

    // Start the promise and wait for async code (catch block) to execute
    const promise = loadWithChunkRetry(loader);
    // Flush microtasks so the async catch runs
    await Promise.resolve();
    await Promise.resolve();

    expect(sessionStorage.getItem('scout-chunk-reload-attempted')).toBe('1');
    expect(sessionStorage.getItem(CHUNK_RELOAD_PENDING_KEY)).toBe('1');
    expect(reloadMock).toHaveBeenCalledOnce();

    // Promise should not resolve/reject (it's pending after reload trigger)
    let settled = false;
    promise
      .then(() => {
        settled = true;
      })
      .catch(() => {
        settled = true;
      });
    await new Promise(r => setTimeout(r, 50));
    expect(settled).toBe(false);
  });
});
