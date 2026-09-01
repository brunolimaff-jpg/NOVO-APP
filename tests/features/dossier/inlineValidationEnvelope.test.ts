/**
 * BRU-162 — envelope determinístico do freeze no fechamento.
 *
 * Runs reais 1-3 (e8c1ad56, c2b3cb56, 5ae7a1ac) morreram na região:
 * inline-validation:body:start → json:parsed → post-validate-inline,
 * sempre com 8 candidatos e body ~50k. O run #4 passou porque nem
 * percorreu a subrota (candidateCount=0).
 *
 * Este teste reproduz a subrota completa com o envelope observado:
 * extract (texto 50k com 8 links) → fetch mocked (/api/link-status,
 * resposta ~50k com latência realista) → response.text() → JSON.parse,
 * com telemetria scoutDiag ativa (flush batch concorrente) — tudo
 * determinístico, REAL_SEARCH_CALLS=0, REAL_PROVIDER_CALLS=0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateInlineSourcesForPromotion } from '../../../features/dossier/waterfall-orchestrator';
import type { VerifiedSource } from '../../../utils/webVerification';

const LINK_URLS = Array.from({ length: 8 }, (_, i) => `https://fonte-${i + 1}.exemplo.com.br/noticia/scheffer-ampliacao-2025-pag-${i + 1}`);

/** Texto ~50k chars com 8 links markdown inline promovíveis. */
function textoComLinksInline(chars: number): string {
  const links = LINK_URLS.map((url, i) => `[${i + 1}]( ${url} )`).join(' ');
  const paragrafo = `A operação do grupo expandiu capacidade em 2025 conforme fontes setoriais. ${links} Dados complementares de logística, insumos emercado interno sustentam a tese comercial.`;
  const base = paragrafo.repeat(Math.ceil(chars / paragrafo.length));
  return base.slice(0, chars);
}

/** Corpo de resposta do /api/link-status (~50k chars, 8 resultados). */
function linkStatusBody(): string {
  const results: Record<string, { status: string }> = {};
  for (const url of LINK_URLS) {
    results[url] = { status: 'valid' };
  }
  // padding para ~50k (simula payload observado nos runs)
  const padding = 'x'.repeat(50_000 - JSON.stringify({ results }).length - 20);
  return JSON.stringify({ results, padding });
}

function makeResponse(body: string, delayMs: number): Response {
  const bodyPromise = new Promise<string>(resolve => {
    setTimeout(() => resolve(body), delayMs);
  });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: () => bodyPromise,
    bodyUsed: false,
  } as unknown as Response;
}

describe('BRU-162 — envelope determinístico da validação inline (subrota do freeze)', () => {
  beforeEach(() => {
    window.localStorage.setItem('SCOUT_DIAG_ENABLED', '1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('subrota completa com envelope observado (8 links, body ~50k, 1.7s de latência) termina < 4s', async () => {
    const body = linkStatusBody();
    expect(body.length).toBeGreaterThan(45_000);

    // Mocks separados por rota (despacho ff7f28af): /api/link-status responde
    // o payload; /api/llm (flush de diagnostics) responde ok lento.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const target = String(_url ?? '');
      if (target.includes('/api/llm')) {
        await new Promise(r => setTimeout(r, 120)); // flush de diagnostics com latência própria
        return { ok: true, status: 200 } as unknown as Response;
      }
      void init;
      return makeResponse(body, 1700); // latência observada no run (totalElapsedMs=1685)
    });
    vi.stubGlobal('fetch', fetchMock);

    const texto = textoComLinksInline(50_000);
    const t0 = performance.now();
    const promoted = await validateInlineSourcesForPromotion(texto, [] as VerifiedSource[]);
    const elapsed = performance.now() - t0;

    // determinístico: extraiu 8 candidatos, fetch do link-status 1x, parse OK, 8 válidos
    const linkStatusCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/link-status'));
    expect(linkStatusCalls).toHaveLength(1);
    expect(promoted).toHaveLength(8);
    // prova de não-travamento: subrota inteira < 4s (timeout total é 5s)
    expect(elapsed).toBeLessThan(4_000);
  });

  // Despacho ff7f28af: flushDiagnosticsNow(..., true) EXPLÍCITO enquanto o
  // body-read dos 8 links ainda está pendente — diagnostics saudável.
  it('flush forçado durante body-read pendente (diagnostics saudável): subrota termina < 4s', async () => {
    const { flushDiagnosticsNow, scoutDiag } = await import('../../../utils/diagnosticLog');
    const body = linkStatusBody();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async url => {
      if (String(url ?? '').includes('/api/llm')) {
        await new Promise(r => setTimeout(r, 80));
        return { ok: true, status: 200 } as unknown as Response;
      }
      return makeResponse(body, 1700);
    });
    vi.stubGlobal('fetch', fetchMock);

    // eventos de telemetria no buffer + flush forçado DURANTE o body-read
    const noiseTimer = setInterval(() => {
      for (let i = 0; i < 10; i += 1) scoutDiag.info('FreezeDiag', 'force-flush-noise', { i });
    }, 100);

    try {
      const texto = textoComLinksInline(50_000);
      const forceFlushTimer = setTimeout(() => flushDiagnosticsNow('bru162:mid-body-read', true), 600);

      const t0 = performance.now();
      const promoted = await validateInlineSourcesForPromotion(texto, [] as VerifiedSource[]);
      const elapsed = performance.now() - t0;

      clearTimeout(forceFlushTimer);
      expect(promoted).toHaveLength(8);
      expect(elapsed).toBeLessThan(4_000);
    } finally {
      clearInterval(noiseTimer);
    }
  });

  // Despacho ff7f28af: flush forçado com diagnostics LENTO/ABORTADO —
  // re-enfileiramento (c344d236) não pode travar nem perder a subrota.
  it('flush forçado durante body-read com /api/llm abortando: subrota ainda termina < 4s', async () => {
    const { flushDiagnosticsNow, scoutDiag } = await import('../../../utils/diagnosticLog');
    const body = linkStatusBody();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async url => {
      if (String(url ?? '').includes('/api/llm')) {
        // diagnostics que aborta (simula sob carga: fetch estoura timeout próprio)
        await new Promise(r => setTimeout(r, 50));
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      return makeResponse(body, 1700);
    });
    vi.stubGlobal('fetch', fetchMock);

    const noiseTimer = setInterval(() => {
      for (let i = 0; i < 10; i += 1) scoutDiag.info('FreezeDiag', 'abort-flush-noise', { i });
    }, 100);

    try {
      const texto = textoComLinksInline(50_000);
      const forceFlushTimer = setTimeout(() => flushDiagnosticsNow('bru162:mid-body-read-abort', true), 600);

      const t0 = performance.now();
      const promoted = await validateInlineSourcesForPromotion(texto, [] as VerifiedSource[]);
      const elapsed = performance.now() - t0;

      clearTimeout(forceFlushTimer);
      expect(promoted).toHaveLength(8);
      expect(elapsed).toBeLessThan(4_000);
    } finally {
      clearInterval(noiseTimer);
    }
  });

  it('subrota sob flush concorrente de telemetria (batch de 5s disparando durante body-read) termina < 4s', async () => {
    const body = linkStatusBody();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      makeResponse(body, 1700),
    );
    vi.stubGlobal('fetch', fetchMock);

    // gera carga de telemetria concorrente (flushes agendados durante a subrota)
    const { scoutDiag } = await import('../../../utils/diagnosticLog');
    const noiseTimer = setInterval(() => {
      for (let i = 0; i < 20; i += 1) {
        scoutDiag.info('FreezeDiag', 'load-noise', { i });
      }
    }, 250);

    try {
      const texto = textoComLinksInline(50_000);
      const t0 = performance.now();
      const promoted = await validateInlineSourcesForPromotion(texto, [] as VerifiedSource[]);
      const elapsed = performance.now() - t0;
      expect(promoted).toHaveLength(8);
      expect(elapsed).toBeLessThan(4_000);
    } finally {
      clearInterval(noiseTimer);
    }
  });

  it('subrota com resposta lenta além do timeout total (5s) degrada com retorno [] em < 7s (sem travar)', async () => {
    const body = linkStatusBody();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      makeResponse(body, 30_000), // nunca chega a tempo
    );
    vi.stubGlobal('fetch', fetchMock);

    const texto = textoComLinksInline(50_000);
    const t0 = performance.now();
    const promoted = await validateInlineSourcesForPromotion(texto, [] as VerifiedSource[]);
    const elapsed = performance.now() - t0;

    expect(promoted).toHaveLength(0);
    expect(elapsed).toBeLessThan(7_000);
  });
});
