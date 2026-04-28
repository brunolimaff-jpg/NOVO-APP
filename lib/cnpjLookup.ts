import { normalizeCnpj } from '../utils/cnpj.js';

export interface CnpjResult {
  cnpj: string;
  companyName: string;
  city: string;
  state: string;
  cnae?: string;
  cnaeDescricao?: string;
}

export class CnpjNotFoundError extends Error {
  constructor(cnpj: string) {
    super(`CNPJ ${cnpj} não encontrado na base da Receita Federal.`);
    this.name = 'CnpjNotFoundError';
  }
}

class CnpjSourceError extends Error {
  constructor(message: string, public readonly notFound: boolean) {
    super(message);
  }
}

// ── Cache com limite de 1000 entradas (evict-oldest) ─────────────────────────
interface CacheEntry { data: CnpjResult; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX = 1000;

function getCached(cnpj: string): CnpjResult | null {
  const entry = cache.get(cnpj);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(cnpj); return null; }
  return entry.data;
}

function setCache(cnpj: string, data: CnpjResult): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cnpj, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Fetch helper ──────────────────────────────────────────────────────────────
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
  if (res.status === 404) throw new CnpjSourceError('BrasilAPI: não encontrado', true);
  if (!res.ok) throw new CnpjSourceError(`BrasilAPI HTTP ${res.status}`, false);
  const p = await res.json();
  const companyName = (p.nome_fantasia || p.razao_social || '').trim();
  const city = (p.municipio || '').trim();
  const state = (p.uf || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new CnpjSourceError('BrasilAPI: dados incompletos', false);
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
  if (res.status === 404) throw new CnpjSourceError('CNPJ.ws: não encontrado', true);
  if (!res.ok) throw new CnpjSourceError(`CNPJ.ws HTTP ${res.status}`, false);
  const p = await res.json();
  const est = p.estabelecimento ?? {};
  const companyName = (est.nome_fantasia || p.razao_social || '').trim();
  const city = (est.cidade?.nome || '').trim();
  const state = (est.estado?.sigla || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new CnpjSourceError('CNPJ.ws: dados incompletos', false);
  return {
    cnpj,
    companyName,
    city,
    state,
    cnae: est.atividade_principal?.subclasse || undefined,
    cnaeDescricao: est.atividade_principal?.descricao || undefined,
  };
}

// ── Fonte 3: Minha Receita ────────────────────────────────────────────────────
async function fromMinhaReceita(cnpj: string): Promise<CnpjResult> {
  const res = await fetchWithTimeout(`https://minhareceita.org/${cnpj}`, 10000);
  if (res.status === 404) throw new CnpjSourceError('MinhaReceita: não encontrado', true);
  if (!res.ok) throw new CnpjSourceError(`MinhaReceita HTTP ${res.status}`, false);
  const p = await res.json();
  const companyName = (p.nome_fantasia || p.razao_social || '').trim();
  const city = (p.municipio || '').trim();
  const state = (p.uf || '').trim().toUpperCase();
  if (!companyName || !city || !state) throw new CnpjSourceError('MinhaReceita: dados incompletos', false);
  return {
    cnpj,
    companyName,
    city,
    state,
    cnae: p.cnae_fiscal ? String(p.cnae_fiscal) : undefined,
    cnaeDescricao: p.cnae_fiscal_descricao || undefined,
  };
}

// ── Lookup principal ──────────────────────────────────────────────────────────
export async function lookupCnpj(cnpjValue: string): Promise<CnpjResult> {
  const cnpj = normalizeCnpj(cnpjValue);

  const cached = getCached(cnpj);
  if (cached) return cached;

  const sources = [
    { name: 'CNPJ.ws',      fn: () => fromCnpjWs(cnpj) },
    { name: 'MinhaReceita', fn: () => fromMinhaReceita(cnpj) },
    { name: 'BrasilAPI',    fn: () => fromBrasilApi(cnpj) },
  ];

  const errors: Array<{ notFound: boolean; msg: string }> = [];

  for (const source of sources) {
    try {
      const data = await source.fn();
      setCache(cnpj, data);
      return data;
    } catch (err) {
      const notFound = err instanceof CnpjSourceError ? err.notFound : false;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ notFound, msg: `${source.name}: ${msg}` });
      console.error(`[cnpjLookup] falha em ${source.name} para ${cnpj}:`, msg);
    }
  }

  // Se todas as fontes retornaram 404, o CNPJ genuinamente não existe
  if (errors.every(e => e.notFound)) {
    throw new CnpjNotFoundError(cnpj);
  }

  console.error(`[cnpjLookup] todas as fontes falharam para ${cnpj}:`, errors.map(e => e.msg));
  throw new Error(errors.map(e => e.msg).join('; '));
}
