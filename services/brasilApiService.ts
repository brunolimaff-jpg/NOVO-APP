import { normalizeCnpj, formatCnpj, isValidCnpj } from '../utils/cnpj';
import { scoutDiag } from '../utils/diagnosticLog';
import type { CnpjPartner } from '../lib/cnpjLookup';

export { normalizeCnpj, formatCnpj, isValidCnpj };

export interface BrasilApiCompanyData {
  cnpj: string;
  companyName: string;
  city: string;
  state: string;
  cnae?: string;
  cnaeDescricao?: string;
  qsa?: CnpjPartner[];
}

export interface CityValidationResult {
  normalizedCity: string;
  normalizedState: string;
  isValid: boolean;
}

const LOCAL_DEV_CNPJ_API_ENDPOINT = ((import.meta.env.VITE_CNPJ_PROXY_URL as string | undefined) || '').replace(/\/$/, '');

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
    const contentType = response.headers.get('content-type') || '';
    const rawBody = await response.text();

    if (!response.ok) {
      let errorMessage = rawBody.trim();
      if (contentType.includes('application/json')) {
        try {
          const payload = JSON.parse(rawBody) as { error?: string; detail?: string; message?: string };
          errorMessage = payload.error || payload.detail || payload.message || rawBody.trim();
        } catch {
          // usa o corpo bruto como fallback
        }
      }

      throw new Error(`HTTP ${response.status}${errorMessage ? `: ${errorMessage}` : ''}`);
    }

    try {
      return JSON.parse(rawBody) as T;
    } catch {
      const isHtmlDocument = contentType.includes('text/html') || /^\s*<!doctype html/i.test(rawBody);
      const isLocalDevHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

      if (isHtmlDocument && isLocalDevHost && url.includes('/api/cnpj')) {
        throw new Error('Local dev sem proxy para /api/cnpj. Rode via vercel dev ou configure VITE_CNPJ_PROXY_URL.');
      }

      const preview = rawBody.slice(0, 140).replace(/\s+/g, ' ').trim();
      throw new Error(
        `Invalid JSON response from ${url} (content-type: ${contentType || 'unknown'})${preview ? `: ${preview}` : ''}`,
      );
    }
  } finally {
    clearTimeout(timeoutId);
    timeoutController.signal.removeEventListener('abort', onAbort);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

export function resolveCnpjApiEndpoint(
  hostname: string = typeof window !== 'undefined' ? window.location.hostname : '',
  isDev: boolean = import.meta.env.DEV,
): string {
  const isLocalDevHost = hostname === 'localhost' || hostname === '127.0.0.1';
  return isDev && isLocalDevHost && LOCAL_DEV_CNPJ_API_ENDPOINT ? LOCAL_DEV_CNPJ_API_ENDPOINT : '/api/cnpj';
}

export async function fetchCompanyByCnpj(cnpjValue: string, signal?: AbortSignal): Promise<BrasilApiCompanyData> {
  const cnpj = normalizeCnpj(cnpjValue);
  if (!isValidCnpj(cnpj)) {
    throw new Error('CNPJ inválido');
  }

  const endpoint = `${resolveCnpjApiEndpoint()}?cnpj=${cnpj}`;
  const timer = scoutDiag.startTimer('CnpjLookup', `fetchCompanyByCnpj:${cnpj}`);
  scoutDiag.info('CnpjLookup', 'iniciando lookup de CNPJ', {
    cnpj,
    endpoint,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'server',
    isDev: import.meta.env.DEV,
  });

  try {
    const data = await fetchJsonWithTimeout<{
      cnpj: string;
      companyName: string;
      city: string;
      state: string;
      cnae?: string;
      cnaeDescricao?: string;
      qsa?: CnpjPartner[];
      error?: string;
    }>(endpoint, 30000, signal);

    if (data.error) {
      throw new Error(data.error);
    }

    timer.end({
      endpoint,
      city: data.city,
      state: data.state,
      cnae: data.cnae,
    });

    return {
      cnpj: data.cnpj,
      companyName: data.companyName,
      city: data.city,
      state: data.state,
      cnae: data.cnae,
      cnaeDescricao: data.cnaeDescricao,
      qsa: data.qsa,
    };
  } catch (error) {
    timer.fail(error);
    scoutDiag.error('CnpjLookup', 'falha no lookup de CNPJ', {
      cnpj,
      endpoint,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
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
  }
}
