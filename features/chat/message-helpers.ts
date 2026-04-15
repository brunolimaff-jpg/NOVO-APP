import { extractCompanyName } from '../../utils/companyNameExtractor';
import { cleanTitle } from '../../utils/textCleaners';

const CONTINUITY_TARGET = 4;

export function isGenericCompanyLabel(value: string | null | undefined): boolean {
  const normalized = cleanTitle(value).trim();
  if (!normalized) return true;
  return /^(empresa|nova investiga[cç][aã]o|a empresa desta conversa|empresa n[aã]o identificada|prospect|companhia|grupo)$/i.test(
    normalized,
  );
}

export function pickCompanyLabel(...candidates: Array<string | null | undefined>): string {
  for (const value of candidates) {
    const raw = (value || '').trim();
    if (!raw) continue;

    const fromEmpresaField = raw.match(/(?:^|\n)\s*-\s*Empresa:\s*([^\n\r]+)/i)?.[1]?.trim();
    if (fromEmpresaField && !isGenericCompanyLabel(fromEmpresaField)) {
      return cleanTitle(fromEmpresaField);
    }

    const fromDossieBracket = raw.match(/dossi[êe]\s+completo\s+de\s*\[([^\]]+)\]/i)?.[1]?.trim();
    if (fromDossieBracket && !isGenericCompanyLabel(fromDossieBracket)) {
      return cleanTitle(fromDossieBracket);
    }

    const extracted = cleanTitle(extractCompanyName(raw));
    if (
      extracted &&
      !isGenericCompanyLabel(extracted) &&
      extracted.length <= 80 &&
      !/investigacao_completa_integrada|protocolo de investiga|contexto cadastral obrigat/i.test(extracted)
    ) {
      return extracted;
    }
  }

  return '';
}

export function resolveHintedCompany(
  sessionEmpresaAlvo: string | null | undefined,
  safeVisibleText: string,
): string | null {
  if (sessionEmpresaAlvo && !isGenericCompanyLabel(sessionEmpresaAlvo)) return sessionEmpresaAlvo;

  const extracted = cleanTitle(extractCompanyName(safeVisibleText));
  if (extracted && !isGenericCompanyLabel(extracted)) return extracted;

  const fromEmpresaField = safeVisibleText.match(/(?:^|\n)\s*-\s*Empresa:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (fromEmpresaField && !isGenericCompanyLabel(fromEmpresaField)) return cleanTitle(fromEmpresaField);

  const trimmed = safeVisibleText.trim();
  if (
    trimmed.length > 0 &&
    trimmed.length <= 60 &&
    !trimmed.includes('\n') &&
    !isGenericCompanyLabel(trimmed)
  ) {
    return trimmed;
  }

  return null;
}

export function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message?.includes('aborted');
}

function normalizeContinuitySuggestion(raw: string): string {
  const normalized = (raw || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.endsWith('?') ? normalized : `${normalized}?`;
}

function buildContinuitySuggestionsFallback(companyName?: string | null): string[] {
  const companyReference = (companyName || '').trim() || 'a operação';
  return [
    `Qual gargalo em ${companyReference} já está consumindo margem e segue tratado como rotina?`,
    `Que decisão crítica em ${companyReference} continua travada por falta de dados confiáveis?`,
    `Onde ${companyReference} ainda depende de planilhas e amplia risco operacional sem reação executiva?`,
    `Se nada mudar em ${companyReference} nos próximos 90 dias, qual ruptura tende a aparecer primeiro?`,
  ];
}

export function ensureContinuitySuggestions(
  suggestions: string[] | null | undefined,
  companyName?: string | null,
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();

  const pushIfValid = (value: string) => {
    const normalized = normalizeContinuitySuggestion(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(normalized);
  };

  (Array.isArray(suggestions) ? suggestions : []).forEach(pushIfValid);

  if (unique.length < CONTINUITY_TARGET) {
    buildContinuitySuggestionsFallback(companyName).forEach(pushIfValid);
  }

  return unique.slice(0, CONTINUITY_TARGET);
}
