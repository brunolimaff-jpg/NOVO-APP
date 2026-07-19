import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SafePublicRequestError, requestPublicUrl, SAFE_PUBLIC_REQUEST_TIMEOUT_MS } from './_safe-public-request.js';

type ValidationState = 'valid' | 'broken' | 'unknown';

interface ValidationResult {
  status: ValidationState;
  httpStatus?: number;
  note?: string;
}

export const config = {
  runtime: 'nodejs',
};

const MAX_URLS_PER_REQUEST = 25;

async function checkUrl(url: string): Promise<ValidationResult> {
  try {
    const deadline = Date.now() + SAFE_PUBLIC_REQUEST_TIMEOUT_MS;
    let res = await requestPublicUrl(url, 'HEAD', { deadline });

    if (res.statusCode === 405 || res.statusCode === 403) {
      res = await requestPublicUrl(url, 'GET', { deadline });
    }

    if (res.statusCode >= 200 && res.statusCode < 400) {
      return { status: 'valid', httpStatus: res.statusCode };
    }

    if (res.statusCode === 404) {
      return { status: 'broken', httpStatus: 404, note: 'Link indisponível (404).' };
    }

    return {
      status: 'broken',
      httpStatus: res.statusCode,
      note: `Link indisponível (HTTP ${res.statusCode}).`,
    };
  } catch (error) {
    if (
      error instanceof SafePublicRequestError &&
      ['invalid_url', 'restricted_hostname', 'restricted_address'].includes(error.code)
    ) {
      return { status: 'unknown', note: 'URL inválida ou restrita para validação.' };
    }
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
