import type { WebVerificationStatus } from '../types';

export interface VerifiedSource {
  title: string;
  url: string;
  verification?: 'grounding' | 'fallback';
}

export interface ModuleVerificationUpdate {
  moduleName: string;
  status: WebVerificationStatus;
  sources: VerifiedSource[];
}

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
const RAW_URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
const FAKE_SOURCE_HOSTS = [
  'ai.studio',
  'aistudio.google.com',
  'vertexai.google.com',
  'gemini.google.com',
  'example.com',
  'exemplo.com',
  'fake-link.com',
];

function normalizeSourceCandidateUrl(url: string): string {
  const raw = (url || '').trim().replace(/^<|>$/g, '').replace(/[),.;:!?]+$/g, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    trackingParams.forEach(param => parsed.searchParams.delete(param));
    const query = parsed.searchParams.toString();
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function isPublicVerificationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false;
    if (FAKE_SOURCE_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))) return false;
    if (hostname.includes('google.com') && parsed.pathname.includes('/search')) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeVerificationStatus(
  status: WebVerificationStatus | undefined,
  groundingUsed?: boolean,
): WebVerificationStatus {
  if (status) return status;
  if (groundingUsed === true) return 'verified';
  if (groundingUsed === false) return 'unverified';
  return 'not_applicable';
}

export function extractPromotableInlineSources(
  text: string,
  existingSources: Array<{ title: string; url: string }> = [],
  limit = 10,
): VerifiedSource[] {
  const out: VerifiedSource[] = [];
  const seen = new Set(existingSources.map(source => normalizeSourceCandidateUrl(source.url)).filter(Boolean));

  const push = (title: string, url: string) => {
    const normalizedUrl = normalizeSourceCandidateUrl(url);
    if (!normalizedUrl || seen.has(normalizedUrl) || !isPublicVerificationUrl(normalizedUrl)) return;
    seen.add(normalizedUrl);
    out.push({
      title: title.trim() || normalizedUrl,
      url: normalizedUrl,
      verification: 'fallback',
    });
  };

  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_REGEX.exec(text || '')) !== null) {
    push(match[1] || '', match[2] || '');
    if (out.length >= limit) return out;
  }

  while ((match = RAW_URL_REGEX.exec(text || '')) !== null) {
    let title = '';
    try {
      title = new URL(match[0]).hostname.replace(/^www\./i, '');
    } catch {
      title = match[0];
    }
    push(title, match[0]);
    if (out.length >= limit) return out;
  }

  return out;
}

export function hasVerifiedWebSources(sources: Array<{ title: string; url: string }> | undefined): boolean {
  return Array.isArray(sources) && sources.some(source => /^https?:\/\//i.test(source.url || ''));
}

export function deriveVerificationStatusFromSources(
  sources: Array<{ title: string; url: string }> | undefined,
  fallbackUsed = false,
  required = true,
): WebVerificationStatus {
  if (!required) return 'not_applicable';
  if (!hasVerifiedWebSources(sources)) return 'unverified';
  return fallbackUsed ? 'fallback_verified' : 'verified';
}

export function getVerificationLabel(status: WebVerificationStatus): string {
  switch (status) {
    case 'verified':
      return 'Verificado na web';
    case 'fallback_verified':
      return 'Verificado via fallback web';
    case 'unverified':
      return 'Resposta sem verificacao web';
    case 'not_applicable':
    default:
      return '';
  }
}
