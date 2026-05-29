/**
 * QW-2 — ErrorToast
 * Toast de erro com mensagem amigável para o vendedor.
 * Usa getFriendlyErrorMessage de utils/friendlyErrorMessage.ts.
 *
 * Responsabilidades:
 *  - Exibir mensagem humana para erros transitórios (rede, timeout, rate limit, auth)
 *  - Auto-dismiss configurável (padrão 5s)
 *  - Dismiss manual via botão
 *  - Ícone e tom de cor por tipo de erro
 *  - Acessível: role="status", aria-live="polite"
 */

import { useEffect, type ElementType } from 'react';
import type { ErrorContext } from '../utils/friendlyErrorMessage';
import { getFriendlyErrorMessage } from '../utils/friendlyErrorMessage';

type IconProps = {
  className?: string;
};

const IconBase = ({ className, symbol, label }: IconProps & { symbol: string; label: string }) => (
  <span className={className} role="img" aria-label={label}>
    {symbol}
  </span>
);

const WifiOff = ({ className }: IconProps) => <IconBase className={className} symbol="📡" label="Sem conexão" />;
const Clock3 = ({ className }: IconProps) => <IconBase className={className} symbol="⏱️" label="Tempo esgotado" />;
const ShieldAlert = ({ className }: IconProps) => (
  <IconBase className={className} symbol="🛡️" label="Acesso bloqueado" />
);
const XCircle = ({ className }: IconProps) => <IconBase className={className} symbol="❌" label="Erro" />;
const AlertTriangle = ({ className }: IconProps) => <IconBase className={className} symbol="⚠️" label="Alerta" />;
const X = ({ className }: IconProps) => <IconBase className={className} symbol="✖️" label="Fechar" />;

export interface ErrorToastProps {
  /** Erro bruto (Error, string ou null). Null = toast oculto. */
  error: unknown | null;
  /** Contexto semântico para tradução da mensagem. */
  context?: ErrorContext;
  /** Callback chamado quando o toast deve fechar. */
  onClose: () => void;
  /** Tempo em ms para auto-dismiss. 0 = desabilitado. Padrão: 5000. */
  autoDismissMs?: number;
}

type ToastVariant = 'network' | 'timeout' | 'quota' | 'auth' | 'default';

function detectVariant(error: unknown): ToastVariant {
  const msg =
    error instanceof Error ? error.message.toLowerCase() : typeof error === 'string' ? error.toLowerCase() : '';

  if (['fetch', 'network', 'failed to fetch', 'net::'].some(p => msg.includes(p))) return 'network';
  if (['timeout', 'timed out', 'deadline', 'aborted'].some(p => msg.includes(p))) return 'timeout';
  if (['429', 'quota', 'rate limit', 'resource_exhausted', 'too many requests'].some(p => msg.includes(p)))
    return 'quota';
  if (['401', '403', 'unauthorized', 'forbidden', 'api key', 'invalid_api_key'].some(p => msg.includes(p)))
    return 'auth';
  return 'default';
}

const VARIANT_CONFIG: Record<ToastVariant, { icon: ElementType; wrapperClass: string; iconClass: string }> = {
  network: {
    icon: WifiOff,
    wrapperClass:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  timeout: {
    icon: Clock3,
    wrapperClass:
      'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200',
    iconClass: 'text-orange-600 dark:text-orange-400',
  },
  quota: {
    icon: AlertTriangle,
    wrapperClass:
      'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
    iconClass: 'text-yellow-600 dark:text-yellow-400',
  },
  auth: {
    icon: ShieldAlert,
    wrapperClass:
      'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
    iconClass: 'text-violet-600 dark:text-violet-400',
  },
  default: {
    icon: XCircle,
    wrapperClass: 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    iconClass: 'text-red-600 dark:text-red-400',
  },
};

export const ErrorToast = ({ error, context = 'generic', onClose, autoDismissMs = 5000 }: ErrorToastProps) => {
  useEffect(() => {
    if (!error || autoDismissMs === 0) return;

    const id = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [error, autoDismissMs, onClose]);

  if (!error) return null;

  const variant = detectVariant(error);
  const { icon: Icon, wrapperClass, iconClass } = VARIANT_CONFIG[variant];
  const { title, detail, canRetry } = getFriendlyErrorMessage(error, context);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex justify-center sm:inset-x-auto sm:right-4 sm:top-4"
    >
      <div
        className={[
          'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-sm',
          wrapperClass,
        ].join(' ')}
      >
        {/* Ícone */}
        <div className={['mt-0.5 shrink-0', iconClass].join(' ')}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        {/* Conteúdo */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{title}</p>
          <p className="mt-0.5 text-sm leading-5 opacity-90">{detail}</p>
          {canRetry && <p className="mt-1 text-xs opacity-60">Você pode tentar novamente.</p>}
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40 dark:hover:bg-white/10"
          aria-label="Fechar aviso de erro"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
