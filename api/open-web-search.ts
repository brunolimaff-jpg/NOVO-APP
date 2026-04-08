import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { scoutDiag } from '../utils/diagnosticLog';

const SearchRequestSchema = z.object({
    query: z.string().min(1),
    url: z.string().url().optional(), // Para extração de URL específica
});

export const config = {
    runtime: 'nodejs',
};

export const maxDuration = 60; // 60 segundos para Vercel Pro, 10s para Hobby

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

        scoutDiag.info('OpenWebSearch', 'Iniciando busca/extração', { query, url });

        let result: string | null = null;

        if (url) {
            // Prioriza a extração de URL específica
            try {
                scoutDiag.info('OpenWebSearch', `Extraindo conteúdo de URL: ${url}`);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch URL: ${response.status}`);
                }
                const html = await response.text();
                // Usar uma biblioteca de parsing HTML (ex: JSDOM, cheerio) para extrair texto limpo
                // Para simplificar no MVP, faremos uma extração básica de texto
                result = extractTextFromHtml(html);
                scoutDiag.info('OpenWebSearch', 'Extração de URL concluída');
            } catch (urlError) {
                scoutDiag.warn('OpenWebSearch', `Falha ao extrair URL ${url}: ${urlError}`);
                // Fallback para busca se a extração da URL falhar
                result = await performWebSearch(query);
            }
        } else if (query) {
            // Se não há URL específica, faz uma busca geral
            result = await performWebSearch(query);
        } else {
            return res.status(400).json({ error: 'Missing query or url' });
        }

        if (!result) {
            scoutDiag.warn('OpenWebSearch', 'Nenhum resultado encontrado para a busca/extração.');
            return res.status(200).json({ content: 'Nenhum resultado relevante encontrado nas fontes públicas.', source: 'OpenWebSearch' });
        }

        return res.status(200).json({ content: result, source: 'OpenWebSearch' });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        scoutDiag.error('OpenWebSearch', 'Falha na operação', { error: message });
        return res.status(500).json({ error: 'Search/Extraction failed', detail: message });
    }
}

// Função para simular a busca web (usaria algo como `serpapi` ou similar)
// Para esta POC, vamos mockar um resultado simples
async function performWebSearch(query: string): Promise<string | null> {
    scoutDiag.info('OpenWebSearch', `Realizando busca web para: ${query}`);
    // Aqui você integraria com uma API de busca gratuita ou um scraper leve.
    // Ex: usar playwright-mcp ou pupeteer para visitar uma página de busca
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simula latência
    return `Resultados para "${query}": Encontrei diversas notícias e artigos sobre ${query} em portais de agronegócio e sites de notícias gerais. Uma análise mais aprofundada pode revelar informações sobre a empresa.`;
}

// Função básica para extrair texto de HTML (para MVP)
function extractTextFromHtml(html: string): string {
    // Isso é MUITO simplificado. Em produção, você usaria uma lib como JSDOM.
    // Apenas remove tags HTML e tenta pegar o texto.
    const text = html.replace(/<[^>]*>/g, '');
    return text.slice(0, 1500) + '... (conteúdo truncado para relevância)';
}
