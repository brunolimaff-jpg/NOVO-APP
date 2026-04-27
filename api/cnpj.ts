import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

interface CnpjResult {
  cnpj: string;
  companyName: string;
  city: string;
  state: string;
  cnae?: string;
  cnaeDescricao?: string;
}

interface CacheEntry {
  data: CnpjResult;
  expiresAt: number;
}

// In-memory cache de instância — best-effort, 7 dias
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCached(cnpj: string): CnpjResult | null {
  const entry = cache.get(cnpj);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cnpj);
    return null;
  }
  return entry.data;
}

function setCache(cnpj: string, data: CnpjResult): void {
  cache.set(cnpj, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── Fonte 1: BrasilAPI ────────────────────────────────────────────────────────
async function fromBrasilApi(cnpj: string): Promise<CnpjResult> {
  const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, 8000);
  if (!res.ok) throw new Error(`BrasilAPI HTTP ${res.status}`);
  const p = await res.json();
  const companyName = (p.nome_fantasia || p.razao_social || '').trim();
  const city = (p.municipio || '').trim();
  const state = (p.uf || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new Error('BrasilAPI: dados incompletos');
  return {
    cnpj,
    companyName,
    city,
    state,
    cnae: p.cnae_fiscal ? String(p.cnae_fiscal) : undefined,
    cnaeDescricao: p.cnae_fiscal_descricao || undefined,
  };
}

// ── Fonte 2: CNPJ.ws ──────────────────────────────────────────────────────────
async function fromCnpjWs(cnpj: string): Promise<CnpjResult> {
  const res = await fetchWithTimeout(`https://publica.cnpj.ws/cnpj/${cnpj}`, 10000);
  if (!res.ok) throw new Error(`CNPJ.ws HTTP ${res.status}`);
  const p = await res.json();
  const est = p.estabelecimento ?? {};
  const companyName = (est.nome_fantasia || p.razao_social || '').trim();
  const city = (est.municipio?.nome || '').trim();
  const state = (est.estado?.sigla || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new Error('CNPJ.ws: dados incompletos');
  return {
    cnpj,
    companyName,
    city,
    state,
    cnae: est.cnae_fiscal?.subclasse || undefined,
    cnaeDescricao: est.cnae_fiscal?.descricao || undefined,
  };
}

// ── Fonte 3: Minha Receita ────────────────────────────────────────────────────
async function fromMinhaReceita(cnpj: string): Promise<CnpjResult> {
  const res = await fetchWithTimeout(`https://minhareceita.org/${cnpj}`, 10000);
  if (!res.ok) throw new Error(`MinhaReceita HTTP ${res.status}`);
  const p = await res.json();
  const companyName = (p.nome_fantasia || p.razao_social || '').trim();
  const city = (p.municipio || '').trim();
  const state = (p.uf || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new Error('MinhaReceita: dados incompletos');
  return {
    cnpj,
    companyName,
    city,
    state,
    cnae: p.cnae_fiscal ? String(p.cnae_fiscal) : undefined,
    cnaeDescricao: p.cnae_fiscal_descricao || undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = typeof req.query.cnpj === 'string' ? req.query.cnpj : '';
  const cnpj = raw.replace(/\D/g, '');

  if (cnpj.length !== 14) {
    return res.status(400).json({ error: 'CNPJ inválido — informe 14 dígitos.' });
  }

  const cached = getCached(cnpj);
  if (cached) {
    return res.status(200).json(cached);
  }

  const sources: Array<{ name: string; fn: () => Promise<CnpjResult> }> = [
    { name: 'BrasilAPI', fn: () => fromBrasilApi(cnpj) },
    { name: 'CNPJ.ws',   fn: () => fromCnpjWs(cnpj) },
    { name: 'MinhaReceita', fn: () => fromMinhaReceita(cnpj) },
  ];

  const errors: string[] = [];

  for (const source of sources) {
    try {
      const data = await source.fn();
      setCache(cnpj, data);
      return res.status(200).json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${source.name}: ${msg}`);
      console.error(`[api/cnpj] falha em ${source.name} para ${cnpj}:`, msg);
    }
  }

  console.error(`[api/cnpj] todas as fontes falharam para ${cnpj}:`, errors);
  return res.status(503).json({
    error: 'Serviço de consulta de CNPJ temporariamente indisponível. Tente novamente em instantes.',
    detail: errors,
  });
}
