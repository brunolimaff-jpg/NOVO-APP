import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export type SafePublicRequestMethod = 'HEAD' | 'GET';

export interface SafePublicAddress {
  address: string;
  family: 4 | 6;
}

export interface SafePublicRequestTarget extends SafePublicAddress {
  url: URL;
}

export interface SafePublicResponse {
  statusCode: number;
  location?: string;
}

export type SafePublicRequestTransport = (
  target: SafePublicRequestTarget,
  method: SafePublicRequestMethod,
  timeoutMs: number,
) => Promise<SafePublicResponse>;

export interface SafePublicRequestDependencies {
  resolve?: (hostname: string) => Promise<SafePublicAddress[]>;
  transport?: SafePublicRequestTransport;
}

type SafePublicRequestErrorCode = 'invalid_url' | 'restricted_hostname' | 'restricted_address' | 'too_many_redirects';

export class SafePublicRequestError extends Error {
  constructor(
    readonly code: SafePublicRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SafePublicRequestError';
  }
}

const REQUEST_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_ADDRESSES = new BlockList();

function addBlockedSubnets(): void {
  for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const) {
    BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
  }

  for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['100::', 64],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ] as const) {
    BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
  }
}

addBlockedSubnets();

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function isRestrictedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  );
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family !== 4 && family !== 6) return false;

  return !BLOCKED_ADDRESSES.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
}

function parseSafePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SafePublicRequestError('invalid_url', 'URL inválida.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafePublicRequestError('invalid_url', 'Protocolo não permitido.');
  }

  if (url.username || url.password) {
    throw new SafePublicRequestError('invalid_url', 'URL com credenciais não é permitida.');
  }

  const expectedPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== expectedPort) {
    throw new SafePublicRequestError('invalid_url', 'Porta não permitida.');
  }

  if (isRestrictedHostname(normalizeHostname(url.hostname))) {
    throw new SafePublicRequestError('restricted_hostname', 'Host restrito.');
  }

  return url;
}

async function resolveHost(hostname: string): Promise<SafePublicAddress[]> {
  const normalized = normalizeHostname(hostname);
  const literalFamily = isIP(normalized);
  if (literalFamily === 4 || literalFamily === 6) {
    return [{ address: normalized, family: literalFamily }];
  }

  const addresses = await dnsLookup(normalized, { all: true });
  return addresses
    .filter((entry): entry is { address: string; family: 4 | 6 } => entry.family === 4 || entry.family === 6)
    .map(entry => ({ address: entry.address, family: entry.family }));
}

async function resolveValidatedTarget(
  url: URL,
  resolve: NonNullable<SafePublicRequestDependencies['resolve']>,
): Promise<SafePublicRequestTarget> {
  const hostname = normalizeHostname(url.hostname);
  const addresses = await resolve(hostname);

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new SafePublicRequestError('restricted_address', 'URL resolve para endereço restrito.');
  }

  return { url, ...addresses[0] };
}

export function createPinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, _options, callback) => callback(null, address, family);
}

const requestPinnedTarget: SafePublicRequestTransport = (target, method, timeoutMs) =>
  new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, response?: SafePublicResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve(response as SafePublicResponse);
    };

    const options = {
      method,
      lookup: createPinnedLookup(target.address, target.family),
      headers: { 'User-Agent': 'ScoutAgro Link Validator/1.0' },
    };
    const onResponse = (response: import('node:http').IncomingMessage) => {
      const rawLocation = response.headers.location;
      const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
      const result = { statusCode: response.statusCode ?? 0, ...(location ? { location } : {}) };

      response.once('aborted', () => finish(new Error('Resposta abortada.')));
      response.once('error', error => finish(error));
      response.once('end', () => finish(undefined, result));
      response.resume();
    };
    const request =
      target.url.protocol === 'https:'
        ? httpsRequest(target.url, options, onResponse)
        : httpRequest(target.url, options, onResponse);
    const timeoutId = setTimeout(() => request.destroy(new Error('Tempo limite excedido.')), timeoutMs);

    request.once('error', error => finish(error));
    request.end();
  });

export async function requestPublicUrl(
  value: string,
  method: SafePublicRequestMethod,
  dependencies: SafePublicRequestDependencies = {},
): Promise<SafePublicResponse> {
  const resolve = dependencies.resolve ?? resolveHost;
  const transport = dependencies.transport ?? requestPinnedTarget;
  let url = parseSafePublicUrl(value);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const target = await resolveValidatedTarget(url, resolve);
    const response = await transport(target, method, REQUEST_TIMEOUT_MS);

    if (!REDIRECT_STATUS_CODES.has(response.statusCode) || !response.location) {
      return response;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new SafePublicRequestError('too_many_redirects', 'Limite de redirects excedido.');
    }

    url = parseSafePublicUrl(new URL(response.location, url).toString());
  }

  throw new SafePublicRequestError('too_many_redirects', 'Limite de redirects excedido.');
}
