import { DEEP_DIVE_SOURCES, Message, Sender } from '../../types';
import { sanitizeHistoryText } from './sanitization';

export type DeepDiveSource = (typeof DEEP_DIVE_SOURCES)[keyof typeof DEEP_DIVE_SOURCES] | 'UNKNOWN';

const FOLLOW_UP_BOT_HISTORY_CHAR_LIMIT = 6000;
const FOLLOW_UP_USER_HISTORY_CHAR_LIMIT = 1200;

interface BuildConversationHistoryOptions {
  isDeepDive?: boolean;
  isFollowUp?: boolean;
}

interface ConversationTurn {
  user: Message;
  model: Message;
}

function limitHistoryText(text: string, limit: number): string {
  if (text.length <= limit) return text;

  const headLength = Math.ceil(limit * 0.7);
  const tailLength = Math.floor(limit * 0.3);
  return [
    text.slice(0, headLength).trimEnd(),
    '[historico anterior compactado para reduzir custo; se faltar contexto, pergunte ao usuario]',
    text.slice(-tailLength).trimStart(),
  ].join('\n\n');
}

function toModelHistoryItem(message: Message): { role: 'user' | 'model'; text: string } {
  const limit =
    message.sender === Sender.Bot ? FOLLOW_UP_BOT_HISTORY_CHAR_LIMIT : FOLLOW_UP_USER_HISTORY_CHAR_LIMIT;
  return {
    role: message.sender === Sender.User ? 'user' : 'model',
    text: limitHistoryText(sanitizeHistoryText(message.text || ''), limit),
  };
}

function buildCompleteTurns(messages: Message[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let pendingUser: Message | null = null;

  for (const message of messages) {
    if (message.sender === Sender.User) {
      pendingUser = message;
      continue;
    }

    if (message.sender === Sender.Bot && pendingUser) {
      turns.push({ user: pendingUser, model: message });
      pendingUser = null;
    }
  }

  return turns;
}

function buildFollowUpHistory(messages: Message[]): Array<{ role: 'user' | 'model'; text: string }> {
  const turns = buildCompleteTurns(messages);
  if (turns.length === 0) return [];

  const selectedTurns = turns.length === 1
    ? turns
    : [turns[0], turns[turns.length - 1]];

  return selectedTurns.flatMap(turn => [toModelHistoryItem(turn.user), toModelHistoryItem(turn.model)]);
}

export function isMegaPromptRequest(userMessage: string, systemPrompt: string): boolean {
  const combined = `${systemPrompt}\n${userMessage}`.toUpperCase();
  return (
    combined.includes('INVESTIGACAO_COMPLETA_INTEGRADA') ||
    combined.includes('DOSSIE_COMPLETO') ||
    combined.includes('DOSSIE COMPLETO DE [') ||
    combined.includes('DOSSIÊ COMPLETO DE [') ||
    combined.includes('PROTOCOLO DE INVESTIGACAO FORENSE ESPECIALIZADA') ||
    combined.includes('PROTOCOLO DE INVESTIGAÇÃO FORENSE ESPECIALIZADA')
  );
}

export function isDeepDiveMessage(message: string, isMegaPromptMessage: boolean): boolean {
  if (!isMegaPromptMessage) return false;
  const deepDiveHints = [
    'INTELIGÊNCIA OPERACIONAL',
    'ARQUITETURA DE TI',
    'COMPLIANCE, RISCO FISCAL',
    'TEIA SOCIETÁRIA',
    'RH, SST E GESTÃO DE PESSOAS',
    'CADEIA DE COMANDO',
    'ORÇAMENTO E JANELA DE COMPRA',
  ];
  return deepDiveHints.some(hint => message.includes(hint));
}

export function getDeepDiveSource(message: string): DeepDiveSource {
  if (message.includes('INTELIGÊNCIA OPERACIONAL') || message.includes('Raio-X')) return DEEP_DIVE_SOURCES.RAIO_X;
  if (message.includes('ARQUITETURA DE TI') || message.includes('Tech Stack')) return DEEP_DIVE_SOURCES.TECH;
  if (message.includes('COMPLIANCE') || message.includes('RISCOS')) return DEEP_DIVE_SOURCES.COMPLIANCE;
  if (message.includes('TEIA SOCIETÁRIA') || message.includes('M&A')) return DEEP_DIVE_SOURCES.EXPANSAO;
  if (message.includes('RH, SST') || message.includes('SINDICATOS')) return DEEP_DIVE_SOURCES.RH;
  if (message.includes('CADEIA DE COMANDO') || message.includes('DECISORES')) return DEEP_DIVE_SOURCES.DECISORES;
  if (message.includes('ORÇAMENTO') || message.includes('JANELA DE COMPRA')) return DEEP_DIVE_SOURCES.ORCAMENTO;
  return 'UNKNOWN';
}

export function buildConversationHistory(
  conversationHistory: Message[],
  optionsOrIsDeepDive: BuildConversationHistoryOptions | boolean,
): Array<{ role: 'user' | 'model'; text: string }> {
  const validMessages = conversationHistory.filter(message => message.text && message.text.trim().length > 0);
  const options =
    typeof optionsOrIsDeepDive === 'boolean'
      ? { isDeepDive: optionsOrIsDeepDive }
      : optionsOrIsDeepDive;

  if (options.isDeepDive) {
    return validMessages
      .filter(message => message.sender === Sender.User)
      .slice(-4)
      .map(message => ({
        role: 'user',
        text: sanitizeHistoryText(message.text || ''),
      }));
  }

  if (options.isFollowUp) {
    return buildFollowUpHistory(validMessages);
  }

  return validMessages.map(message => ({
    role: message.sender === Sender.User ? 'user' : 'model',
    text: sanitizeHistoryText(message.text || ''),
  }));
}

export function buildTimeoutError(label: string, timeoutMs: number): Error {
  const error = new Error(`${label} timeout after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  return error;
}

export async function runWithStepTimeout<T>(
  label: string,
  action: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return action(signal);
  }

  const timeoutController = new AbortController();
  const relayAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timeoutController.abort();
      reject(buildTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([action(timeoutController.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    signal?.removeEventListener('abort', relayAbort);
  }
}
