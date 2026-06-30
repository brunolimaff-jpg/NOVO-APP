import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { isValidPublicUrl, extractHtml, performWebSearch } from '../utils/documentExtractor.js';
import { braveSearch } from '../services/search/brave-search.js';

const SearchRequestSchema = z
  .object({
    query: z.string().min(1).optional(),
    url: z.string().url().optional(),
  })
  .refine(data => Boolean(data.query || data.url), {
    message: 'Deve fornecer query ou url',
  });

export const config = {
  runtime: 'nodejs',
};

export const maxDuration = 60;

interface OpenWebSearchSource {
  title: string;
  url: string;
  snippet?: string;
  provider: 'duckduckgo' | 'url';
}

type ProviderName = 'duckduckgo';
type ProviderFailureReason = 'empty_result' | 'unknown';

interface ProviderStatus {
  provider: ProviderName;
  ok: boolean;
  reason?: ProviderFailureReason;
  statusCode?: number;
}

async function performResilientSearch(query: string): Promise<{
  content: string;
  source: string;
  sources: OpenWebSearchSource[];
  providerStatus: ProviderStatus[];
  degraded?: boolean;
  detail?: string;
}> {
  const errors: string[] = [];
  const providerStatus: ProviderStatus[] = [];

  // Brave como primário (JSON estruturado, server-side)
  try {
    const braveResults = await braveSearch(query);
    if (braveResults.length > 0) {
      providerStatus.push({ provider: 'duckduckgo', ok: true });
      const content = braveResults.map(r => `Título: ${r.title}\nURL: ${r.url}\nResumo: ${r.snippet}\n---`).join('\n');
      return {
        content,
        source: 'Brave',
        sources: braveResults.map(r => ({ title: r.title, url: r.url, provider: 'url' as const })),
        providerStatus,
      };
    }
  } catch (e) {
    scoutDiag.warn('OpenWebSearch', 'Brave falhou, fallback para DDG', { error: String(e).slice(0, 200) });
  }

  // Fallback DDG se Brave retornar vazio ou falhar
  try {
    const content = await performWebSearch(query);
    if (content && !/Nenhum resultado encontrado/i.test(content)) {
      providerStatus.push({ provider: 'duckduckgo', ok: true });
      return {
        content,
        source: 'OpenWebSearch/DuckDuckGo',
        sources: [],
        providerStatus,
      };
    }
    if (content) errors.push(content);
    providerStatus.push({ provider: 'duckduckgo', ok: false, reason: 'empty_result' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    providerStatus.push({ provider: 'duckduckgo', ok: false, reason: 'unknown' });
    scoutDiag.warn('OpenWebSearch', 'DuckDuckGo fallback falhou', { error: message });
  }

  return {
    content: '',
    source: 'OpenWebSearch/DdgDegraded',
    sources: [],
    providerStatus,
    degraded: true,
    detail: errors.filter(Boolean).join(' | ') || 'Nenhum resultado público capturado.',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = SearchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { query, url } = parsed.data;
    const searchQuery = query || url || '';

    scoutDiag.info('OpenWebSearch', 'Iniciando operação', { query: searchQuery, url });

    let content = '';
    let sources: OpenWebSearchSource[] = [];
    let source = 'OpenWebSearch';
    let degraded = false;
    let detail: string | undefined;
    let providerStatus: ProviderStatus[] = [];

    if (url) {
      if (!isValidPublicUrl(url)) {
        scoutDiag.warn('OpenWebSearch', `URL bloqueada por segurança: ${url}`);
        return res.status(403).json({ error: 'Forbidden: Restricted URL' });
      }

      try {
        scoutDiag.info('OpenWebSearch', `Extraindo: ${url}`);
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const html = await response.text();
        content = await extractHtml(html);
        source = 'OpenWebSearch/URL';
        sources = [{ title: url, url, provider: 'url' }];
        providerStatus = [];
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        scoutDiag.warn('OpenWebSearch', `Falha na URL ${url}, tentando busca...`, { error: message });
        const searchResult = await performResilientSearch(searchQuery);
        content = searchResult.content;
        sources = searchResult.sources;
        source = searchResult.source;
        degraded = Boolean(searchResult.degraded);
        detail = searchResult.detail;
        providerStatus = searchResult.providerStatus;
      }
    } else {
      const searchResult = await performResilientSearch(searchQuery);
      content = searchResult.content;
      sources = searchResult.sources;
      source = searchResult.source;
      degraded = Boolean(searchResult.degraded);
      detail = searchResult.detail;
      providerStatus = searchResult.providerStatus;
    }

    return res.status(200).json({
      content,
      source,
      sources,
      degraded,
      detail,
      providerStatus,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    scoutDiag.error('OpenWebSearch', 'Falha crítica', { error: message });
    return res.status(200).json({
      content: '',
      source: 'OpenWebSearch/Degraded',
      sources: [],
      degraded: true,
      detail: message,
      providerStatus: [{ provider: 'duckduckgo', ok: false, reason: 'unknown' }],
    });
  }
}
