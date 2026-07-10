import { describe, expect, it, vi } from 'vitest';
import {
  createPinnedLookup,
  isPublicIpAddress,
  requestPublicUrl,
  type SafePublicRequestDependencies,
  type SafePublicRequestTransport,
} from '../api/_safe-public-request';

const PUBLIC_IPV4 = { address: '93.184.216.34', family: 4 as const };

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
    '127.0.0.2',
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '169.254.169.254',
    '192.168.1.1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejeita endereco nao publico: %s', address => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it('aceita endereco publico roteavel', () => {
    expect(isPublicIpAddress(PUBLIC_IPV4.address)).toBe(true);
  });

  it('rejeita DNS que mistura endereco publico e restrito', async () => {
    const transport = vi.fn<SafePublicRequestTransport>();

    await expect(
      requestPublicUrl(
        'https://mixed.test',
        'HEAD',
        dependencies({
          resolve: async () => [PUBLIC_IPV4, { address: '127.0.0.1', family: 4 }],
          transport,
        }),
      ),
    ).rejects.toMatchObject({ code: 'restricted_address' });

    expect(transport).not.toHaveBeenCalled();
  });

  it('revalida cada redirect antes de abrir a conexao seguinte', async () => {
    const resolve = vi.fn(async (hostname: string) => {
      if (hostname === 'redirect.test') return [PUBLIC_IPV4];
      return [{ address: '127.0.0.1', family: 4 as const }];
    });
    const transport = vi.fn<SafePublicRequestTransport>().mockResolvedValue({
      statusCode: 302,
      location: 'http://restricted.test/internal',
    });

    await expect(requestPublicUrl('https://redirect.test', 'HEAD', dependencies({ resolve, transport }))).rejects.toMatchObject({
      code: 'restricted_address',
    });

    expect(transport).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('redirect.test');
    expect(resolve).toHaveBeenCalledWith('restricted.test');
  });

  it('fixa a conexao no IP previamente validado', async () => {
    const transport = vi.fn<SafePublicRequestTransport>().mockResolvedValue({ statusCode: 204 });

    await requestPublicUrl('https://example.test/path', 'HEAD', dependencies({ transport }));

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        address: PUBLIC_IPV4.address,
        family: 4,
        url: expect.objectContaining({ hostname: 'example.test' }),
      }),
      'HEAD',
      5000,
    );
  });

  it('rejeita credenciais e portas nao padrao antes de resolver DNS', async () => {
    const resolve = vi.fn();

    await expect(requestPublicUrl('https://user:pass@example.test', 'HEAD', dependencies({ resolve }))).rejects.toMatchObject({
      code: 'invalid_url',
    });
    await expect(requestPublicUrl('https://example.test:8443', 'HEAD', dependencies({ resolve }))).rejects.toMatchObject({
      code: 'invalid_url',
    });

    expect(resolve).not.toHaveBeenCalled();
  });

  it('mantem o lookup fixado no endereco validado', async () => {
    const lookup = createPinnedLookup(PUBLIC_IPV4.address, PUBLIC_IPV4.family);

    await new Promise<void>((resolve, reject) => {
      lookup('ignored.test', {}, (error, address, family) => {
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
