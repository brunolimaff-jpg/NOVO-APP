import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scoutDiag } from '../../utils/diagnosticLog';
import Tooltip from '../Tooltip';
import type { ChatTheme } from './contracts';

interface ComposerProps {
  isHidden: boolean;
  isLoading: boolean;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
  };
  sessionId?: string | null;
  theme: ChatTheme;
  onSendMessage: (text: string) => void;
  onRetry: () => void;
  onStop?: () => void;
}

const Composer: React.FC<ComposerProps> = ({
  isHidden,
  isLoading,
  processing,
  sessionId,
  theme,
  onSendMessage,
  onRetry,
  onStop,
}) => {
  const [input, setInput] = useState('');
  const [showRetryToast, setShowRetryToast] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const malformedProcessingSignatureRef = useRef<string | null>(null);

  const processingInfo = useMemo(() => {
    if (!processing) return null;

    const stage = typeof processing.stage === 'string' ? processing.stage.trim() : '';
    const completedStages = Array.isArray(processing.completedStages) ? processing.completedStages : [];
    const failureCount =
      typeof processing.failureCount === 'number' && Number.isFinite(processing.failureCount)
        ? processing.failureCount
        : 0;
    const totalStages =
      typeof processing.totalStages === 'number' && Number.isFinite(processing.totalStages)
        ? processing.totalStages
        : null;

    const details: string[] = [];
    if (completedStages.length > 0) {
      details.push(
        totalStages && totalStages > 0
          ? `${completedStages.length}/${totalStages} etapas`
          : `${completedStages.length} ${completedStages.length === 1 ? 'etapa' : 'etapas'}`,
      );
    }
    if (failureCount > 0) {
      details.push(`tentativa ${failureCount + 1}`);
    }

    return {
      label: stage || 'Processando...',
      detailText: details.join(' • '),
      stageType: typeof processing.stage,
      completedStagesIsArray: Array.isArray(processing.completedStages),
      failureCountType: typeof processing.failureCount,
      totalStagesType: typeof processing.totalStages,
      isMalformed: typeof processing.stage !== 'string' || !Array.isArray(processing.completedStages),
    };
  }, [processing]);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ text: string }>).detail;
      if (!detail?.text) return;
      setInput(detail.text);
      window.setTimeout(() => textareaRef.current?.focus(), 100);
    };

    window.addEventListener('scout:prefill', handlePrefill);
    return () => window.removeEventListener('scout:prefill', handlePrefill);
  }, []);

  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'inherit';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    if (!showRetryToast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      return;
    }

    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setShowRetryToast(false), 8000);

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [showRetryToast]);

  useEffect(() => {
    if (!processingInfo?.isMalformed) {
      malformedProcessingSignatureRef.current = null;
      return;
    }

    const logPayload = {
      stageType: processingInfo.stageType,
      completedStagesIsArray: processingInfo.completedStagesIsArray,
      failureCountType: processingInfo.failureCountType,
      totalStagesType: processingInfo.totalStagesType,
      sessionId: sessionId ?? null,
    };
    const signature = JSON.stringify(logPayload);
    if (malformedProcessingSignatureRef.current === signature) return;

    malformedProcessingSignatureRef.current = signature;
    scoutDiag.warn('ChatInterface', 'processing payload malformado no indicador inferior', logPayload);
  }, [processingInfo, sessionId]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSendMessage(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleStopWithToast = () => {
    onStop?.();
    setShowRetryToast(true);
  };

  const handleRetryNormal = () => {
    setShowRetryToast(false);
    onRetry();
  };

  if (isHidden) return null;

  return (
    <div className={`flex-none border-t ${theme.border} ${theme.surface}`}>
      {isLoading && processing && processingInfo && (
        <div
          data-testid="chat-processing-indicator"
          className={`px-4 pt-2 pb-1 text-xs ${theme.textSecondary} flex items-center gap-1.5 flex-wrap`}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>{processingInfo.label}</span>
          {processingInfo.detailText ? <span className="opacity-80">{processingInfo.detailText}</span> : null}
        </div>
      )}

      {showRetryToast && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between gap-2">
          <span>⚠️ Geração interrompida. Você pode tentar novamente agora.</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRetryNormal}
              className="rounded-md bg-amber-500/15 px-2 py-1 font-semibold hover:bg-amber-500/25"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => setShowRetryToast(false)}
              className="text-amber-600 dark:text-amber-400 hover:opacity-70 flex-none"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div data-testid="message-input" className="p-3 flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            data-testid="chat-input"
            ref={textareaRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Gerando resposta...' : 'Digite sua mensagem...'}
            disabled={isLoading}
            rows={1}
            className={`w-full resize-none rounded-xl px-3 py-2.5 text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${theme.inputBg} ${theme.inputBorder} ${theme.textPrimary} disabled:opacity-50 max-h-40 overflow-y-auto`}
            aria-label="Campo de mensagem"
          />
        </div>

        {isLoading ? (
          <Tooltip label="Parar geração" position="top">
            <button
              data-testid="chat-stop-button"
              type="button"
              onClick={handleStopWithToast}
              className="flex-none p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors"
              aria-label="Parar geração"
              title="Parar"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </Tooltip>
        ) : (
          <Tooltip label="Enviar mensagem" position="top">
            <button
              data-testid="send-message-button"
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex-none p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white transition-colors"
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m-7 7l7-7 7 7" />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default Composer;
