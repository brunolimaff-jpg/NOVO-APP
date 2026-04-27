import { normalizeCnpj, formatCnpj, isValidCnpj } from '../utils/cnpj';

export { normalizeCnpj, formatCnpj, isValidCnpj };

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

function normalizeText(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

export async function fetchCompanyByCnpj(cnpjValue: string, signal?: AbortSignal): Promise<BrasilApiCompanyData> {
  const cnpj = normalizeCnpj(cnpjValue);
  if (!isValidCnpj(cnpj)) {
    throw new Error('CNPJ inválido');
  }

  const data = await fetchJsonWithTimeout<{
    cnpj: string;
    companyName: string;
    city: string;
    state: string;
    cnae?: string;
    cnaeDescricao?: string;
    error?: string;
  }>(`/api/cnpj?cnpj=${cnpj}`, 30000, signal);

  if (data.error) {
    throw new Error(data.error);
  }

  return {
    cnpj: data.cnpj,
    companyName: data.companyName,
    city: data.city,
    state: data.state,
    cnae: data.cnae,
    cnaeDescricao: data.cnaeDescricao,
  };
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
  }
}
