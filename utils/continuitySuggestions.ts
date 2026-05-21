const CONTINUITY_TARGET = 4;

export interface ContinuitySuggestionOptions {
  contextText?: string | null;
  avoidSuggestions?: string[] | null;
}

interface ContinuityTheme {
  id: string;
  detect: RegExp;
  prompts: Array<(companyReference: string) => string>;
}

const LEGACY_FALLBACK_PATTERNS = [
  /^qual gargalo em .+ ja esta consumindo margem e segue tratado como rotina\?$/i,
  /^que decisao critica em .+ continua travada por falta de dados confiaveis\?$/i,
  /^onde .+ ainda depende de planilhas e amplia risco operacional sem reacao executiva\?$/i,
  /^se nada mudar em .+ nos proximos 90 dias, qual ruptura tende a aparecer primeiro\?$/i,
];

const themeCatalog: ContinuityTheme[] = [
  {
    id: 'fiscal',
    detect: /\b(fiscal|tribut|compliance|sefaz|multa|autua[cç][aã]o|passivo|pgfn|e-?social|obriga[cç][aã]o)\b/gi,
    prompts: [
      company => `Qual frente fiscal em ${company} ainda depende de conferência manual antes de virar dado confiável?`,
      company => `Que exposição de compliance em ${company} já deveria estar no radar da diretoria?`,
      company => `Onde ${company} transforma risco tributário recorrente em rotina operacional perigosa?`,
    ],
  },
  {
    id: 'tech',
    detect: /\b(erp|hcm|wms|sistema|integra[cç][aã]o|planilha|dados|fechamento|consolida[cç][aã]o|stack|legado)\b/gi,
    prompts: [
      company => `Onde o ERP de ${company} deixa integração quebrada virar custo invisível no fechamento?`,
      company => `Qual etapa em ${company} ainda nasce na planilha porque os sistemas não conversam?`,
      company => `Que dado crítico de ${company} chega tarde demais para sustentar decisão executiva?`,
    ],
  },
  {
    id: 'rh',
    detect: /\b(rh|hcm|folha|ponto|sst|turnover|absente[ií]smo|acidente|sindic|headcount|seguran[cç]a)\b/gi,
    prompts: [
      company => `Qual risco de RH ou SST em ${company} cresce sem visibilidade consolidada para liderança?`,
      company => `Onde ${company} ainda cruza folha, ponto e segurança tarde demais para agir?`,
      company => `Que perda de produtividade em ${company} segue invisível por falta de HCM integrado?`,
    ],
  },
  {
    id: 'ops',
    detect: /\b(opera[cç][aã]o|log[ií]st|supply|rastreabil|expedi[cç][aã]o|estoque|insumo|colheita|safra|produ[cç][aã]o|wms)\b/gi,
    prompts: [
      company => `Qual etapa operacional em ${company} mais perde previsibilidade por dado atrasado ou desencontrado?`,
      company => `Onde ${company} perde rastreabilidade quando logística, estoque e produção saem do mesmo plano?`,
      company => `Que gargalo de operação em ${company} já ficou caro demais para continuar informal?`,
    ],
  },
  {
    id: 'governance',
    detect: /\b(diretoria|comit[eê]|decis[aã]o|budget|or[cç]amento|conselho|sponsor|prioridade|investimento|veto)\b/gi,
    prompts: [
      company => `Que decisão de diretoria em ${company} segue parada por falta de caso financeiro incontestável?`,
      company => `Quem em ${company} ganha poder político quando o risco vira número e não opinião?`,
      company => `Qual pauta em ${company} já tem urgência executiva, mas ainda não tem dono claro?`,
    ],
  },
  {
    id: 'finance',
    detect: /\b(margem|custo|perda|ebitda|caixa|resultado|rentab|despesa|roi|receita|vazamento)\b/gi,
    prompts: [
      company => `Qual vazamento de margem em ${company} aparece no resultado, mas ainda não virou projeto?`,
      company => `Onde o custo oculto de ${company} nasce na operação e some no consolidado financeiro?`,
      company => `Que perda recorrente em ${company} precisa virar ROI antes de disputar orçamento?`,
    ],
  },
];

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeContinuitySuggestion(raw: string): string {
  const normalized = (raw || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*[-*+•]\s+/, '')
    .replace(/^\s*\d+\s*[).:-]\s*/, '')
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  const withoutEndingPunctuation = normalized.replace(/[.!]+$/g, '').trim();
  if (!withoutEndingPunctuation) return '';
  return withoutEndingPunctuation.endsWith('?') ? withoutEndingPunctuation : `${withoutEndingPunctuation}?`;
}

function isLegacyFallbackSuggestion(value: string): boolean {
  const comparable = normalizeForComparison(normalizeContinuitySuggestion(value));
  return LEGACY_FALLBACK_PATTERNS.some(pattern => pattern.test(`${comparable}?`));
}

function countThemeHits(text: string, detect: RegExp): number {
  const regex = new RegExp(detect.source, detect.flags.includes('g') ? detect.flags : `${detect.flags}g`);
  return Array.from(text.matchAll(regex)).length;
}

function buildAvoidKeys(options: ContinuitySuggestionOptions): Set<string> {
  return new Set(
    (options.avoidSuggestions || [])
      .filter((item): item is string => typeof item === 'string')
      .map(item => normalizeForComparison(normalizeContinuitySuggestion(item)))
      .filter(Boolean),
  );
}

function pushUnique(
  target: string[],
  seen: Set<string>,
  avoidKeys: Set<string>,
  raw: string,
): void {
  const candidate = normalizeContinuitySuggestion(raw);
  if (!candidate || candidate.length < 24 || !candidate.endsWith('?')) return;
  if (isLegacyFallbackSuggestion(candidate)) return;

  const key = normalizeForComparison(candidate);
  if (!key || avoidKeys.has(key) || seen.has(key)) return;
  seen.add(key);
  target.push(candidate);
}

export function buildContextualContinuityFallback(
  companyName?: string | null,
  options: ContinuitySuggestionOptions = {},
): string[] {
  const companyReference = (companyName || '').trim() || 'a operação';
  const contextCorpus = `${companyReference}\n${options.contextText || ''}`;
  const avoidKeys = buildAvoidKeys(options);
  const seen = new Set<string>();
  const candidates: string[] = [];

  const rankedThemes = themeCatalog
    .map(theme => ({ ...theme, hits: countThemeHits(contextCorpus, theme.detect) }))
    .sort((a, b) => b.hits - a.hits);

  const activeThemes = rankedThemes.filter(theme => theme.hits > 0);
  const themesToUse = activeThemes.length > 0 ? activeThemes : rankedThemes;

  themesToUse.forEach((theme, themeIndex) => {
    theme.prompts.forEach((prompt, promptIndex) => {
      if (themeIndex > CONTINUITY_TARGET && promptIndex > 0) return;
      pushUnique(candidates, seen, avoidKeys, prompt(companyReference));
    });
  });

  [
    `Qual frente em ${companyReference} concentra retrabalho suficiente para virar conversa de diretoria?`,
    `Onde ${companyReference} perde velocidade comercial porque o dado operacional chega tarde?`,
    `Que risco em ${companyReference} já tem custo recorrente e ainda não virou pauta de orçamento?`,
    `Qual processo de ${companyReference} precisa sair do improviso antes da próxima expansão?`,
    `Quem em ${companyReference} deveria patrocinar a correção antes que o problema vire urgência?`,
  ].forEach(prompt => pushUnique(candidates, seen, avoidKeys, prompt));

  return candidates.slice(0, CONTINUITY_TARGET);
}

export function ensureContinuitySuggestions(
  suggestions: string[] | null | undefined,
  companyName?: string | null,
  options: ContinuitySuggestionOptions = {},
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  const avoidKeys = buildAvoidKeys(options);

  (Array.isArray(suggestions) ? suggestions : []).forEach(item => {
    pushUnique(unique, seen, avoidKeys, item);
  });

  if (unique.length < CONTINUITY_TARGET) {
    buildContextualContinuityFallback(companyName, options).forEach(item => {
      pushUnique(unique, seen, avoidKeys, item);
    });
  }

  return unique.slice(0, CONTINUITY_TARGET);
}
