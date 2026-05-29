import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { scoutDiag } from '../utils/diagnosticLog';
import { Message, Sender, AppError, Feedback, FeedbackSubmissionOptions } from '../types';
import { ChatMode } from '../constants';
import GhostMessageBlock from './GhostMessageBlock';
import ErrorMessageCard from './ErrorMessageCard';
import SectionalBotMessage from './SectionalBotMessage';
import InlineTypingResponse from './InlineTypingResponse';
import ScorePorta from './ScorePorta';
import ClienteSeniorScore from './ClienteSeniorScore';
import MessageActionsBar from './MessageActionsBar';
import { DeepDiveTopics } from './DeepDiveTopics';
import DossierErrorBoundary from '../features/dossier/DossierErrorBoundary';
import { applyDossierLinkIntegrity } from '../utils/dossierLinkIntegrity';
import { coerceGroundingSources, verifiedSourcesToPool } from '../utils/dossierSourcePool';
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
  onSendFeedback: (
    messageId: string,
    feedback: Feedback,
    comment: string,
    content: string,
    options?: FeedbackSubmissionOptions,
  ) => void;
  onToggleMessageSources: (messageId: string) => void;
  onDeepDive?: (display: string, hidden: string) => Promise<void>;
  onRegenerateSuggestions: (messageId: string) => void;
  handleDeleteWithUndo: (msgId: string) => void;
  pendingDeleteId: string | null;
  hideSuggestionsForMessageId: string | null;
  setInput: (text: string) => void;
  sessionId?: string;
  userId?: string;
  dossierId?: string;
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

interface MessageRowBodyProps {
  index: number;
  msg: Message;
  data: MessageRowData;
}

const MessageRowBody = memo(({ index, msg, data }: MessageRowBodyProps) => {
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

  const isBot = msg.sender === Sender.Bot;
  const isLast = index === messages.length - 1;
  const displayScore = isBot ? msg.scorePorta : undefined;
  const groundingSources = useMemo(() => coerceGroundingSources(msg.groundingSources), [msg.groundingSources]);

  const auditableSources = useMemo<AuditableSource[]>(() => {
    const pool = verifiedSourcesToPool(groundingSources);
    const cleaned = applyDossierLinkIntegrity(msg.text || '', { allowedPool: pool });
    return buildAuditableSources(cleaned, groundingSources);
  }, [msg.text, groundingSources]);

  const citedInTextSources = useMemo(
    () => auditableSources.filter(source => source.sourceTypes.includes('inline_citation')),
    [auditableSources],
  );
  const consultedNotCitedSources = useMemo(
    () =>
      auditableSources.filter(
        source => source.sourceTypes.includes('consulted_not_cited') && !source.sourceTypes.includes('inline_citation'),
      ),
    [auditableSources],
  );
  const inferredSources = useMemo(
    () => auditableSources.filter(source => source.sourceTypes.includes('inferred_without_url')),
    [auditableSources],
  );
  const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkValidationResult>>({});
  const assistantLabel = '\uD83E\uDD85 Scout 360';
  const loadingVariant = msg.loadingVariant ?? 'hero';
  const hasSubstantiveText = Boolean(msg.text && msg.text.trim().length > 200);
  const showHeroLoading = isBot && msg.isThinking && loadingVariant === 'hero' && !hasSubstantiveText;
  const showInlineLoading = isBot && msg.isThinking && loadingVariant === 'inline';
  const contentRef = useRef<HTMLDivElement | null>(null);
  let content: React.ReactNode;

  useEffect(() => {
    if (!msg.isSourcesOpen) return;
    const urls = (auditableSources || []).flatMap(s => (s.url ? [s.url as string] : []));
    if (urls.length === 0) return;

    let cancelled = false;
    fetchLinkStatuses(urls).then(results => {
      if (!cancelled) setLinkStatuses(results);
    });
    return () => {
      cancelled = true;
    };
  }, [auditableSources, msg.isSourcesOpen]);

  // Mede dimensões do nó DOM real após commit, apenas para diagnóstico
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !msg.text) return;

    const handle = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      scoutDiag.info('MessageRow', 'commit:dimensions', {
        messageId: msg.id?.slice(0, 8),
        sender: msg.sender,
        textLen: msg.text.length,
        rectW: Math.round(rect.width),
        rectH: Math.round(rect.height),
        offsetH: el.offsetHeight,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        overflow: cs.overflow,
      });
    });

    return () => cancelAnimationFrame(handle);
  }, [msg.text, msg.id, msg.sender]);

  if (showHeroLoading) {
    // Hero loading lives in App.tsx via the fullscreen LoadingSmart overlay.
    // Keep a measurable virtual row so react-virtuoso does not warn about zero-sized items.
    return <div aria-hidden="true" className="h-px w-full overflow-hidden" data-testid="hero-loading-spacer" />;
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
    const sourcesCount = citedInTextSources.length + consultedNotCitedSources.length + inferredSources.length;

    content = (
      <div
        data-testid="message-row"
        data-message-id={msg.id}
        data-sender={msg.sender}
        data-text-length={msg.text?.length ?? 0}
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
            aria-label="Excluir esta mensagem"
          >
            <span aria-hidden="true">&#x1F5D1;&#xFE0F;</span>
          </button>
        )}
        <div
          ref={contentRef}
          {...(isBot
            ? {
                'data-testid': 'bot-message-content',
                'data-message-id': msg.id,
                'data-sender': 'bot',
                'data-text-length': msg.text?.length ?? 0,
              }
            : {})}
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
            <DossierErrorBoundary isDarkMode={isDarkMode}>
              <>
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
                  cnpj={cnpj}
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
                {isLast && !isLoading && onDeepDive && !msg.isDeepDiveResult && (
                  <DeepDiveTopics onSelectTopic={onDeepDive} />
                )}
                <MessageActionsBar
                  content={msg.text}
                  verifiedSourcesCount={consultedNotCitedSources.length}
                  citedLinksCount={citedInTextSources.length}
                  currentFeedback={msg.feedback}
                  onFeedback={fb => onFeedback(msg.id, fb)}
                  onSubmitFeedback={(fb, comment, content, options) =>
                    onSendFeedback(msg.id, fb, comment, content, options)
                  }
                  onToggleSources={() => onToggleMessageSources(msg.id)}
                  isSourcesVisible={!!msg.isSourcesOpen}
                  isDarkMode={isDarkMode}
                  dossierId={data.dossierId}
                />
                {msg.isSourcesOpen && sourcesCount > 0 && (
                  <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    {[
                      { label: 'Citadas no texto', items: citedInTextSources },
                      { label: 'Consultadas pela IA (não citadas)', items: consultedNotCitedSources },
                      { label: 'Inferidas sem URL', items: inferredSources },
                    ].flatMap(group =>
                      group.items.length > 0
                        ? [
                            <div key={group.label} className="mb-3 last:mb-0">
                              <p
                                className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                              >
                                {group.label}
                              </p>
                              <ol className="space-y-2 list-decimal pl-4">
                                {group.items.map((s, i) => {
                                  const status = s.url
                                    ? linkStatuses[s.url] || linkStatuses[normalizeSourceUrl(s.url)]
                                    : undefined;
                                  const statusLabel = !s.url
                                    ? 'ANÁLISE INFERIDA'
                                    : status?.status === 'valid'
                                      ? 'CONFIRMADO'
                                      : status?.status === 'broken'
                                        ? (status.note || 'OFF-LINE').toUpperCase()
                                        : 'AUDITORIA EM CURSO';
                                  const statusIcon = statusLabel.includes('CONFIRMADO')
                                    ? '✓'
                                    : statusLabel.includes('OFF-LINE')
                                      ? '✕'
                                      : statusLabel.includes('INFERIDA')
                                        ? '○'
                                        : '◌';
                                  const statusColor = statusLabel.includes('CONFIRMADO')
                                    ? 'text-emerald-500'
                                    : statusLabel.includes('OFF-LINE')
                                      ? 'text-red-500'
                                      : statusLabel.includes('INFERIDA')
                                        ? 'text-amber-500'
                                        : 'text-slate-500';
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
                                          <span className={`${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                            {s.title}
                                          </span>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-[10px] ${statusColor}`} aria-hidden>
                                            {statusIcon}
                                          </span>
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
                                      </div>
                                      {s.url ? (
                                        <p
                                          className={`mt-1 text-[10px] break-all ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
                                        >
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
                            </div>,
                          ]
                        : [],
                    )}
                  </div>
                )}
              </>
            </DossierErrorBoundary>
          ) : (
            <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.text}</div>
          )}
        </div>
      </div>
    );
  }

  return <div className="pb-3 px-2 md:px-6 lg:px-8">{content}</div>;
});

MessageRowBody.displayName = 'MessageRowBody';

const MessageRow = memo(({ index, data }: MessageRowProps) => {
  if (!data) return null;
  const { messages } = data;
  if (!messages || !Array.isArray(messages)) return null;
  const msg = messages[index];
  if (!msg) return null;
  return <MessageRowBody index={index} msg={msg} data={data} />;
});

MessageRow.displayName = 'MessageRow';
export default MessageRow;
