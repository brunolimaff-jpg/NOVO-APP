import { scoutDiag } from './diagnosticLog';

/**
 * Utilitário Unificado de Extração e Busca
 * 
 * Centraliza a lógica de busca web e extração de documentos para ser usada
 * tanto em rotas de API quanto diretamente no backend (bypassando HTTP 401).
 * Usa Lazy Loading para dependências pesadas para evitar erros no Vercel.
 */

export interface UniversalExtractResult {
    text: string;
    length: number;
    source?: string;
    degraded?: boolean;
    error?: string;
}

function stripNullCharacters(input: string): string {
    return input.split('\u0000').join(' ');
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
 * Extrai conteúdo limpo de HTML usando Cheerio (Leve e rápido para Serverless).
 */
export async function extractHtml(html: string, limit = 15000): Promise<string> {
    const cheerio = await import('cheerio');
    const $ = cheerio.load(html);
    
    // Remove elementos indesejados
    $('script, style, nav, footer, iframe, noscript, .ads, #ads').remove();
    
    // Tenta focar no conteúdo principal (heurística simples)
    const mainContent = $('article, main, .content, #content, .post, .article').first();
    const text = mainContent.length ? mainContent.text() : $('body').text();

    return stripNullCharacters(text)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
}

/**
 * Extrai texto de buffer PDF.
 */
export async function extractPdf(buffer: Buffer): Promise<string> {
    try {
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: buffer });
        const parsed = await parser.getText();
        return stripNullCharacters(parsed.text || '')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (e) {
        scoutDiag.error('DocumentExtractor', 'Erro no PDFParse', e);
        return '[Erro na extração de PDF]';
    }
}

/**
 * Extrai texto de buffer DOCX.
 */
export async function extractDocx(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
}

/**
 * Realiza busca no DuckDuckGo Lite.
 */
export async function performWebSearch(query: string): Promise<string | null> {
    const cheerio = await import('cheerio');
    scoutDiag.info('DocumentExtractor', `Buscando no DuckDuckGo (Cheerio): ${query}`);

    try {
        const searchUrl = `https://duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
        const response = await fetch(searchUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' 
            },
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const html = await response.text();
        const $ = cheerio.load(html);
        const results: string[] = [];

        // Log de memória em modo verbose
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const memory = process.memoryUsage();
            scoutDiag.info('DocumentExtractor', `Memória RAM: ${Math.round(memory.heapUsed / 1024 / 1024)}MB / ${Math.round(memory.rss / 1024 / 1024)}MB`);
        }

        $('.result-link').each((i, el) => {
            if (i >= 5) return;
            const title = $(el).text().trim();
            let url = $(el).attr('href') || '#';
            
            // Corrige URLs relativas do DDG Lite
            if (url.startsWith('//')) url = 'https:' + url;
            
            const snippet = $(el).closest('tr').next().find('.result-snippet').text().trim();
            results.push(`Título: ${title}\nURL: ${url}\nResumo: ${snippet}\n---`);
        });

        return results.join('\n') || 'Nenhum resultado encontrado.';
    } catch (error) {
        scoutDiag.error('DocumentExtractor', 'Erro na busca web', error);
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

        const processedText = stripNullCharacters(text).replace(/\s+/g, ' ').trim().slice(0, limit);

        return {
            text: processedText,
            length: processedText.length
        };

    } catch (error: any) {
        scoutDiag.error('DocumentExtractor', 'Falha na extração universal', { error: error.message });
        return { text: '', length: 0, error: error.message };
    }
}
