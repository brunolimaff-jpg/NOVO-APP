import { describe, it, expect } from 'vitest';
import { setSecurityHeaders } from '../../api/_security-headers';

function createMockResponse(): Record<string, unknown> {
  const headers: Record<string, string> = {};
  return {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    get headers() {
      return headers;
    },
  };
}

describe('setSecurityHeaders', () => {
  it('define 4 headers de seguranca padrao', () => {
    const res = createMockResponse() as unknown as Parameters<typeof setSecurityHeaders>[0];
    setSecurityHeaders(res);

    expect((res as unknown as { headers: Record<string, string> }).headers).toEqual({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });

  it('nao quebra quando setHeader nao e funcao', () => {
    const res = { setHeader: undefined } as unknown as Parameters<typeof setSecurityHeaders>[0];
    expect(() => setSecurityHeaders(res)).not.toThrow();
  });

  it('nao quebra quando res e objeto vazio', () => {
    const res = {} as unknown as Parameters<typeof setSecurityHeaders>[0];
    expect(() => setSecurityHeaders(res)).not.toThrow();
  });
});
