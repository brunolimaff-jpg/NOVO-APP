import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Message, Sender, AppError, Feedback, PortaDimension } from '../types';
import { ChatMode } from '../constants';
import GhostMessageBlock from './GhostMessageBlock';
import ErrorMessageCard from './ErrorMessageCard';
import SectionalBotMessage from './SectionalBotMessage';
import InlineTypingResponse from './InlineTypingResponse';
import ScorePorta from './ScorePorta';
import ClienteSeniorScore from './ClienteSeniorScore';
import MessageActionsBar from './MessageActionsBar';
import { DeepDiveTopics } from './DeepDiveTopics';
import { buildAuditableSources, normalizeSourceUrl, type AuditableSource } from '../utils/textCleaners';
import { fetchLinkStatuses, type LinkValidationResult } from '../utils/linkValidation';

export interface MessageRowData {
  messages: Message[];
  isLoading: boolean;
  isDarkMode: boolean;
  mode: ChatMode;
  onRetry?: () => void;
  onDeleteMessage?: (id: string) => void;
  onReportError?: (id: string, err: AppError) => void;
  onFeedback: (messageId: string, feedback: Feedback) => void;
  onSendFeedback: (messageId: string, feedback: Feedback, comment: string, content: string) => void;
  onToggleMessageSources: (messageId: string) => void;
  onDeepDive?: (display: string, hidden: string) => Promise<void>;
  onRegenerateSuggestions: (messageId: string) => void;
  handleDeleteWithUndo: (msgId: string) => void;
  pendingDeleteId: string | null;
  hideSuggestionsForMessageId: string | null;
  setInput: (text: string) => void;
  sessionId?: string;
  userId?: string;
  processing?: { stage?: string; completedStages?: string[]; failureCount?: number; totalStages?: number };
  lastUserQuery?: string;
  onStop?: () => void;
  onSendMessage?: (text: string) => void;
  empresaAlvo?: string | null;
  cnpj?: string | null;
  loadingPinnedLabel?: string | null;
}

interface MessageRowProps {
  index: number;
  data: MessageRowData;
}

// Exibe aviso discreto quando o grounding falhou silenciosamente.
// Regra: so aparece quando groundingUsed === false (explicitamente false,
// nao undefined). undefined = grounding nao era aplicavel nesta mensagem.
function GroundingFallbackBadge({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium mt-2 px-2 py-0.5 rounded-full select-none ${
        isDarkMode
          ? 'bg-amber-900/30 text-amber-400 border border-amber-800/40'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
      title="O grounding (busca web) falhou nesta resposta. O conteudo foi gerado sem verificacao de fontes externas — valide informacoes criticas."
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      Resposta sem verificacao web
    </span>
  );
}

const PORTA_DIMENSION_MODULE_MAP: Record<PortaDimension, string[]> = {
  P: ['Estratégia & Expansão'],
  O: ['Raio-X Operacional'],
  R: ['Riscos & Compliance'],
  T: ['Tech Stack'],
  A: ['RH & Decisores'],
};

function normalizePortaDimensions(dimensions?: string[]): PortaDimension[] {
  if (!Array.isArray(dimensions) || dimensions.length === 0) return [];
  const valid = new Set<PortaDimension>(['P', 'O', 'R', 'T', 'A']);
  return Array.from(new Set(dimensions.filter((dimension): dimension is PortaDimension => valid.has(dimension as PortaDimension))));
}

function buildPortaRetryPrompt(dimensions: PortaDimension[], empresaAlvo?: string | null): string {
  const dimensionLabel = dimensions.join(', ');
  const modules = Array.from(
    new Set(dimensions.flatMap(dimension => PORTA_DIMENSION_MODULE_MAP[dimension] || [])),
  );
  const moduleLabel = modules.join(', ');
  const companyLabel = (empresaAlvo || '').trim() || 'a empresa investigada';

  return [
    `Reexecutar agora os módulos pendentes do Score PORTA para ${companyLabel}.`,
    `Dimensões pendentes: ${dimensionLabel}.`,
    `Módulos prioritários: ${moduleLabel}.`,
    'Não conclua a rodada até consolidar o Score PORTA final com evidências estruturadas de P, O, R, T e A.',
  ].join(' ');
}

function PortaFallbackAlert({
  isDarkMode,
  dimensions,
  companyName,
  hasConfirmedCnpj,
  onRetry,
  retryDisabled,
  retryPending,
}: {
  isDarkMode: boolean;
  dimensions: PortaDimension[];
  companyName?: string | null;
  hasConfirmedCnpj: boolean;
  onRetry: () => void;
  retryDisabled: boolean;
  retryPending: boolean;
}) {
  const modules = Array.from(
    new Set(dimensions.flatMap(dimension => PORTA_DIMENSION_MODULE_MAP[dimension] || [])),
  );

  const normalizedCompany = (companyName || '').trim() || 'a empresa investigada';

  return (
    <div
      className={`mt-1 mb-3 rounded-xl border px-3 py-2.5 ${
        isDarkMode
          ? 'bg-red-900/30 text-red-200 border-red-700/60'
          : 'bg-red-50 text-red-800 border-red-200'
      }`}
      role="alert"
      data-testid="porta-fallback-alert"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold tracking-wide uppercase">
            ⚠ Score PORTA parcial com fallback técnico
          </p>
          <p className={`text-[11px] mt-1 ${isDarkMode ? 'text-red-100/90' : 'text-red-700'}`}>
            Pendências: <strong>{dimensions.join(', ')}</strong> · Módulos para recompor: <strong>{modules.join(', ')}</strong>
          </p>
          {!hasConfirmedCnpj && (
            <p className={`text-[11px] mt-1.5 ${isDarkMode ? 'text-amber-200' : 'text-amber-800'}`}>
              Para continuar com segurança na análise de <strong>{normalizedCompany}</strong>, confirme o CNPJ (14 dígitos).
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
            isDarkMode
              ? 'bg-red-500/20 text-red-100 border border-red-400/40 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed'
              : 'bg-red-100 text-red-700 border border-red-300 hover:bg-red-200 disabled:opacity-60 disabled:cursor-not-allowed'
          }`}
          title="Reexecutar somente os módulos pendentes para consolidar o Score PORTA"
        >
          {retryPending ? 'Reexecutando pendências…' : 'Tentar novamente pendências'}
        </button>
      </div>
      {retryPending && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-2 text-[11px] font-semibold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}
        >
          Reexecução iniciada. Consolidando evidências pendentes do Score PORTA…
        </p>
      )}
    </div>
  );
}

const MessageRow = memo(({ index, data }: MessageRowProps) => {
  if (!data) return null;
  const {
    messages,
    isLoading,
    isDarkMode,
    mode,
    onRetry,
    onDeleteMessage,
    onReportError,
    onFeedback,
    onSendFeedback,
    onToggleMessageSources,
    onDeepDive,
    onRegenerateSuggestions,
    handleDeleteWithUndo,
    pendingDeleteId,
    hideSuggestionsForMessageId,
    setInput,
    sessionId,
    userId,
    processing,
    onSendMessage,
    empresaAlvo,
    cnpj,
  } = data;

  if (!messages || !Array.isArray(messages)) return null;
  const msg = messages[index];
  if (!msg) return null;

  const isBot = msg.sender === Sender.Bot;
  const isLast = index === messages.length - 1;
  const displayScore = isBot ? msg.scorePorta : undefined;
  const auditableSources = useMemo<AuditableSource[]>(
    () => buildAuditableSources(msg.text || '', msg.groundingSources || []),
    [msg.text, msg.groundingSources],
  );
  const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkValidationResult>>({});
  const [portaRetryPending, setPortaRetryPending] = useState(false);
  const portaRetrySawLoadingRef = useRef(false);
  const portaRetryWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // groundingUsed === false (explicitamente): fallback silencioso acionado.
  // undefined: grounding nao era aplicavel (thinking mode, deep dive, etc.) -> sem badge.
  const showGroundingFallbackWarning = isBot && msg.groundingUsed === false;
  const portaFallbackDimensions = normalizePortaDimensions(msg.portaFallbackDimensions);
  const showPortaFallbackWarning = isBot && msg.portaFallbackApplied === true && portaFallbackDimensions.length > 0;
  const hasConfirmedCnpj = typeof cnpj === 'string' && cnpj.replace(/\D/g, '').length === 14;
  const portaRetryPrompt = useMemo(
    () => (showPortaFallbackWarning ? buildPortaRetryPrompt(portaFallbackDimensions, empresaAlvo) : ''),
    [empresaAlvo, portaFallbackDimensions, showPortaFallbackWarning],
  );
  const assistantLabel = '\uD83E\uDD85 Scout 360';
  const loadingVariant = msg.loadingVariant ?? 'hero';
  const showHeroLoading = isBot && msg.isThinking && loadingVariant === 'hero';
  const showInlineLoading = isBot && msg.isThinking && loadingVariant === 'inline';
  const handlePortaRetry = () => {
    if (!portaRetryPrompt || portaRetryPending) return;
    setPortaRetryPending(true);
    portaRetrySawLoadingRef.current = false;
    if (portaRetryWatchdogRef.current) clearTimeout(portaRetryWatchdogRef.current);
    portaRetryWatchdogRef.current = setTimeout(() => {
      if (!portaRetrySawLoadingRef.current) {
        setPortaRetryPending(false);
      }
    }, 4500);

    if (onSendMessage) {
      onSendMessage(portaRetryPrompt);
      return;
    }
    setPortaRetryPending(false);
    setInput(portaRetryPrompt);
  };

  useEffect(() => {
    if (!portaRetryPending) return;

    if (isLoading) {
      portaRetrySawLoadingRef.current = true;
      if (portaRetryWatchdogRef.current) {
        clearTimeout(portaRetryWatchdogRef.current);
        portaRetryWatchdogRef.current = null;
      }
      return;
    }

    if (portaRetrySawLoadingRef.current) {
      setPortaRetryPending(false);
      portaRetrySawLoadingRef.current = false;
    }
  }, [isLoading, portaRetryPending]);

  useEffect(() => {
    return () => {
      if (portaRetryWatchdogRef.current) {
        clearTimeout(portaRetryWatchdogRef.current);
      }
    };
  }, []);

  let content: React.ReactNode;

  useEffect(() => {
    if (!msg.isSourcesOpen) return;
    const urls = (auditableSources || []).filter(s => !!s.url).map(s => s.url as string);
    if (urls.length === 0) return;

    let cancelled = false;
    fetchLinkStatuses(urls).then(results => {
      if (!cancelled) setLinkStatuses(results);
    });
    return () => {
      cancelled = true;
    };
  }, [auditableSources, msg.isSourcesOpen]);

  if (showHeroLoading) {
    // Hero loading lives in App.tsx via the fullscreen LoadingSmart overlay.
    // Rendering a second inline card here downgrades the premium experience.
    return null;
  } else if (showInlineLoading) {
    content = (
      <div className="flex justify-start animate-fade-in">
        <div
          className={`rounded-2xl p-4 shadow-sm w-full ${
            isDarkMode ? 'bg-slate-900 border border-gray-700/30' : 'bg-white border border-gray-200'
          } px-3 md:px-5 py-3 md:py-4`}
        >
          <div className="flex items-center justify-between mb-2 opacity-70 text-[10px] uppercase font-bold tracking-wider select-none">
            <span>{assistantLabel}</span>
            <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <InlineTypingResponse isDarkMode={isDarkMode} stage={processing?.stage} />
        </div>
      </div>
    );
  } else if (msg.isError && msg.errorDetails) {
    content = (
      <ErrorMessageCard
        error={msg.errorDetails}
        onRetry={onRetry || (() => {})}
        isLoadingRetry={isLoading}
        isDarkMode={isDarkMode}
        mode={mode}
        onReportError={onReportError ? () => onReportError(msg.id, msg.errorDetails!) : undefined}
      />
    );
  } else if (isBot && !msg.isThinking && !msg.isError && (!msg.text || msg.text.trim() === '')) {
    content = (
      <div className="flex justify-start animate-fade-in w-full max-w-3xl">
        <GhostMessageBlock msg={msg} onRetry={onRetry} isLoading={isLoading} isDarkMode={isDarkMode} />
      </div>
    );
  } else {
    const sourcesCount = auditableSources.length;

    content = (
      <div
        className={`flex ${
          isBot ? 'justify-start' : 'justify-end'
        } animate-fade-in group/msg items-start gap-1.5 transition-opacity duration-300 ${
          pendingDeleteId === msg.id ? 'opacity-30 pointer-events-none' : ''
        }`}
      >
        {!isBot && onDeleteMessage && (
          <button
            onClick={() => handleDeleteWithUndo(msg.id)}
            className={`self-start mt-[38px] flex-shrink-0 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-150 p-1.5 rounded-lg text-sm ${
              isDarkMode
                ? 'text-slate-600 hover:text-red-400 hover:bg-slate-800'
                : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
            }`}
            title="Excluir esta mensagem"
          >
            \uD83D\uDDD1\uFE0F
          </button>
        )}
        <div
          className={`rounded-2xl p-4 shadow-sm relative ${
            isBot
              ? `${isDarkMode ? 'bg-slate-900' : 'bg-white'} border ${isDarkMode ? 'border-gray-700/30' : 'border-gray-200'} px-3 md:px-5 py-3 md:py-4 w-full min-w-0 overflow-hidden`
              : `${isDarkMode ? 'bg-emerald-900/20 border border-emerald-900/30 text-emerald-100' : 'bg-emerald-50 border border-emerald-100 text-slate-800'} max-w-[90%] md:max-w-[75%] lg:max-w-[60%]`
          }`}
        >
          <div className="flex items-center justify-between mb-2 opacity-70 text-[10px] uppercase font-bold tracking-wider select-none">
            <span>{isBot ? assistantLabel : '\uD83D\uDC64 Você'}</span>
            <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {isBot ? (
            <>
              {showPortaFallbackWarning && (
                <PortaFallbackAlert
                  isDarkMode={isDarkMode}
                  dimensions={portaFallbackDimensions}
                  companyName={empresaAlvo}
                  hasConfirmedCnpj={hasConfirmedCnpj}
                  onRetry={handlePortaRetry}
                  retryDisabled={isLoading || portaRetryPending}
                  retryPending={portaRetryPending}
                />
              )}
              {displayScore && <ScorePorta {...displayScore} isDarkMode={isDarkMode} />}
              {msg.clienteSeniorData?.encontrado && (
                <ClienteSeniorScore data={msg.clienteSeniorData} isDarkMode={isDarkMode} />
              )}
              <SectionalBotMessage
                message={{ ...msg, groundingSources: msg.groundingSources || [] }}
                sessionId={sessionId}
                userId={userId}
                isDarkMode={isDarkMode}
                mode={mode}
                empresaAlvo={empresaAlvo}
                auditableSources={auditableSources}
                onPreFillInput={text => {
                  if (onSendMessage) {
                    onSendMessage(text);
                  } else {
                    setInput(text);
                  }
                }}
                onRegenerateSuggestions={onRegenerateSuggestions}
                hideSuggestions={msg.id === hideSuggestionsForMessageId}
              />
              {showGroundingFallbackWarning && (
                <GroundingFallbackBadge isDarkMode={isDarkMode} />
              )}
              {isLast && !isLoading && onDeepDive && !msg.isDeepDiveResult && <DeepDiveTopics onSelectTopic={onDeepDive} />}
              <MessageActionsBar
                content={msg.text}
                sourcesCount={sourcesCount}
                currentFeedback={msg.feedback}
                onFeedback={fb => onFeedback(msg.id, fb)}
                onSubmitFeedback={(fb, comment, content) => onSendFeedback(msg.id, fb, comment, content)}
                onToggleSources={() => onToggleMessageSources(msg.id)}
                isSourcesVisible={!!msg.isSourcesOpen}
                isDarkMode={isDarkMode}
              />
              {msg.isSourcesOpen && auditableSources.length > 0 && (
                <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                  >
                    \uD83D\uDCDA Fontes
                  </p>
                  <ol className="space-y-2 list-decimal pl-4">
                    {(auditableSources || []).map((s, i) => {
                      const status = s.url ? linkStatuses[s.url] || linkStatuses[normalizeSourceUrl(s.url)] : undefined;
                      const statusLabel = !s.url
                        ? 'ANÁLISE INFERIDA'
                        : status?.status === 'valid'
                          ? 'CONFIRMADO'
                          : status?.status === 'broken'
                            ? (status.note || 'OFF-LINE').toUpperCase()
                            : 'AUDITORIA EM CURSO';
                      const context =
                        s.contexts[0] ||
                        (s.url
                          ? 'Referencia usada para embasar parte da resposta; valide aderencia ao contexto.'
                          : 'Mencao inferida sem URL explicita; validacao manual necessaria.');

                      return (
                        <li key={s.key || i} className="text-xs">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-semibold text-[10px] opacity-80">
                              {s.citationIndex ? `^${s.citationIndex}` : '^?'}
                            </span>
                            {s.url ? (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:underline break-all"
                              >
                                {s.title || 'Fonte'}
                              </a>
                            ) : (
                              <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{s.title}</span>
                            )}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                statusLabel.includes('CONFIRMADO')
                                  ? isDarkMode
                                    ? 'bg-emerald-900/50 text-emerald-300 font-bold'
                                    : 'bg-emerald-100 text-emerald-700 font-bold'
                                  : statusLabel.includes('OFF-LINE')
                                    ? isDarkMode
                                      ? 'bg-red-900/50 text-red-300'
                                      : 'bg-red-100 text-red-700'
                                    : isDarkMode
                                      ? 'bg-amber-900/40 text-amber-300'
                                      : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          {s.url ? (
                            <p className={`mt-1 text-[10px] break-all ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {s.url}
                            </p>
                          ) : null}
                          <p
                            className={`mt-1 text-[10px] leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
                          >
                            {context}
                          </p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.text}</div>
          )}
        </div>
      </div>
    );
  }

  return <div className="pb-3 px-2 md:px-6 lg:px-8">{content}</div>;
});

MessageRow.displayName = 'MessageRow';
export default MessageRow;
