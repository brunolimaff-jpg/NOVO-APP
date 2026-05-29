const MAX_ITEMS = 8;
const SAFE_GENERIC_BRANDS = new Set(['senior', 'sistemas', 'gatec', 'scout']);
const COMPANY_MARKER_PATTERN =
  /\b(?:ltda|s\/a|sa|cia|cooperativa|fazenda|usina|holding|agropecuaria|agroindustrial|industria|alimentos)\b/i;
const COMPANY_SPECIFIC_PATTERN =
  /\b(?:teia societ[aá]ria|per[ií]metro fiscal|pegada de mercado|footprint de mercado|rastreando a|auditando .* da|desconstruindo .* da)\b/i;
const UNSAFE_CURIOSITY_PATTERN =
  /\b(?:infiltrando|desconstruindo|expondo|segredos?|ocultos?|intelig[êe]ncia de guerra|1 em cada 4|score porta)\b/i;

function sanitizeLoadingContext(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length > 80) return '';
  if (/\n|\r|\[|\]|:|```|---/.test(text)) return '';
  if (/dossi[eê] completo|investiga[cç][aã]o|protocolo|conta alvo|prompt|porta|status|contexto cadastral/i.test(text)) {
    return '';
  }
  return text;
}

function normalizeForComparison(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsDifferentCompany(line: string, expectedCompany: string): boolean {
  const normalizedLine = normalizeForComparison(line);
  const normalizedCompany = normalizeForComparison(expectedCompany);

  if (!normalizedLine || !normalizedCompany) return false;
  if (normalizedLine.includes(normalizedCompany)) return false;

  const companyTokens = normalizedCompany.split(' ').filter(token => token.length > 2);

  if (companyTokens.some(token => normalizedLine.includes(token))) return false;

  const lineTokens = normalizedLine.split(' ').filter(Boolean);
  const hasSafeGenericBrand = lineTokens.some(token => SAFE_GENERIC_BRANDS.has(token));
  const looksCompanySpecific =
    COMPANY_MARKER_PATTERN.test(normalizedLine) || COMPANY_SPECIFIC_PATTERN.test(normalizedLine);

  return looksCompanySpecific && !hasSafeGenericBrand;
}

function toLines(value: unknown, expectedCompany = '', strictCompanyMatch = false): string[] {
  if (!Array.isArray(value)) return [];

  const sanitizeLine = (line: string): string => line.replace(/\s+/g, ' ').trim();
  const isStatusLikeLine = (line: string): boolean =>
    (/^(buscando|consultando|cruzando|mapeando|analisando|gerando|montando|preparando)\b/i.test(line) &&
      line.length < 65) ||
    /^(passo|fase)\s+\d+/i.test(line) ||
    /(em andamento|investiga[cç][aã]o em andamento)/i.test(line);
  const isUnsafeLine = (line: string): boolean => {
    const text = line.toLowerCase();
    return (
      UNSAFE_CURIOSITY_PATTERN.test(line) ||
      text.includes('investigacao_completa_integrada') ||
      text.includes('protocolo de investigação forense') ||
      text.includes('dossiê completo de [') ||
      text.includes('conta alvo:') ||
      text.includes('nunca viole') ||
      text.includes('porta_feed') ||
      text.includes('[[porta') ||
      text.includes('[[status') ||
      text.includes('###') ||
      text.includes('diretriz') ||
      text.includes('contexto cadastral obrigatório')
    );
  };

  return value
    .map(item => (typeof item === 'string' ? sanitizeLine(item) : ''))
    .filter(item => item.length > 10 && item.length <= 220)
    .filter(item => !isStatusLikeLine(item))
    .filter(item => !isUnsafeLine(item))
    .filter(item => {
      if (!expectedCompany) return true;
      if (!mentionsDifferentCompany(item, expectedCompany)) {
        if (!strictCompanyMatch) return true;
        return normalizeForComparison(item).includes(normalizeForComparison(expectedCompany));
      }
      return false;
    });
}

function interleaveGroups(groups: string[][], limit = MAX_ITEMS): string[] {
  const buckets = groups.map(group => [...group]);
  const out: string[] = [];
  while (out.length < limit && buckets.some(bucket => bucket.length > 0)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next && !out.includes(next)) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function buildLoadingCuriositiesFallback(context: string): string[] {
  const safeCompany = sanitizeLoadingContext(context || '');

  const genericFallback = [
    'Prévia do dossiê: separando sinais cadastrais, mercado e possíveis dores operacionais antes da recomendação final.',
    'Os próximos minutos organizam fatos confirmados, hipóteses comerciais e pontos de validação para a conversa.',
    'Setor e região entram como contexto para avaliar pressão de margem, logística, crescimento e timing comercial.',
    'A Senior pode aparecer como ângulo quando os sinais indicarem necessidade de controle, produtividade ou decisão com dados.',
  ];

  if (!safeCompany) return genericFallback;

  return [
    `Prévia do dossiê da ${safeCompany}: separando sinais públicos, hipóteses comerciais e próximos pontos de validação.`,
    `Na ${safeCompany}, o Scout prioriza indícios de operação, crescimento, risco e tomada de decisão antes da abordagem.`,
    `Setor e região da ${safeCompany} entram como contexto para avaliar pressão de margem, logística e janela comercial.`,
    'A Senior pode entrar como ângulo se os sinais apontarem necessidade de controle, produtividade ou decisão com dados.',
  ];
}

export function parseLoadingCuriosities(rawText: string, context: string): string[] {
  const safeContext = sanitizeLoadingContext(context || '');
  const fallback = buildLoadingCuriositiesFallback(safeContext);
  if (!rawText?.trim()) return fallback;

  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      const curated = toLines(parsed, safeContext);
      return curated.length > 0 ? [...curated, ...fallback].slice(0, MAX_ITEMS) : fallback;
    }

    if (parsed && typeof parsed === 'object') {
      const empresa = toLines((parsed as Record<string, unknown>).empresa, safeContext, true);
      const setor = toLines((parsed as Record<string, unknown>).setor, safeContext);
      const regional = toLines((parsed as Record<string, unknown>).regional, safeContext);
      const senior = toLines((parsed as Record<string, unknown>).senior, safeContext);

      const merged = interleaveGroups([empresa, [...setor, ...regional], senior], MAX_ITEMS);
      return merged.length > 0 ? [...merged, ...fallback].slice(0, MAX_ITEMS) : fallback;
    }

    return fallback;
  } catch {
    return fallback;
  }
}
