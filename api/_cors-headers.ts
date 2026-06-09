import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ALLOWED_ORIGINS } from './_allowed-origins.js';

/**
 * Aplica headers CORS na resposta.
 * Usar em rotas que precisam de acesso cross-origin (chamadas do frontend).
 */
export function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin ?? '';
  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);

  if (ALLOWED_ORIGINS.has(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
  );
}
