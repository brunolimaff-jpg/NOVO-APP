import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

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
  now?: () => number;
  deadline?: number;
}

type SafePublicRequestErrorCode =
  | 'invalid_url'
  | 'restricted_hostname'
  | 'restricted_address'
  | 'dns_resolution_failed'
  | 'timeout'
  | 'transport_failed'
  | 'too_many_redirects';

export class SafePublicRequestError extends Error {
  constructor(
    readonly code: SafePublicRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SafePublicRequestError';
  }
}

export const SAFE_PUBLIC_REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

const IPV4_RESTRICTED_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // unspecified and this network
  [0x0a000000, 8], // RFC 1918
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local and cloud metadata
  [0xac100000, 12], // RFC 1918
  [0xc0000000, 24], // IANA special-purpose block
  [0xc0000200, 24], // documentation
  [0xc0586300, 24], // deprecated 6to4 relay anycast
  [0xc0a80000, 16], // RFC 1918
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // documentation
  [0xcb007100, 24], // documentation
  [0xe0000000, 4], // multicast and reserved
];

const IPV6_RESTRICTED_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['::', 96], // unspecified, loopback and IPv4-compatible/mapped addresses
  ['64:ff9b::', 96], // NAT64 well-known prefix
  ['64:ff9b:1::', 48], // locally assigned NAT64
  ['100::', 64], // discard-only
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, carries an embedded IPv4 address
  ['fc00::', 7], // unique local addresses
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
];

function normalizeHost(value: string): string {
  return value.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function parseIpv4(address: string): number | null {
  const segments = address.split('.');
  if (segments.length !== 4) return null;

  let value = 0;
  for (const segment of segments) {
    if (!/^\d{1,3}$/.test(segment)) return null;
    const octet = Number(segment);
    if (octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function ipv4InRange(address: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (network & mask);
}

function parseIpv6(address: string): bigint | null {
  const normalized = normalizeHost(address);
  if (isIP(normalized) !== 6) return null;

  const [left, right, ...extra] = normalized.split('::');
  if (extra.length > 0) return null;

  const expand = (part: string): string[] => (part ? part.split(':') : []);
  const leftParts = expand(left);
  const rightParts = expand(right ?? '');
  const parts = [...leftParts, ...rightParts];
  const ipv4Index = parts.findIndex(part => part.includes('.'));

  if (ipv4Index >= 0) {
    if (ipv4Index !== parts.length - 1) return null;
    const ipv4 = parseIpv4(parts[ipv4Index]);
    if (ipv4 === null) return null;
    parts.splice(ipv4Index, 1, ((ipv4 >>> 16) & 0xffff).toString(16), (ipv4 & 0xffff).toString(16));
  }

  const missing = 8 - parts.length;
  if (missing < 0 || (normalized.includes('::') ? missing < 1 : missing !== 0)) return null;
  const groups = normalized.includes('::') ? [...leftParts, ...Array(missing).fill('0'), ...rightParts] : parts;

  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/i.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function ipv6InRange(address: bigint, network: string, prefix: number): boolean {
  const parsedNetwork = parseIpv6(network);
  if (parsedNetwork === null) return false;
  const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return (address & mask) === (parsedNetwork & mask);
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
  const normalized = normalizeHost(address);
  const family = isIP(normalized);

  if (family === 4) {
    const parsed = parseIpv4(normalized);
    return parsed !== null && !IPV4_RESTRICTED_RANGES.some(([network, prefix]) => ipv4InRange(parsed, network, prefix));
  }

  if (family === 6) {
    const parsed = parseIpv6(normalized);
    if (parsed === null || !ipv6InRange(parsed, '2000::', 3)) return false;
    return !IPV6_RESTRICTED_RANGES.some(([network, prefix]) => ipv6InRange(parsed, network, prefix));
  }

  return false;
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

  const defaultPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== defaultPort) {
    throw new SafePublicRequestError('invalid_url', 'Porta não permitida.');
  }
  if (isRestrictedHostname(normalizeHost(url.hostname))) {
    throw new SafePublicRequestError('restricted_hostname', 'Host restrito.');
  }
  return url;
}

async function resolveHost(hostname: string): Promise<SafePublicAddress[]> {
  const normalized = normalizeHost(hostname);
  const family = isIP(normalized);
  if (family === 4 || family === 6) return [{ address: normalized, family }];

  const entries = await dnsLookup(normalized, { all: true, verbatim: true });
  return entries
    .filter((entry): entry is SafePublicAddress => entry.family === 4 || entry.family === 6)
    .map(entry => ({ address: entry.address, family: entry.family }));
}

function remainingTimeout(deadline: number, now: () => number): number {
  const remaining = deadline - now();
  if (remaining <= 0) throw new SafePublicRequestError('timeout', 'Tempo limite excedido.');
  return remaining;
}

async function withinDeadline<T>(operation: Promise<T>, deadline: number, now: () => number): Promise<T> {
  const timeoutMs = remainingTimeout(deadline, now);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new SafePublicRequestError('timeout', 'Tempo limite excedido.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function resolveValidatedTarget(
  url: URL,
  resolve: NonNullable<SafePublicRequestDependencies['resolve']>,
  deadline: number,
  now: () => number,
): Promise<SafePublicRequestTarget> {
  const hostname = normalizeHost(url.hostname);
  let addresses: SafePublicAddress[];
  const literalFamily = isIP(hostname);
  if (literalFamily === 4 || literalFamily === 6) {
    addresses = [{ address: hostname, family: literalFamily }];
  } else {
    try {
      addresses = await withinDeadline(resolve(hostname), deadline, now);
    } catch (error) {
      if (error instanceof SafePublicRequestError) throw error;
      throw new SafePublicRequestError('dns_resolution_failed', 'Não foi possível resolver o host.');
    }
  }

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
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, response?: SafePublicResponse) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve(response as SafePublicResponse);
    };
    const onResponse = (response: IncomingMessage) => {
      const rawLocation = response.headers.location;
      const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
      const result = { statusCode: response.statusCode ?? 0, ...(location ? { location } : {}) };
      response.once('aborted', () => finish(new SafePublicRequestError('transport_failed', 'Resposta abortada.')));
      response.once('error', error => finish(new SafePublicRequestError('transport_failed', error.message)));
      response.once('end', () => finish(undefined, result));
      response.resume();
    };
    const options = {
      method,
      lookup: createPinnedLookup(target.address, target.family),
      headers: { 'User-Agent': 'ScoutAgro Link Validator/1.0' },
      agent: false,
    };
    const request = target.url.protocol === 'https:' ? httpsRequest(target.url, options, onResponse) : httpRequest(target.url, options, onResponse);
    timeoutId = setTimeout(() => request.destroy(new SafePublicRequestError('timeout', 'Tempo limite excedido.')), timeoutMs);
    request.once('error', error => finish(error instanceof SafePublicRequestError ? error : new SafePublicRequestError('transport_failed', error.message)));
    request.end();
  });

export async function requestPublicUrl(
  value: string,
  method: SafePublicRequestMethod,
  dependencies: SafePublicRequestDependencies = {},
): Promise<SafePublicResponse> {
  const resolve = dependencies.resolve ?? resolveHost;
  const transport = dependencies.transport ?? requestPinnedTarget;
  const now = dependencies.now ?? Date.now;
  const deadline = dependencies.deadline ?? now() + SAFE_PUBLIC_REQUEST_TIMEOUT_MS;
  let url = parseSafePublicUrl(value);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const target = await resolveValidatedTarget(url, resolve, deadline, now);
    const response = await withinDeadline(transport(target, method, remainingTimeout(deadline, now)), deadline, now);

    if (!REDIRECT_STATUS_CODES.has(response.statusCode) || !response.location) return response;
    if (redirectCount === MAX_REDIRECTS) {
      throw new SafePublicRequestError('too_many_redirects', 'Limite de redirects excedido.');
    }
    url = parseSafePublicUrl(new URL(response.location, url).toString());
  }

  throw new SafePublicRequestError('too_many_redirects', 'Limite de redirects excedido.');
}
