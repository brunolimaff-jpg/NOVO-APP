import { extractCompanyName } from './companyNameExtractor';
import { cleanTitle } from './textCleaners';

export { ensureContinuitySuggestions } from './continuitySuggestions';

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
