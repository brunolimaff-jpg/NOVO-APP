import type { VercelRequest, VercelResponse } from '@vercel/node';

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

interface WebSearchRequest {
  query: string;
}

const BRAVE_API = 'https://api.search.brave.com/res/v1/web/search';

const BLOCKED_DOMAINS = new Set([
  'apontador.com.br',
  'listamais.com.br',
  'telelistas.net',
  'guiamais.com.br',
  'fonecedor.com.br',
  'tudolocal.com.br',
  'mapa.com.br',
  'guiabrasil.com.br',
]);

function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return BLOCKED_DOMAINS.has(hostname) || Array.from(BLOCKED_DOMAINS).some(d => hostname.includes(d));
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Brave Search API key not configured' });
  }

  const { query } = (req.body ?? {}) as WebSearchRequest;
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    const params = new URLSearchParams({
      q: `${query} -site:apontador.com.br -site:listamais.com.br -site:telelistas.net`,
      count: '8',
      search_lang: 'pt',
    });

    const braveRes = await fetch(`${BRAVE_API}?${params}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!braveRes.ok) {
      console.error(`[WebSearch] Brave API error: ${braveRes.status}`);
      return res.status(502).json({ error: `Brave API returned ${braveRes.status}` });
    }

    const data = (await braveRes.json()) as BraveSearchResponse;
    const rawResults = data.web?.results ?? [];

    const curated = rawResults
      .filter(r => !isBlockedDomain(r.url))
      .slice(0, 5)
      .map(r => ({
        title: r.title,
        url: r.url,
        snippet: (r.description ?? '').slice(0, 300),
      }));

    return res.status(200).json({ results: curated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[WebSearch] falha:', message);
    return res.status(500).json({ error: message });
  }
}
