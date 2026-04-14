import { describe, it, expect } from 'vitest';
import handler from '../api/extract-content';
import type { VercelRequest, VercelResponse } from '@vercel/node';

describe('api/extract-content handler', () => {
    it('deve retornar 405 para GET', async () => {
        const req = { method: 'GET' } as VercelRequest;
        const res = {
            status: (s: number) => ({ json: (j: any) => ({ s, j }) })
        } as any;
        const result = await handler(req, res);
        expect((result as any).s).toBe(405);
    });

    it('deve validar schema Zod', async () => {
        const req = { 
            method: 'POST',
            body: {} 
        } as VercelRequest;
        const res = {
            status: (s: number) => ({ json: (j: any) => ({ s, j }) })
        } as any;
        const result = await handler(req, res);
        expect((result as any).s).toBe(400);
    });
});
