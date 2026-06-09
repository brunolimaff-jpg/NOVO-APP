import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyCors } from '../../api/_cors-headers.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function mockReq(origin?: string): VercelRequest {
  return {
    headers: { origin: origin || '' },
  } as unknown as VercelRequest;
}

function mockRes(): { res: VercelResponse; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
  } as unknown as VercelResponse;
  return { res, headers };
}

describe('applyCors', () => {
  it('define headers CORS para origem permitida (localhost)', () => {
    const req = mockReq('http://localhost:5173');
    const { res, headers } = mockRes();

    applyCors(req, res);

    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(headers['Vary']).toBe('Origin');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET,OPTIONS,POST');
  });

  it('define headers CORS para preview Vercel', () => {
    const req = mockReq('https://scoutagro-git-feat-test-abc123.vercel.app');
    const { res, headers } = mockRes();

    applyCors(req, res);

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://scoutagro-git-feat-test-abc123.vercel.app',
    );
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('nao define Allow-Origin para origem nao permitida', () => {
    const req = mockReq('https://evil.example.com');
    const { res, headers } = mockRes();

    applyCors(req, res);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Vary']).toBeUndefined();
    // Credentials e Methods sao setados mesmo sem Allow-Origin
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET,OPTIONS,POST');
  });

  it('define todos os headers de request permitidos', () => {
    const req = mockReq('http://localhost:5173');
    const { res, headers } = mockRes();

    applyCors(req, res);

    const allowedHeaders = headers['Access-Control-Allow-Headers'];
    expect(allowedHeaders).toContain('Content-Type');
    expect(allowedHeaders).toContain('X-CSRF-Token');
    expect(allowedHeaders).toContain('Accept');
    expect(allowedHeaders).toContain('X-Api-Version');
  });

  it('nao quebra com headers vazios', () => {
    const req = { headers: {} } as unknown as VercelRequest;
    const { res } = mockRes();
    expect(() => applyCors(req, res)).not.toThrow();
  });
});
