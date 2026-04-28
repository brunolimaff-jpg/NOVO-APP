import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCompanyByCnpj,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
  resolveCnpjApiEndpoint,
  validateCityInState,
} from '../../services/brasilApiService';

describe('brasilApiService helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes and formats cnpj', () => {
    const normalized = normalizeCnpj('04.252.011/0001-10');
    expect(normalized).toBe('04252011000110');
    expect(formatCnpj(normalized)).toBe('04.252.011/0001-10');
  });

  it('validates check digits', () => {
    expect(isValidCnpj('04252011000110')).toBe(true);
    expect(isValidCnpj('04252011000111')).toBe(false);
  });

  it('uses the deployed proxy endpoint in localhost dev', () => {
    expect(resolveCnpjApiEndpoint('localhost', true)).toBe('/api/cnpj');
    expect(resolveCnpjApiEndpoint('127.0.0.1', true)).toBe('/api/cnpj');
    expect(resolveCnpjApiEndpoint('scoutagro.vercel.app', false)).toBe('/api/cnpj');
  });

  it('returns company data from the /api/cnpj proxy', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({
          cnpj: '04252011000110',
          companyName: 'Empresa Exemplo',
          city: 'Cuiabá',
          state: 'MT',
        }),
      } as Response);

    const result = await fetchCompanyByCnpj('04.252.011/0001-10');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api/cnpj?cnpj=04252011000110'),
      expect.anything(),
    );
    expect(result.companyName).toBe('Empresa Exemplo');
    expect(result.city).toBe('Cuiabá');
    expect(result.state).toBe('MT');
  });

  it('throws when proxy returns error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify({ error: 'Serviço indisponível' }),
    } as Response);

    await expect(fetchCompanyByCnpj('04.252.011/0001-10')).rejects.toThrow();
  });

  it('validates city and uf via IBGE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => JSON.stringify([{ nome: 'Cuiabá' }, { nome: 'Várzea Grande' }]),
    } as Response);

    const result = await validateCityInState('Cuiaba', 'MT');
    expect(result.isValid).toBe(true);
    expect(result.normalizedCity).toBe('Cuiabá');
  });

  it('surfaces a clear local-dev error when /api/cnpj returns app html', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<!DOCTYPE html><html><body>app shell</body></html>',
    } as Response);

    await expect(fetchCompanyByCnpj('04.252.011/0001-10')).rejects.toThrow(/Local dev sem proxy para \/api\/cnpj/i);
  });
});
