import { normalizeCnpj } from '../utils/cnpj.js';

export type CnpjPartnerSource = 'BrasilAPI' | 'CNPJ.ws' | 'MinhaReceita';
export type CnpjPartnerConfidence = 'official';

export interface CnpjPartner {
  name?: string;
  role?: string;
  document?: string;
  source: CnpjPartnerSource;
  confidence: CnpjPartnerConfidence;
}

export interface CnpjResult {
  cnpj: string;
  companyName: string;
  city: string;
  state: string;
  cnae?: string;
  cnaeDescricao?: string;
  qsa?: CnpjPartner[];
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

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readText(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    return text || undefined;
  }

  if (isRecord(value)) {
    return readText(value.descricao) || readText(value.nome) || readText(value.role);
  }

  return undefined;
}

function pickText(payload: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = readText(payload[key]);
    if (text) return text;
  }
  return undefined;
}

function pickPublicDocument(payload: UnknownRecord, keys: string[]): string | undefined {
  const document = pickText(payload, keys);
  if (!document) return undefined;

  const digits = document.replace(/\D/g, '');
  const isMasked = document.includes('*');
  const hasFullSensitiveId = digits.length === 11 || digits.length === 14;
  return isMasked || !hasFullSensitiveId ? document : undefined;
}

function mapPartners(items: unknown, source: CnpjPartnerSource): CnpjPartner[] | undefined {
  if (!Array.isArray(items)) return undefined;

  const partners = items.flatMap((item): CnpjPartner[] => {
    if (!isRecord(item)) return [];

    const partner: CnpjPartner = {
      name: pickText(item, ['nome_socio', 'nome', 'razao_social']),
      role: pickText(item, ['qualificacao_socio', 'qualificacao', 'cargo']),
      document: pickPublicDocument(item, ['documento_socio', 'cpf_cnpj_socio', 'cnpj_cpf_socio', 'cpf_cnpj', 'documento']),
      source,
      confidence: 'official',
    };

    return partner.name || partner.role || partner.document ? [partner] : [];
  });

  return partners.length > 0 ? partners : undefined;
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
    qsa: mapPartners(p.qsa, 'BrasilAPI'),
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
    qsa: mapPartners(p.socios, 'CNPJ.ws'),
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
    qsa: mapPartners(p.qsa || p.socios, 'MinhaReceita'),
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
