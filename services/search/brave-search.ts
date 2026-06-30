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

    if (!response.ok) {
      scoutDiag.warn('BraveSearch', `HTTP ${response.status}`, { query });
      return [];
    }

    const data = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (data.web?.results || [])
      .filter(r => r.url)
      .map(r => ({
        url: r.url!,
        title: r.title || r.url!,
        snippet: r.description || '',
      }));
  } catch (e) {
    scoutDiag.warn('BraveSearch', 'erro', { query, error: String(e).slice(0, 200) });
    return [];
  }
}
