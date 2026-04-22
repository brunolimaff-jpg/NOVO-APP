export { SENIOR_PRODUCT_URLS, findSeniorProductUrl } from '../utils/seniorLinks';

const FALLBACK_BACKEND_URL =
  'https://script.google.com/macros/s/AKfycbxvhFIWm6wOW0qDSrSB0lKA7UGkvxGltvZY9hghDpxv9r3diYcPoiPUq_n4WzJpkEY/exec';
const FALLBACK_LOOKUP_URL =
  'https://script.google.com/macros/s/AKfycbxscB2gSotAxrCdpRpyaqrPKlsPbRfe6fgjicbd69fG6sMM3vrbuGjDaRctWCTcE8d-/exec';
const FALLBACK_OPEN_WEB_SEARCH_ENDPOINT = '/api/open-web-search';

type ScoutApiEnvKey = 'VITE_BACKEND_URL' | 'VITE_LOOKUP_URL' | 'VITE_OPEN_WEB_SEARCH_URL';

function getEnvValue(key: ScoutApiEnvKey): string | undefined {
  const envMap: Record<ScoutApiEnvKey, string | undefined> = {
    VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
    VITE_LOOKUP_URL: import.meta.env.VITE_LOOKUP_URL,
    VITE_OPEN_WEB_SEARCH_URL: import.meta.env.VITE_OPEN_WEB_SEARCH_URL,
  };
  const value = envMap[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export const BACKEND_URL = getEnvValue('VITE_BACKEND_URL') ?? FALLBACK_BACKEND_URL;
export const LOOKUP_URL = getEnvValue('VITE_LOOKUP_URL') ?? FALLBACK_LOOKUP_URL;
export const OPEN_WEB_SEARCH_ENDPOINT =
  getEnvValue('VITE_OPEN_WEB_SEARCH_URL') ?? FALLBACK_OPEN_WEB_SEARCH_ENDPOINT;

export const FAKE_DOMAINS = [
  'ai.studio',
  'aistudio.google.com',
  'ai.google.dev',
  'vertexai.google.com',
  'generativelanguage.googleapis.com',
  'makersuite.google.com',
  'bard.google.com',
  'gemini.google.com',
  'g.co',
  'example.com',
  'exemplo.com',
  'confirmado',
  'auditoria',
  'fake-link.com',
];

export function isFakeUrl(url: string): boolean {
  if (!url) return true;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (FAKE_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return true;
    }

    return hostname.includes('google.com') && parsed.pathname.includes('/search');
  } catch {
    const lower = url.toLowerCase();
    return FAKE_DOMAINS.some(domain => lower.includes(domain)) || lower.includes('google.com/search');
  }
}
