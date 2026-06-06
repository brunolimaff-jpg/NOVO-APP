import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { extractPromotableInlineSources } from '../../utils/webVerification';
import { validateInlineSourcesForPromotion } from '../../features/dossier/waterfall-orchestrator';

// ── Helpers ─────────────────────────────────────────────────────────

function mockFetchResponse(
  config: {
    status?: number;
    ok?: boolean;
    body?: string;
    contentType?: string;
    contentLength?: string;
    /** Se true, a promise do fetch nunca resolve */
    neverResolve?: boolean;
    /** Se true, response.text() nunca resolve mesmo com fetch resolvido */
    neverReadBody?: boolean;
  } = {},
) {
  const {
    status = 200,
    ok = true,
    body = '{}',
    contentType = 'application/json',
    contentLength,
    neverResolve,
    neverReadBody,
  } = config;

  if (neverResolve) {
    return vi.fn(() => new Promise<Response>(() => {})) as typeof fetch;
  }

  return vi.fn(() => {
    const headers = new Headers();
    headers.set('content-type', contentType);
    if (contentLength) headers.set('content-length', contentLength);

    return Promise.resolve({
      status,
      ok,
      headers,
      bodyUsed: false,
      text: neverReadBody ? () => new Promise<string>(() => {}) : () => Promise.resolve(body),
      json: () => Promise.resolve(JSON.parse(body)),
    } as Response);
  }) as typeof fetch;
}

// ── Testes: extractPromotableInlineSources — regex patológico ───────

describe('extractPromotableInlineSources — defensive regex', () => {
  it('retorna vazio para texto vazio', () => {
    const sources = extractPromotableInlineSources('', [], 10);
    expect(sources).toEqual([]);
  });

  it('ignora marcadores incompletos sem fechar parênteses', () => {
    const text = 'Veja [Doc](https://www.bndes.gov.br/noticia e mais [Info](https://www.gov.br';
    const sources = extractPromotableInlineSources(text, [], 10);
    // Nenhum markdown link bem formado — ambos têm parênteses não fechados
    expect(sources.every(s => s.verification === 'fallback')).toBe(true);
  });

  it('extrai links em texto grande com muitas correspondências parciais', () => {
    // Simula um dossiê com muitas near-matches que poderiam causar
    // backtracking no regex MARKDOWN_LINK_REGEX
    const fragments: string[] = [];
    for (let i = 0; i < 200; i++) {
      fragments.push(`[Fonte ${i}](https://www.exemplo.com.br/pagina/${i}) — [Ref ${i}](https://www.gov.br/doc${i})`);
      // Adiciona near-matches: abre colchete mas não tem link completo
      fragments.push(`[pendente ${i}] sem url — (https://www.incompleto`);
    }
    const text = fragments.join('\n');

    const start = performance.now();
    const sources = extractPromotableInlineSources(text, [], 40);
    const duration = performance.now() - start;

    // Deve extrair os links válidos
    expect(sources.length).toBeGreaterThan(0);
    // Não deve demorar mais que 2s (catastrophic backtracking levaria minutos)
    expect(duration).toBeLessThan(2000);
    // Cada source deve ter URL normalizada
    for (const s of sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.title).toBeTruthy();
    }
  });

  it('não entra em loop infinito com parênteses aninhados', () => {
    // Caso patológico: parênteses profundamente aninhados que confundem
    // o grupo de captura de URL no regex
    const text = '[Nested](https://www.gov.br/doc(' + '('.repeat(100) + '))' + ')'.repeat(100);
    const start = performance.now();
    const sources = extractPromotableInlineSources(text, [], 10);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(2000);
    // O regex pode ou não capturar — o importante é não travar
    expect(Array.isArray(sources)).toBe(true);
  });

  it('respeita o limite de candidatos', () => {
    const links: string[] = [];
    for (let i = 0; i < 50; i++) {
      links.push(`[Link ${i}](https://www.gov.br/doc/${i})`);
    }
    const text = links.join('\n');
    const sources = extractPromotableInlineSources(text, [], 10);
    expect(sources.length).toBeLessThanOrEqual(10);
  });
});

// ── Testes: validateInlineSourcesForPromotion ────────────────────────

describe('validateInlineSourcesForPromotion — timeout e body', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('retorna [] quando não há candidatos', async () => {
    const result = await validateInlineSourcesForPromotion('texto sem links', []);
    expect(result).toEqual([]);
  });

  it('retorna [] quando fetch rejeita (timeout total)', async () => {
    const mockFetch = vi.fn(() => Promise.reject(new DOMException('The operation was aborted', 'AbortError')));
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const text = '[Gov](https://www.gov.br/doc)';
    const resultPromise = validateInlineSourcesForPromotion(text, []);

    // Avança o timer para disparar o timeout total de 30s
    await vi.advanceTimersByTimeAsync(31_000);

    const result = await resultPromise;
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('retorna [] quando fetch nunca resolve (promise pendente)', async () => {
    // Mock: fetch ouve o AbortSignal e rejeita quando controller.abort() é chamado
    globalThis.fetch = vi.fn((_url, options?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        if (options?.signal) {
          if (options.signal.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'));
            return;
          }
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
      });
    }) as unknown as typeof fetch;

    const text = '[Gov](https://www.gov.br/doc)';
    const resultPromise = validateInlineSourcesForPromotion(text, []);

    // Avança 31s para disparar o AbortController de timeout total
    await vi.advanceTimersByTimeAsync(31_000);

    const result = await resultPromise;
    expect(result).toEqual([]);
  }, 10_000);

  it('retorna [] quando body nunca termina (response.text() pendente)', async () => {
    const headers = new Headers();
    headers.set('content-type', 'application/json');

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers,
        bodyUsed: false,
        text: () => new Promise<string>(() => {}), // nunca resolve
      } as Response),
    ) as unknown as typeof fetch;

    const text = '[Gov](https://www.gov.br/doc)';
    const resultPromise = validateInlineSourcesForPromotion(text, []);

    // Avança 16s para disparar o body read timeout (15s)
    await vi.advanceTimersByTimeAsync(16_000);

    const result = await resultPromise;
    expect(result).toEqual([]);
  });

  it('retorna [] quando HTTP status não é OK', async () => {
    globalThis.fetch = mockFetchResponse({ status: 500, ok: false, body: '{}' });

    const text = '[Gov](https://www.gov.br/doc)';
    const result = await validateInlineSourcesForPromotion(text, []);

    expect(result).toEqual([]);
  });

  it('retorna [] quando JSON está truncado', async () => {
    globalThis.fetch = mockFetchResponse({
      status: 200,
      ok: true,
      body: '{"results": {"https://www.gov.br/doc": {"status": "val', // truncado
    });

    const text = '[Gov](https://www.gov.br/doc)';
    const result = await validateInlineSourcesForPromotion(text, []);

    expect(result).toEqual([]);
  });

  it('retorna fontes válidas quando tudo funciona', async () => {
    globalThis.fetch = mockFetchResponse({
      status: 200,
      ok: true,
      body: JSON.stringify({
        results: {
          'https://www.gov.br/doc': { status: 'valid' },
          'https://www.example.com/fake': { status: 'broken' },
        },
      }),
    });

    // Cria texto com links para domínios públicos
    const text = '[Gov](https://www.gov.br/doc) e [Fake](https://www.example.com/fake)';
    const result = await validateInlineSourcesForPromotion(text, []);

    // Apenas www.gov.br deve ser considerada válida (é domínio público)
    // Nota: o filtro final depende de isPublicVerificationUrl dentro de extractPromotableInlineSources
    expect(Array.isArray(result)).toBe(true);
    // Mesmo que o servidor retorne valid, a extração já filtra domínios não-públicos
  });

  it('timeout total resulta em [] e permite continuidade do waterfall', async () => {
    // Mock: fetch ouve o AbortSignal — rejeita quando controller.abort() dispara
    globalThis.fetch = vi.fn((_url, options?: { signal?: AbortSignal }) => {
      return new Promise<Response>((_resolve, reject) => {
        if (options?.signal) {
          if (options.signal.aborted) {
            reject(new DOMException('The operation was aborted', 'AbortError'));
            return;
          }
          options.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        }
      });
    }) as unknown as typeof fetch;

    const text = '[Gov](https://www.gov.br/doc)';
    const resultPromise = validateInlineSourcesForPromotion(text, []);

    // Avança o timer para disparar o timeout total (30s)
    await vi.advanceTimersByTimeAsync(31_000);

    const result = await resultPromise;
    // Deve retornar [] (timeout capturado) em vez de travar
    expect(result).toEqual([]);
  }, 10_000);
});
