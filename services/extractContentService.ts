/**
 * Servico de Extracao de Conteudo Universal
 * Suporta Web (HTML), PDF e DOCX (Word).
 * Possui cache em memoria com TTL de 24 horas.
 */

interface ExtractResult {
    text: string;
    length: number;
    degraded?: boolean;
    error?: string;
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

class ExtractContentService {
    private cache = new Map<string, { result: ExtractResult; timestamp: number }>();

    /**
     * Extrai conteudo de uma URL ou conteudo em base64.
     */
    async extract(params: { url?: string; base64Content?: string; mimeType?: string }): Promise<ExtractResult> {
        const cacheKey = params.url || this.generateHash(params.base64Content || '');
        
        // Verifica cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            console.log(`[ExtractService] Cache hit: ${cacheKey}`);
            return cached.result;
        }

        try {
            const response = await fetch('/api/extract-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha na extracao');
            }

            const result: ExtractResult = await response.json();
            
            // Salva no cache
            this.cache.set(cacheKey, { result, timestamp: Date.now() });
            
            return result;
        } catch (error: any) {
            console.error('[ExtractService] Erro:', error);
            return { text: '', length: 0, error: error.message };
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
