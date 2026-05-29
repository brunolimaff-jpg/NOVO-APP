import type { LookupResponse } from '../services/clientLookupService';
import type { ClienteSeniorData, MatchType } from '../types';

const COMPETITOR_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'TOTVS', regex: /\b(?:totvs|protheus|datasul|microsiga)\b/i },
  { label: 'SAP', regex: /\b(?:sap|s\/4hana|business one|businessone)\b/i },
];

const CORE_FAMILIES = ['ERP', 'HCM', 'GATec', 'Logística'];

function normalizeFamily(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hasFamily(families: string[] | undefined, target: string): boolean {
  const normalizedTarget = normalizeFamily(target);
  return (families || []).some(family => normalizeFamily(family) === normalizedTarget);
}

function resolveAbsentFamilies(families: string[] | undefined): string[] {
  return CORE_FAMILIES.filter(family => !hasFamily(families, family));
}

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
    familiasAusentes: resolveAbsentFamilies(primary.familias_presentes),
    modulosPorFamilia: primary.modulos_por_familia,
    temErp: Boolean(primary.tem_erp ?? hasFamily(primary.familias_presentes, 'ERP')),
    temHcm: Boolean(primary.tem_hcm ?? hasFamily(primary.familias_presentes, 'HCM')),
    temGatec: Boolean(primary.tem_gatec ?? hasFamily(primary.familias_presentes, 'GATec')),
    temLogistica: Boolean(primary.tem_logistica ?? hasFamily(primary.familias_presentes, 'Logística')),
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

function inferClienteMatchType(lookup: LookupResponse, primary: LookupResponse['results'][number]): MatchType {
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
  const absentFamilies =
    clienteSeniorData.familiasAusentes?.filter(Boolean).join(', ') ||
    resolveAbsentFamilies(clienteSeniorData.familias).join(', ');
  const totalModulos = clienteSeniorData.totalModulos ?? 'não informado';
  const erpConfirmed = clienteSeniorData.temErp ?? hasFamily(clienteSeniorData.familias, 'ERP');
  const hcmConfirmed = clienteSeniorData.temHcm ?? hasFamily(clienteSeniorData.familias, 'HCM');

  return `
[EVIDÊNCIA CRM INTERNO SENIOR — PRIORIDADE MÁXIMA]
- ${companyLabel} é cliente Senior confirmado no CRM interno.
- Total de módulos contratados: ${totalModulos}.
- Famílias confirmadas: ${families}.
- Famílias NÃO confirmadas no CRM: ${absentFamilies || 'nenhuma família crítica ausente informada'}.

[REGRAS OBRIGATÓRIAS DE NARRATIVA]
- ${erpConfirmed ? 'ERP Senior confirmado no CRM interno.' : 'ERP Senior NÃO confirmado no CRM interno. É proibido afirmar ERP Senior como core, backoffice implantado ou solução contratada desta conta.'}
- ${hcmConfirmed ? 'HCM Senior confirmado no CRM interno.' : 'HCM Senior NÃO confirmado no CRM interno.'}
- Se ERP não estiver confirmado, trate ERP como GAP de cross-sell ou hipótese pública explicitamente marcada, nunca como cliente ERP.
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

  const competitorMentions = COMPETITOR_PATTERNS.filter(({ regex }) => regex.test(trimmed)).map(({ label }) => label);

  if (competitorMentions.length === 0) return trimmed;

  const companyLabel = companyName?.trim() || clienteSeniorData.grupo || 'A empresa analisada';
  const uniqueMentions = [...new Set(competitorMentions)].join(' e ');
  const totalModulos = clienteSeniorData.totalModulos ?? 'múltiplos';

  return `${trimmed}

---
## 🔒 Nota de consistência comercial
A base interna Senior confirma ${companyLabel} como cliente Senior com ${totalModulos} módulos contratados. Menções a ${uniqueMentions} neste dossiê devem ser lidas como legado, satélite ou convivência, não como ERP core principal sem evidência superior ao CRM interno.`;
}

function hasConfirmedErp(clienteSeniorData?: ClienteSeniorData): boolean {
  return Boolean(clienteSeniorData?.temErp ?? hasFamily(clienteSeniorData?.familias, 'ERP'));
}

function hasConfirmedHcm(clienteSeniorData?: ClienteSeniorData): boolean {
  return Boolean(clienteSeniorData?.temHcm ?? hasFamily(clienteSeniorData?.familias, 'HCM'));
}

const SENIOR_ERP_MENTION_PATTERN = /\b(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)\b/i;
const SENIOR_ERP_ASSERTION_PATTERN =
  /\b(?:confirmad[ao]s?|implantad[ao]s?|contratad[ao]s?|core|backoffice|existente|atual|possui|tem|cliente|m[oó]dulos?|usa|utiliza|roda|opera|adotad[ao]s?|presen[çc]a)\b/i;
const SENIOR_ERP_NEGATION_PATTERN =
  /\b(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)\b.{0,80}\b(?:n[aã]o\s+confirmad[ao]|ausente|gap|hip[oó]tese|validar|n[aã]o\s+contratad[ao])\b|\b(?:n[aã]o\s+(?:confirma|confirmad[ao]|possui|tem|usa|utiliza)|sem|ausente)\b.{0,80}\b(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)\b/i;

const SENIOR_ERP_RISKY_PHRASE_PATTERNS: RegExp[] = [
  /\b(?:possui|tem|usa|utiliza|roda|opera|adota)\s+(?:o\s+|a\s+)?(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)(?:\s*\([^)]*\))?/gi,
  /\b(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)(?:\s*\([^)]*\))?\s*:?\s*(?:confirmad[ao]s?|implantad[ao]s?|contratad[ao]s?|core|backoffice|existente|atual)(?:\s+(?:como\s+)?(?:core|backoffice|principal|atual|existente))*/gi,
  /\b(?:confirmad[ao]s?|implantad[ao]s?|contratad[ao]s?)\s+(?:como\s+)?(?:o\s+|a\s+)?(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)(?:\s*\([^)]*\))?/gi,
  /\b(?:m[oó]dulos?\s+de|presen[çc]a\s+de)\s+(?:ERP\s+Senior|Senior\s+ERP|ERP\s+Sapiens|Sapiens\s+ERP)(?:\s*\([^)]*\))?/gi,
];

function hasRiskySeniorErpAssertion(line: string): boolean {
  if (!SENIOR_ERP_MENTION_PATTERN.test(line)) return false;
  if (SENIOR_ERP_NEGATION_PATTERN.test(line)) return false;
  return SENIOR_ERP_ASSERTION_PATTERN.test(line);
}

function neutralizeSeniorErpAssertion(line: string): string {
  let nextLine = line;
  let replaced = false;

  for (const pattern of SENIOR_ERP_RISKY_PHRASE_PATTERNS) {
    nextLine = nextLine.replace(pattern, () => {
      replaced = true;
      return 'ERP Senior não confirmado no CRM interno';
    });
  }

  if (replaced) {
    return nextLine;
  }

  return `${line} — ERP Senior não confirmado no CRM interno; tratar como gap de cross-sell ou hipótese a validar.`;
}

export function enforceSeniorEvidenceConstraints(
  text: string,
  companyName: string,
  clienteSeniorData?: ClienteSeniorData,
): string {
  const trimmed = text.trim();
  if (!trimmed || !clienteSeniorData?.encontrado) return trimmed;

  const erpConfirmed = hasConfirmedErp(clienteSeniorData);
  const hcmConfirmed = hasConfirmedHcm(clienteSeniorData);
  if (erpConfirmed || !hcmConfirmed) return trimmed;

  let changed = false;

  const constrained = trimmed
    .split('\n')
    .map(line => {
      let nextLine = line.replace(/\bHCM\s*\/\s*ERP\b/gi, () => {
        changed = true;
        return 'HCM';
      });

      if (hasRiskySeniorErpAssertion(nextLine)) {
        changed = true;
        nextLine = neutralizeSeniorErpAssertion(nextLine);
      }

      return nextLine;
    })
    .join('\n');

  if (!changed || /##\s*🔒\s*Nota de consist[eê]ncia comercial/i.test(constrained)) {
    return constrained;
  }

  const companyLabel = companyName?.trim() || clienteSeniorData.grupo || 'A empresa analisada';
  return `${constrained}

---
## 🔒 Nota de consistência comercial
A base interna Senior confirma ${companyLabel} como cliente Senior em HCM, mas não confirma ERP Senior contratado. Qualquer tese de ERP deve ser tratada como gap de cross-sell ou hipótese a validar, não como core instalado.`;
}
