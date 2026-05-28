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
    provider: 'duckduckgo' | 'url';
}

type ProviderName = 'duckduckgo';
type ProviderFailureReason =
    | 'empty_result'
    | 'unknown';

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
    const t0 = Date.now();
    const timingSteps: Array<{ step: string; elapsedMs: number }> = [];

    function recordStep(step: string): number {
        const elapsed = Date.now() - t0;
        timingSteps.push({ step, elapsedMs: elapsed });
        return elapsed;
    }

    recordStep('handler:start');
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
        recordStep('parse:done');

        let content = '';
        let sources: OpenWebSearchSource[] = [];
        let source = 'OpenWebSearch';
        let degraded = false;
        let detail: string | undefined;
        let providerStatus: ProviderStatus[] = [];

        if (url) {
            if (!isValidPublicUrl(url)) {
                recordStep('url:blocked');
                return res.status(403).json({ error: 'Forbidden: Restricted URL', timingMs: Date.now() - t0, timingSteps });
            }

            try {
                recordStep('url:fetch:start');
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
                    signal: AbortSignal.timeout(10000)
                });

                recordStep('url:fetch:done');
                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

                const html = await response.text();
                recordStep('url:html:received');
                content = await extractHtml(html);
                recordStep('url:extract:done');
                source = 'OpenWebSearch/URL';
                sources = [{ title: url, url, provider: 'url' }];
                providerStatus = [];
            } catch (err) {
                recordStep('url:fetch:failed');
                const message = err instanceof Error ? err.message : String(err);
                const searchResult = await performResilientSearch(searchQuery);
                content = searchResult.content;
                sources = searchResult.sources;
                source = searchResult.source;
                degraded = Boolean(searchResult.degraded);
                detail = searchResult.detail;
                providerStatus = searchResult.providerStatus;
                recordStep('url:fallback:done');
            }
        } else {
            recordStep('search:start');
            const searchResult = await performResilientSearch(searchQuery);
            recordStep('search:done');
            content = searchResult.content;
            sources = searchResult.sources;
            source = searchResult.source;
            degraded = Boolean(searchResult.degraded);
            detail = searchResult.detail;
            providerStatus = searchResult.providerStatus;
        }

        const totalMs = Date.now() - t0;
        recordStep('handler:end');

        return res.status(200).json({
            content,
            source,
            sources,
            degraded,
            detail,
            providerStatus,
            timingMs: totalMs,
            timingSteps,
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const totalMs = Date.now() - t0;
        recordStep('handler:crash');
        return res.status(200).json({
            content: '',
            source: 'OpenWebSearch/Degraded',
            sources: [],
            degraded: true,
            detail: `${message} (handler elapsed: ${totalMs}ms)`,
            providerStatus: [{ provider: 'duckduckgo', ok: false, reason: 'unknown' }],
            timingMs: totalMs,
            timingSteps,
        });
    }
}
