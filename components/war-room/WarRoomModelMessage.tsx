import MarkdownRenderer from '../MarkdownRenderer';
import type { AuditableSource } from '../../utils/textCleaners';
import type { WarRoomTheme } from './theme';
import type { LinkStatusMap, WRMessage } from './types';
import { WarRoomSources } from './WarRoomSources';

interface WarRoomModelMessageProps {
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

export function WarRoomModelMessage({
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
}: WarRoomModelMessageProps) {
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
        <WarRoomSources
          isDarkMode={dk}
          linkStatuses={linkStatuses}
          sources={mergedSources}
          t={t}
        />
      )}
    </div>
  );
}
