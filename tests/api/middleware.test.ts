import { describe, it, expect, vi, beforeEach } from 'vitest';
import middleware from '../../middleware.js';

function createRequest(opts: { method?: string; pathname?: string; origin?: string } = {}) {
  const url = new URL('https://scoutagro.vercel.app');
  if (opts.pathname) {
    url.pathname = opts.pathname;
  }
  const headers = new Headers();
  if (opts.origin) {
    headers.set('Origin', opts.origin);
  }
  return new Request(url, {
    method: opts.method || 'GET',
    headers,
  });
}

describe('middleware', () => {
  it('ignora requisicoes fora de /api/', async () => {
    const req = createRequest({ pathname: '/index.html', method: 'OPTIONS' });
    const result = await middleware(req);
    expect(result).toBeUndefined();
  });

  it('ignora requisicoes GET normais (nao OPTIONS)', async () => {
    const req = createRequest({ pathname: '/api/cnpj', method: 'GET' });
    const result = await middleware(req);
    expect(result).toBeUndefined();
  });

  it('responde 204 para OPTIONS com origem permitida', async () => {
    const req = createRequest({
      pathname: '/api/gemini',
      method: 'OPTIONS',
      origin: 'http://localhost:5173',
    });
    const result = await middleware(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(204);
    expect(result!.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(result!.headers.get('Vary')).toBe('Origin');
  });

  it('responde 204 para OPTIONS de preview Vercel', async () => {
    const req = createRequest({
      pathname: '/api/gemini',
      method: 'OPTIONS',
      origin: 'https://scoutagro-git-feat-test-brunolimaff-3629s-projects.vercel.app',
    });
    const result = await middleware(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(204);
  });

  it('nao define Allow-Origin para OPTIONS de origem desconhecida', async () => {
    const req = createRequest({
      pathname: '/api/gemini',
      method: 'OPTIONS',
      origin: 'https://evil.example.com',
    });
    const result = await middleware(req);
    expect(result).toBeInstanceOf(Response);
    expect(result!.status).toBe(204);
    expect(result!.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('define headers CORS no OPTIONS via middleware', async () => {
    const req = createRequest({
      pathname: '/api/gemini',
      method: 'OPTIONS',
      origin: 'http://localhost:5173',
    });
    const result = await middleware(req);
    expect(result!.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(result!.headers.get('Access-Control-Allow-Methods')).toBe('GET,OPTIONS,POST');
  });
});
