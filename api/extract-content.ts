import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { scoutDiag } from '../utils/diagnosticLog';

const ExtractRequestSchema = z.object({
    url: z.string().url().optional(),
    base64Content: z.string().optional(),
    mimeType: z.string().optional(),
}).refine(data => {
    if (data.url) return true;
    if (data.base64Content && data.mimeType) return true;
    return false;
}, {
    message: "Deve fornecer url ou base64Content com mimeType"
});

export const config = {
    runtime: 'nodejs',
};

export const maxDuration = 60;

/**
 * Valida se uma URL é pública e segura para evitar SSRF.
 */
function isValidPublicUrl(urlString: string): boolean {
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

async function extractHtml(html: string): Promise<string> {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const reader = new Readability(doc);
    const article = reader.parse();
    return (article?.textContent || doc.body.textContent || '')
        .replace(/\u0000/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000);
}

async function extractPdf(buffer: Buffer): Promise<string> {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const parsed = ExtractRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        }

        const { url, base64Content, mimeType } = parsed.data;
        let text = "";

        if (url) {
            if (!isValidPublicUrl(url)) {
                return res.status(403).json({ error: 'Forbidden: Restricted URL' });
            }

            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 ScoutAgro/1.0' },
                signal: AbortSignal.timeout(20000)
            });

            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            
            if (contentType.includes('application/pdf')) {
                const buffer = Buffer.from(await response.arrayBuffer());
                text = await extractPdf(buffer);
            } else if (contentType.includes('officedocument.wordprocessingml.document')) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const result = await mammoth.extractRawText({ buffer });
                text = result.value;
            } else {
                // Assume HTML
                const html = await response.text();
                text = await extractHtml(html);
            }
        } else if (base64Content && mimeType) {
            const buffer = Buffer.from(base64Content, 'base64');
            
            if (mimeType === 'application/pdf') {
                text = await extractPdf(buffer);
            } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const result = await mammoth.extractRawText({ buffer });
                text = result.value;
            } else if (mimeType === 'text/html') {
                text = await extractHtml(buffer.toString('utf-8'));
            } else if (mimeType === 'text/plain') {
                text = buffer.toString('utf-8');
            } else {
                return res.status(400).json({ degraded: true, error: "Tipo não suportado" });
            }
        }

        return res.status(200).json({
            text: text.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 15000),
            length: text.length
        });

    } catch (error: any) {
        scoutDiag.error('ExtractContent', 'Erro na extração', { error: error.message });
        return res.status(500).json({ error: 'Erro interno na extração', details: error.message });
    }
}
