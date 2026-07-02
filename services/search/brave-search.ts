import { scoutDiag } from '../../utils/diagnosticLog.js';

export interface BraveSearchResultItem {
  url: string;
  title: string;
  snippet: string;
}

export async function braveSearch(query: string, count = 5): Promise<BraveSearchResultItem[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    scoutDiag.warn('BraveSearch', 'BRAVE_API_KEY ausente');
    return [];
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const response = await fetch(url, {
      headers: {
        'X-Subscription-Token': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    scoutDiag.info('BraveSearch', 'response', {
      query: query.slice(0, 80),
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      scoutDiag.warn('BraveSearch', `HTTP ${response.status}`, { query: query.slice(0, 80) });
      return [];
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results = (data.web?.results || [])
      .filter(r => r.url)
      .map(r => ({
        url: r.url!,
        title: r.title || r.url!,
        snippet: r.description || '',
      }));

    scoutDiag.info('BraveSearch', 'parsed', {
      query: query.slice(0, 80),
      count: results.length,
      hasWeb: Boolean(data.web),
      hasResults: Boolean(data.web?.results),
    });

    return results;
  } catch (e) {
    scoutDiag.warn('BraveSearch', 'erro', { query, error: String(e).slice(0, 200) });
    return [];
  }
}
