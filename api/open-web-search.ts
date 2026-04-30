import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog';
import { isValidPublicUrl, extractHtml, performWebSearch } from '../utils/documentExtractor';

const SearchRequestSchema = z.object({
    query: z.string().min(1),
    url: z.string().url().optional(),
});

export const config = {
    runtime: 'nodejs',
};

export const maxDuration = 60;

interface OpenWebSearchSource {
    title: string;
    url: string;
    snippet?: string;
    provider: 'brave' | 'duckduckgo' | 'url';
}

function getEnvVar(name: string): string | undefined {
    try {
        return process.env[name];
    } catch {
        return undefined;
    }
}

function formatSourcesAsContent(sources: OpenWebSearchSource[]): string {
    return sources
        .map(source => [
            `Título: ${source.title}`,
            `URL: ${source.url}`,
            source.snippet ? `Resumo: ${source.snippet}` : '',
            '---',
        ].filter(Boolean).join('\n'))
        .join('\n');
}

async function performBraveSearch(query: string): Promise<OpenWebSearchSource[]> {
    const apiKey = getEnvVar('BRAVE_SEARCH_API_KEY');
    if (!apiKey) return [];

    const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('count', '5');
    searchUrl.searchParams.set('country', 'br');
    searchUrl.searchParams.set('search_lang', 'pt-br');
    searchUrl.searchParams.set('safesearch', 'moderate');

    const response = await fetch(searchUrl, {
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': apiKey,
        },
        signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
        throw new Error(`Brave Search failed: ${response.status}`);
    }

    const data = await response.json() as {
        web?: {
            results?: Array<{
                title?: string;
                url?: string;
                description?: string;
            }>;
        };
    };

    return (data.web?.results || [])
        .map(item => ({
            title: item.title?.trim() || item.url?.trim() || 'Resultado Brave',
            url: item.url?.trim() || '',
            snippet: item.description?.trim(),
            provider: 'brave' as const,
        }))
        .filter(source => /^https?:\/\//i.test(source.url))
        .slice(0, 5);
}

async function performResilientSearch(query: string): Promise<{
    content: string;
    source: string;
    sources: OpenWebSearchSource[];
    degraded?: boolean;
    detail?: string;
}> {
    const errors: string[] = [];

    try {
        const braveSources = await performBraveSearch(query);
        if (braveSources.length > 0) {
            return {
                content: formatSourcesAsContent(braveSources),
                source: 'OpenWebSearch/Brave',
                sources: braveSources,
            };
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        scoutDiag.warn('OpenWebSearch', 'Brave Search falhou, tentando fallback best-effort', { error: message });
    }

    try {
        const content = await performWebSearch(query);
        if (content && !/Nenhum resultado encontrado/i.test(content)) {
            return {
                content,
                source: 'OpenWebSearch/DuckDuckGo',
                sources: [],
            };
        }
        if (content) errors.push(content);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(message);
        scoutDiag.warn('OpenWebSearch', 'DuckDuckGo fallback falhou', { error: message });
    }

    return {
        content: '',
        source: getEnvVar('BRAVE_SEARCH_API_KEY') ? 'OpenWebSearch/Brave+DdgDegraded' : 'OpenWebSearch/DdgDegraded',
        sources: [],
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

        scoutDiag.info('OpenWebSearch', 'Iniciando operação', { query, url });

        let content = '';
        let sources: OpenWebSearchSource[] = [];
        let source = 'OpenWebSearch';
        let degraded = false;
        let detail: string | undefined;

        if (url) {
            if (!isValidPublicUrl(url)) {
                scoutDiag.warn('OpenWebSearch', `URL bloqueada por segurança: ${url}`);
                return res.status(403).json({ error: 'Forbidden: Restricted URL' });
            }

            try {
                scoutDiag.info('OpenWebSearch', `Extraindo: ${url}`);
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
                    signal: AbortSignal.timeout(10000)
                });

                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

                const html = await response.text();
                content = await extractHtml(html);
                source = 'OpenWebSearch/URL';
                sources = [{ title: url, url, provider: 'url' }];
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                scoutDiag.warn('OpenWebSearch', `Falha na URL ${url}, tentando busca...`, { error: message });
                const searchResult = await performResilientSearch(query);
                content = searchResult.content;
                sources = searchResult.sources;
                source = searchResult.source;
                degraded = Boolean(searchResult.degraded);
                detail = searchResult.detail;
            }
        } else {
            const searchResult = await performResilientSearch(query);
            content = searchResult.content;
            sources = searchResult.sources;
            source = searchResult.source;
            degraded = Boolean(searchResult.degraded);
            detail = searchResult.detail;
        }

        return res.status(200).json({
            content,
            source,
            sources,
            degraded,
            detail,
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
        });
    }
}
