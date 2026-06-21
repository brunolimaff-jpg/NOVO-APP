import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { isValidPublicUrl, extractHtml, performWebSearch } from '../utils/documentExtractor.js';

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

interface BraveResult {
  title: string;
  url: string;
  description: string;
}

const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';
const BLOCKED_DOMAINS = new Set([
  'apontador.com.br',
  'listamais.com.br',
  'telelistas.net',
  'guiamais.com.br',
  'fonecedor.com.br',
  'tudolocal.com.br',
]);

function isBlocked(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    return BLOCKED_DOMAINS.has(h) || Array.from(BLOCKED_DOMAINS).some(d => h.includes(d));
  } catch {
    return false;
  }
}

async function braveSearch(query: string): Promise<{ content: string; sources: OpenWebSearchSource[] } | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      q: `${query} -site:apontador.com.br -site:listamais.com.br`,
      count: '6',
      search_lang: 'pt-br',
    });
    const res = await fetch(`${BRAVE_API}?${params}`, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { web?: { results?: BraveResult[] } };
    const curated = (data.web?.results ?? []).filter(r => !isBlocked(r.url)).slice(0, 4);

    if (curated.length === 0) return null;

    const content = curated.map(r => `- ${r.title}: ${r.description?.slice(0, 300)}\n  ${r.url}`).join('\n\n');
    const sources: OpenWebSearchSource[] = curated.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description?.slice(0, 300),
      provider: 'brave' as const,
    }));
    return { content, sources };
  } catch {
    return null;
  }
}

interface OpenWebSearchSource {
  title: string;
  url: string;
  snippet?: string;
  provider: OpenWebSearchProvider;
}

type ProviderName = 'brave' | 'duckduckgo';
type OpenWebSearchProvider = 'brave' | 'duckduckgo' | 'url';
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

  // 1. Tenta Brave Search primeiro
  const braveResult = await braveSearch(query);
  if (braveResult) {
    providerStatus.push({ provider: 'brave', ok: true });
    return {
      content: braveResult.content,
      source: 'Brave Search API',
      sources: braveResult.sources,
      providerStatus,
    };
  }
  providerStatus.push({ provider: 'brave', ok: false, reason: 'empty_result' });

  // 2. Fallback DuckDuckGo
  try {
    const content = await performWebSearch(query);
    if (content && !/Nenhum resultado encontrado/i.test(content)) {
      providerStatus.push({ provider: 'duckduckgo', ok: true });
      return { content, source: 'DuckDuckGo (fallback)', sources: [], providerStatus };
    }
    if (content) errors.push(content);
    providerStatus.push({ provider: 'duckduckgo', ok: false, reason: 'empty_result' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    providerStatus.push({ provider: 'duckduckgo', ok: false, reason: 'unknown' });
  }

  return {
    content: '',
    source: 'OpenWebSearch/Degraded',
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
