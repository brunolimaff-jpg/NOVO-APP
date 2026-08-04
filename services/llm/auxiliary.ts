import { Message, Sender } from '../../types';
import { ensureContinuitySuggestions } from '../../utils/continuitySuggestions';

export interface ContinuityQuestionOptions {
  mode?: 'default' | 'regenerate';
  avoidSuggestions?: string[];
  ensureFresh?: boolean;
  signal?: AbortSignal;
}

function throwIfContinuityAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (typeof DOMException !== 'undefined') {
    throw new DOMException('The operation was aborted', 'AbortError');
  }
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}

export async function generateContinuityQuestion(
  messages: Message[],
  empresaAlvo: string | null,
  nomeVendedor: string,
  options: ContinuityQuestionOptions = {},
): Promise<string[]> {
  throwIfContinuityAborted(options.signal);

  const CONTINUITY_TARGET = 4;
  const normalizedCompany = (empresaAlvo || '').trim();
  const normalizedExcludedSuggestions = (options.avoidSuggestions || [])
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 12);
  const recentMessages = messages
    .slice(-6)
    .map(message => `${message.sender === Sender.User ? 'Vendedor' : 'Scout'}: ${message.text?.slice(0, 300) || ''}`)
    .join('\n');

  // BYPASS 2026-06-09: generateContinuityQuestion pula LLM.
  // 100% das tentativas caíam no fallback (~20s latência sem retorno).
  // O fallback ensureContinuitySuggestions tem 23 templates em 6 temas — qualidade equivalente.
  // Código LLM completo preservado no git history (removido em refatoração god-component).
  return ensureContinuitySuggestions([], normalizedCompany, {
    contextText: recentMessages,
    avoidSuggestions: normalizedExcludedSuggestions,
  }).slice(0, CONTINUITY_TARGET);
}
