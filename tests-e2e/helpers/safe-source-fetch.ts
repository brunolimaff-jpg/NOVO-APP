import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 30_000;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface SourceResponse {
  status: number;
  location?: string;
}

export interface SafeSourceDependencies {
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  requestPinned?: (
    url: URL,
    method: 'HEAD' | 'GET',
    resolved: ResolvedAddress,
    timeoutMs: number,
  ) => Promise<SourceResponse>;
}

function ipv4ToNumber(address: string): number {
  return address.split('.').reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function ipv4InCidr(address: string, network: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const blocked: Array<[string, number]> = [
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
    ];
    return !blocked.some(([network, bits]) => ipv4InCidr(address, network, bits));
  }
  if (family === 6) {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized.startsWith('::ffff:')) return isPublicIpAddress(normalized.slice(7));
    const parts = normalized.split('::');
    if (parts.length > 2) return false;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (parts.length === 1 && missing !== 0)) return false;
    const groups = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
    if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return false;
    const numeric = groups.reduce((value, group) => (value << 16n) + BigInt(`0x${group}`), 0n);
    const inCidr = (network: bigint, bits: bigint) =>
      bits === 0n || numeric >> (128n - bits) === network >> (128n - bits);
    if (numeric >> 32n === 0xffffn) {
      const mapped = Number(numeric & 0xffffffffn);
      return isPublicIpAddress(
        [mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join('.'),
      );
    }
    return !(
      numeric === 0n ||
      numeric === 1n ||
      inCidr(0n, 96n) ||
      inCidr(0x64ff9b0001n << 80n, 48n) ||
      inCidr(0x100n << 112n, 64n) ||
      inCidr(0x2001n << 112n, 23n) ||
      inCidr(0xfc00n << 112n, 7n) ||
      inCidr(0xfe80n << 112n, 10n) ||
      inCidr(0xff00n << 112n, 8n) ||
      inCidr(0x20010db8n << 96n, 32n) ||
      inCidr(0x2002n << 112n, 16n) ||
      inCidr(0x3fffn << 112n, 20n) ||
      inCidr(0x5f00n << 112n, 16n)
    );
  }
  return false;
}

async function defaultResolveHost(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map(item => ({ address: item.address, family: item.family as 4 | 6 }));
}

async function defaultRequestPinned(
  url: URL,
  method: 'HEAD' | 'GET',
  resolved: ResolvedAddress,
  timeoutMs: number,
): Promise<SourceResponse> {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method,
        headers: { 'User-Agent': 'SeniorScout360-GoldenValidation/1.0' },
        lookup: (_hostname, _options, callback) => callback(null, resolved.address, resolved.family),
      },
      response => {
        const result = {
          status: response.statusCode ?? 0,
          location: typeof response.headers.location === 'string' ? response.headers.location : undefined,
        };
        response.destroy();
        resolve(result);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`source request timeout after ${timeoutMs}ms`)));
    request.on('error', reject);
    request.end();
  });
}

async function validateAndResolve(url: URL, resolveHost: NonNullable<SafeSourceDependencies['resolveHost']>) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`unsupported source protocol: ${url.protocol}`);
  if (url.username || url.password) throw new Error('source URL must not contain credentials');
  const allowedPort = !url.port || (url.protocol === 'https:' ? url.port === '443' : url.port === '80');
  if (!allowedPort) throw new Error(`source URL port is not allowed: ${url.port}`);

  const literalFamily = isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily as 4 | 6 }]
    : await resolveHost(url.hostname);
  if (addresses.length === 0 || addresses.some(item => !isPublicIpAddress(item.address))) {
    throw new Error(`source resolves to non-public address: ${url.hostname}`);
  }
  return addresses[0];
}

export async function requestSourceSafely(
  initialUrl: string,
  method: 'HEAD' | 'GET',
  dependencies: SafeSourceDependencies = {},
): Promise<SourceResponse> {
  const resolveHost = dependencies.resolveHost ?? defaultResolveHost;
  const requestPinned = dependencies.requestPinned ?? defaultRequestPinned;
  let currentUrl = new URL(initialUrl);
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error(`source validation timeout after ${TOTAL_TIMEOUT_MS}ms`);
    const resolved = await validateAndResolve(currentUrl, resolveHost);
    const response = await requestPinned(currentUrl, method, resolved, Math.min(REQUEST_TIMEOUT_MS, remainingMs));
    if (response.status < 300 || response.status >= 400) return response;
    if (!response.location) return response;
    if (hop === MAX_REDIRECTS) throw new Error(`source exceeded ${MAX_REDIRECTS} redirects`);
    currentUrl = new URL(response.location, currentUrl);
  }
  throw new Error('unreachable redirect state');
}
