import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { scoutDiag } from './diagnosticLog';

/**
 * Utilitário Unificado de Extração e Busca
 * 
 * Centraliza a lógica de busca web e extração de documentos para ser usada
 * tanto em rotas de API quanto diretamente no backend (bypassando HTTP 401).
 */

export interface UniversalExtractResult {
    text: string;
    length: number;
    source?: string;
    degraded?: boolean;
    error?: string;
}

/**
 * Valida se uma URL é pública e segura para evitar SSRF.
 */
export function isValidPublicUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        const hostname = url.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;
        if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return false;
        if (hostname.startsWith('169.254.')) return false;
        if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Extrai conteúdo limpo de HTML usando Readability.
 */
export async function extractHtml(html: string, limit = 15000): Promise<string> {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    return (article?.textContent || doc.body.textContent || '')
        .replace(/\u0000/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

/**
 * Extrai texto de buffer PDF.
 */
export async function extractPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
        const parsed = await parser.getText();
        return (parsed.text || '')
            .replace(/\u0000/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    } finally {
        await parser.destroy();
    }
}

/**
 * Extrai texto de buffer DOCX.
 */
export async function extractDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
}

/**
 * Realiza busca no DuckDuckGo Lite.
 */
export async function performWebSearch(query: string): Promise<string | null> {
    scoutDiag.info('DocumentExtractor', `Buscando no DuckDuckGo: ${query}`);

    try {
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

        const links = Array.from(doc.querySelectorAll('a.result-link'))
            .slice(0, 5)
            .map((el) => {
                const a = el as HTMLAnchorElement;
                const title = a.textContent?.trim() || 'Sem título';
                const url = a.getAttribute('href') || '';
                const snippet = a.closest('tr')?.nextElementSibling?.textContent?.trim() || '';
                return `Título: ${title}\nURL: ${url}\nResumo: ${snippet}\n---`;
            })
            .join('\n');

        return links || 'Nenhum resultado encontrado.';
    } catch (error) {
        scoutDiag.error('DocumentExtractor', 'Erro na busca DDG', { error });
        return null;
    }
}

/**
 * Função Unificada para Extração de Documentos ou Web.
 */
export async function universalExtract(params: { 
    url?: string; 
    base64Content?: string; 
    mimeType?: string;
    limit?: number;
}): Promise<UniversalExtractResult> {
    const { url, base64Content, mimeType, limit = 15000 } = params;
    let text = "";

    try {
        if (url) {
            if (!isValidPublicUrl(url)) {
                throw new Error('URL restrita ou inválida por segurança.');
            }

            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
                signal: AbortSignal.timeout(20000)
            });

            if (!response.ok) throw new Error(`Falha no download da URL (${response.status})`);
            
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            
            if (contentType.includes('application/pdf')) {
                const buffer = Buffer.from(await response.arrayBuffer());
                text = await extractPdf(buffer);
            } else if (contentType.includes('officedocument.wordprocessingml.document')) {
                const buffer = Buffer.from(await response.arrayBuffer());
                text = await extractDocx(buffer);
            } else {
                const html = await response.text();
                text = await extractHtml(html, limit);
            }
        } else if (base64Content && mimeType) {
            const buffer = Buffer.from(base64Content, 'base64');
            
            if (mimeType === 'application/pdf') {
                text = await extractPdf(buffer);
            } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                text = await extractDocx(buffer);
            } else if (mimeType === 'text/html') {
                text = await extractHtml(buffer.toString('utf-8'), limit);
            } else if (mimeType === 'text/plain') {
                text = buffer.toString('utf-8');
            } else {
                throw new Error("Mime-type não suportado para extração.");
            }
        }

        return {
            text: text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit),
            length: text.length
        };

    } catch (error: any) {
        scoutDiag.error('DocumentExtractor', 'Falha na extração universal', { error: error.message });
        return { text: '', length: 0, error: error.message };
    }
}
