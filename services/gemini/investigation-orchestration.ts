import {
  ClienteSeniorData,
  Message,
  ScorePortaData,
  Sender,
} from '../../types';
import { normalizeAppError } from '../../utils/errorHelpers';
import { parsePortaMarkerV2 } from '../../utils/porta';
import { extractClienteSeniorData } from '../../utils/seniorEvidence';
import { applyPromptLeakShield } from '../../utils/textCleaners';
import { withAutoRetry } from '../../utils/retry';
import { proxyChatSendMessage, proxyGenerateContent } from '../geminiProxy';
import {
  benchmarkClientes,
  formatarBenchmarkParaPrompt,
  formatarComexParaPrompt,
  formatarParaPrompt,
  isConcorrenteOuPropria,
  lookupCliente,
  type BenchmarkResponse,
  type LookupResponse,
} from '../clientLookupService';
import { getContextoConcorrentesRegionais, type CompetitorDetection } from '../competitorService';
import { scoutDiag } from '../../utils/diagnosticLog';
import { buscarContextoDocsPinecone, buscarContextoPinecone } from '../ragService';
import {
  addFeedAdjustment,
  addFlagFeed,
  addSegmentFeed,
  generatePortaContextForDeepDive,
  getPortaState,
  initPortaState,
  resetPortaState,
  setBaseScore,
} from '../portaStateService';
import { STABLE_RESEARCH_MODEL_ID, TACTICAL_MODEL_ID, selectMainChatModelId } from './config';
import type { GeminiRequestOptions, SendMessageToGeminiResult } from './contracts';
import { parsePortaFeeds } from './porta';
import { debugRecovery, looksLikeMissedOpenQuestionAnswer, trackOpenQuestionRecoveryAttempt } from './recovery';
import { getDeepDiveSource, isDeepDiveMessage, isMegaPromptRequest, runWithStepTimeout, buildConversationHistory, type DeepDiveSource } from './runtime';
import { sanitizeStreamText, isValidEmpresaParaBenchmark } from './sanitization';
import { normalizeGroundingSources } from './sources';
import { emitDossieStatus } from './status';

function shouldEmitDeepDiveStatus(userMessage: string, label: 'corporate' | 'tech' | 'compliance' | 'rh' | 'logistica'): boolean {
  if (label === 'corporate') return userMessage.includes('TEIA SOCIETÁRIA') || userMessage.includes('M&A');
  if (label === 'tech') return userMessage.includes('ARQUITETURA DE TI') || userMessage.includes('Tech');
  if (label === 'compliance') return userMessage.includes('COMPLIANCE') || userMessage.includes('RISCOS');
  if (label === 'rh') return userMessage.includes('RH, SST') || userMessage.includes('DECISORES');
  return userMessage.includes('LOGÍSTICA') || userMessage.includes('SUPPLY');
}

function buildExtraContext(params: {
  clienteData: LookupResponse | null;
  comexData: unknown;
  ragContext: string;
  ragDocsContext: string;
  concorrentesContext: string;
  portaContext: string;
}): string {
  const { clienteData, comexData, ragContext, ragDocsContext, concorrentesContext, portaContext } = params;
  const clienteFormatado = clienteData ? formatarParaPrompt(clienteData) : '';
  const comexFormatado = (comexData as { isExportador?: boolean } | null)?.isExportador
    ? formatarComexParaPrompt(comexData as never)
    : '';

  return [
    clienteFormatado,
    comexFormatado,
    ragContext ? `\n[CONTEXTO RAG]\n${ragContext}` : '',
    ragDocsContext ? `\n[DOCS RAG]\n${ragDocsContext}` : '',
    concorrentesContext ? `\n[CONCORRENTES]\n${concorrentesContext}` : '',
    portaContext ? `\n[PORTA STATE]\n${portaContext}` : '',
  ].filter(Boolean).join('\n');
}

function initializePortaState(params: {
  isMegaPromptMessage: boolean;
  isDeepDive: boolean;
  empresaAlvo: string | null;
  userMessage: string;
  portaSessionId: string;
}): void {
  const { isMegaPromptMessage, isDeepDive, empresaAlvo, userMessage, portaSessionId } = params;
  if (isMegaPromptMessage) {
    resetPortaState();
    initPortaState(empresaAlvo || userMessage.slice(0, 60), portaSessionId);
    return;
  }

  if (isDeepDive) {
    const current = getPortaState();
    if (!current || current.sessionId !== portaSessionId) {
      initPortaState(empresaAlvo || userMessage.slice(0, 60), portaSessionId);
    }
  }
}

function processPortaFeeds(params: {
  isMegaPromptMessage: boolean;
  isDeepDive: boolean;
  deepDiveSource: DeepDiveSource;
  responseText: string;
  onScorePorta?: (score: ScorePortaData) => void;
}): ScorePortaData | null {
  const { isMegaPromptMessage, isDeepDive, deepDiveSource, responseText, onScorePorta } = params;
  if (!isMegaPromptMessage && !isDeepDive) return null;

  const source = isDeepDive ? deepDiveSource : 'MEGA';
  const baseScore = parsePortaMarkerV2(responseText || '');
  if (baseScore) {
    setBaseScore(baseScore);
  }

  const feeds = parsePortaFeeds(responseText || '', source);
  for (const adjustment of feeds.adjustments) addFeedAdjustment(adjustment);
  for (const flag of feeds.flags) addFlagFeed(flag);
  for (const segment of feeds.segments) addSegmentFeed(segment);

  const portaState = getPortaState();
  if (portaState?.consolidatedScore) {
    onScorePorta?.(portaState.consolidatedScore);
    return portaState.consolidatedScore;
  }

  if (baseScore) {
    onScorePorta?.(baseScore);
    return baseScore;
  }

  return null;
}

export async function sendMessageToGemini(
  userMessage: string,
  conversationHistory: Message[],
  systemPrompt: string,
  options: GeminiRequestOptions = {},
  canUseLookup: boolean = true,
): Promise<SendMessageToGeminiResult> {
  const {
    useGrounding = true,
    thinkingLevel,
    thinkingMode,
    useOpenWebSearch = false,
    signal,
    onText,
    onStatus,
    onScorePorta,
    onCompetitor,
    onRagFailed,
    nomeVendedor = 'Vendedor',
    sessionId,
    hintedCompany = null,
  } = options;

  void nomeVendedor;

  if (signal?.aborted) throw new Error('AbortError');
  emitDossieStatus(onStatus, 'intent');
  emitDossieStatus(onStatus, 'complexity');

  let empresaAlvo: string | null = hintedCompany || null;
  const cnpjMatch = userMessage.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})\b/);
  const cnpjDetected = cnpjMatch?.[1]?.replace(/\D/g, '') || null;
  let clienteData: LookupResponse | null = null;
  let clienteSeniorData: ClienteSeniorData | undefined;
  let comexData: unknown = null;
  emitDossieStatus(onStatus, 'context');
  emitDossieStatus(onStatus, 'enrichment');

  let ragContext = '';
  let ragDocsContext = '';

  const portaSessionId = sessionId || 'session-unknown';
  const isMegaPromptMessage = isMegaPromptRequest(userMessage, systemPrompt);
  const isDeepDive = isDeepDiveMessage(userMessage, isMegaPromptMessage);
  const deepDiveSource = isDeepDive ? getDeepDiveSource(userMessage) : 'UNKNOWN';
  const shouldForceDirectAnswer = isMegaPromptMessage && !isDeepDive;
  const resolvedThinkingLevel =
    thinkingLevel ?? (thinkingMode === true ? 'high' : thinkingMode === false ? 'low' : 'high');
  const hasActiveContextHint = !!empresaAlvo || !!cnpjDetected || isMegaPromptMessage;

  if (!empresaAlvo && isMegaPromptMessage) {
    const nameFromMegaprompt = userMessage.match(
      /dossi[eê]\s+completo\s+de\s+\[?([A-ZÀ-Úa-zà-ú][^\]\n]{2,80})\]?/i,
    )?.[1]?.trim();
    if (nameFromMegaprompt && isValidEmpresaParaBenchmark(nameFromMegaprompt)) {
      empresaAlvo = nameFromMegaprompt;
      scoutDiag.info?.('EmpresaAlvo', 'extraído do megaprompt na 1ª passada', { empresaAlvo });
    }
  }

  let targetCompanyForLookup: string | null = canUseLookup ? (empresaAlvo ?? null) : null;

  if (canUseLookup && !targetCompanyForLookup && isDeepDive && conversationHistory.length > 0) {
    const previousTargetMessage = [...conversationHistory]
      .reverse()
      .find(message => message.sender === Sender.User && message.text?.includes('DOSSIÊ'));
    if (previousTargetMessage) {
      const nameMatch = previousTargetMessage.text.match(/(?:DOSSIÊ|DOSSIE)\s+(?:COMPLETO\s+)?(?:DE\s+)?\[?([A-ZÀ-Ú][^\]\n]{2,60})\]?/i);
      if (nameMatch?.[1]) targetCompanyForLookup = nameMatch[1].trim();
    }
  }

  if (targetCompanyForLookup) {
    emitDossieStatus(onStatus, 'cadastral');
    scoutDiag.warn('Cadastral', 'iniciando lookupCliente', {
      target: String(targetCompanyForLookup).slice(0, 80),
    });
    try {
      const lookupPromises: Promise<unknown>[] = [lookupCliente(targetCompanyForLookup)];
      const cleanCnpj = cnpjDetected || '';
      if (cleanCnpj.length === 14) {
        // TODO: A API /api/comex atual usa um mock determinístico para simular exportadores.
      }

      const results = await Promise.allSettled(lookupPromises);

      if (results[0].status === 'rejected') {
        scoutDiag.error('Cadastral', 'lookupCliente rejeitado', {
          target: String(targetCompanyForLookup).slice(0, 80),
          reason: String(results[0].reason),
        });
      } else if (results[0].value) {
        clienteData = results[0].value as LookupResponse;
        const resolvedCompanyName =
          clienteData?.results?.[0]?.grupo?.trim() || clienteData?.query?.trim() || null;
        if (resolvedCompanyName && !empresaAlvo) empresaAlvo = resolvedCompanyName;

        if (clienteData?.error) {
          scoutDiag.warn('Cadastral', 'lookup com falha técnica ou resposta inválida', {
            query: clienteData.query,
            error: clienteData.error,
            ok: clienteData.ok,
            encontrado: clienteData.encontrado,
          });
        }

        if (clienteData?.results && clienteData.results.length > 0) {
          clienteSeniorData = extractClienteSeniorData(clienteData);
        }

        scoutDiag.warn('Cadastral', 'lookupCliente concluído', {
          encontrado: clienteData?.encontrado,
          query: clienteData?.query,
          ok: clienteData?.ok,
          totalModulos: clienteSeniorData?.totalModulos ?? null,
        });
      }

      if (results.length > 1 && results[1].status === 'fulfilled' && results[1].value) {
        comexData = results[1].value;
      }
    } catch (error: unknown) {
      scoutDiag.error('Cadastral', 'exceção no bloco de lookup', {
        target: String(targetCompanyForLookup).slice(0, 80),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isDeepDive && (!clienteSeniorData || !clienteSeniorData.encontrado)) {
    const previousBotMessageWithClientData = [...conversationHistory]
      .reverse()
      .find(message => message.sender === Sender.Bot && message.clienteSeniorData?.encontrado);

    if (previousBotMessageWithClientData?.clienteSeniorData) {
      clienteSeniorData = previousBotMessageWithClientData.clienteSeniorData;
    }
  }

  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'rag');
    try {
      const [pinecone, docs] = await Promise.all([
        buscarContextoPinecone(userMessage, empresaAlvo || ''),
        buscarContextoDocsPinecone(userMessage),
      ]);
      ragContext = pinecone.context;
      ragDocsContext = docs.context;
      if (pinecone.failed || docs.failed) onRagFailed?.();
    } catch (error: unknown) {
      scoutDiag.error('RAG', 'exceção ao buscar contexto Pinecone/docs', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let concorrentesContext = '';
  if (isMegaPromptMessage) {
    emitDossieStatus(onStatus, 'concorrentes');
    try {
      concorrentesContext = await getContextoConcorrentesRegionais(empresaAlvo || userMessage);
    } catch (error: unknown) {
      scoutDiag.warn('Concorrentes', 'falha ao montar contexto regional', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'deepResearch');
  }

  if (isDeepDive) {
    if (shouldEmitDeepDiveStatus(userMessage, 'corporate')) emitDossieStatus(onStatus, 'corporate');
    if (shouldEmitDeepDiveStatus(userMessage, 'tech')) emitDossieStatus(onStatus, 'tech');
    if (shouldEmitDeepDiveStatus(userMessage, 'compliance')) emitDossieStatus(onStatus, 'compliance');
    if (shouldEmitDeepDiveStatus(userMessage, 'rh')) emitDossieStatus(onStatus, 'rh');
    if (shouldEmitDeepDiveStatus(userMessage, 'logistica')) emitDossieStatus(onStatus, 'logistica');
  }

  const portaContext = isMegaPromptMessage ? generatePortaContextForDeepDive(deepDiveSource || 'MEGA') : '';
  const extraContext = buildExtraContext({
    clienteData,
    comexData,
    ragContext,
    ragDocsContext,
    concorrentesContext,
    portaContext,
  });

  const fullSystemPrompt = extraContext ? `${systemPrompt}\n\n${extraContext}` : systemPrompt;
  emitDossieStatus(onStatus, 'context');
  emitDossieStatus(onStatus, 'prompt');
  emitDossieStatus(onStatus, 'history');

  const history = buildConversationHistory(conversationHistory, isDeepDive);
  const historyChars = history.reduce((total, item) => total + item.text.length, 0);
  const promptBudget = {
    sessionId: sessionId ?? null,
    hintedCompany: hintedCompany ?? null,
    resolvedCompany: empresaAlvo ?? null,
    modelToUse: null as string | null,
    userChars: userMessage.length,
    systemChars: fullSystemPrompt.length,
    historyChars,
    historyMessages: history.length,
    isMegaPromptMessage,
    isDeepDive,
    shouldUseGrounding: false,
  };

  initializePortaState({
    isMegaPromptMessage,
    isDeepDive,
    empresaAlvo,
    userMessage,
    portaSessionId,
  });

  const modelToUse = selectMainChatModelId({
    isDeepDive,
    isMegaPromptMessage,
    shouldForceDirectAnswer,
  });
  const shouldUseGrounding = useGrounding;
  promptBudget.modelToUse = modelToUse;
  promptBudget.shouldUseGrounding = shouldUseGrounding;

  if (isMegaPromptMessage || isDeepDive) {
    scoutDiag.info?.('GeminiBudget', 'iniciando investigação com orçamento de contexto', promptBudget);
    const totalChars = promptBudget.userChars + promptBudget.systemChars + promptBudget.historyChars;
    if (totalChars > 120000) {
      scoutDiag.warn('GeminiBudget', 'payload elevado para investigação', {
        ...promptBudget,
        totalChars,
      });
    }
  }

  let finalText: string;
  emitDossieStatus(onStatus, 'model');
  emitDossieStatus(onStatus, 'response');

  let response;
  const requestStartedAt = Date.now();
  let usedGroundingFallback = false;
  try {
    response = await withAutoRetry(
      'Gemini:sendMessage',
      () =>
        proxyChatSendMessage(
          {
            model: modelToUse,
            systemInstruction: fullSystemPrompt,
            history,
            message: userMessage,
            useGrounding: shouldUseGrounding,
            thinkingLevel: resolvedThinkingLevel,
            thinkingMode,
            useOpenWebSearch,
          },
          signal,
        ),
      { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 30000, abortSignal: signal },
    );
  } catch (error) {
    const appError = normalizeAppError(error);
    const canFallbackWithoutGrounding =
      shouldUseGrounding && ['TIMEOUT', 'NETWORK', 'MODEL_OVERLOADED', 'SERVER'].includes(appError.code);

    if (!canFallbackWithoutGrounding) throw error;

    onStatus?.('Entrando em contingência sem busca externa...');
    usedGroundingFallback = true;
    response = await withAutoRetry(
      'Gemini:sendMessage:fallback-no-grounding',
      () =>
        proxyChatSendMessage(
          {
            model: TACTICAL_MODEL_ID,
            systemInstruction: fullSystemPrompt,
            history,
            message: userMessage,
            useGrounding: false,
            thinkingLevel: resolvedThinkingLevel,
            thinkingMode,
          },
          signal,
        ),
      { maxRetries: 4, baseDelayMs: 2000, maxDelayMs: 20000, abortSignal: signal },
    );
  }

  finalText = sanitizeStreamText(response.text || '');
  const leakShieldResult = applyPromptLeakShield(finalText, {
    companyHint: empresaAlvo || hintedCompany || '',
  });
  if (leakShieldResult.blocked) {
    scoutDiag.warn('PromptLeakShield', 'resposta bloqueada por possível vazamento de prompt', {
      sessionId: sessionId ?? null,
      resolvedCompany: empresaAlvo ?? hintedCompany ?? null,
      fingerprint: leakShieldResult.fingerprint,
      indicators: leakShieldResult.indicators,
      modelToUse,
      isMegaPromptMessage,
      isDeepDive,
    });
    finalText = leakShieldResult.text;
  }

  if (isMegaPromptMessage || isDeepDive) {
    scoutDiag.info?.('GeminiTiming', 'investigação concluída', {
      sessionId: sessionId ?? null,
      resolvedCompany: empresaAlvo ?? null,
      modelToUse,
      durationMs: Date.now() - requestStartedAt,
      responseChars: finalText.length,
      usedGroundingFallback,
      isMegaPromptMessage,
      isDeepDive,
    });
  }

  emitDossieStatus(onStatus, 'validation');
  emitDossieStatus(onStatus, 'synthesis');

  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'scoring');
  }

  const scorePorta = processPortaFeeds({
    isMegaPromptMessage,
    isDeepDive,
    deepDiveSource,
    responseText: response.text || '',
    onScorePorta,
  });

  if (onCompetitor && finalText) {
    try {
      const competitorDetected = isConcorrenteOuPropria(finalText);
      if (competitorDetected) {
        onCompetitor({ encontrado: true, detected: true, names: ['Concorrente Detectado'] } as CompetitorDetection);
      }
    } catch {
      // silencioso
    }
  }

  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'consolidando');
  }

  if (onText && finalText) {
    onText(finalText);
  }
  emitDossieStatus(onStatus, 'finalReview');
  emitDossieStatus(onStatus, 'hooks');

  const shouldRecoverByFallback = looksLikeMissedOpenQuestionAnswer(finalText);
  debugRecovery('pre-check', {
    shouldForceDirectAnswer,
    hasActiveContextHint,
    shouldRecoverByFallback,
    finalTextSnippet: finalText.slice(0, 120),
  });

  if (shouldForceDirectAnswer && shouldRecoverByFallback) {
    trackOpenQuestionRecoveryAttempt();
  }

  const sources = leakShieldResult.blocked ? [] : normalizeGroundingSources(response);
  const suggestions: string[] = [];

  return {
    text: finalText,
    sources,
    suggestions,
    scorePorta: leakShieldResult.blocked ? null : scorePorta,
    clienteSeniorData: leakShieldResult.blocked ? undefined : clienteSeniorData,
    ghostReason: leakShieldResult.blocked ? 'prompt_leak_blocked' : null,
  };
}

export async function generateDossierModule(
  moduleName: string,
  empresaAlvo: string,
  foundationBlock: string,
  specialistPrompt: string,
  extraContext: string = '',
  options: { signal?: AbortSignal; onText?: (text: string) => void; timeoutMs?: number } = {},
): Promise<string> {
  const finalPrompt = `${foundationBlock}\n\n${specialistPrompt}\n\n${extraContext}`;
  const promptChars = finalPrompt.length;
  const startedAt = Date.now();

  scoutDiag.info?.('DossierModule', 'iniciando módulo especializado', {
    moduleName,
    empresaAlvo,
    foundationChars: foundationBlock.length,
    specialistChars: specialistPrompt.length,
    extraContextChars: extraContext.length,
    promptChars,
  });
  if (promptChars > 80000) {
    scoutDiag.warn('DossierModule', 'módulo especializado com prompt elevado', {
      moduleName,
      empresaAlvo,
      promptChars,
    });
  }

  const response = await runWithStepTimeout(
    `DossierModule:${moduleName}`,
    stepSignal =>
      proxyGenerateContent(
        {
          model: STABLE_RESEARCH_MODEL_ID,
          contents: `Empresa alvo: ${empresaAlvo}\nGere APENAS o bloco de ${moduleName} com extrema precisão e profundidade comercial.`,
          config: { systemInstruction: finalPrompt, temperature: 0.2, maxOutputTokens: 8192 },
        },
        stepSignal,
      ),
    options.signal,
    options.timeoutMs,
  );

  const shieldedResult = applyPromptLeakShield(response.text || '', { companyHint: empresaAlvo });
  if (shieldedResult.blocked) {
    scoutDiag.warn('PromptLeakShield', 'módulo do dossiê bloqueado por possível vazamento de prompt', {
      moduleName,
      empresaAlvo,
      fingerprint: shieldedResult.fingerprint,
      indicators: shieldedResult.indicators,
    });
  }
  const finalText = shieldedResult.text;
  scoutDiag.info?.('DossierModule', 'módulo especializado concluído', {
    moduleName,
    empresaAlvo,
    durationMs: Date.now() - startedAt,
    responseChars: finalText.length,
  });
  if (options.onText && finalText) options.onText(finalText);
  return finalText;
}

export async function getIsolatedBenchmark(
  empresaAlvo: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  if (!isValidEmpresaParaBenchmark(empresaAlvo)) return '';

  const benchmarkResult = await runWithStepTimeout(
    `Benchmark:Isolated:${empresaAlvo}`,
    stepSignal =>
      withAutoRetry(
        'Benchmark:Isolated',
        () => benchmarkClientes(empresaAlvo),
        { maxRetries: 3, abortSignal: stepSignal },
      ),
    options.signal,
    options.timeoutMs,
  );

  if (!benchmarkResult || !benchmarkResult.ok || !benchmarkResult.results?.length) return '';

  const benchmarkPrompt = formatarBenchmarkParaPrompt(benchmarkResult as BenchmarkResponse, empresaAlvo);

  const response = await proxyGenerateContent(
    {
      model: TACTICAL_MODEL_ID,
      contents: `Sua tarefa é formatar Referências de Mercado Estratégicas para a empresa: ${empresaAlvo}.
Use EXCLUSIVAMENTE os dados abaixo:
${benchmarkPrompt}

Diretriz: Crie um bloco de alto impacto para o final do dossiê, listando cases similares atendidos pela Senior.`,
      config: { temperature: 0.1 },
    },
    options.signal,
  );

  return applyPromptLeakShield(response.text || '', { companyHint: empresaAlvo }).text;
}
