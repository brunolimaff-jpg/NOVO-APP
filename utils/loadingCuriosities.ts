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
      text.includes('deep dive de [') ||
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
    'O Scout está agora infiltrando-se em bases de dados públicas para desconstruir o perímetro da conta alvo.',
    'Rastreando sinais de venda ocultos e detectando gatilhos de dor operacional em tempo real.',
    'Sabia? A tecnologia Senior orquestra os processos críticos de 1 em cada 4 grandes empresas do país.',
    'Aguarde: Auditando referências de mercado e calibrando o Score PORTA contra o setor.',
  ];

  if (!safeCompany) return genericFallback;

  return [
    `Rastreando a ${safeCompany}: Capturando sinais operacionais e pegada de mercado em múltiplas fontes.`,
    `Desconstruindo a teia societária da ${safeCompany} para calibrar o Score PORTA contra o setor.`,
    `Inovação: A Senior lidera o mercado Agtech com soluções que integram do campo ao escritório.`,
    `Auditando o perímetro fiscal da ${safeCompany} para detectar riscos e incentivos ocultos.`,
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
