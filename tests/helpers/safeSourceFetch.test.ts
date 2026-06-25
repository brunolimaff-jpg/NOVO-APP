import { describe, expect, it, vi } from 'vitest';
import {
  isPublicIpAddress,
  requestSourceSafely,
  type ResolvedAddress,
  type SafeSourceDependencies,
} from '../../tests-e2e/helpers/safe-source-fetch';

const publicAddress: ResolvedAddress = { address: '8.8.8.8', family: 4 };

describe('safe source fetch', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '::1',
    '0:0:0:0:0:0:0:1',
    '0:0:0:0:0:ffff:7f00:1',
    'fe80::1',
    'fc00::1',
    '2001:db8::1',
  ])('bloqueia endereço não público %s', address => expect(isPublicIpAddress(address)).toBe(false));

  it('aceita IPv4 e IPv6 públicos', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('bloqueia DNS misto quando qualquer resposta é privada', async () => {
    await expect(
      requestSourceSafely('https://example.com', 'HEAD', {
        resolveHost: async () => [publicAddress, { address: '127.0.0.1', family: 4 }],
        requestPinned: vi.fn(),
      }),
    ).rejects.toThrow('non-public');
  });

  it('revalida redirect e bloqueia salto para metadata privada', async () => {
    const dependencies: SafeSourceDependencies = {
      resolveHost: async hostname =>
        hostname === 'safe.example' ? [publicAddress] : [{ address: '169.254.169.254', family: 4 }],
      requestPinned: vi.fn().mockResolvedValue({ status: 302, location: 'http://metadata.example/latest' }),
    };
    await expect(requestSourceSafely('https://safe.example', 'GET', dependencies)).rejects.toThrow('non-public');
  });

  it('fixa a conexão no IP público validado e segue redirect público', async () => {
    const requestPinned = vi
      .fn()
      .mockResolvedValueOnce({ status: 301, location: '/final' })
      .mockResolvedValueOnce({ status: 200 });
    const result = await requestSourceSafely('https://safe.example/start', 'HEAD', {
      resolveHost: async () => [publicAddress],
      requestPinned,
    });
    expect(result.status).toBe(200);
    expect(requestPinned).toHaveBeenNthCalledWith(
      2,
      new URL('https://safe.example/final'),
      'HEAD',
      publicAddress,
      20_000,
    );
  });

  it('bloqueia credenciais e portas não padrão', async () => {
    const dependencies: SafeSourceDependencies = { resolveHost: async () => [publicAddress] };
    await expect(requestSourceSafely('https://user:secret@safe.example', 'HEAD', dependencies)).rejects.toThrow(
      'credentials',
    );
    await expect(requestSourceSafely('https://safe.example:8443', 'HEAD', dependencies)).rejects.toThrow('port');
  });

  it('interrompe cadeia acima do limite de redirects', async () => {
    await expect(
      requestSourceSafely('https://safe.example/start', 'HEAD', {
        resolveHost: async () => [publicAddress],
        requestPinned: vi.fn().mockResolvedValue({ status: 302, location: '/again' }),
      }),
    ).rejects.toThrow('exceeded 5 redirects');
  });
});
