/**
 * BRU-33 — Resolver canônico determinístico (extraído da V6 Shadow).
 *
 * Fronteira SERVER-SIDE segura: reproduz exatamente a qualidade de identidade
 * canônica que sustentou a V6 (matriz/filial real, head office, sócios PJ com
 * CNPJ completo, pessoas físicas sem CPF). NUNCA inferir "0001 => Matriz" —
 * o caso Scheffer (04.733.767/0001-80 = Filial) provou que essa heurística é
 * falsa. Sem Keychain, sem process.env privado, sem Brave: apenas fetch
 * público BrasilAPI/CNPJ.ws + montagem pura.
 *
 * O harness Shadow (upstream-provider) importa daqui — direção permitida
 * (shadow → shared); o runtime NUNCA importa de shadow/.
 */
import type { CanonicalAccount } from '../gold-contracts';

export interface BrasilApiCadastro {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnae_fiscal_descricao?: string;
  descricao_situacao_cadastral?: string;
  identificador_matriz_filial?: number | string;
  /** CNPJ da matriz quando a fonte fornecer (BrasilAPI/CNPJ.ws não expõem —
   *  fica ausente; NUNCA inferir por heurística de sufixo). */
  headOfficeCnpj?: string | null;
  qsa?: Array<{
    nome_socio?: string;
    qualificacao_socio?: string;
    cnpj_cpf_do_socio?: string;
  }>;
}

function normalizeCnpj(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

function formatCnpj(digits: string): string {
  const d = digits.replace(/[^\d]/g, '');
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Dados cadastrais reais: BrasilAPI (primária) com fallback CNPJ.ws. */
export async function fetchCnpjData(cnpjDigits: string): Promise<BrasilApiCadastro> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
      headers: { 'User-Agent': 'Scout360/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return res.json() as Promise<BrasilApiCadastro>;
  } catch {
    // fallback abaixo
  }
  const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjDigits}`, {
    headers: { 'User-Agent': 'Scout360/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res2.ok) throw new Error(`CNPJ.ws HTTP ${res2.status}`);
  const d = (await res2.json()) as Record<string, unknown>;
  const estabelecimento = (d.estabelecimento || {}) as Record<string, unknown>;
  const qsaRaw = (d.socios || d.qsa || d.socios_pj || []) as Array<{
    nome?: string;
    nome_socio?: string;
    qualificacao?: string;
    qualificacao_socio?: string;
    cnpj_cpf_do_socio?: string;
    cnpj?: string;
  }>;
  const matrizFilial =
    d.identificador_matriz_filial ??
    estabelecimento.matriz_filial ??
    ((d.estabelecimento as Record<string, unknown>)?.matriz_filial === 1 ? 1 : 2);
  return {
    cnpj: (d.cnpj as string) || cnpjDigits,
    razao_social: (d.razao_social as string) || (d.razaoSocial as string) || '',
    nome_fantasia: (d.nome_fantasia as string) || (d.nomeFantasia as string) || '',
    cnae_fiscal_descricao:
      ((d.cnae_fiscal as Record<string, unknown>)?.descricao as string) || (d.cnae_fiscal_descricao as string) || '',
    descricao_situacao_cadastral:
      (d.situacao_cadastral as string) || ((d.situacao as Record<string, unknown>)?.descricao as string) || '',
    identificador_matriz_filial: matrizFilial as number | string,
    qsa: qsaRaw.map(s => ({
      nome_socio: s.nome_socio || s.nome || '',
      qualificacao_socio: s.qualificacao_socio || s.qualificacao || 'Sócio',
      cnpj_cpf_do_socio: s.cnpj_cpf_do_socio || s.cnpj || '',
    })),
  };
}

/**
 * Monta o CanonicalAccount a partir do cadastro bruto (determinístico).
 * Sócios PJ (CNPJ completo de 14 dígitos) → directPjPartners; pessoas
 * físicas (CPF mascarado) → qsaPeople (mapa de acesso, NUNCA CPF).
 */
export function buildCanonicalFromBrasilApi(
  cad: BrasilApiCadastro,
  fallbackCompanyName: string,
): CanonicalAccount {
  const isFilial = String(cad.identificador_matriz_filial) === '2';
  const directPjPartners: Array<{ legalName: string; cnpj: string }> = [];
  const qsaPeople: Array<{ name: string; role: string }> = [];
  for (const q of cad.qsa || []) {
    const doc = normalizeCnpj(q.cnpj_cpf_do_socio || '');
    const isPj = doc.length === 14 && !String(q.cnpj_cpf_do_socio || '').includes('*');
    if (isPj && q.nome_socio) {
      directPjPartners.push({ legalName: q.nome_socio, cnpj: formatCnpj(doc) });
    } else if (q.nome_socio) {
      qsaPeople.push({ name: q.nome_socio, role: q.qualificacao_socio || 'Sócio' });
    }
  }
  return {
    inputCnpj: cad.cnpj,
    legalName: cad.razao_social || fallbackCompanyName,
    establishmentType: isFilial ? 'Filial' : 'Matriz',
    rootCnpj: (cad.cnpj || '').replace(/[^\d]/g, '').slice(0, 8),
    // Preservado APENAS quando a fonte fornece. Nunca inferir "0001 => Matriz"
    // (caso Scheffer: 04.733.767/0001-80 é Filial, matriz é 0014-03).
    headOfficeCnpj: cad.headOfficeCnpj || null,
    headOfficeLegalName: null,
    directPjPartners,
    qsaPeople: qsaPeople.slice(0, 10),
  };
}

/**
 * Resolve o canonical completo a partir do cadastro real. Retorna null se o
 * CNPJ não for resolvível (fallback fail-closed). headOffice é preservado
 * somente quando a fonte o fornece.
 */
export async function resolveCanonicalAccount(
  cnpj: string,
  companyName: string,
): Promise<CanonicalAccount | null> {
  try {
    const cnpjDigits = normalizeCnpj(cnpj);
    if (cnpjDigits.length !== 14) return null;
    const cad = await fetchCnpjData(cnpjDigits);
    return buildCanonicalFromBrasilApi(cad, companyName);
  } catch {
    return null;
  }
}
