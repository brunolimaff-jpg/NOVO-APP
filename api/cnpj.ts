import type { VercelRequest, VercelResponse } from '@vercel/node';
import { lookupCnpj, CnpjNotFoundError } from '../lib/cnpjLookup.js';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';

export const config = { runtime: 'nodejs' };

// Origens permitidas: domínio de produção + previews Vercel + dev local
const ALLOWED_ORIGINS = new Set([
  process.env.ALLOWED_ORIGIN,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  'https://scoutagro.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[]);

function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin ?? '';
  // Permite qualquer subdomínio *.vercel.app do projeto (previews de PR)
  const isVercelPreview = /^https:\/\/novo-app-[a-z0-9-]+-brunolimaff-jpg\.vercel\.app$/.test(origin);
  if (ALLOWED_ORIGINS.has(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = typeof req.query.cnpj === 'string' ? req.query.cnpj : '';
  const cnpj = normalizeCnpj(raw);
  const origin = req.headers.origin ?? '';
  const host = req.headers.host ?? '';

  console.info('[api/cnpj] request:start', {
    cnpj,
    origin,
    host,
    userAgent: req.headers['user-agent'] ?? '',
  });

  if (!isValidCnpj(cnpj)) {
    console.warn('[api/cnpj] request:invalid-cnpj', { cnpj, origin, host });
    return res.status(400).json({ error: 'CNPJ inválido — verifique os dígitos informados.' });
  }

  try {
    const data = await lookupCnpj(cnpj);
    console.info('[api/cnpj] request:success', {
      cnpj,
      sourceResult: {
        city: data.city,
        state: data.state,
        cnae: data.cnae,
      },
    });
    return res.status(200).json(data);
  } catch (err) {
    if (err instanceof CnpjNotFoundError) {
      console.warn('[api/cnpj] request:not-found', {
        cnpj,
        origin,
        host,
        message: err.message,
      });
      return res.status(404).json({ error: err.message });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/cnpj] request:error', {
      cnpj,
      origin,
      host,
      message: msg,
    });
    return res.status(503).json({
      error: 'Serviço de consulta de CNPJ temporariamente indisponível. Tente novamente em instantes.',
      detail: msg,
    });
  }
}
