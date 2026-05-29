import type React from 'react';
import { MODE_CONFIG } from './config';
import type { AccentClasses, WarRoomTheme } from './theme';
import type { LinkStatusMap, WRMessage } from './types';
import type { AuditableSource } from '../../utils/textCleaners';
import { WarRoomModelMessage } from './WarRoomModelMessage';

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
            <div
              className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-3 sm:px-4 py-3 relative group ${
                msg.role === 'user'
                  ? `bg-gradient-to-br ${accent.grad[MODE_CONFIG[msg.mode].accent]} text-white shadow-lg`
                  : msg.isError
                    ? t.msgBotErr
                    : t.msgBotBg
              }`}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`}
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`}
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${t.loadDot} animate-bounce`}
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                  <span className={`text-[10px] animate-pulse ${t.loadTxt}`}>{status || 'Processando...'}</span>
                </div>
              ) : msg.role === 'user' ? (
                <p className="text-sm">{msg.text}</p>
              ) : (
                <WarRoomModelMessage
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
