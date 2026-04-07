import type { LookupResponse } from '../services/clientLookupService';
import type { ClienteSeniorData, MatchType } from '../types';

const COMPETITOR_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'TOTVS', regex: /\b(?:totvs|protheus|datasul|microsiga)\b/i },
  { label: 'SAP', regex: /\b(?:sap|s\/4hana|business one|businessone)\b/i },
];

export function extractClienteSeniorData(lookup?: LookupResponse | null): ClienteSeniorData | undefined {
  if (!lookup?.encontrado || !lookup.results?.length) return undefined;

  const primary = lookup.results[0];
  const matchType = inferClienteMatchType(lookup, primary);
  return {
    encontrado: matchType === 'exact',
    matchType,
    grupo: primary.grupo,
    totalModulos: primary.total_modulos,
    familias: primary.familias_presentes,
    modulosPorFamilia: primary.modulos_por_familia,
  };
}

function normalizeComparableText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferClienteMatchType(
  lookup: LookupResponse,
  primary: LookupResponse['results'][number],
): MatchType {
  if (primary.matchType) return primary.matchType;

  const normalizedQuery = normalizeComparableText(lookup.query || '');
  if (!normalizedQuery) return 'broad';

  const labels = [primary.grupo, ...(primary.razoes_sociais || [])]
    .map(label => normalizeComparableText(label))
    .filter(Boolean);

  if (labels.some(label => label === normalizedQuery || label.includes(normalizedQuery))) {
    return 'exact';
  }

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const hasAllTokens = labels.some(label => queryTokens.every(token => label.includes(token)));
  if (hasAllTokens) return 'partial';

  return labels.some(label => queryTokens.some(token => label.includes(token))) ? 'broad' : 'broad';
}

export function buildSeniorEvidenceContext(companyName: string, clienteSeniorData?: ClienteSeniorData): string {
  if (!clienteSeniorData?.encontrado) return '';

  const companyLabel = companyName?.trim() || clienteSeniorData.grupo || 'empresa analisada';
  const families = clienteSeniorData.familias?.filter(Boolean).join(', ') || 'Famílias não detalhadas';
  const totalModulos = clienteSeniorData.totalModulos ?? 'não informado';

  return `
[EVIDÊNCIA CRM INTERNO SENIOR — PRIORIDADE MÁXIMA]
- ${companyLabel} é cliente Senior confirmado no CRM interno.
- Total de módulos contratados: ${totalModulos}.
- Famílias confirmadas: ${families}.

[REGRAS OBRIGATÓRIAS DE NARRATIVA]
- Não trate TOTVS ou SAP como ERP core principal sem prova mais forte que o CRM interno.
- Se houver sinais públicos de TOTVS ou SAP, trate como legado, satélite ou convivência.
- Direcione a tese comercial para expansão, cross-sell, consolidação, integração ou governança.
- É proibido escrever que a conta é ERP virgem quando o CRM interno confirma relacionamento Senior.
  `.trim();
}

export function appendSeniorEvidenceNote(
  text: string,
  companyName: string,
  clienteSeniorData?: ClienteSeniorData,
): string {
  const trimmed = text.trim();
  if (!clienteSeniorData?.encontrado || !trimmed) return trimmed;
  if (/##\s*🔒\s*Nota de consist[eê]ncia comercial/i.test(trimmed)) return trimmed;

  const competitorMentions = COMPETITOR_PATTERNS
    .filter(({ regex }) => regex.test(trimmed))
    .map(({ label }) => label);

  if (competitorMentions.length === 0) return trimmed;

  const companyLabel = companyName?.trim() || clienteSeniorData.grupo || 'A empresa analisada';
  const uniqueMentions = [...new Set(competitorMentions)].join(' e ');
  const totalModulos = clienteSeniorData.totalModulos ?? 'múltiplos';

  return `${trimmed}

---
## 🔒 Nota de consistência comercial
A base interna Senior confirma ${companyLabel} como cliente Senior com ${totalModulos} módulos contratados. Menções a ${uniqueMentions} neste dossiê devem ser lidas como legado, satélite ou convivência, não como ERP core principal sem evidência superior ao CRM interno.`;
}
