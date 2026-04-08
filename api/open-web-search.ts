import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { scoutDiag } from '../utils/diagnosticLog';

const SearchRequestSchema = z.object({
    query: z.string().min(1),
    url: z.string().url().optional(),
});

export const config = {
    runtime: 'nodejs',
};

export const maxDuration = 60;

/**
 * CAMADA DE DESCOBERTA (Internal Search Layer)
 * 
 * Papel: Realizar buscas públicas rápidas e descoberta de URLs candidatas.
 * Diferença vs Fetch MCP:
 * - Esta API é usada internamente pelo Scout para busca inicial e snippets.
 * - O Fetch MCP (externo) deve ser usado por agentes para aprofundamento factual densa de URLs específicas.
 */

/**
 * Valida se uma URL é pública e segura para evitar SSRF.
 */
function isValidPublicUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

        const hostname = url.hostname.toLowerCase();

        // Bloqueia localhost e IPs de loopback
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;

        // Bloqueia redes privadas (RFC1918)
        // 10.0.0.0/8
        if (hostname.startsWith('10.')) return false;
        // 172.16.0.0/12
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
        // 192.168.0.0/16
        if (hostname.startsWith('192.168.')) return false;

        // Bloqueia link-local e metadados de cloud (AWS, GCP, Azure, Vercel)
        if (hostname.startsWith('169.254.')) return false;

        // Bloqueia nomes de domínio que resolvem para interno (ex: .local, .internal)
        if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

        return true;
    } catch {
        return false;
    }
}

/**
 * Limpa o HTML usando @mozilla/readability para extrair conteúdo relevante.
 */
function extractCleanText(html: string): string {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Readability remove automaticamente headers, footers, navs, etc.
    const reader = new Readability(doc);
    const article = reader.parse();

    if (!article) {
        // Fallback para textContent simples se Readability falhar
        return (doc.body.textContent || '')
            .replace(/\s\s+/g, ' ')
            .trim()
            .slice(0, 15000);
    }

    return (article.textContent || '')
        .replace(/\s\s+/g, ' ')
        .trim()
        .slice(0, 15000); // Aumentado de 10k para 15k
}

/**
 * Realiza uma busca real no DuckDuckGo (Lite) para evitar mocks.
 */
async function performWebSearch(query: string): Promise<string | null> {
    scoutDiag.info('OpenWebSearch', `Buscando no DuckDuckGo: ${query}`);

    try {
        // Usamos a versão lite que é mais fácil de parsear e não exige JS
        const searchUrl = `https://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) throw new Error(`DDG search failed: ${response.status}`);

        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // No DDG Lite, os resultados estão em tabelas
        const links = Array.from(doc.querySelectorAll('a.result-link'))
            .slice(0, 5) // Pega os top 5 resultados
            .map((el) => {
                const a = el as HTMLAnchorElement;
                const title = a.textContent?.trim() || 'Sem título';
                const url = a.getAttribute('href') || '';
                const snippet = a.closest('tr')?.nextElementSibling?.textContent?.trim() || '';
                return `Título: ${title}\nURL: ${url}\nResumo: ${snippet}\n---`;
            })
            .join('\n');

        return links || 'Nenhum resultado encontrado no DuckDuckGo.';
    } catch (error) {
        scoutDiag.error('OpenWebSearch', 'Erro na busca DDG', { error });
        return null;
    }
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
                    signal: AbortSignal.timeout(10000) // Timeout de 10s para a extração
                });

                if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

                const html = await response.text();
                content = extractCleanText(html);
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
