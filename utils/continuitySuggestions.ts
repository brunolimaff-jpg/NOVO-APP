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

const TECHNICAL_SELLER_QUESTION_REGEX =
  /\b(arquitetura|nativamente|ecossistema|gatec|capex|erp|hcm|wms|stack|integra[cç][aã]o|m[oó]dulos?\s+senior|sistemas?\s+que\s+j[aá]\s+rodam|visibilidade\s+de\s+ponta\s+a\s+ponta)\b/i;
const BUSINESS_QUESTION_OPENER_REGEX = /^(qual|quais|que|quem|onde|quando|quanto|quantos|quanta|quantas)\b/i;
const BUSINESS_SELLER_SIGNAL_REGEX =
  /\b(margem|custo|risco|decis[aã]o|investimento|or[cç]amento|crescimento|opera[cç][aã]o|atraso|retrabalho|prazo|cliente|produtividade|dinheiro|retorno|diretoria|prioridade|expans[aã]o|perda|multa|controle|patrocin|receita|resultado|servi[cç]o)\b/i;

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
      company => `Qual risco fiscal em ${company} já ameaça virar custo direto para o negócio?`,
      company => `Quem em ${company} perde sono quando uma rotina fiscal vira multa ou atraso?`,
      company => `Que custo de regularização em ${company} ainda não entrou na conversa da diretoria?`,
    ],
  },
  {
    id: 'tech',
    detect: /\b(erp|hcm|wms|sistema|integra[cç][aã]o|planilha|dados|fechamento|consolida[cç][aã]o|stack|legado)\b/gi,
    prompts: [
      company => `Qual rotina manual em ${company} mais atrasa uma decisão que já deveria ser simples?`,
      company => `Onde ${company} perde dinheiro porque o time precisa conferir informação no braço?`,
      company => `Que decisão comercial em ${company} fica parada porque o número confiável chega tarde?`,
    ],
  },
  {
    id: 'rh',
    detect: /\b(rh|hcm|folha|ponto|sst|turnover|absente[ií]smo|acidente|sindic|headcount|seguran[cç]a)\b/gi,
    prompts: [
      company => `Qual perda de produtividade em ${company} já custa dinheiro e ainda parece normal?`,
      company => `Que risco trabalhista em ${company} pode virar problema de diretoria se nada mudar?`,
      company => `Onde ${company} mais perde gente, tempo ou controle sem colocar isso na conta?`,
    ],
  },
  {
    id: 'ops',
    detect: /\b(opera[cç][aã]o|log[ií]st|supply|rastreabil|expedi[cç][aã]o|estoque|insumo|colheita|safra|produ[cç][aã]o|wms)\b/gi,
    prompts: [
      company => `Qual gargalo operacional em ${company} mais ameaça margem, prazo ou nível de serviço?`,
      company => `Onde ${company} perde dinheiro quando a operação cresce mais rápido que o controle?`,
      company => `Que atraso ou retrabalho em ${company} o cliente final já pode sentir primeiro?`,
    ],
  },
  {
    id: 'governance',
    detect: /\b(diretoria|comit[eê]|decis[aã]o|budget|or[cç]amento|conselho|sponsor|prioridade|investimento|veto)\b/gi,
    prompts: [
      company => `Qual decisão de investimento em ${company} precisa de um número claro para sair do papel?`,
      company => `Quem em ${company} sente a dor forte o bastante para patrocinar uma mudança agora?`,
      company => `Qual prioridade da diretoria de ${company} perde força porque o impacto financeiro não está claro?`,
    ],
  },
  {
    id: 'finance',
    detect: /\b(margem|custo|perda|ebitda|caixa|resultado|rentab|despesa|roi|receita|vazamento)\b/gi,
    prompts: [
      company => `Onde a margem de ${company} está vazando sem virar uma prioridade de investimento?`,
      company => `Qual custo escondido em ${company} já é grande o bastante para justificar mudança?`,
      company => `Que perda recorrente em ${company} precisa aparecer em reais para ganhar orçamento?`,
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

export function isBusinessSellerContinuityQuestion(value: string): boolean {
  const normalized = normalizeContinuitySuggestion(value);
  if (!normalized) return false;
  if (!BUSINESS_QUESTION_OPENER_REGEX.test(normalized)) return false;
  if (!BUSINESS_SELLER_SIGNAL_REGEX.test(normalized)) return false;
  if (TECHNICAL_SELLER_QUESTION_REGEX.test(normalized)) return false;
  if (/\bbruno\b/i.test(normalized)) return false;
  return true;
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
  if (!candidate || candidate.length < 15) return;
  if (isLegacyFallbackSuggestion(candidate)) return;
  if (!isBusinessSellerContinuityQuestion(candidate)) return;

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
    `Qual dor de negócio em ${companyReference} já está cara demais para continuar informal?`,
    `Onde ${companyReference} perde margem, prazo ou cliente por falta de controle executivo?`,
    `Que risco em ${companyReference} já tem custo recorrente e ainda não virou pauta de orçamento?`,
    `Qual processo de ${companyReference} precisa sair do improviso antes da próxima expansão?`,
    `Quem em ${companyReference} deveria patrocinar a mudança antes que o problema vire urgência?`,
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
