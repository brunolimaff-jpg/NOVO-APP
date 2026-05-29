import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidPublicUrl } from '../utils/documentExtractor.js';
import { setSecurityHeaders } from './_security-headers.js';

type ValidationState = 'valid' | 'broken' | 'unknown';

interface ValidationResult {
  status: ValidationState;
  httpStatus?: number;
  note?: string;
}

export const config = {
  runtime: 'nodejs',
};

const REQUEST_TIMEOUT_MS = 5000;
const MAX_URLS_PER_REQUEST = 25;

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function checkUrl(url: string): Promise<ValidationResult> {
  // isValidPublicUrl bloqueia localhost, 127.0.0.1, 169.254.169.254 (AWS metadata),
  // ranges privados (10.x, 172.16-31.x, 192.168.x), .local, .internal
  if (!isValidPublicUrl(url)) {
    return { status: 'unknown', note: 'URL inválida ou restrita para validação.' };
  }

  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: withTimeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: withTimeout(REQUEST_TIMEOUT_MS),
      });
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
  setSecurityHeaders(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const sanitized = urls.filter((u: unknown): u is string => typeof u === 'string').slice(0, MAX_URLS_PER_REQUEST);

  const results: Record<string, ValidationResult> = {};
  await Promise.all(
    sanitized.map(async (url: string) => {
      results[url] = await checkUrl(url);
    }),
  );

  return res.status(200).json({ results });
}
