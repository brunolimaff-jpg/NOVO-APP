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

        let content: string | null = null;

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
            } catch (err) {
                scoutDiag.warn('OpenWebSearch', `Falha na URL ${url}, tentando busca...`);
                content = await performWebSearch(query);
            }
        } else {
            content = await performWebSearch(query);
        }

        return res.status(200).json({
            content: content || 'Nenhum dado capturado.',
            source: 'OpenWebSearch/DuckDuckGo'
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        scoutDiag.error('OpenWebSearch', 'Falha crítica', { error: message });
        return res.status(500).json({ error: 'Internal Server Error', detail: message });
    }
}

