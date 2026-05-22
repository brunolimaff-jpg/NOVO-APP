import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog.js';
import { isValidPublicUrl, extractHtml, performWebSearch } from '../utils/documentExtractor.js';
import { setSecurityHeaders } from './_security-headers.js';

const SearchRequestSchema = z.object({
    query: z.string().min(1).optional(),
    url: z.string().url().optional(),
}).refine(data => Boolean(data.query || data.url), {
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
    provider: 'brave' | 'duckduckgo' | 'url';
}

type ProviderName = 'brave' | 'duckduckgo';
type ProviderFailureReason =
    | 'missing_key'
    | 'unauthorized'
    | 'quota_exhausted'
    | 'rate_limited'
    | 'timeout'
    | 'server_error'
    | 'empty_result'
    | 'unknown';

interface ProviderStatus {
    provider: ProviderName;
    ok: boolean;
    reason?: ProviderFailureReason;
    statusCode?: number;
}

class ProviderError extends Error {
    readonly reason: ProviderFailureReason;
    readonly statusCode?: number;

    constructor(message: string, reason: ProviderFailureReason, statusCode?: number) {
        super(message);
        this.name = 'ProviderError';
        this.reason = reason;
        this.statusCode = statusCode;
    }
}

const BRAVE_DISABLE_TTL_MS = 15 * 60 * 1000;
let braveDisabledUntil = 0;
let braveDisabledReason: ProviderFailureReason | undefined;

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

function classifyBraveStatus(status: number, bodyPreview = ''): ProviderFailureReason {
    if (status === 401 || status === 403) return 'unauthorized';
    if (status === 429) {
        return /quota|credit|exhaust|limit/i.test(bodyPreview) ? 'quota_exhausted' : 'rate_limited';
    }
    if (status >= 500) return 'server_error';
    return 'unknown';
}

function shouldDisableBrave(reason: ProviderFailureReason): boolean {
    return reason === 'unauthorized' || reason === 'quota_exhausted' || reason === 'rate_limited';
}

async function performBraveSearch(query: string): Promise<OpenWebSearchSource[]> {
    const apiKey = getEnvVar('BRAVE_SEARCH_API_KEY');
    if (!apiKey) throw new ProviderError('BRAVE_SEARCH_API_KEY ausente.', 'missing_key');

    const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('count', '5');
    searchUrl.searchParams.set('country', 'br');
    searchUrl.searchParams.set('search_lang', 'pt-br');
    searchUrl.searchParams.set('safesearch', 'moderate');

    let response: Response;
    try {
        response = await fetch(searchUrl, {
            headers: {
                Accept: 'application/json',
                'Accept-Encoding': 'gzip',
                'X-Subscription-Token': apiKey,
            },
            signal: AbortSignal.timeout(12000),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ProviderError(`Brave Search timeout/network: ${message}`, 'timeout');
    }

    if (!response.ok) {
        const bodyPreview = await response.text().catch(() => '');
        const reason = classifyBraveStatus(response.status, bodyPreview);
        throw new ProviderError(`Brave Search failed: ${response.status}`, reason, response.status);
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

    const sources = (data.web?.results || [])
        .map(item => ({
            title: item.title?.trim() || item.url?.trim() || 'Resultado Brave',
            url: item.url?.trim() || '',
            snippet: item.description?.trim(),
            provider: 'brave' as const,
        }))
        .filter(source => /^https?:\/\//i.test(source.url))
        .slice(0, 5);

    if (sources.length === 0) {
        throw new ProviderError('Brave Search sem resultados úteis.', 'empty_result');
    }

    return sources;
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

    if (Date.now() < braveDisabledUntil) {
        providerStatus.push({ provider: 'brave', ok: false, reason: braveDisabledReason || 'rate_limited' });
    } else {
        try {
            const braveSources = await performBraveSearch(query);
            providerStatus.push({ provider: 'brave', ok: true });
            return {
                content: formatSourcesAsContent(braveSources),
                source: 'OpenWebSearch/Brave',
                sources: braveSources,
                providerStatus,
            };
        } catch (error) {
            const providerError = error instanceof ProviderError ? error : null;
            const reason = providerError?.reason || 'unknown';
            const statusCode = providerError?.statusCode;
            const message = error instanceof Error ? error.message : String(error);
            errors.push(message);
            providerStatus.push({ provider: 'brave', ok: false, reason, statusCode });
            if (shouldDisableBrave(reason)) {
                braveDisabledUntil = Date.now() + BRAVE_DISABLE_TTL_MS;
                braveDisabledReason = reason;
            }
            scoutDiag.warn('OpenWebSearch', 'Brave Search falhou, tentando fallback best-effort', {
                error: message,
                reason,
                statusCode,
            });
        }
    }

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
        source: getEnvVar('BRAVE_SEARCH_API_KEY') ? 'OpenWebSearch/Brave+DdgDegraded' : 'OpenWebSearch/DdgDegraded',
        sources: [],
        providerStatus,
        degraded: true,
        detail: errors.filter(Boolean).join(' | ') || 'Nenhum resultado público capturado.',
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setSecurityHeaders(res);
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
                    signal: AbortSignal.timeout(10000)
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
            providerStatus: [{ provider: 'brave', ok: false, reason: 'unknown' }],
        });
    }
}
