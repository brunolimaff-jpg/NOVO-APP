import { Message, Sender } from '../../types';
import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../../utils/loadingCuriosities';
import { sanitizeLoadingContextText } from '../../utils/textCleaners';
import { scoutDiag } from '../../utils/diagnosticLog';
import { ensureContinuitySuggestions } from '../../utils/continuitySuggestions';
import { proxyGenerateContent } from '../geminiProxy';
import { LOADING_CURIOSITY_MODEL_ID, ROUTER_MODEL_ID } from './config';

const CONTINUITY_SYSTEM = `
Você é o estrategista de continuidade do 🦅 Senior Scout 360.
Sua missão é criar ganchos comerciais que forcem o cliente a admitir um gap de gestão ou tecnologia.

DIRETRIZES DE PENSAMENTO:
1. ANCORAGEM OBRIGATÓRIA: Cada pergunta deve conter ao menos UM dado específico do contexto.
2. FOCO EM VENDAS (SENIOR): Direcione para sistemas: ERP, HCM, WMS ou GATec.
3. ESTILO "SNIPER": Se o contexto diz que a empresa cresceu, pergunte sobre o caos que isso gera.

PROIBIÇÕES:
- PROIBIDO: Iniciar perguntas com "Como você..." (muito vago).
- PROIBIDO: Perguntas genéricas que sirvam para qualquer empresa.

Responda EXCLUSIVAMENTE em Português (Brasil) usando um Array JSON de strings.
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
    const prompt = `Você é um gerador de mensagens de alto impacto (Sniper) para tela de carregamento de uma ferramenta de inteligência comercial chamada Senior Scout 360.
Contexto da investigação: "${safeContext}"
Consulta original: "${querySample}"

Gere um array JSON com 7 a 9 frases extremamente impactantes e informativas (máximo 180 caracteres cada), em português-BR, seguindo RIGOROSAMENTE esta proporção:
- [75% dos itens] FOCO NO SCOUT: Ações de "investigação profunda" que o Scout está realizando sobre a empresa "${safeContext}". Use verbos fortes e de inteligência: "Rastreando", "Desconstruindo", "Infiltrando", "Escaneando", "Expondo". Foque na sensação de que o Scout está descobrindo segredos operacionais valiosos.
- [25% dos itens] FOCO EM INOVAÇÃO SENIOR: Curiosidades de autoridade e diferenciação da Senior Sistemas ou inovações tecnológicas de ponta (IA, Agtech, Logtech).

Exemplos de tom desejado:
- "O Scout está agora cruzando dados de exportação com o histórico da Logística para expor gargalos ocultos no supply chain."
- "Desconstruindo a teia societária para identificar os reais centros de poder e influência na tomada de decisão."
- "Sabia? A tecnologia Senior orquestra os processos críticos de 1 em cada 4 grandes empresas do país."

Regras:
- Responda EXCLUSIVAMENTE com um array JSON de strings
- Tom: Premium, Executivo, Inteligência de Guerra
- No Scout: Sempre cite o nome da empresa se disponível
- Na inovação Senior: Foque em autoridade e escala nacional
${regionalLine}
${regionalRule}`;
    try {
      const flashResponse = await proxyGenerateContent({
        model: LOADING_CURIOSITY_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.6, maxOutputTokens: 900 },
      });
      const parsed = parseLoadingCuriosities(flashResponse.text || '', safeContext);
      if (parsed.length > 0) return parsed;
    } catch {
      // fallback para o roteador atual quando o modelo Flash dedicado estiver indisponível
    }

    const routerResponse = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.6, maxOutputTokens: 900 },
    });
    return parseLoadingCuriosities(routerResponse.text || '', safeContext);
  } catch {
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
  const basePrompt = `${contextNote}\n\nHistórico recente:\n${recentMessages}\n\nGere 4 perguntas de continuidade estratégica para o vendedor ${nomeVendedor} usar na próxima interação. Responda como array JSON de strings.`;

  const effectiveBasePrompt = [
    contextNote,
    `Historico recente:\n${recentMessages}`,
    noveltyConstraint,
    exclusionConstraint,
    `Gere ${modelRequestedCount} perguntas de continuidade estrategica para o vendedor ${nomeVendedor} usar na proxima interacao.`,
    'As 4 perguntas devem ser livres e escolhidas pela força comercial, não por mix artificial.',
    'Pode citar o nome da empresa quando isso deixar a pergunta mais precisa e mais dura comercialmente.',
    `A resposta final deve conter no minimo ${CONTINUITY_TARGET} perguntas ineditas em relacao a lista bloqueada (quando houver).`,
    'Responda como array JSON de strings, sem texto adicional.',
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
    if (candidate.length < 24 || candidate.length > 230) return false;
    if (!candidate.endsWith('?')) return false;
    if (bannedOpeners.test(candidate)) return false;
    if (/^(responda|retorne|array json|json)/i.test(candidate)) return false;
    if (/^\s*(?:\[|{)/.test(candidate)) return false;
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
    } catch {
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
    const response = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.8, maxOutputTokens: 900, systemInstruction: systemPrompt, responseMimeType: 'application/json' },
    });

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
