import { AppError, ErrorCode, ErrorSource } from '../types';
import { ChatMode } from '../constants';

type ErrorLike = {
  code?: unknown;
  details?: unknown;
  friendlyMessage?: unknown;
  message?: unknown;
  name?: unknown;
  source?: unknown;
  status?: unknown;
};

function toErrorLike(error: unknown): ErrorLike {
  return error && typeof error === 'object' ? (error as ErrorLike) : {};
}

/**
 * Normaliza qualquer erro para o formato AppError.
 */
export function normalizeAppError(
  error: unknown,
  source: ErrorSource = 'UNKNOWN',
  defaultMessage: string = 'Ocorreu um erro inesperado.',
): AppError {
  const errorLike = toErrorLike(error);

  // Se já for um AppError, retorna ele mesmo (pode precisar ajustar a source se for genérica)
  if (isAppError(error)) {
    return {
      ...error,
      source: error.source === 'UNKNOWN' ? source : error.source,
    };
  }

  const rawMessage = typeof errorLike.message === 'string' ? errorLike.message : String(error);
  const explicitStatus =
    typeof errorLike.status === 'number' ? errorLike.status : typeof errorLike.code === 'number' ? errorLike.code : 0;
  // Extrai status HTTP do formato "LLM proxy failed (XXX): ..." (llmProxy.ts)
  const proxyStatusMatch = rawMessage.match(/LLM proxy failed \((\d{3})\)/);
  // Extrai status HTTP de JSON inline: {"code":"500"} ou "code": 500
  const jsonStatusMatch = rawMessage.match(/"code"\s*:\s*"?(\d{3})"?/);
  const status =
    explicitStatus ||
    (proxyStatusMatch ? Number(proxyStatusMatch[1]) : 0) ||
    (jsonStatusMatch ? Number(jsonStatusMatch[1]) : 0);

  let code: ErrorCode = 'UNKNOWN';
  let friendlyMessage = defaultMessage;
  let retryable = true; // Default: botão "Tentar de novo" aparece
  let transient = false; // Default: sem auto-retry automático

  // 0. Erros Fatais de Fetch / Abort (NÃO RETENTAR)
  if (rawMessage.match(/input body is disturbed/i)) {
    code = 'UNKNOWN';
    friendlyMessage = 'Erro técnico na comunicação (Corpo da requisição já utilizado).';
    retryable = false;
    transient = false; // CRÍTICO: Nunca retentar erro de body disturbed
  } else if (rawMessage.match(/aborted/i) || errorLike.name === 'AbortError' || errorLike.code === 'ABORTED') {
    code = 'ABORTED';
    friendlyMessage = 'Solicitação cancelada pelo usuário.';
    retryable = false;
    transient = false; // CRÍTICO: Nunca retentar cancelamento do usuário
  }
  // 1. Erros de Rede / Conexão (Fetch API)
  else if (
    rawMessage.match(
      /fetch failed|load failed|network|connection|offline|internet|failed to fetch|err_connection|net::err_/i,
    )
  ) {
    code = 'NETWORK';
    friendlyMessage = 'Parece que você está sem internet ou houve uma falha na conexão.';
    transient = true;
  }
  // 2. Timeout
  else if (rawMessage.match(/timeout|deadline/i)) {
    code = 'TIMEOUT';
    friendlyMessage = 'O servidor demorou muito para responder.';
    transient = true;
  }
  // 3. Rate Limit / Quota (429)
  else if (status === 429 || rawMessage.includes('429') || rawMessage.match(/quota|rate limit|exhausted/i)) {
    code = 'RATE_LIMIT';
    friendlyMessage = 'O sistema está com muito tráfego agora. Aguarde um instante.';
    transient = true; // Auto-retry com backoff é ideal aqui
  }
  // 4. Model Overloaded (503)
  else if (status === 503 || rawMessage.includes('503') || rawMessage.match(/overloaded|capacity/i)) {
    code = 'MODEL_OVERLOADED';
    friendlyMessage = 'A IA está sobrecarregada no momento. Tente novamente.';
    transient = true;
  }
  // 5. Server Errors (500, 502, 504)
  else if (status >= 500) {
    code = 'SERVER';
    friendlyMessage = 'Erro interno nos servidores da IA.';
    transient = true;
  }
  // 6a. Modelo incompatível com API usada (ex.: deep-research requer Interactions API)
  else if (rawMessage.match(/only supports Interactions API/i)) {
    code = 'UNKNOWN';
    friendlyMessage = 'Modelo de IA incompatível com o método de chamada. Contate o suporte técnico.';
    retryable = false;
    transient = false;
  }
  // 6. Safety / Blocked Content (400 ou msg específica)
  else if (rawMessage.match(/safety|blocked|harmful|policy/i)) {
    code = 'BLOCKED_CONTENT';
    friendlyMessage = 'A resposta foi bloqueada pelos filtros de segurança.';
    retryable = false;
    transient = false;
  }
  // 7. Billing Errors (403 com dunning/PERMISSION_DENIED — projeto Google Cloud suspenso)
  else if (rawMessage.match(/dunning|PERMISSION_DENIED|billing/i)) {
    code = 'BILLING';
    friendlyMessage = 'O serviço está temporariamente indisponível. Tente novamente mais tarde.';
    retryable = false;
    transient = true;
  }
  // 8. Auth Errors
  else if (status === 401 || status === 403 || rawMessage.match(/api key|unauthorized|forbidden/i)) {
    code = 'AUTH';
    friendlyMessage = 'Chave de API inválida ou expirada.';
    retryable = false;
    transient = false;
  }

  return {
    code,
    message: rawMessage,
    friendlyMessage, // Mensagem base, pode ser sobrescrita pela UI com base no Modo
    httpStatus: typeof status === 'number' ? status : undefined,
    retryable,
    transient,
    source,
    details: error && typeof error === 'object' ? (error as Record<string, unknown>) : undefined,
  };
}

function isAppError(error: unknown): error is AppError {
  return !!error && typeof error === 'object' && 'code' in error && 'friendlyMessage' in error;
}

/**
 * Retorna uma mensagem amigável para o fluxo único de investigação.
 */
export function getFriendlyErrorMessage(error: AppError, _mode: ChatMode): string {
  switch (error.code) {
    case 'NETWORK':
      return 'Verifique sua conexão com a internet e tente novamente.';
    case 'RATE_LIMIT':
      return 'Muitas requisições simultâneas. Aguarde alguns instantes.';
    case 'MODEL_OVERLOADED':
      return 'O serviço de IA está temporariamente instável.';
    case 'BLOCKED_CONTENT':
      return 'Não consegui processar essa solicitação por políticas de segurança.';
    case 'SERVER':
      return 'Ocorreu uma falha temporária nos servidores de IA.';
    case 'ABORTED':
      return 'Geração interrompida.';
    case 'BILLING':
      return 'O serviço está temporariamente indisponível. Tente novamente mais tarde.';
    default:
      return error.friendlyMessage || 'Não foi possível completar a solicitação.';
  }
}
