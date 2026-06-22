import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidPublicUrl } from '../utils/documentExtractor.js';

type ValidationState = 'valid' | 'broken' | 'unknown';

interface ValidationResult {
  status: ValidationState;
  httpStatus?: number;
  note?: string;
}

export const config = {
  runtime: 'nodejs',
};

const REQUEST_TIMEOUT_MS = 2500;
const MAX_URLS_PER_REQUEST = 25;

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

async function fetchUrlWithTimeout(
  url: string,
  method: 'HEAD' | 'GET',
  redirect: RequestRedirect = 'manual',
): Promise<Response> {
  const timeout = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect,
      signal: timeout.signal,
    });
  } finally {
    timeout.clear();
  }
}

const MAX_REDIRECT_HOPS = 3;

async function checkUrl(url: string): Promise<ValidationResult> {
  if (!isValidPublicUrl(url)) {
    return { status: 'unknown', note: 'URL inválida ou restrita para validação.' };
  }

  let effectiveUrl = url;
  let redirects = 0;

  try {
    let res = await fetchUrlWithTimeout(effectiveUrl, 'HEAD', 'manual');

    while (res.status >= 301 && res.status <= 308 && redirects < MAX_REDIRECT_HOPS) {
      const location = res.headers.get('location');
      if (!location || !isValidPublicUrl(location)) {
        return { status: 'unknown', note: 'Redirecionamento bloqueado por segurança (SSRF).' };
      }
      effectiveUrl = location;
      redirects++;
      res = await fetchUrlWithTimeout(effectiveUrl, 'HEAD', 'manual');
    }

    if (res.status === 405 || res.status === 403) {
      res = await fetchUrlWithTimeout(effectiveUrl, 'GET', 'manual');
    }

    if (res.status >= 200 && res.status < 400) {
      return { status: 'valid', httpStatus: res.status };
    }

    if (res.status === 404) {
      return { status: 'broken', httpStatus: 404, note: 'Link indisponível (404).' };
    }

    return {
      status: 'broken',
      httpStatus: res.status,
      note: `Link indisponível (HTTP ${res.status}).`,
    };
  } catch {
    return { status: 'unknown', note: 'Não foi possível validar agora; revisar manualmente.' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const sanitized = urls.filter((u: unknown): u is string => typeof u === 'string').slice(0, MAX_URLS_PER_REQUEST);

  const results: Record<string, ValidationResult> = {};
  const settled = await Promise.allSettled(sanitized.map((url: string) => checkUrl(url)));

  settled.forEach((result, index) => {
    const url = sanitized[index];
    if (!url) return;
    results[url] =
      result.status === 'fulfilled'
        ? result.value
        : { status: 'unknown', note: 'Não foi possível validar agora; revisar manualmente.' };
  });

  return res.status(200).json({ results });
}
