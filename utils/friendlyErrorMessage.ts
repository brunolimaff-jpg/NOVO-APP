/**
 * QW-2 — Mensagens de erro amigáveis para o vendedor
 * Traduz erros técnicos em linguagem de campo.
 */

export type ErrorContext = 'llm' | 'rag' | 'network' | 'export' | 'generic';

interface FriendlyError {
  title: string;
  detail: string;
  canRetry: boolean;
}

const NETWORK_PATTERNS = ['fetch', 'network', 'failed to fetch', 'networkerror', 'net::'];

const QUOTA_PATTERNS = ['429', 'quota', 'rate limit', 'resource_exhausted', 'too many requests'];

const BILLING_PATTERNS = ['dunning', 'permission_denied', 'billing'];

const AUTH_PATTERNS = ['401', '403', 'unauthorized', 'forbidden', 'api key', 'invalid_api_key'];

const TIMEOUT_PATTERNS = ['timeout', 'timed out', 'deadline', 'aborted', 'context deadline exceeded'];

function matches(msg: string, patterns: string[]): boolean {
  const lower = msg.toLowerCase();
  return patterns.some(p => lower.includes(p));
}

export function getFriendlyErrorMessage(error: unknown, context: ErrorContext = 'generic'): FriendlyError {
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Erro desconhecido';

  if (matches(rawMessage, TIMEOUT_PATTERNS)) {
    return {
      title: 'Análise demorou demais',
      detail: 'A IA está sobrecarregada agora. Tente novamente em alguns segundos.',
      canRetry: true,
    };
  }

  if (matches(rawMessage, QUOTA_PATTERNS)) {
    return {
      title: 'Limite de consultas atingido',
      detail: 'Muitas requisições em pouco tempo. Aguarde 1 minuto e tente novamente.',
      canRetry: true,
    };
  }

  if (matches(rawMessage, BILLING_PATTERNS)) {
    return {
      title: 'Serviço indisponível',
      detail: 'O serviço está temporariamente indisponível. Tente novamente mais tarde.',
      canRetry: false,
    };
  }

  if (matches(rawMessage, AUTH_PATTERNS)) {
    return {
      title: 'Problema de autenticação',
      detail: 'Sua sessão pode ter expirado. Recarregue a página.',
      canRetry: false,
    };
  }

  if (matches(rawMessage, NETWORK_PATTERNS)) {
    return {
      title: 'Sem conexão com o servidor',
      detail: 'Verifique sua internet e tente novamente.',
      canRetry: true,
    };
  }

  // Contexto específico
  switch (context) {
    case 'rag':
      return {
        title: 'Base de dados indisponível',
        detail: 'Não consegui buscar contexto adicional. A resposta pode ser menos detalhada.',
        canRetry: true,
      };
    case 'llm':
      return {
        title: 'IA temporariamente indisponível',
        detail: 'Não foi possível processar sua mensagem agora. Tente novamente em instantes.',
        canRetry: true,
      };
    case 'export':
      return {
        title: 'Erro ao gerar arquivo',
        detail: 'Não foi possível exportar o dossiê. Tente novamente.',
        canRetry: true,
      };
    default:
      return {
        title: 'Algo deu errado',
        detail: 'Tente novamente. Se o problema persistir, recarregue a página.',
        canRetry: true,
      };
  }
}

/** Versao simplificada para uso direto no toast.error() */
export function toastErrorMessage(error: unknown, context: ErrorContext = 'generic'): string {
  const { title, detail } = getFriendlyErrorMessage(error, context);
  return `${title} — ${detail}`;
}
