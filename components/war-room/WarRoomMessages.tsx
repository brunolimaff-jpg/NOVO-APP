import type React from 'react';
import MarkdownRenderer from '../MarkdownRenderer';
import { MODE_CONFIG } from './config';
import type { AccentClasses, WarRoomTheme } from './theme';
import type { LinkStatusMap, WRMessage } from './types';
import { normalizeSourceUrl, type AuditableSource } from '../../utils/textCleaners';

interface WarRoomMessagesProps {
  copiedId: string | null;
  expandedErrorId: string | null;
  isDarkMode: boolean;
  linkStatuses: LinkStatusMap;
  messages: WRMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messageSourcesMap: Record<string, AuditableSource[]>;
  onCopy: (text: string, id: string) => void;
  onRetry: (failedMessageId: string) => void;
  onToggleErrorDetails: (messageId: string) => void;
  status: string;
  t: WarRoomTheme;
  accent: AccentClasses;
}

export function WarRoomMessages({
  copiedId,
  expandedErrorId,
  isDarkMode,
  linkStatuses,
  messages,
  messagesEndRef,
  messageSourcesMap,
  onCopy,
  onRetry,
  onToggleErrorDetails,
  status,
  t,
  accent,
}: WarRoomMessagesProps) {
  const dk = isDarkMode;

  return (
    <>
      {messages.map(msg => {
        const mergedSources = messageSourcesMap[msg.id] || [];
        return (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-3 relative group ${msg.role === 'user'
              ? `bg-gradient-to-br ${accent.grad[MODE_CONFIG[msg.mode].accent]} text-white shadow-lg`
              : msg.isError ? t.msgBotErr : t.msgBotBg}`}>
              {msg.isLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '0ms' }} />
                    <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '150ms' }} />
                    <span className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`} style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className={`text-[10px] animate-pulse ${t.loadTxt}`}>{status || 'Processando...'}</span>
                </div>
              ) : msg.role === 'user' ? (
                <p className="text-sm">{msg.text}</p>
              ) : (
                <ModelMessage
                  copiedId={copiedId}
                  expandedErrorId={expandedErrorId}
                  isDarkMode={dk}
                  linkStatuses={linkStatuses}
                  mergedSources={mergedSources}
                  msg={msg}
                  onCopy={onCopy}
                  onRetry={onRetry}
                  onToggleErrorDetails={onToggleErrorDetails}
                  t={t}
                />
              )}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </>
  );
}

interface ModelMessageProps {
  copiedId: string | null;
  expandedErrorId: string | null;
  isDarkMode: boolean;
  linkStatuses: LinkStatusMap;
  mergedSources: AuditableSource[];
  msg: WRMessage;
  onCopy: (text: string, id: string) => void;
  onRetry: (failedMessageId: string) => void;
  onToggleErrorDetails: (messageId: string) => void;
  t: WarRoomTheme;
}

function ModelMessage({
  copiedId,
  expandedErrorId,
  isDarkMode,
  linkStatuses,
  mergedSources,
  msg,
  onCopy,
  onRetry,
  onToggleErrorDetails,
  t,
}: ModelMessageProps) {
  const dk = isDarkMode;

  return (
    <div>
      <button
        onClick={() => onCopy(msg.text, msg.id)}
        className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 ${t.btnCopy}`}
        title="Copiar resposta"
      >
        {copiedId === msg.id ? '✓' : '📋'}
      </button>
      <MarkdownRenderer content={msg.text} isDarkMode={dk} allowRawHtml={false} auditableSources={mergedSources} />
      {msg.isError && (
        <div className={`mt-3 pt-3 border-t ${t.srcBdr} flex flex-wrap items-center gap-2`}>
          {(msg.retryable ?? true) && (
            <button
              type="button"
              onClick={() => onRetry(msg.id)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                dk
                  ? 'border-amber-700/50 text-amber-300 hover:bg-amber-500/10'
                  : 'border-amber-300 text-amber-700 hover:bg-amber-50'
              }`}
            >
              Tentar novamente
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleErrorDetails(msg.id)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
              dk
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800/50'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {expandedErrorId === msg.id ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          {expandedErrorId === msg.id && (
            <pre className={`w-full mt-1 text-[10px] whitespace-pre-wrap break-words p-2 rounded-md ${
              dk ? 'bg-slate-950/60 text-slate-300' : 'bg-slate-100 text-slate-700'
            }`}>
              {msg.technicalDetails || 'Sem detalhes técnicos disponíveis para esta falha.'}
            </pre>
          )}
        </div>
      )}
      {mergedSources.length > 0 && (
        <SourceList
          isDarkMode={dk}
          linkStatuses={linkStatuses}
          sources={mergedSources}
          t={t}
        />
      )}
    </div>
  );
}

interface SourceListProps {
  isDarkMode: boolean;
  linkStatuses: LinkStatusMap;
  sources: AuditableSource[];
  t: WarRoomTheme;
}

function SourceList({ isDarkMode, linkStatuses, sources, t }: SourceListProps) {
  const dk = isDarkMode;

  return (
    <div className={`mt-3 pt-3 border-t ${t.srcBdr}`}>
      <p className={`text-[9px] uppercase tracking-wider font-bold mb-1.5 ${t.srcLabel}`}>Fontes</p>
      <ul className="space-y-1.5">
        {sources.map((s, i) => {
          const status = s.url ? linkStatuses[s.url] || linkStatuses[normalizeSourceUrl(s.url)] : undefined;
          const statusLabel = !s.url
            ? 'ANÁLISE INFERIDA'
            : status?.status === 'valid'
              ? 'CONFIRMADO'
              : status?.status === 'broken'
                ? (status.note || 'OFF-LINE').toUpperCase()
                : 'AUDITORIA EM CURSO';
          const context = s.contexts[0] || (s.url
            ? 'Referência usada para sustentar parte da resposta.'
            : 'Menção inferida sem URL explícita; valide manualmente.');

          return (
            <li key={s.key || i} className="text-[10px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold opacity-80">
                  {s.citationIndex ? `[${s.citationIndex}]` : '[inferida]'}
                </span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className={`${t.srcTxt} hover:underline break-all`}>
                    {s.title || s.url}
                  </a>
                ) : (
                  <span className={dk ? 'text-slate-300' : 'text-slate-700'}>{s.title}</span>
                )}
                <span className={`px-1.5 py-0.5 rounded-full ${
                  statusLabel.includes('CONFIRMADO')
                    ? (dk ? 'bg-emerald-900/50 text-emerald-300 font-bold' : 'bg-emerald-100 text-emerald-700 font-bold')
                    : statusLabel.includes('OFF-LINE')
                      ? (dk ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700')
                      : (dk ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                }`}>
                  {statusLabel}
                </span>
              </div>
              <p className={`mt-0.5 ${dk ? 'text-slate-400' : 'text-slate-500'}`}>{context}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
