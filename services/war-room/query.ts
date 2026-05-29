import { normalizeAppError } from '../../utils/errorHelpers';
import { withAutoRetry } from '../../utils/retry';
import { proxyGerarDossie } from '../geminiProxy';
import { MODEL_ID, MODEL_TIMEOUT_MS } from './config';
import type {
  WarRoomMessage,
  WarRoomMode,
  WarRoomModelResponse,
  WarRoomQueryOptions,
  WarRoomResult,
} from './contracts';
import { collectWarRoomIntentFlags, isOutOfScope, normalizeTarget } from './intent';
import { buildWarRoomPrompt, getWarRoomSystemPrompt } from './prompting';
import { loadWarRoomDocsContext } from './retrieval';
import { detectHallucinatedUrls, enforceBankingAnchors, extractGroundingSources } from './sources';

function makeAbortError(): Error {
  const error = new Error('Request aborted');
  error.name = 'AbortError';
  return error;
}

function runWithTimeoutAndSignal<T>(task: () => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }

    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(makeAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    task()
      .then(value => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      })
      .catch(error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
  });
}

function buildOutOfScopeResult(): WarRoomResult {
  return {
    text: `⚠️ **Essa pesquisa é melhor no Chat Principal!**\n\nO War Room é focado em **dúvidas técnicas** sobre o ERP Senior (módulos, processos, integrações).\n\nPara investigar empresas, gerar dossiês ou consultar CNPJs, use o **Chat Principal** do 🦅 Senior Scout 360. Feche o War Room clicando no ✕ e faça sua pesquisa direto no chat.\n\n---\n\n💡 **Exemplos do que o War Room responde:**\n- "Como funciona o módulo de compras no ERP Senior?"\n- "Qual a diferença entre Sapiens e Gestão Empresarial?"\n- "Como configurar integração com NFe?"`,
    sources: [],
    outOfScope: true,
  };
}

function buildAbortedResult(): WarRoomResult {
  return {
    text: '⚠️ **Erro**\n\nSolicitação cancelada pelo usuário.',
    sources: [],
    isError: true,
    retryable: false,
    technicalDetails: 'ABORTED: solicitação cancelada antes da execução.',
  };
}

export async function queryWarRoom(
  mode: WarRoomMode,
  message: string,
  history: WarRoomMessage[],
  target: string,
  onStatus?: (status: string) => void,
  options: WarRoomQueryOptions = {},
): Promise<WarRoomResult> {
  const { signal, timeoutMs = MODEL_TIMEOUT_MS } = options;

  if (signal?.aborted) {
    return buildAbortedResult();
  }

  if (mode === 'tech' && isOutOfScope(message)) {
    return buildOutOfScopeResult();
  }

  const resolvedTarget = mode === 'tech' ? '' : normalizeTarget(target, message);
  const flags = collectWarRoomIntentFlags(mode, message);
  const systemPrompt = getWarRoomSystemPrompt(mode, resolvedTarget);
  const { docsContext, docsUnavailable } = await loadWarRoomDocsContext(mode, message, flags, onStatus);

  if ((mode === 'tech' || mode === 'benchmark') && docsContext) {
    onStatus?.('🔍 Analisando documentação...');
  }

  const fullPrompt = buildWarRoomPrompt({
    mode,
    message,
    history,
    docsContext,
    flags,
  });

  onStatus?.(mode === 'tech' ? '🧠 Gerando resposta técnica...' : `⚔️ Forjando argumentos contra ${resolvedTarget}...`);

  try {
    const useGrounding = mode !== 'tech';
    const response = await withAutoRetry(
      'war-room-generate',
      () =>
        runWithTimeoutAndSignal(
          () =>
            proxyGerarDossie(
              {
                model: MODEL_ID,
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                config: {
                  systemInstruction: systemPrompt,
                  temperature: mode === 'tech' ? 0.15 : 0.3,
                  maxOutputTokens: 8192,
                  tools: useGrounding ? [{ googleSearch: {} }] : undefined,
                },
              },
              signal,
            ),
          timeoutMs,
          signal,
        ),
      { maxRetries: 2, baseDelayMs: 700, maxDelayMs: 3000 },
    );

    const modelResponse = response as WarRoomModelResponse;
    let text = modelResponse.text || '';
    const sources = extractGroundingSources(modelResponse);

    if (!text.trim()) {
      throw new Error('Resposta vazia do modelo');
    }

    if (flags.wantsBanking) {
      text = enforceBankingAnchors(text);
    }

    // Detector de alucinacao pos-processamento
    if (docsContext) {
      const knownUrls: Array<{ url?: string }> = [];
      const urlRegex = /https:\/\/documentacao\.senior\.com\.br\/[^\s)>]+/g;
      let urlMatch: RegExpExecArray | null;
      while ((urlMatch = urlRegex.exec(docsContext)) !== null) {
        knownUrls.push({ url: urlMatch[0] });
      }
      detectHallucinatedUrls(text, knownUrls);
    }

    const disclaimer =
      docsUnavailable && (mode === 'tech' || mode === 'benchmark')
        ? '\n\n_[Aviso: o contexto do Pinecone não respondeu nesta tentativa; resposta baseada em conhecimento complementar.]_'
        : '';

    return { text: (text.trim() + disclaimer).trim(), sources };
  } catch (error: unknown) {
    console.error('[WarRoom] Erro:', error);
    const appError = normalizeAppError(error, 'GEMINI', 'Falha ao consultar War Room.');
    const errorMessage =
      appError.friendlyMessage || `Erro de comunicação: ${appError.message || 'Falha na conexão'}. Tente novamente.`;

    return {
      text: `⚠️ **Erro**\n\n${errorMessage}`,
      sources: [],
      isError: true,
      retryable: appError.retryable,
      technicalDetails: `source=${appError.source}; code=${appError.code}; status=${appError.httpStatus ?? 'n/a'}; message=${appError.message}`,
    };
  }
}
