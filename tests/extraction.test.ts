import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractContentService } from '../services/extractContentService';

// Mock global fetch
global.fetch = vi.fn();

describe('ExtractContentService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset cache by accessing private member if needed, or just rely on clear mocks
        // Since it's a singleton, we might need a way to clear it for clean tests
        (extractContentService as any).cache.clear();
    });

    it('deve chamar a API quando nao houver cache', async () => {
        const mockResult = { text: 'Conteudo extraido', length: 17 };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResult,
        });

        const result = await extractContentService.extract({ url: 'https://example.com/test.pdf' });
        
        expect(result).toEqual(mockResult);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('deve usar o cache em chamadas repetidas', async () => {
        const mockResult = { text: 'Conteudo extraido', length: 17 };
        (fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResult,
        });

        // Primeira chamada
        await extractContentService.extract({ url: 'https://example.com/cache-test' });
        
        // Segunda chamada
        const result = await extractContentService.extract({ url: 'https://example.com/cache-test' });
        
        expect(result).toEqual(mockResult);
        expect(fetch).toHaveBeenCalledTimes(1); // Somente 1 chamada fetch (cache hit na segunda)
    });

    it('deve falhar graciosamente em erro de rede', async () => {
        (fetch as any).mockRejectedValue(new Error('Network error'));

        const result = await extractContentService.extract({ url: 'https://example.com/error' });
        
        expect(result.text).toBe('');
        expect(result.error).toBe('Network error');
    });
});
