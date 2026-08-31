/**
 * BRU-109 DECISÃO 1 (A) — Taxonomia estruturada do compact-error.
 *
 * Veredito do Planejador (2026-08-15): o compact-error NÃO deve carregar
 * texto livre (error.message arbitrário) — somente uma classe + métricas
 * estruturais que discriminam vazio × prosa × JSON truncado × JSON
 * sintaticamente inválido × falha de transporte. Persistência garantida no
 * scout_diagnostics (evento crítico Gold) com payload estrutural apenas.
 *
 * Módulo browser-safe (sem dependências Node/DOM): importado pelo adapter do
 * browser e pelo pipeline Gold.
 */
import { isAbortLikeError } from '../../../utils/abortHelpers';
import { parseJsonPayload } from './prompts/gold-contract-prompts';
import type { RawFindingPack } from './gold-contracts';

export type CompactErrorClass =
  | 'JSON_NOT_FOUND'
  | 'JSON_SYNTAX'
  | 'PROXY_TRANSPORT'
  | 'PROXY_INVALID_BODY'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface CompactErrorMeta {
  errorClass: CompactErrorClass;
  /** Comprimento da resposta crua (text) do LLM — nunca o pack parseado. */
  responseChars?: number;
  /** finishReason devolvido pelo /api/llm (separar truncamento de desobediência). */
  finishReason?: string | null;
  /** Presença de `{` e `}` na resposta crua (boundary de objeto JSON). */
  hasObjectBoundary?: boolean;
}

/** Erro estruturado carregado pelo adapter quando o compact falha. */
export class CompactPayloadError extends Error {
  readonly errorClass: CompactErrorClass;
  readonly responseChars?: number;
  readonly finishReason?: string | null;
  readonly hasObjectBoundary?: boolean;

  constructor(message: string, meta: CompactErrorMeta) {
    super(message);
    this.name = 'CompactPayloadError';
    this.errorClass = meta.errorClass;
    this.responseChars = meta.responseChars;
    this.finishReason = meta.finishReason;
    this.hasObjectBoundary = meta.hasObjectBoundary;
  }
}

/** True quando a string tem um par `{` ... `}` (boundary de objeto). */
export function hasObjectBoundary(text: string): boolean {
  const t = (text || '').trim();
  return t.indexOf('{') !== -1 && t.lastIndexOf('}') !== -1 && t.lastIndexOf('}') > t.indexOf('{');
}

/**
 * Classifica um erro de compact em CompactErrorClass pela mensagem.
 * Usado pelo pipeline quando o erro NÃO é CompactPayloadError (ex.: mock ou
 * erro não estruturado) — fallback UNKNOWN nunca mente sobre a classe.
 *
 * BRU-76 (BRU-117 lote 1): HTTP 504 do proxy e TimeoutError externo são
 * TIMEOUT; AbortError permanece distinto (nunca vira timeout/retry).
 */
export function classifyCompactErrorClass(error: unknown): CompactErrorClass {
  if (error instanceof CompactPayloadError) return error.errorClass;
  const message = error instanceof Error ? error.message : String(error);
  const isDomTimeout =
    typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'TimeoutError';
  const name = error instanceof Error ? error.name : '';

  // TimeoutError externo (ex.: AbortSignal.timeout do deadline Gold) → TIMEOUT.
  // Checado ANTES do abort-like: TimeoutError com mensagem contendo "aborted"
  // (ex.: "The operation was aborted due to timeout") NÃO é abort do usuário —
  // o name é mais específico que o heurístico de mensagem.
  if (isDomTimeout || name === 'TimeoutError' || /TimeoutError/i.test(message)) return 'TIMEOUT';
  if (isAbortLikeError(error)) return 'UNKNOWN';
  // HTTP 504 do proxy (gateway timeout) → TIMEOUT (antes do PROXY_TRANSPORT genérico).
  if (/LLM proxy failed \(504\)/i.test(message)) return 'TIMEOUT';
  if (/timeout after \d+ms/i.test(message)) return 'TIMEOUT';
  if (/LLM proxy failed \(\d+\)/i.test(message)) return 'PROXY_TRANSPORT';
  if (/returned invalid JSON/i.test(message)) return 'PROXY_INVALID_BODY';
  if (/JSON n[aã]o encontrado|esperado objeto|JSON inv[aá]lido/i.test(message)) return 'JSON_NOT_FOUND';
  if (/Unexpected token|Unexpected end|JSON\.parse|in JSON at position|SyntaxError/i.test(message)) {
    return 'JSON_SYNTAX';
  }
  return 'UNKNOWN';
}

/** Detail do evento compact-error: somente metadados estruturais, nunca texto. */
export function compactErrorStageDetail(error: unknown): CompactErrorMeta {
  if (error instanceof CompactPayloadError) {
    return {
      errorClass: error.errorClass,
      responseChars: error.responseChars,
      finishReason: error.finishReason,
      hasObjectBoundary: error.hasObjectBoundary,
    };
  }
  return { errorClass: classifyCompactErrorClass(error) };
}

/**
 * Parseia a resposta crua do compact classificando a falha com metadados
 * estruturais (errorClass + responseChars + finishReason + hasObjectBoundary).
 *
 * Uso no adapter browser: substitui `parseJsonPayload(result.text)` direto —
 * a resposta CRUA que falhou é medida aqui (nunca o pack parseado), para a
 * telemetria discriminar vazio × prosa × JSON truncado × JSON inválido.
 */
export function tryParseCompactPayload(
  text: string,
  options: { finishReason?: string | null } = {},
): RawFindingPack {
  const responseChars = (text || '').length;
  const boundary = hasObjectBoundary(text);
  const finishReason = options.finishReason ?? null;

  try {
    return parseJsonPayload(text);
  } catch (error) {
    // JSON.parse de um JSON com boundary presente é falha SINTÁTICA (ex.:
    // truncado no meio); sem boundary é ausência de JSON (prosa/vazio).
    const errorClass: CompactErrorClass = boundary ? 'JSON_SYNTAX' : 'JSON_NOT_FOUND';
    const message = error instanceof Error ? error.message : String(error);
    throw new CompactPayloadError(`Compact: ${errorClass} — ${message.slice(0, 120)}`, {
      errorClass,
      responseChars,
      finishReason,
      hasObjectBoundary: boundary,
    });
  }
}
