import { Message, Sender } from '../../types';
import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../../utils/loadingCuriosities';
import { sanitizeLoadingContextText } from '../../utils/textCleaners';
import { scoutDiag } from '../../utils/diagnosticLog';
import { ensureContinuitySuggestions, isBusinessSellerContinuityQuestion } from '../../utils/continuitySuggestions';
import { proxyGenerateContent } from '../geminiProxy';
import { LOADING_CURIOSITY_MODEL_ID, ROUTER_MODEL_ID } from './config';

const CONTINUITY_SYSTEM = `
<task>
Gerar perguntas de acompanhamento que um vendedor consultivo faria para abrir uma conversa de negocio com a conta.
</task>

<context>
As perguntas aparecem como botoes clicaveis para o vendedor. Elas precisam ajudar o vendedor a falar de dor, dinheiro, risco, prioridade, decisor, prazo, crescimento, margem, investimento ou impacto operacional.
</context>

<constraints>
- Linguagem de negocio, simples e falavel em reuniao comercial.
- Cada pergunta deve parecer uma pergunta feita por vendedor para decisor, nao por arquiteto, analista tecnico ou implementador.
- Use sinais do contexto, mas traduza tecnologia para impacto de negocio.
- Proibido citar ou focar em: arquitetura, nativamente, ecossistema, stack, GATec, CAPEX, ERP, HCM, WMS, modulos Senior, sistemas que ja rodam, visibilidade de ponta a ponta.
- Proibido mencionar o nome do vendedor.
- Proibido iniciar com "Como voce", "Considerando" ou "Com a".
- Responda exclusivamente em Portugues (Brasil) usando um Array JSON de strings.
</constraints>

<example>
<input>Pergunta tecnica ruim: "Pela robustez tecnologica da Scheffer, qual perda financeira estimada por nao ter logistica integrada nativamente ao GATec?"</input>
<output>"Onde a Scheffer perde margem quando a logistica fica mais manual do que deveria?"</output>
</example>

<example>
<input>Pergunta tecnica ruim: "O CAPEX da Scheffer indica novos ativos; como garantir gestao de patio com os sistemas atuais?"</input>
<output>"Qual investimento da Scheffer pode perder retorno se a operacao crescer sem mais controle?"</output>
</example>
`;

export async function generateLoadingCuriosities(
  loadingContext: string,
  searchQuery: string,
): Promise<string[]> {
  const safeContext = sanitizeLoadingContextText(loadingContext || '');
  const fallback = buildLoadingCuriositiesFallback(safeContext);
  const querySample = (searchQuery || '').slice(0, 240);

  const locationFromCadastro = querySample.match(/Cidade\s*=\s*([^;,\n]+)\s*;\s*UF\s*=\s*([A-Za-z]{2})/i);
  const locationFromNaturalText = querySample.match(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`\-. ]{2,40})\s*[-/]\s*([A-Za-z]{2})\b/);
  const onlyUf = querySample.match(/\bUF\s*[:=]\s*([A-Za-z]{2})\b/i);

  const city = (locationFromCadastro?.[1] || locationFromNaturalText?.[1] || '').trim();
  const uf = (locationFromCadastro?.[2] || locationFromNaturalText?.[2] || onlyUf?.[1] || '').trim().toUpperCase();
  const regionalScope = city && uf ? `${city}/${uf}` : uf ? `UF ${uf}` : '';

  const regionalLine = regionalScope
    ? `- Curiosidades de mercado regional coerentes com a localização da empresa (${regionalScope})`
    : '- Sem localização explícita: usar curiosidades gerais do mercado brasileiro';

  const regionalRule = regionalScope
    ? `- Use contexto regional coerente com ${regionalScope}, sem presumir Mato Grosso/Centro-Oeste`
    : '- Não presumir MT/Centro-Oeste quando a localização não estiver explícita';
  try {
    const prompt = `<task>
Gerar prévias de valor para a tela de carregamento do Senior Scout 360 enquanto o dossiê comercial é produzido.
</task>

<context>
Empresa ou contexto em análise: "${safeContext}"
Consulta original: "${querySample}"
Tempo médio da pesquisa completa: 3 a 5 minutos.
</context>

<objective>
As frases devem fazer o vendedor sentir que está vendo uma amostra útil do que virá no dossiê: sinais seguros, hipóteses comerciais e próximos pontos de validação.
</objective>

<output_contract>
Responda exclusivamente com JSON neste formato:
{
  "empresa": ["2 a 3 frases sobre sinais da empresa"],
  "setor": ["2 a 3 frases sobre setor, mercado ou cadeia de valor"],
  "regional": ["1 a 2 frases sobre região quando houver localização explícita"],
  "senior": ["1 a 2 frases sobre possíveis ângulos de conversa para Senior"]
}
Cada frase deve ter no máximo 180 caracteres.
</output_contract>

<content_rules>
- Linguagem executiva, comercial e segura.
- Use termos como "sinal a validar", "ponto de atenção", "hipótese de dor" e "ângulo de conversa".
- Não afirme fatos específicos sem fonte explícita no contexto.
- Não diga que a empresa usa, precisa ou comprará produto Senior.
- Não use "segredos", "ocultos", "infiltrando", "desconstruindo", "expondo" ou "inteligência de guerra".
- Não invente estatísticas de autoridade da Senior.
- No grupo "senior", fale de possibilidades comerciais amplas: controle, produtividade, integração operacional, decisão com dados, risco e margem.
${regionalLine}
${regionalRule}
</content_rules>

<examples>
{
  "empresa": [
    "Prévia da conta: sinais cadastrais e operacionais ajudam a separar fato confirmado de hipótese comercial.",
    "Ponto de atenção: entender operação, risco e tomada de decisão antes de sugerir abordagem."
  ],
  "setor": [
    "Hipótese de dor: margem, logística e previsibilidade costumam orientar conversas de valor neste setor."
  ],
  "regional": [
    "Contexto regional entra como sinal de pressão competitiva, disponibilidade logística e timing comercial."
  ],
  "senior": [
    "Ângulo Senior: se houver dor de controle, a conversa pode partir de produtividade e decisão com dados."
  ]
}
</examples>`;
    try {
      const flashResponse = await proxyGenerateContent({
        model: LOADING_CURIOSITY_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.6, maxOutputTokens: 900 },
      });
      const parsed = parseLoadingCuriosities(flashResponse.text || '', safeContext);
      if (parsed.length > 0) return parsed;
    } catch (err) {
      scoutDiag.warn('Auxiliary', 'Flash model indisponível, fallback para Router', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const routerResponse = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.6, maxOutputTokens: 900 },
    });
    return parseLoadingCuriosities(routerResponse.text || '', safeContext);
  } catch (err) {
    scoutDiag.warn('Auxiliary', 'Falha ao gerar curiosidades de loading (usando fallback)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return fallback;
  }
}

export interface ContinuityQuestionOptions {
  mode?: 'default' | 'regenerate';
  avoidSuggestions?: string[];
  ensureFresh?: boolean;
}

export async function generateContinuityQuestion(
  messages: Message[],
  empresaAlvo: string | null,
  nomeVendedor: string,
  options: ContinuityQuestionOptions = {},
): Promise<string[]> {
  const CONTINUITY_TARGET = 4;
  const normalizedCompany = (empresaAlvo || '').trim();
  const companyReference = normalizedCompany || 'a operação';
  const shouldPrioritizeNovelty =
    options.mode === 'regenerate' ||
    Boolean(options.ensureFresh) ||
    (Array.isArray(options.avoidSuggestions) && options.avoidSuggestions.length > 0);
  const modelRequestedCount = shouldPrioritizeNovelty ? 8 : CONTINUITY_TARGET;
  const normalizedExcludedSuggestions = (options.avoidSuggestions || [])
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
  const recentMessages = messages
    .slice(-6)
    .map(message => `${message.sender === Sender.User ? 'Vendedor' : 'Scout'}: ${message.text?.slice(0, 300) || ''}`)
    .join('\n');
  const contextCorpus = `${normalizedCompany}\n${recentMessages}`.toLowerCase();
  const contextNote = empresaAlvo ? `Empresa em análise: ${empresaAlvo}` : '';
  const systemPrompt = CONTINUITY_SYSTEM;
  const noveltyConstraint =
    shouldPrioritizeNovelty
      ? 'MODO NOVIDADE: priorize perguntas realmente novas e com angulos diferentes das anteriores.'
      : '';
  const exclusionConstraint = normalizedExcludedSuggestions.length > 0
    ? `PERGUNTAS BLOQUEADAS (NAO pode repetir):\n${normalizedExcludedSuggestions.map(item => `- ${item}`).join('\n')}`
    : '';
  const basePrompt = [
    '<task>Gere 4 perguntas de continuidade para uma conversa comercial.</task>',
    '<context>',
    contextNote,
    `Historico recente:\n${recentMessages}`,
    '</context>',
    '<constraints>',
    `O vendedor se chama ${nomeVendedor}, mas nao cite o nome dele nas perguntas.`,
    'As perguntas devem falar de negocio: margem, custo, risco, decisor, prioridade, investimento, prazo, crescimento, cliente ou retorno.',
    'Nao use jargao tecnico nem nomes de produto. Traduza qualquer dado tecnico em impacto comercial.',
    'Responda como array JSON de strings, sem texto adicional.',
    '</constraints>',
  ]
    .filter(Boolean)
    .join('\n\n');

  const effectiveBasePrompt = [
    '<context>',
    contextNote,
    `Historico recente:\n${recentMessages}`,
    '</context>',
    '<constraints>',
    noveltyConstraint,
    exclusionConstraint,
    `Gere ${modelRequestedCount} perguntas de continuidade para a proxima conversa comercial.`,
    'As perguntas devem soar como fala de vendedor para diretor, CFO, gestor de operacao ou sponsor.',
    'Priorize negocio: margem, custo, risco, decisor, prioridade, investimento, prazo, crescimento, cliente e retorno.',
    'Nao use jargao tecnico nem nomes de produto. Traduza qualquer dado tecnico em impacto comercial.',
    'Pode citar o nome da empresa quando isso deixar a pergunta mais precisa.',
    `A resposta final deve conter no minimo ${CONTINUITY_TARGET} perguntas ineditas em relacao a lista bloqueada (quando houver).`,
    'Responda como array JSON de strings, sem texto adicional.',
    '</constraints>',
  ]
    .filter(Boolean)
    .join('\n\n');

  const genericQuestionRegex =
    /(maior\s+desafio|principal\s+dor|o\s+que\s+mais\s+preocupa|o\s+que\s+precisa\s+melhorar|como\s+est[aá]\s+a\s+opera[cç][aã]o)/i;
  const themeCatalog = [
    {
      id: 'fiscal',
      detect: /(compliance|fiscal|tribut|passivo|multa|sefaz|pgfn|autua[cç][aã]o|e-?social)/gi,
      prompts: [
        `Qual passivo fiscal em ${companyReference} já é conhecido e segue tratado como rotina operacional?`,
        `Onde ${companyReference} ainda absorve compliance no braço sem transformar isso em prioridade executiva?`,
        `Que obrigação crítica em ${companyReference} continua em conferência paralela e já amplia exposição regulatória?`,
      ],
    },
    {
      id: 'tech',
      detect: /(erp|hcm|wms|integra[cç][aã]o|sistema|stack|legado|planilha|dados|fechamento|consolida[cç][aã]o)/gi,
      prompts: [
        `Onde ${companyReference} ainda depende de planilha para fechar o que o ERP deveria resolver sozinho?`,
        `Qual etapa sistêmica mais fragiliza ${companyReference} quando os dados chegam quebrados entre áreas?`,
        `Que gargalo de integração em ${companyReference} já virou rotina e segue consumindo margem sem reação da diretoria?`,
      ],
    },
    {
      id: 'rh',
      detect: /(rh|sst|headcount|folha|turnover|turnover|absente[ií]smo|safrist|sindicat|seguran[cç]a|acidente)/gi,
      prompts: [
        `Qual perda de produtividade em RH ou SST já virou normal em ${companyReference} e ainda não entrou na conta da operação?`,
        `Onde ${companyReference} segue reagindo no escuro por falta de dado consolidado entre folha, ponto e segurança?`,
        `Que risco trabalhista ou de SST em ${companyReference} cresce sem dono claro quando a operação acelera?`,
      ],
    },
    {
      id: 'ops',
      detect: /(opera[cç][aã]o|log[ií]st|supply|rastreabil|expedi[cç][aã]o|estoque|insumo|colheita|safra|produ[cç][aã]o)/gi,
      prompts: [
        `Onde ${companyReference} perde previsibilidade hoje porque o dado crítico chega tarde ou desencontrado?`,
        `Qual gargalo operacional em ${companyReference} já foi normalizado e continua destruindo margem sem virar prioridade?`,
        `Que etapa de rastreabilidade ou logística em ${companyReference} ainda trava reação rápida quando a operação aperta?`,
      ],
    },
    {
      id: 'governance',
      detect: /(diretoria|or[cç]amento|sponsor|decis[aã]o|comit[eê]|prioridade|conselho|investimento|budget|veto)/gi,
      prompts: [
        `Qual decisão estratégica em ${companyReference} continua travada porque ninguém consolidou um caso financeiro incontestável?`,
        `Onde o tema já é importante o bastante para a diretoria de ${companyReference}, mas ainda não ganhou dono político claro?`,
        `Que sinal de budget ou prioridade existe em ${companyReference}, mas ainda não virou movimento executivo real?`,
      ],
    },
    {
      id: 'finance',
      detect: /(margem|ebitda|custo|caixa|resultado|rentab|perda|despesa|roi|receita)/gi,
      prompts: [
        `Qual vazamento de margem em ${companyReference} já está visível e ainda não recebeu resposta sistêmica?`,
        `Onde o custo oculto em ${companyReference} cresce sem aparecer com clareza no resultado consolidado?`,
        `Que perda financeira em ${companyReference} segue dispersa entre áreas e por isso nunca vira decisão prioritária?`,
      ],
    },
  ] as const;

  const getThemeHits = (text: string, detect: RegExp): number => {
    const flags = detect.flags.includes('g') ? detect.flags : `${detect.flags}g`;
    const regex = new RegExp(detect.source, flags);
    return Array.from(text.matchAll(regex)).length;
  };

  const activeThemes = themeCatalog
    .map(theme => ({
      ...theme,
      hits: getThemeHits(contextCorpus, theme.detect),
    }))
    .sort((a, b) => b.hits - a.hits);

  const getThemeIdsForCandidate = (candidate: string): string[] => {
    const sample = candidate.toLowerCase();
    return activeThemes
      .filter(theme => theme.hits > 0 && new RegExp(theme.detect.source, theme.detect.flags).test(sample))
      .map(theme => theme.id);
  };

  const normalizeQuestionCandidate = (raw: string): string => {
    const withoutQuotes = (raw || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/^\s*[-*+•]\s+/, '')
      .replace(/^\s*\d+\s*[).:-]\s*/, '')
      .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!withoutQuotes) return '';

    const withoutEndingPunctuation = withoutQuotes.replace(/[.!]+$/g, '').trim();
    if (!withoutEndingPunctuation) return '';
    return withoutEndingPunctuation.endsWith('?') ? withoutEndingPunctuation : `${withoutEndingPunctuation}?`;
  };

  const bannedOpeners = /^(considerando|com\s+a|como\s+voc[êe]s?|você)\b/i;
  const sniperSignalRegex =
    /(gap|caos|trav|paralis|margem|perda|custo|retrabalho|press[aã]o|passivo|risco|atras|gargalo|veto|budget|planilha|integra[cç][aã]o|fechamento|diretoria|exce[cç][aã]o)/i;
  const leverageSignalRegex =
    /(custo|margem|perda|risco|or[cç]amento|decis[aã]o|prazo|janela|dias|fiscal|compliance|retrabalho|integra[cç][aã]o|erp|hcm|wms|safra|fechamento)/i;
  const companyToken = normalizedCompany.toLowerCase().split(/\s+/)[0] || '';

  const isValidQuestionCandidate = (raw: string): boolean => {
    const candidate = normalizeQuestionCandidate(raw);
    if (candidate.length < 15 || candidate.length > 180) return false;
    if (!candidate.endsWith('?')) return false;
    if (bannedOpeners.test(candidate)) return false;
    if (/^(responda|retorne|array json|json)/i.test(candidate)) return false;
    if (/^\s*(?:\[|{)/.test(candidate)) return false;
    if (!isBusinessSellerContinuityQuestion(candidate)) return false;
    if (genericQuestionRegex.test(candidate) && !leverageSignalRegex.test(candidate) && !sniperSignalRegex.test(candidate)) return false;
    return true;
  };

  const buildQuestionDedupeKey = (value: string): string => {
    return normalizeQuestionCandidate(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };
  const blockedQuestionKeys = new Set(
    normalizedExcludedSuggestions
      .map(item => buildQuestionDedupeKey(item))
      .filter(Boolean),
  );

  const mergeUniqueQuestions = (base: string[], incoming: string[]): string[] => {
    const merged = [...base];
    const seen = new Set(base.map(item => buildQuestionDedupeKey(item)).filter(Boolean));
    for (const item of incoming) {
      const candidate = normalizeQuestionCandidate(item);
      const key = buildQuestionDedupeKey(candidate);
      if (!candidate || !key || blockedQuestionKeys.has(key) || seen.has(key) || !isValidQuestionCandidate(candidate)) continue;
      seen.add(key);
      merged.push(candidate);
    }
    return merged;
  };

  const scoreQuestionCandidate = (raw: string): number => {
    const candidate = normalizeQuestionCandidate(raw);
    if (!candidate) return 0;
    const signalHits = getThemeIdsForCandidate(candidate).length;
    let score = 0;
    if (candidate.endsWith('?')) score += 2;
    if (candidate.length >= 36 && candidate.length <= 180) score += 2;
    if (!bannedOpeners.test(candidate)) score += 2;
    if (/\b(\d+|90 dias|30 dias|12 meses|r\$|margem)\b/i.test(candidate)) score += 1;
    if (leverageSignalRegex.test(candidate)) score += 3;
    if (sniperSignalRegex.test(candidate)) score += 3;
    if (signalHits > 0) score += 2 + signalHits;
    if (companyToken.length >= 3 && candidate.toLowerCase().includes(companyToken)) score += 1;
    return score;
  };

  const orderByQuality = (items: string[]): string[] => {
    return items
      .map((item, index) => ({ item, index, score: scoreQuestionCandidate(item) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map(entry => entry.item);
  };

  const parseQuestionArray = (raw: string): string[] => {
    if (!raw?.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map(item => normalizeQuestionCandidate(item))
        .filter(item => isValidQuestionCandidate(item));
    } catch (err) {
      scoutDiag.warn('Auxiliary', 'Falha ao parsear array de perguntas', {
        error: err instanceof Error ? err.message : String(err),
        preview: raw?.slice(0, 100),
      });
      return [];
    }
  };

  const extractBalancedJsonArrays = (raw: string): string[] => {
    const arrays: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '[') {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (char === ']') {
        if (depth === 0) continue;
        depth -= 1;
        if (depth === 0 && start >= 0) {
          arrays.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }

    return arrays;
  };

  const extractQuestionsFromFreeText = (raw: string): string[] => {
    const lines = raw
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const lineCandidates = lines
      .filter(line => /^[-*+•]\s+/.test(line) || /^\d+\s*[).:-]\s+/.test(line) || line.includes('?'))
      .map(line => normalizeQuestionCandidate(line))
      .filter(line => isValidQuestionCandidate(line));

    const sentenceCandidates = Array.from(
      raw
        .replace(/\s+/g, ' ')
        .matchAll(/([A-ZÀ-Ú0-9][^?]{10,220}\?)/gi),
    )
      .map(match => normalizeQuestionCandidate(match[1]))
      .filter(line => isValidQuestionCandidate(line));

    return mergeUniqueQuestions(lineCandidates, sentenceCandidates);
  };

  const parseContinuityQuestions = (raw: string): { questions: string[]; stageHits: string[] } => {
    const stageHits: string[] = [];
    let questions: string[] = [];
    const rawTrimmed = (raw || '').trim();
    if (!rawTrimmed) return { questions: [], stageHits };

    const fenced = rawTrimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const direct = parseQuestionArray(fenced);
    if (direct.length > 0) {
      questions = mergeUniqueQuestions(questions, direct);
      stageHits.push('direct_json');
    }

    if (questions.length < CONTINUITY_TARGET) {
      const embeddedCandidates = extractBalancedJsonArrays(rawTrimmed);
      const embeddedQuestions = embeddedCandidates.reduce<string[]>(
        (acc, snippet) => mergeUniqueQuestions(acc, parseQuestionArray(snippet)),
        [],
      );
      if (embeddedQuestions.length > 0) {
        questions = mergeUniqueQuestions(questions, embeddedQuestions);
        stageHits.push('embedded_json');
      }
    }

    if (questions.length < CONTINUITY_TARGET) {
      const freeTextQuestions = extractQuestionsFromFreeText(rawTrimmed);
      if (freeTextQuestions.length > 0) {
        questions = mergeUniqueQuestions(questions, freeTextQuestions);
        stageHits.push('free_text');
      }
    }

    return { questions, stageHits };
  };

  const runContinuityAttempt = async (
    prompt: string,
    attempt: 'primary' | 'retry' | 'novelty_retry',
  ): Promise<{ questions: string[]; stageHits: string[]; raw: string }> => {
    const response = await proxyGenerateContent(
      {
        model: ROUTER_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.8, maxOutputTokens: 900, systemInstruction: systemPrompt, responseMimeType: 'application/json' },
      },
      AbortSignal.timeout(15000),
    );

    const raw = (response.text || '').trim();
    const parsed = parseContinuityQuestions(raw);
    scoutDiag.info?.('ContinuityQuestion', 'parse de sugestões concluído', {
      attempt,
      company: empresaAlvo || null,
      rawChars: raw.length,
      questionCount: parsed.questions.length,
      stageHits: parsed.stageHits,
      blockedCount: blockedQuestionKeys.size,
      mode: options.mode || 'default',
    });
    return { ...parsed, raw };
  };

  let collectedQuestions: string[] = [];
  try {
    const primaryAttempt = await runContinuityAttempt(effectiveBasePrompt, 'primary');
    collectedQuestions = mergeUniqueQuestions(collectedQuestions, primaryAttempt.questions);

    if (collectedQuestions.length < CONTINUITY_TARGET) {
      scoutDiag.warn('ContinuityQuestion', 'sugestões insuficientes na primeira tentativa', {
        company: empresaAlvo || null,
        count: collectedQuestions.length,
        stageHits: primaryAttempt.stageHits,
        rawSnippet: primaryAttempt.raw.slice(0, 200),
      });

      const retryPrompt = `${basePrompt}\n\nIMPORTANTE: Sua resposta anterior foi inválida ou incompleta. Responda agora com EXATAMENTE 4 perguntas em formato de ARRAY JSON de strings, sem texto adicional.`;
      const effectiveRetryPrompt = shouldPrioritizeNovelty
        ? `${effectiveBasePrompt}\n\nIMPORTANTE: sua resposta anterior veio incompleta. Refaca e entregue de 8 a 12 perguntas, garantindo pelo menos 4 perguntas realmente novas sem repetir a lista bloqueada.`
        : retryPrompt;
      const retryAttempt = await runContinuityAttempt(effectiveRetryPrompt, 'retry');
      collectedQuestions = mergeUniqueQuestions(collectedQuestions, retryAttempt.questions);

      if (collectedQuestions.length < CONTINUITY_TARGET) {
        scoutDiag.warn('ContinuityQuestion', 'ainda insuficiente após retry', {
          company: empresaAlvo || null,
          count: collectedQuestions.length,
          stageHits: retryAttempt.stageHits,
          rawSnippet: retryAttempt.raw.slice(0, 200),
        });
      }
      if (shouldPrioritizeNovelty && collectedQuestions.length < CONTINUITY_TARGET) {
        const noveltyRetryPrompt = `${effectiveBasePrompt}\n\nULTIMA TENTATIVA: entregue somente perguntas novas, sem repetir nenhuma da lista bloqueada, em um ARRAY JSON.`;
        const noveltyRetryAttempt = await runContinuityAttempt(noveltyRetryPrompt, 'novelty_retry');
        collectedQuestions = mergeUniqueQuestions(collectedQuestions, noveltyRetryAttempt.questions);
      }
    }
  } catch (error) {
    scoutDiag.warn('ContinuityQuestion', 'falha ao gerar perguntas de continuidade', {
      company: empresaAlvo || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return orderByQuality(
      ensureContinuitySuggestions([], normalizedCompany, {
        contextText: recentMessages,
        avoidSuggestions: normalizedExcludedSuggestions,
      }),
    ).slice(0, CONTINUITY_TARGET);
  }

  collectedQuestions = orderByQuality(collectedQuestions);

  if (collectedQuestions.length < CONTINUITY_TARGET) {
    const beforeFallbackCount = collectedQuestions.length;
    collectedQuestions = orderByQuality(ensureContinuitySuggestions(collectedQuestions, normalizedCompany, {
      contextText: recentMessages,
      avoidSuggestions: normalizedExcludedSuggestions,
    }));
    scoutDiag.warn('ContinuityQuestion', 'fallback premium acionado para completar sugestões', {
      company: empresaAlvo || null,
      beforeFallbackCount,
      afterFallbackCount: collectedQuestions.length,
      mode: options.mode || 'default',
      blockedCount: blockedQuestionKeys.size,
    });
  }

  return ensureContinuitySuggestions(collectedQuestions, normalizedCompany, {
    contextText: recentMessages,
    avoidSuggestions: normalizedExcludedSuggestions,
  }).slice(0, CONTINUITY_TARGET);
}
