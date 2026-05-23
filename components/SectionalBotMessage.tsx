import React, { useMemo, useState, useCallback } from 'react';
import { Message } from '../types';
import MarkdownRenderer from './MarkdownRenderer';
import { getSellerSectionKind, parseMarkdownSections, type SellerSectionKind } from '../utils/sectionParser';
import { ChatMode } from '../constants';
import SmartOptions, { parseSmartOptions } from './SmartOptions';
import type { AuditableSource } from '../utils/textCleaners';
import { FeedbackSection } from './FeedbackSection';

interface SectionalBotMessageProps {
  message: Message;
  sessionId?: string;
  userId?: string;
  isDarkMode: boolean;
  mode?: ChatMode;
  onPreFillInput?: (text: string) => void;
  onRegenerateSuggestions?: (messageId: string) => void;
  hideSuggestions?: boolean;
  empresaAlvo?: string | null;
  auditableSources?: AuditableSource[];
}

const CopyButton: React.FC<{ text: string; isDarkMode: boolean }> = ({ text, isDarkMode }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('SectionalBotMessage: Clipboard API failed, usando fallback', err);
      // fallback para ambientes sem clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  const base = isDarkMode
    ? 'bg-slate-700/80 hover:bg-slate-600 text-slate-300 border-slate-600'
    : 'bg-white/90 hover:bg-slate-50 text-slate-500 border-slate-200';

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copiado!' : 'Copiar dossiê'}
      aria-label={copied ? 'Conteúdo copiado' : 'Copiar dossiê completo'}
      className={`
        absolute top-0 right-0 z-10
        flex items-center gap-1.5 px-2.5 py-1.5
        rounded-md border text-xs font-medium
        shadow-sm backdrop-blur-sm
        transition-all duration-200 ease-out
        ${base}
        ${copied ? 'scale-95' : 'scale-100'}
      `}
      style={{ opacity: copied ? 1 : undefined }}
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-500">Copiado!</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          <span>Copiar</span>
        </>
      )}
    </button>
  );
};

function getSellerSectionClass(kind: SellerSectionKind, isDarkMode: boolean): string {
  if (kind === 'maps') {
    return isDarkMode
      ? 'rounded-xl border border-blue-500/25 bg-blue-500/10 shadow-sm'
      : 'rounded-xl border border-blue-200 bg-blue-50 shadow-sm';
  }
  if (kind === 'cards') {
    return isDarkMode
      ? 'rounded-xl border border-slate-700 bg-slate-900/70 shadow-sm'
      : 'rounded-xl border border-slate-200 bg-white shadow-sm';
  }
  return '';
}

function normalizeFeedbackSectionTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function shouldShowSectionFeedback(title: string): boolean {
  const normalized = normalizeFeedbackSectionTitle(title);
  return [
    'resumo',
    'dor',
    'dores',
    'evidencia',
    'score porta',
    'porta',
    'abordagem',
    'proxima acao',
    'proximas acoes',
    'cards de auditoria',
  ].some(fragment => normalized.includes(fragment));
}

const SectionalBotMessage: React.FC<SectionalBotMessageProps> = ({
  message,
  sessionId,
  userId,
  isDarkMode,
  mode,
  onPreFillInput,
  onRegenerateSuggestions,
  hideSuggestions = false,
  empresaAlvo,
  auditableSources = []
}) => {
  const content = message.text || "";

  const { cleanText, options: parsedOptions } = useMemo(() => parseSmartOptions(content), [content]);
  const sections = useMemo(() => parseMarkdownSections(cleanText), [cleanText]);

  const activeOptions = Array.isArray(message.suggestions) && message.suggestions.length > 0
    ? message.suggestions
    : parsedOptions;

  const processedOptions = useMemo(() => {
    if (!Array.isArray(activeOptions) || activeOptions.length === 0) return [];
    if (!empresaAlvo) return activeOptions;
    return activeOptions.map(option =>
      option
        .replace(/\[NOME DA EMPRESA\]/gi, empresaAlvo)
        .replace(/\[Nome da Empresa\]/gi, empresaAlvo)
        .replace(/\[Empresa\]/gi, empresaAlvo)
        .replace(/\[NOME DO GRUPO \/ EMPRESA ALVO\]/gi, empresaAlvo)
    );
  }, [activeOptions, empresaAlvo]);

  const isRegenerating = Boolean(message.isRegeneratingSuggestions);

  const handleRegenerate = () => {
    if (onRegenerateSuggestions && message.id) {
      onRegenerateSuggestions(message.id);
    }
  };

  // Só mostra o botão copiar se houver conteúdo substancial (dossiê real)
  const showCopyButton = cleanText.length > 300;

  if (sections.length <= 1 && !/^(#{1,3})\s+/m.test(cleanText)) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {showCopyButton && (
          <div className="relative h-0">
            <CopyButton text={cleanText} isDarkMode={isDarkMode} />
          </div>
        )}
        <MarkdownRenderer
          content={cleanText}
          isDarkMode={isDarkMode}
          groundingSources={message.groundingSources}
          auditableSources={auditableSources}
        />
        {processedOptions.length > 0 && onPreFillInput && !hideSuggestions && (
          <SmartOptions
            options={processedOptions}
            onPreFillInput={onPreFillInput}
            isRegenerating={isRegenerating}
            onRegenerate={handleRegenerate}
          />
        )}
      </div>
    );
  }

  return (
    <div className="sectional-message space-y-4">
      {showCopyButton && (
        <div className="relative flex justify-end mb-1">
          <CopyButton text={cleanText} isDarkMode={isDarkMode} />
        </div>
      )}

      {sections.map((section, idx) => {
        const sellerSectionKind = getSellerSectionKind(section.title);
        const sellerSectionClass = getSellerSectionClass(sellerSectionKind, isDarkMode);
        const isPrimaryModule = section.level === 1 && section.kind === 'module';
        const framedClass = sellerSectionClass || (
          isPrimaryModule
            ? isDarkMode
              ? 'rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm'
              : 'rounded-2xl border border-slate-200 bg-white/90 shadow-sm'
            : ''
        );

        return (
        <div
          key={section.key}
          data-section-kind={sellerSectionKind}
          className={`section-block group relative ${framedClass}`}
        >
          {isPrimaryModule && (
            <div className={`flex items-center justify-between gap-3 px-4 pt-4 pb-1 md:px-5 ${
              isDarkMode ? 'border-slate-800/70' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  isDarkMode
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>
                  Módulo {sections.slice(0, idx + 1).filter(item => item.level === 1 && item.kind === 'module').length}
                </span>
              </div>
            </div>
          )}
          <div className={isPrimaryModule || sellerSectionKind !== 'default' ? 'section-content px-4 pb-4 pt-3 md:px-5 md:pb-5' : 'section-content'}>
            <MarkdownRenderer
              content={section.key === 'intro' ? section.content : `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`}
              isDarkMode={isDarkMode}
              groundingSources={message.groundingSources}
              auditableSources={auditableSources}
              showCollapsibleSources={idx === sections.length - 1}
            />
            {sessionId && shouldShowSectionFeedback(section.title) && (
              <FeedbackSection
                sectionKey={section.key}
                sectionTitle={section.title}
                sectionContent={section.content}
                sessionId={sessionId}
                messageId={message.id}
                userId={userId}
                isDarkMode={isDarkMode}
                mode={mode}
              />
            )}
          </div>
        </div>
        );
      })}

      {processedOptions.length > 0 && onPreFillInput && !hideSuggestions && (
        <div className="mt-4 min-w-0 border-t border-dashed border-gray-500/20 pt-2">
          <SmartOptions
            options={processedOptions}
            onPreFillInput={onPreFillInput}
            isRegenerating={isRegenerating}
            onRegenerate={handleRegenerate}
          />
        </div>
      )}
    </div>
  );
};

export default SectionalBotMessage;
