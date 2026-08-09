import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.js';
import { resolveCanonicalAccount } from '../services/llm/gold/canonical/canonical-resolver.js';
import { cacheHeaders } from './_cache-headers.js';
import { applyCors } from './_cors-headers.js';

/**
 * BRU-33 — Canonical Gold em fronteira server-side segura.
 *
 * Reproduz a MESMA qualidade de identidade canônica da V6 (matriz/filial real,
 * head office, sócios PJ com CNPJ completo, pessoas físicas sem CPF) usando o
 * resolver determinístico extraído do harness. Nenhuma heurística "0001 =>
 * Matriz" no browser — o caso Scheffer provou que ela é falsa.
 * Nenhuma chave/segredo atravessa o cliente.
 */
export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = typeof req.query.cnpj === 'string' ? req.query.cnpj : '';
  const cnpj = normalizeCnpj(raw);
  const companyName = typeof req.query.companyName === 'string' ? req.query.companyName : '';
  const origin = req.headers.origin ?? '';
  const host = req.headers.host ?? '';

  console.warn('[api/gold-canonical] request:start', { cnpj, origin, host });

  if (!isValidCnpj(cnpj)) {
    console.warn('[api/gold-canonical] request:invalid-cnpj', { cnpj, origin, host });
    return res.status(400).json({ error: 'CNPJ inválido — verifique os dígitos informados.' });
  }

  try {
    const canonical = await resolveCanonicalAccount(cnpj, companyName);
    if (!canonical) {
      console.warn('[api/gold-canonical] request:not-resolved', { cnpj, origin, host });
      return res.status(404).json({ error: 'Canonical não resolvível para o CNPJ informado.' });
    }
    res.setHeader('Cache-Control', cacheHeaders(3600)['Cache-Control']);
    console.warn('[api/gold-canonical] request:success', {
      cnpj,
      establishmentType: canonical.establishmentType,
      rootCnpj: canonical.rootCnpj,
      headOfficeCnpj: canonical.headOfficeCnpj ?? null,
      directPjPartnersCount: canonical.directPjPartners.length,
      qsaPeopleCount: canonical.qsaPeople.length,
    });
    return res.status(200).json(canonical);
  } catch (err) {
    console.error('[api/gold-canonical] request:error', {
      cnpj,
      error: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({ error: 'Falha ao resolver canonical.' });
  }
}
