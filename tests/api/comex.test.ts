import { describe, it, expect, vi, beforeAll } from 'vitest';

// --- Mocks ---

const mockSetHeader = vi.fn();
const mockStatus = vi.fn();
const mockJson = vi.fn();
const mockEnd = vi.fn();

function makeMockRes() {
  mockStatus.mockReturnThis();
  return {
    setHeader: mockSetHeader,
    status: mockStatus,
    json: mockJson,
    end: mockEnd,
  };
}

vi.mock('../../lib/cnpjLookup', () => ({
  lookupCnpj: vi.fn(),
  CnpjNotFoundError: class CnpjNotFoundError extends Error {
    constructor(cnpj: string) {
      super(`CNPJ ${cnpj} nao encontrado`);
      this.name = 'CnpjNotFoundError';
    }
  },
}));

vi.mock('../../utils/cnpj', () => ({
  normalizeCnpj: vi.fn((cnpj: string) => cnpj.replace(/\D/g, '')),
  isValidCnpj: vi.fn((cnpj: string) => cnpj.length === 14),
}));

vi.mock('../../api/_cache-headers', () => ({
  cacheHeaders: vi.fn(() => ({ 'Cache-Control': 'public, max-age=86400' })),
}));

vi.mock('../../api/_security-headers', () => ({
  setSecurityHeaders: vi.fn(),
}));

describe('comex handler — error paths', () => {
  let handler: (req: unknown, res: unknown) => Promise<unknown>;

  beforeAll(async () => {
    const mod = await import('../../api/comex');
    handler = mod.default;
  });

  it('retorna 400 para CNPJ invalido', async () => {
    const { isValidCnpj } = await import('../../utils/cnpj');
    vi.mocked(isValidCnpj).mockReturnValueOnce(false);

    const req = { query: { cnpj: '123' }, method: 'GET', headers: {} };
    const res = makeMockRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({ error: 'CNPJ inválido.' });
  });

  it('retorna 500 quando lookupCnpj lanca erro inesperado', async () => {
    const { isValidCnpj } = await import('../../utils/cnpj');
    const { lookupCnpj } = await import('../../lib/cnpjLookup');

    vi.mocked(isValidCnpj).mockReturnValueOnce(true);
    vi.mocked(lookupCnpj).mockRejectedValueOnce(new Error('API externa fora do ar'));

    const req = { query: { cnpj: '12345678000199' }, method: 'GET', headers: {} };
    const res = makeMockRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({ error: 'Internal server error while fetching Comex data' });
  });

  it('retorna 200 com CNPJNotFoundError indicando nao exportador', async () => {
    const { isValidCnpj } = await import('../../utils/cnpj');
    const { lookupCnpj, CnpjNotFoundError } = await import('../../lib/cnpjLookup');

    vi.mocked(isValidCnpj).mockReturnValueOnce(true);
    vi.mocked(lookupCnpj).mockRejectedValueOnce(new CnpjNotFoundError('12345678000199'));

    const req = { query: { cnpj: '12345678000199' }, method: 'GET', headers: {} };
    const res = makeMockRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      isExportador: false,
      message: 'CNPJ não encontrado na base da Receita Federal',
    });
  });
});

describe('comex handler — OPTIONS preflight', () => {
  let handler: (req: unknown, res: unknown) => Promise<unknown>;

  beforeAll(async () => {
    vi.resetModules();
    const mod = await import('../../api/comex');
    handler = mod.default;
  });

  it('retorna 405 para OPTIONS — middleware.ts faz o preflight', async () => {
    const req = { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } };
    const res = makeMockRes();

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
  });
});
