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
const BRAVE_FINAL_LIMIT = 4;
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
    const h = normalizeHostname(url);
    return Array.from(BLOCKED_DOMAINS).some(d => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function normalizeHostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
}

function safeDomain(url: string): string | null {
  try {
    return normalizeHostname(url);
  } catch {
    return null;
  }
}

function shortTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, 90);
}

function removeNegativeSiteOperators(query: string): string {
  return query
    .replace(/(?:^|\s)-site:[^\s)]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSimplifiedQuery(query: string): string {
  const withoutOperators = removeNegativeSiteOperators(query)
    .replace(/\b(?:holding|grupo econômico|controladora|faturamento|receita|resultado financeiro|área|hectares|fazendas|produção agrícola|exportação|internacional|operações exterior|ERP|sistema gestão|tecnologia|SAP|TOTVS|Senior)\b/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cnpjMatch = withoutOperators.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  const quotedMatch = withoutOperators.match(/"([^"]+)"/);
  const company = (quotedMatch?.[1] ?? withoutOperators)
    .replace(/\bcnpj\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [company, cnpjMatch?.[0] ?? 'CNPJ'].filter(Boolean).join(' ').trim();
}

function dedupeResults(results: BraveResult[]): BraveResult[] {
  const seen = new Set<string>();
  const deduped: BraveResult[] = [];

  for (const result of results) {
    let key = `${shortTitle(result.title).toLowerCase()}|${result.url}`;
    try {
      const parsed = new URL(result.url);
      parsed.search = '';
      parsed.hash = '';
      key = `${shortTitle(result.title).toLowerCase()}|${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
    } catch {
      // Mantém a chave original quando a URL não é parseável.
    }

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

type BraveQueryVariant = 'with_negative_site' | 'without_negative_site' | 'simplified';
type BraveEmptyReason = 'NO_API_KEY' | 'HTTP_ERROR' | 'RAW_ZERO' | 'BRAVE_RESULTS_FILTERED_OUT' | 'UNKNOWN';

interface BraveDiagnostics {
  hasKey: boolean;
  attempted: boolean;
  httpStatus?: number;
  rawCount: number;
  afterBlockedDomainsCount: number;
  afterRelevanceCount: number;
  afterDedupCount: number;
  afterFinalLimitCount: number;
  blockedByDomainCount: number;
  blockedByQueryOperatorCount: number;
  emptyReason?: BraveEmptyReason;
  queryOriginal: string;
  querySanitized: string;
  queryVariant?: BraveQueryVariant;
  sampleDomains: string[];
  sampleTitles: string[];
}

interface BraveAttemptResult {
  content: string;
  sources: OpenWebSearchSource[];
  diagnostics: BraveDiagnostics;
}

interface BraveAttemptFailure {
  diagnostics: BraveDiagnostics;
}

function makeBaseBraveDiagnostics(query: string, hasKey: boolean): BraveDiagnostics {
  return {
    hasKey,
    attempted: false,
    rawCount: 0,
    afterBlockedDomainsCount: 0,
    afterRelevanceCount: 0,
    afterDedupCount: 0,
    afterFinalLimitCount: 0,
    blockedByDomainCount: 0,
    blockedByQueryOperatorCount: 0,
    queryOriginal: query,
    querySanitized: removeNegativeSiteOperators(query),
    sampleDomains: [],
    sampleTitles: [],
  };
}

function buildBraveVariants(query: string): Array<{ variant: BraveQueryVariant; query: string }> {
  const sanitized = removeNegativeSiteOperators(query);
  const simplified = buildSimplifiedQuery(query);
  const variants: Array<{ variant: BraveQueryVariant; query: string }> = [
    {
      variant: 'with_negative_site',
      query: `${query} -site:apontador.com.br -site:listamais.com.br`.trim(),
    },
  ];

  if (sanitized && sanitized !== variants[0].query) {
    variants.push({ variant: 'without_negative_site', query: sanitized });
  }
  if (simplified && simplified !== sanitized) {
    variants.push({ variant: 'simplified', query: simplified });
  }

  return variants;
}

function curateBraveResults(rawResults: BraveResult[], diagnostics: BraveDiagnostics): BraveResult[] {
  diagnostics.rawCount = rawResults.length;
  diagnostics.sampleDomains = Array.from(
    new Set(rawResults.map(r => safeDomain(r.url)).filter((domain): domain is string => Boolean(domain))),
  ).slice(0, 5);
  diagnostics.sampleTitles = rawResults.map(r => shortTitle(r.title)).filter(Boolean).slice(0, 3);

  const domainAllowed = rawResults.filter(r => !isBlocked(r.url));
  diagnostics.blockedByDomainCount = rawResults.length - domainAllowed.length;
  diagnostics.afterBlockedDomainsCount = domainAllowed.length;

  const relevanceAllowed = domainAllowed.filter(r => Boolean(r.title?.trim() || r.description?.trim()));
  diagnostics.afterRelevanceCount = relevanceAllowed.length;

  const deduped = dedupeResults(relevanceAllowed);
  diagnostics.afterDedupCount = deduped.length;

  const finalResults = deduped.slice(0, BRAVE_FINAL_LIMIT);
  diagnostics.afterFinalLimitCount = finalResults.length;
  return finalResults;
}

function toBraveContent(results: BraveResult[]): string {
  return results.map(r => `- ${r.title}: ${r.description?.slice(0, 300)}\n  ${r.url}`).join('\n\n');
}

function toBraveSources(results: BraveResult[]): OpenWebSearchSource[] {
  return results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description?.slice(0, 300),
    provider: 'brave' as const,
  }));
}

async function braveSearch(query: string): Promise<BraveAttemptResult | BraveAttemptFailure> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  const fallbackDiagnostics = makeBaseBraveDiagnostics(query, Boolean(apiKey));
  if (!apiKey) {
    console.warn('[BraveSearch] API key ausente em process.env');
    return { diagnostics: { ...fallbackDiagnostics, emptyReason: 'NO_API_KEY' } };
  }

  let bestFailure: BraveDiagnostics | null = null;

  try {
    for (const candidate of buildBraveVariants(query)) {
      const diagnostics = makeBaseBraveDiagnostics(query, true);
      diagnostics.attempted = true;
      diagnostics.queryVariant = candidate.variant;
      diagnostics.querySanitized = candidate.query;
      diagnostics.blockedByQueryOperatorCount = (candidate.query.match(/(?:^|\s)-site:/gi) ?? []).length;

      const params = new URLSearchParams({
        q: candidate.query,
        count: '6',
        search_lang: 'pt-br',
      });
      const res = await fetch(`${BRAVE_API}?${params}`, {
        headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
        signal: AbortSignal.timeout(5000),
      });
      diagnostics.httpStatus = res.status;
      if (!res.ok) {
        diagnostics.emptyReason = 'HTTP_ERROR';
        bestFailure = diagnostics;
        scoutDiag.warn('BraveSearch', 'API respondeu sem sucesso', { ...diagnostics });
        continue;
      }

      const data = (await res.json()) as { web?: { results?: BraveResult[] } };
      const rawResults = data.web?.results ?? [];
      const curated = curateBraveResults(rawResults, diagnostics);

      if (curated.length > 0) {
        scoutDiag.info('BraveSearch', 'curadoria com resultado', { ...diagnostics });
        return { content: toBraveContent(curated), sources: toBraveSources(curated), diagnostics };
      }

      diagnostics.emptyReason = rawResults.length === 0 ? 'RAW_ZERO' : 'BRAVE_RESULTS_FILTERED_OUT';
      bestFailure =
        !bestFailure || diagnostics.rawCount > bestFailure.rawCount || diagnostics.blockedByDomainCount > bestFailure.blockedByDomainCount
          ? diagnostics
          : bestFailure;
      scoutDiag.warn('BraveSearch', '0 resultados após curadoria', { ...diagnostics });
    }

    return { diagnostics: bestFailure ?? { ...fallbackDiagnostics, attempted: true, emptyReason: 'UNKNOWN' } };
  } catch (error) {
    console.error('[BraveSearch] exceção:', error instanceof Error ? error.message : String(error));
    return {
      diagnostics: {
        ...fallbackDiagnostics,
        attempted: true,
        emptyReason: 'UNKNOWN',
      },
    };
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
type ProviderFailureReason = 'empty_result' | 'unknown' | 'BRAVE_RESULTS_FILTERED_OUT' | 'HTTP_ERROR' | 'RAW_ZERO' | 'NO_API_KEY';

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
  braveDiagnostics?: BraveDiagnostics;
}> {
  const errors: string[] = [];
  const providerStatus: ProviderStatus[] = [];

  // 1. Tenta Brave Search primeiro
  const braveResult = await braveSearch(query);
  if ('content' in braveResult) {
    providerStatus.push({ provider: 'brave', ok: true });
    return {
      content: braveResult.content,
      source: 'Brave Search API',
      sources: braveResult.sources,
      providerStatus,
      braveDiagnostics: braveResult.diagnostics,
    };
  }
  const braveReason = braveResult.diagnostics.emptyReason ?? 'unknown';
  providerStatus.push({
    provider: 'brave',
    ok: false,
    reason: braveReason === 'UNKNOWN' ? 'unknown' : braveReason,
    statusCode: braveResult.diagnostics.httpStatus,
  });
  if (braveReason === 'BRAVE_RESULTS_FILTERED_OUT') {
    errors.push(`BRAVE_RESULTS_FILTERED_OUT: ${JSON.stringify(braveResult.diagnostics)}`);
  }

  // 2. Fallback DuckDuckGo
  try {
    const content = await performWebSearch(query);
    if (content && !/Nenhum resultado encontrado/i.test(content)) {
      providerStatus.push({ provider: 'duckduckgo', ok: true });
      return { content, source: 'DuckDuckGo (fallback)', sources: [], providerStatus, braveDiagnostics: braveResult.diagnostics };
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
    braveDiagnostics: braveResult.diagnostics,
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
    let braveDiagnostics: BraveDiagnostics | undefined;

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
        braveDiagnostics = searchResult.braveDiagnostics;
      }
    } else {
      const searchResult = await performResilientSearch(searchQuery);
      content = searchResult.content;
      sources = searchResult.sources;
      source = searchResult.source;
      degraded = Boolean(searchResult.degraded);
      detail = searchResult.detail;
      providerStatus = searchResult.providerStatus;
      braveDiagnostics = searchResult.braveDiagnostics;
    }

    const hasBraveKey = Boolean(process.env.BRAVE_SEARCH_API_KEY);

    return res.status(200).json({
      content,
      source,
      sources,
      degraded,
      detail,
      providerStatus,
      _debug: {
        hasBraveKey,
        braveAttempted: Boolean(providerStatus.find(s => s.provider === 'brave')),
        brave: braveDiagnostics,
      },
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
