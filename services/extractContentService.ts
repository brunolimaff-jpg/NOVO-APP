import { get, set } from 'idb-keyval';
import { scoutDiag } from '../utils/diagnosticLog';

/**
 * Servico de Extracao de Conteudo Universal
 * Suporta Web (HTML), PDF e DOCX (Word).
 * Possui cache persistente em IndexedDB com TTL de 7 dias.
 */

interface ExtractResult {
    text: string;
    length: number;
    degraded?: boolean;
    error?: string;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias
const DB_PREFIX = 'ext-cache-';

function describeExtractCacheKey(cacheKey: string): string {
    if (!cacheKey) return 'empty';
    if (cacheKey.startsWith('hash-')) return cacheKey;
    try {
        const parsed = new URL(cacheKey);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return cacheKey.length > 80 ? `${cacheKey.slice(0, 80)}...` : cacheKey;
    }
}

class ExtractContentService {
    /**
     * Extrai conteudo de uma URL ou conteudo em base64 com cache persistente.
     */
    async extract(params: { url?: string; base64Content?: string; mimeType?: string }): Promise<ExtractResult> {
        const cacheKey = params.url || this.generateHash(params.base64Content || '');
        const dbKey = `${DB_PREFIX}${cacheKey}`;
        
        try {
            // Verifica cache persistente (IndexedDB)
            const cached = await get<{ result: ExtractResult; timestamp: number }>(dbKey);
            
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                scoutDiag.info('ExtractService', 'cache persistente encontrado', {
                    cacheKey: describeExtractCacheKey(cacheKey),
                });
                return cached.result;
            }
        } catch (e) {
            scoutDiag.warn('ExtractService', 'erro ao ler cache IndexedDB', {
                error: e instanceof Error ? e.message : String(e),
            });
        }

        try {
            const response = await fetch('/api/extract-content', {
                // ... same fetch logic
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha na extracao');
            }

            const result: ExtractResult = await response.json();
            
            // Salva no cache persistente
            try {
                await set(dbKey, { result, timestamp: Date.now() });
            } catch (e) {
                scoutDiag.warn('ExtractService', 'erro ao salvar cache IndexedDB', {
                    error: e instanceof Error ? e.message : String(e),
                });
            }
            
            return result;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            scoutDiag.error('ExtractService', 'erro ao extrair conteúdo', {
                source: params.url ? describeExtractCacheKey(params.url) : 'base64-content',
                error: message,
            });
            return { text: '', length: 0, error: message };
        }
    }

    private generateHash(str: string): string {
        // Hash simples para base64 grande
        let hash = 0;
        for (let i = 0; i < Math.min(str.length, 1000); i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return `hash-${hash}-${str.length}`;
    }
}

export const extractContentService = new ExtractContentService();
