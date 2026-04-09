export interface BrasilApiCompanyData {
  cnpj: string;
  companyName: string;
  city: string;
  state: string;
  cnae?: string;
  cnaeDescricao?: string;
}

export interface CityValidationResult {
  normalizedCity: string;
  normalizedState: string;
  isValid: boolean;
}

function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '');
}

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  const finalController = new AbortController();
  const onAbort = () => finalController.abort();
  timeoutController.signal.addEventListener('abort', onAbort);
  if (signal) {
    if (signal.aborted) {
      finalController.abort();
    } else {
      signal.addEventListener('abort', onAbort);
    }
  }

  try {
    const response = await fetch(url, { method: 'GET', signal: finalController.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
    timeoutController.signal.removeEventListener('abort', onAbort);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export function normalizeCnpj(value: string): string {
  return onlyDigits(value).slice(0, 14);
}

export function formatCnpj(value: string): string {
  const digits = normalizeCnpj(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDigit = (base: string, factors: number[]): number => {
    const total = base
      .split('')
      .reduce((sum, char, idx) => sum + Number(char) * factors[idx], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const d1 = calcDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDigit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${d1}${d2}`);
}

export async function fetchCompanyByCnpj(cnpjValue: string, signal?: AbortSignal): Promise<BrasilApiCompanyData> {
  const cnpj = normalizeCnpj(cnpjValue);
  if (!isValidCnpj(cnpj)) {
    throw new Error('CNPJ inválido');
  }

  const parsePayload = (payload: {
    cnpj?: string;
    razao_social?: string;
    nome_fantasia?: string;
    municipio?: string;
    uf?: string;
    cnae_fiscal?: number | string;
    cnae_fiscal_descricao?: string;
  }): BrasilApiCompanyData => {
    const companyName = (payload.nome_fantasia || payload.razao_social || '').trim();
    const city = (payload.municipio || '').trim();
    const state = (payload.uf || '').trim().toUpperCase();

    if (!companyName || !city || !state) {
      throw new Error('Dados incompletos');
    }

    return {
      cnpj: payload.cnpj ? normalizeCnpj(payload.cnpj) : cnpj,
      companyName,
      city,
      state,
      cnae: payload.cnae_fiscal ? String(payload.cnae_fiscal) : undefined,
      cnaeDescricao: payload.cnae_fiscal_descricao || undefined,
    };
  };

  try {
    const brasilApiPayload = await fetchJsonWithTimeout<{
      cnpj?: string;
      razao_social?: string;
      nome_fantasia?: string;
      municipio?: string;
      uf?: string;
      cnae_fiscal?: number | string;
      cnae_fiscal_descricao?: string;
    }>(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, 8000, signal);
    return parsePayload(brasilApiPayload);
  } catch {
    // Fallback: ReceitaWS
    const receitaPayload = await fetchJsonWithTimeout<{
      cnpj?: string;
      nome?: string;
      fantasia?: string;
      municipio?: string;
      uf?: string;
      status?: string;
      message?: string;
    }>(`https://www.receitaws.com.br/v1/cnpj/${cnpj}`, 10000, signal);

    if (receitaPayload.status && receitaPayload.status.toUpperCase() === 'ERROR') {
      throw new Error(receitaPayload.message || 'Falha no fallback ReceitaWS');
    }

    return parsePayload({
      cnpj: receitaPayload.cnpj,
      razao_social: receitaPayload.nome,
      nome_fantasia: receitaPayload.fantasia,
      municipio: receitaPayload.municipio,
      uf: receitaPayload.uf,
    });
  }
}

export async function validateCityInState(cityValue: string, ufValue: string, signal?: AbortSignal): Promise<CityValidationResult> {
  const normalizedState = (ufValue || '').trim().toUpperCase();
  const city = (cityValue || '').trim();
  if (city.length < 2 || normalizedState.length !== 2) {
    return { normalizedCity: city, normalizedState, isValid: false };
  }

  try {
    const payload = await fetchJsonWithTimeout<Array<{ nome: string }>>(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${normalizedState}/municipios`,
      12000,
      signal,
    );
    const target = normalizeText(city);
    const found = payload.find(item => normalizeText(item.nome) === target);
    return {
      normalizedCity: found?.nome || city,
      normalizedState,
      isValid: !!found,
    };
  } catch {
    // Em caso de indisponibilidade do IBGE, não bloquear o fluxo do usuário.
    return {
      normalizedCity: city,
      normalizedState,
      isValid: true,
    };
  };
}
