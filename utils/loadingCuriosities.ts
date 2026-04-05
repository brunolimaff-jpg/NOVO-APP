const MAX_ITEMS = 8;

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

function toLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const sanitizeLine = (line: string): string => line.replace(/\s+/g, ' ').trim();
  const isStatusLikeLine = (line: string): boolean => (
    (/^(buscando|consultando|cruzando|mapeando|analisando|gerando|montando|preparando)\b/i.test(line) && line.length < 65) ||
    /^(passo|fase)\s+\d+/i.test(line) ||
    /(em andamento|investiga[cç][aã]o em andamento)/i.test(line)
  );
  const isUnsafeLine = (line: string): boolean => {
    const text = line.toLowerCase();
    return (
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
    .map((item) => (typeof item === 'string' ? sanitizeLine(item) : ''))
    .filter((item) => item.length > 10 && item.length <= 220)
    .filter((item) => !isStatusLikeLine(item))
    .filter((item) => !isUnsafeLine(item));
}

function interleaveGroups(groups: string[][], limit = MAX_ITEMS): string[] {
  const buckets = groups.map((group) => [...group]);
  const out: string[] = [];
  while (out.length < limit && buckets.some((bucket) => bucket.length > 0)) {
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
    'Consolidando sinais públicos, contexto operacional e referências de mercado para montar uma resposta objetiva.',
    'Cruzando evidências observáveis com benchmarks do setor antes de calibrar o Score PORTA.',
    'Empresas com disciplina operacional transformam dados em vantagem competitiva mais rápido que concorrentes.',
    'O Scout filtra ruído antes de sugerir táticas — qualidade dos dados define qualidade das recomendações.',
  ];

  if (!safeCompany) return genericFallback;

  return [
    `${safeCompany}: mapeando sinais operacionais, footprint de mercado e padrões de tomada de decisão.`,
    `Cruzando dados públicos da ${safeCompany} com benchmarks do setor para calibrar o Score PORTA.`,
    'Empresas que integram gestão agrícola, fiscal e de pessoas em um ERP reduzem retrabalho em até 30%.',
    'O Scout prioriza evidências factuais antes de sugerir táticas — dados ruidosos geram recomendações erradas.',
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
      const curated = toLines(parsed);
      return curated.length > 0 ? [...curated, ...fallback].slice(0, MAX_ITEMS) : fallback;
    }

    if (parsed && typeof parsed === 'object') {
      const empresa = toLines((parsed as Record<string, unknown>).empresa);
      const setor = toLines((parsed as Record<string, unknown>).setor);
      const regional = toLines((parsed as Record<string, unknown>).regional);

      const merged = interleaveGroups([empresa, setor, regional], MAX_ITEMS);
      return merged.length > 0 ? [...merged, ...fallback].slice(0, MAX_ITEMS) : fallback;
    }

    return fallback;
  } catch {
    return fallback;
  }
}
