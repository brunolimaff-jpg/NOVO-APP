import { describe, expect, it, vi } from 'vitest';
import {
  createPinnedLookup,
  isPublicIpAddress,
  requestPublicUrl,
  type SafePublicAddress,
  type SafePublicRequestDependencies,
  type SafePublicRequestTransport,
} from '../api/_safe-public-request';

const PUBLIC_IPV4: SafePublicAddress = { address: '93.184.216.34', family: 4 };

function dependencies(overrides: Partial<SafePublicRequestDependencies> = {}): SafePublicRequestDependencies {
  const transport: SafePublicRequestTransport = async () => ({ statusCode: 200 });
  return {
    resolve: async () => [PUBLIC_IPV4],
    transport,
    ...overrides,
  };
}

describe('api/_safe-public-request', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '192.0.2.1',
    '100.64.0.1',
    '::1',
    '::127.0.0.1',
    '::ffff:127.0.0.1',
    '64:ff9b::10.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ])('rejeita endereço não público: %s', address => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it('aceita IPv4 público roteável', () => {
    expect(isPublicIpAddress(PUBLIC_IPV4.address)).toBe(true);
  });

  it('aceita destino público e fixa a conexão no IP validado', async () => {
    const transport = vi.fn<SafePublicRequestTransport>().mockResolvedValue({ statusCode: 204 });

    await expect(requestPublicUrl('https://example.test/path', 'HEAD', dependencies({ transport }))).resolves.toEqual({ statusCode: 204 });
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ address: PUBLIC_IPV4.address, family: 4, url: expect.any(URL) }),
      'HEAD',
      expect.any(Number),
    );
  });

  it.each([
    ['http://localhost/private', 'restricted_hostname'],
    ['https://user:pass@example.test', 'invalid_url'],
    ['https://example.test:8443', 'invalid_url'],
    ['http://169.254.169.254/latest/meta-data', 'restricted_address'],
    ['http://[::ffff:127.0.0.1]/', 'restricted_address'],
    ['http://[64:ff9b::10.0.0.1]/', 'restricted_address'],
  ])('falha fechado para %s', async (url, code) => {
    const resolve = vi.fn();
    await expect(requestPublicUrl(url, 'HEAD', dependencies({ resolve }))).rejects.toMatchObject({ code });
    if (code !== 'restricted_address') expect(resolve).not.toHaveBeenCalled();
  });

  it('rejeita DNS que mistura endereço público e inseguro', async () => {
    const transport = vi.fn<SafePublicRequestTransport>();
    await expect(
      requestPublicUrl(
        'https://mixed.test',
        'HEAD',
        dependencies({ resolve: async () => [PUBLIC_IPV4, { address: '127.0.0.1', family: 4 }], transport }),
      ),
    ).rejects.toMatchObject({ code: 'restricted_address' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('revalida redirects e bloqueia destino privado ou metadata', async () => {
    const resolve = vi.fn(async (hostname: string) => {
      if (hostname === 'public.test') return [PUBLIC_IPV4];
      return [{ address: hostname === 'metadata.test' ? '169.254.169.254' : '127.0.0.1', family: 4 as const }];
    });
    const transport = vi.fn<SafePublicRequestTransport>().mockResolvedValue({
      statusCode: 302,
      location: 'http://restricted.test/internal',
    });

    await expect(requestPublicUrl('https://public.test', 'HEAD', dependencies({ resolve, transport }))).rejects.toMatchObject({
      code: 'restricted_address',
    });
    expect(transport).toHaveBeenCalledTimes(1);

    transport.mockResolvedValueOnce({ statusCode: 302, location: 'http://metadata.test/latest/meta-data' });
    await expect(requestPublicUrl('https://public.test', 'HEAD', dependencies({ resolve, transport }))).rejects.toMatchObject({
      code: 'restricted_address',
    });
  });

  it('segue redirect público válido e rejeita excesso de redirects', async () => {
    const redirectingTransport = vi
      .fn<SafePublicRequestTransport>()
      .mockResolvedValueOnce({ statusCode: 302, location: 'https://next.test/path' })
      .mockResolvedValueOnce({ statusCode: 200 });
    await expect(requestPublicUrl('https://public.test', 'HEAD', dependencies({ transport: redirectingTransport }))).resolves.toEqual({
      statusCode: 200,
    });

    const loopTransport = vi.fn<SafePublicRequestTransport>().mockResolvedValue({ statusCode: 302, location: 'https://public.test/again' });
    await expect(requestPublicUrl('https://public.test', 'HEAD', dependencies({ transport: loopTransport }))).rejects.toMatchObject({
      code: 'too_many_redirects',
    });
  });

  it('falha fechado quando o DNS falha', async () => {
    await expect(
      requestPublicUrl('https://unresolved.test', 'HEAD', dependencies({ resolve: async () => Promise.reject(new Error('dns failed')) })),
    ).rejects.toMatchObject({ code: 'dns_resolution_failed' });
  });

  it('mantém um único orçamento de deadline ao seguir redirects', async () => {
    let now = 0;
    const transport = vi
      .fn<SafePublicRequestTransport>()
      .mockImplementationOnce(async () => {
        now = 4_500;
        return { statusCode: 302, location: 'https://next.test' };
      })
      .mockResolvedValueOnce({ statusCode: 204 });

    await requestPublicUrl('https://public.test', 'HEAD', dependencies({ transport, now: () => now, deadline: 5_000 }));
    expect(transport.mock.calls[0]?.[2]).toBe(5_000);
    expect(transport.mock.calls[1]?.[2]).toBe(500);
  });

  it('usa lookup fixado, impedindo DNS rebinding após a validação', async () => {
    const lookup = createPinnedLookup(PUBLIC_IPV4.address, PUBLIC_IPV4.family);
    await new Promise<void>((resolve, reject) => {
      lookup('rebinding.test', {}, (error, address, family) => {
        try {
          expect(error).toBeNull();
          expect(address).toBe(PUBLIC_IPV4.address);
          expect(family).toBe(PUBLIC_IPV4.family);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      });
    });
  });
});
