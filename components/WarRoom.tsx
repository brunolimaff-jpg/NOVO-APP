import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { queryWarRoom } from '../services/warRoomService';
import { extractCompetitorFromMessage, isBlockedIntent, resolveWarRoomIntent } from '../services/war-room/intent';
import { buildAuditableSources, type AuditableSource } from '../utils/textCleaners';
import { fetchLinkStatuses } from '../utils/linkValidation';
import { MODE_CONFIG, UNIFIED_SUGGESTIONS } from './war-room/config';
import { getAccentClasses, getWarRoomTheme } from './war-room/theme';
import { WarRoomComposer } from './war-room/WarRoomComposer';
import { WarRoomEmptyState } from './war-room/WarRoomEmptyState';
import { WarRoomHeader } from './war-room/WarRoomHeader';
import { WarRoomMessages } from './war-room/WarRoomMessages';
import { WarRoomSidebar } from './war-room/WarRoomSidebar';
import type { LinkStatusMap, UnifiedRoute, WarRoomProps, WRMessage } from './war-room/types';

export default function WarRoom({ isOpen, onClose, isDarkMode, defaultCompetitorTarget }: WarRoomProps) {
  const dk = isDarkMode;

  const [lastRoute, setLastRoute] = useState<UnifiedRoute>('tech');
  const [messages, setMessages] = useState<WRMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [queryCount, setQueryCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [linkStatuses, setLinkStatuses] = useState<LinkStatusMap>({});
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messageSourcesMap = useMemo<Record<string, AuditableSource[]>>(() => {
    const map: Record<string, AuditableSource[]> = {};
    for (const msg of messages) {
      if (msg.role !== 'model' || msg.isLoading) continue;
      map[msg.id] = buildAuditableSources(msg.text || '', msg.sources || []);
    }
    return map;
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopyFeedback('Conteúdo copiado.');
      setTimeout(() => setCopiedId(null), 2000);
      setTimeout(() => setCopyFeedback(null), 2200);
    } catch (err) {
      console.warn('WarRoom: Clipboard API failed, usando fallback', err);
      setCopyFeedback('Não foi possível copiar. Copie manualmente.');
      setTimeout(() => setCopyFeedback(null), 2600);
    }
  }, []);

  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsLoading(false);
      setStatus('');
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    const urls = Array.from(
      new Set(
        Object.values(messageSourcesMap)
          .flatMap((sources) => sources.map((s) => s.url).filter(Boolean) as string[])
      )
    );
    if (urls.length === 0) return;

    let cancelled = false;
    fetchLinkStatuses(urls).then((results) => {
      if (!cancelled) setLinkStatuses(results);
    });
    return () => {
      cancelled = true;
    };
  }, [messageSourcesMap]);

  const submitMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (isBlockedIntent(text)) {
      const userMsg: WRMessage = { id: Date.now().toString(), role: 'user', mode: 'tech', text };
      const blockedReply: WRMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        mode: 'tech',
        text: 'Essa frente está temporariamente bloqueada. **Em breve** liberaremos esse recurso no War Room.',
      };
      setInput('');
      setIsSidebarOpen(false);
      setMessages((prev) => [...prev, userMsg, blockedReply]);
      return;
    }

    const resolvedMode = resolveWarRoomIntent(text);
    setLastRoute(resolvedMode);
    const inferredTarget = extractCompetitorFromMessage(text);
    const target = resolvedMode === 'benchmark'
      ? inferredTarget || (defaultCompetitorTarget || '').trim()
      : '';

    setInput('');
    setIsSidebarOpen(false);
    const userMsg: WRMessage = { id: Date.now().toString(), role: 'user', mode: resolvedMode, text };
    const botId = (Date.now() + 1).toString();
    const loadingMsg: WRMessage = { id: botId, role: 'model', mode: resolvedMode, text: '', isLoading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsLoading(true);
    setStatus('Preparando...');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages
        .filter(m => !m.isLoading && !m.isError)
        .map(m => ({ role: m.role, text: m.text }));
      const requestTimeoutMs = resolvedMode === 'benchmark' ? 120000 : 90000;

      const result = await queryWarRoom(resolvedMode, text, history, target, setStatus, {
        signal: controller.signal,
        timeoutMs: requestTimeoutMs,
      });
      setQueryCount(prev => prev + 1);

      setMessages((prev) => prev.map((m) =>
        m.id === botId
          ? {
            ...m,
            text: result.text,
            sources: result.sources,
            isLoading: false,
            isError: Boolean(result.isError),
            retryable: result.retryable,
            technicalDetails: result.technicalDetails,
          }
          : m
      ));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro de conexão';
      const technicalDetails = err instanceof Error
        ? err.stack || err.message
        : 'Falha sem stack disponível.';
      setMessages((prev) => prev.map((m) =>
        m.id === botId
          ? {
            ...m,
            text: `⚠️ ${errorMessage}`,
            isError: true,
            isLoading: false,
            retryable: true,
            technicalDetails,
          }
          : m
      ));
    } finally {
      setIsLoading(false);
      setStatus('');
      abortRef.current = null;
    }
  }, [defaultCompetitorTarget, isLoading, messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    await submitMessage(text);
  }, [input, isLoading, submitMessage]);

  const resendFromFailedMessage = useCallback((failedMessageId: string) => {
    if (isLoading) return;
    const failedIndex = messages.findIndex((m) => m.id === failedMessageId);
    if (failedIndex <= 0) return;
    const userMsg = [...messages.slice(0, failedIndex)].reverse().find((m) => m.role === 'user');
    if (!userMsg) return;
    void submitMessage(userMsg.text);
  }, [isLoading, messages, submitMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!isOpen) return null;

  const cfg = MODE_CONFIG[lastRoute] ?? MODE_CONFIG['tech'];
  const t = getWarRoomTheme(dk);
  const accent = getAccentClasses(dk);

  return (
    <div className={`fixed inset-0 z-50 flex ${t.pageBg} ${t.textMain} animate-fade-in`}>
      <WarRoomSidebar
        cfg={cfg}
        isOpen={isSidebarOpen}
        onClose={onClose}
        onToggleSidebar={setIsSidebarOpen}
        queryCount={queryCount}
        t={t}
        accent={accent}
      />

      <div className={`flex-1 flex flex-col min-w-0 ${t.terminalBg}`}>
        <WarRoomHeader
          cfg={cfg}
          hasMessages={messages.length > 0}
          isLoading={isLoading}
          isSidebarOpen={isSidebarOpen}
          onAbort={() => {
            if (abortRef.current) abortRef.current.abort();
          }}
          onClearMessages={() => setMessages([])}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          t={t}
          accent={accent}
        />

        {copyFeedback && (
          <div className={`mx-3 sm:mx-5 mt-2 text-[11px] rounded-lg px-3 py-2 ${dk ? 'bg-slate-900 text-slate-300' : 'bg-slate-100 text-slate-700'}`}>
            {copyFeedback}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar">
          {messages.length === 0 && (
            <WarRoomEmptyState
              cfg={cfg}
              suggestions={UNIFIED_SUGGESTIONS}
              onSelectSuggestion={(hint) => {
                setInput(hint);
                inputRef.current?.focus();
              }}
              t={t}
              accent={accent}
            />
          )}

          <WarRoomMessages
            copiedId={copiedId}
            expandedErrorId={expandedErrorId}
            isDarkMode={dk}
            linkStatuses={linkStatuses}
            messages={messages}
            messagesEndRef={messagesEndRef}
            messageSourcesMap={messageSourcesMap}
            onCopy={copyToClipboard}
            onRetry={resendFromFailedMessage}
            onToggleErrorDetails={(messageId) => setExpandedErrorId((current) => current === messageId ? null : messageId)}
            status={status}
            t={t}
            accent={accent}
          />
        </div>

        <WarRoomComposer
          cfg={cfg}
          input={input}
          inputRef={inputRef}
          isLoading={isLoading}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
          t={t}
          accent={accent}
        />
      </div>
    </div>
  );
}
