import React, { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Message } from '../types';
import { getSellerSectionKind, parseMarkdownSections, type ParsedSection, type SellerSectionKind } from '../utils/sectionParser';
import { ChatMode } from '../constants';
import SmartOptions, { parseSmartOptions } from './SmartOptions';
import type { AuditableSource } from '../utils/textCleaners';
import { FeedbackSection } from './FeedbackSection';
import SocietaryMap from '../features/dossier/SocietaryMap';
import { parseTeiaText, type ParsedTeiaData } from '../features/dossier/teiaTextParser';
import { createScoutTraceId, isScoutTraceEnabled, scoutDiag } from '../utils/diagnosticLog';
import MarkdownRenderer from './MarkdownRenderer';

const LazyMarkdownRenderer = import.meta.env.VITEST
  ? MarkdownRenderer
  : React.lazy(() => import('./MarkdownRenderer'));

const EMPTY_AUDITABLE_SOURCES: AuditableSource[] = [];

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
  cnpj?: string | null;
  auditableSources?: AuditableSource[];
  isLoading?: boolean;
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
          <svg
            className="w-3.5 h-3.5 text-emerald-500"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
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

const SECTION_FEEDBACK_FRAGMENTS = [
  'resumo',
  'dor',
  'evidencia',
  'porta',
  'abordagem',
  'proxima acao',
  'cards de auditoria',
];

function shouldShowSectionFeedback(title: string): boolean {
  const normalized = normalizeFeedbackSectionTitle(title);
  return SECTION_FEEDBACK_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

function shouldShowSocietaryMap(title: string, content: string, cnpj?: string | null): boolean {
  if (!cnpj) return false;
  const normalized = normalizeFeedbackSectionTitle(`${title}\n${content}`);
  return (
    normalized.includes('teia societaria') ||
    normalized.includes('mapa de poder societario') ||
    normalized.includes('mapa do poder societario')
  );
}

function filterSourcesForSection(sources: AuditableSource[], sectionContent: string): AuditableSource[] {
  if (!sources || sources.length === 0) return [];
  if (!sectionContent) return sources;

  const hasEmptyContexts = sources.some(s => !s.contexts || s.contexts.length === 0);
  if (hasEmptyContexts) return sources;

  const contentLower = sectionContent.toLowerCase();
  return sources.filter(source =>
    source.contexts.some(ctx => {
      if (!ctx) return false;
      return contentLower.includes(ctx.toLowerCase());
    }),
  );
}

function stripSocietaryMapDuplicates(markdown: string): string {
  let result = markdown.replace(/```mermaid[\s\S]*?```/gi, '');

  const lines = result.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const normalized = normalizeFeedbackSectionTitle(line);
    if (/^#{1,6}\s+/.test(line)) {
      if (normalized.includes('mapa de poder societario') || normalized.includes('mapa do poder societario')) {
        skipping = true;
        continue;
      }
      if (skipping) {
        skipping = false;
      }
    }
    if (!skipping) output.push(line);
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTabelaMestreCnpjs(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let skipping = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const normalized = normalizeFeedbackSectionTitle(line);

    if (normalized.includes('tabela mestre de cnpjs') || normalized.includes('tabela mestra de cnpjs')) {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (/^#{1,6}\s+/.test(line)) {
        skipping = false;
        output.push(line);
      } else if (line.trim().startsWith('|') || /^\s*\|[-:| ]+\|\s*$/.test(line) || line.trim() === '') {
        continue;
      } else {
        skipping = false;
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripUnsafeSocietarySections(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let skippingLevel: number | null = null;

  for (const line of lines) {
    const normalizedLine = normalizeFeedbackSectionTitle(line);
    if (/^\s*[-*]?\s*(?:\*\*)?outros cnpjs(?:\*\*)?\s*:/i.test(normalizedLine)) {
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const normalizedTitle = normalizeFeedbackSectionTitle(heading[2]);

      if (skippingLevel !== null && level <= skippingLevel) {
        skippingLevel = null;
      }

      if (
        normalizedTitle.includes('outros cnpjs onde o socio aparece') ||
        normalizedTitle.includes('alertas de validacao societaria')
      ) {
        skippingLevel = level;
        continue;
      }
    }

    if (skippingLevel !== null) continue;
    output.push(line);
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const TRUNCATION_SECTION_THRESHOLD = 3;
const HEAVY_MARKDOWN_CHARS = 4_000;
const CHUNKED_RENDER_CHARS = 20_000;
const CHUNKED_SECTIONS_PER_IDLE = 1;
const CHUNKED_INITIAL_SECTION_COUNT = 1;

type IdleHandle = number;

function scheduleIdleWork(callback: () => void, timeoutMs = 100): IdleHandle {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: timeoutMs });
  }
  return window.setTimeout(callback, 0);
}

function cancelIdleWork(handle: IdleHandle): void {
  if (typeof window === 'undefined') return;
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

interface ParsedMessageBundle {
  cleanText: string;
  parsedOptions: string[];
  displayText: string;
  sections: ParsedSection[];
  sectionSourcesMap: AuditableSource[][];
  parsedTeiaData: ParsedTeiaData;
  societaryMapSectionIndex: number;
}

function computeParsedMessageBundle(
  rawText: string,
  auditableSources: AuditableSource[],
  cnpj?: string | null,
): ParsedMessageBundle {
  const { cleanText, options: parsedOptions } = parseSmartOptions(rawText);
  const displayText = stripUnsafeSocietarySections(cleanText);
  const sections = parseMarkdownSections(displayText);
  const sectionSourcesMap = sections.map(section => filterSourcesForSection(auditableSources, section.content));
  const parsedTeiaData = parseTeiaText(cleanText);
  const societaryMapSectionIndex = sections.findIndex(section =>
    shouldShowSocietaryMap(section.title, section.content, cnpj),
  );

  return {
    cleanText,
    parsedOptions,
    displayText,
    sections,
    sectionSourcesMap,
    parsedTeiaData,
    societaryMapSectionIndex,
  };
}


async function computeParsedMessageBundleChunked(
  rawText: string,
  auditableSources: AuditableSource[],
  cnpj?: string | null,
): Promise<ParsedMessageBundle> {
  const { cleanText, options: parsedOptions } = parseSmartOptions(rawText);
  const displayText = stripUnsafeSocietarySections(cleanText);
  const sections = parseMarkdownSections(displayText);

  await yieldToMain();

  const sectionSourcesMap = sections.map(section => filterSourcesForSection(auditableSources, section.content));

  await yieldToMain();

  const parsedTeiaData = parseTeiaText(cleanText);
  const societaryMapSectionIndex = sections.findIndex(section =>
    shouldShowSocietaryMap(section.title, section.content, cnpj),
  );

  return {
    cleanText,
    parsedOptions,
    displayText,
    sections,
    sectionSourcesMap,
    parsedTeiaData,
    societaryMapSectionIndex,
  };
}

const SectionSkeleton: React.FC = () => (
  <div data-testid="section-skeleton" className="animate-pulse space-y-2 py-2">
    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-full" />
    <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
  </div>
);

const DeferredMessageSkeleton: React.FC = () => (
  <div data-testid="bot-message-content" data-deferred="true" className="flex min-w-0 flex-col gap-3 p-4">
    <div className="animate-pulse space-y-3">
      <div className="h-3 bg-slate-300 dark:bg-slate-700 rounded w-3/4" />
      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
      <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
    </div>
    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Carregando dossiê...</p>
  </div>
);

interface SectionalBotMessageParsedProps extends SectionalBotMessageProps {
  readyText: string;
}

const SectionalBotMessageParsed: React.FC<SectionalBotMessageParsedProps> = ({
  readyText,
  message,
  sessionId,
  userId,
  isDarkMode,
  mode,
  onPreFillInput,
  onRegenerateSuggestions,
  hideSuggestions = false,
  empresaAlvo,
  cnpj,
  auditableSources = EMPTY_AUDITABLE_SOURCES,
  isLoading = false,
}) => {
  const [parsedBundle, setParsedBundle] = useState<ParsedMessageBundle | null>(() =>
    readyText.length <= HEAVY_MARKDOWN_CHARS
      ? computeParsedMessageBundle(readyText, auditableSources, cnpj)
      : null,
  );
  const [renderedSectionCount, setRenderedSectionCount] = useState(() =>
    readyText.length > CHUNKED_RENDER_CHARS ? CHUNKED_INITIAL_SECTION_COUNT : Number.MAX_SAFE_INTEGER,
  );
  const [isDossierExpanded, setIsDossierExpanded] = useState(false);

  const teiaTraceIdRef = useRef(createScoutTraceId('teia'));
  const teiaTraceEnabled = isScoutTraceEnabled('teia');

  useEffect(() => {
    setIsDossierExpanded(false);
  }, [message.id]);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: IdleHandle | null = null;

    if (readyText.length <= HEAVY_MARKDOWN_CHARS) {
      setParsedBundle(computeParsedMessageBundle(readyText, auditableSources, cnpj));
      return () => {
        cancelled = true;
      };
    }

    setParsedBundle(null);
    void computeParsedMessageBundleChunked(readyText, auditableSources, cnpj)
      .then(bundle => {
        if (!cancelled) setParsedBundle(bundle);
      })
      .catch(err => {
        console.error('SectionalBotMessage: chunked parse failed, fallback sync', err);
        if (!cancelled) setParsedBundle(computeParsedMessageBundle(readyText, auditableSources, cnpj));
      });

    return () => {
      cancelled = true;
      if (idleHandle !== null) cancelIdleWork(idleHandle);
    };
  }, [cnpj, message.id, readyText]); // auditableSources: intentionally omitted to avoid [] default loop

  useEffect(() => {
    if (!parsedBundle || readyText.length <= CHUNKED_RENDER_CHARS) {
      setRenderedSectionCount(Number.MAX_SAFE_INTEGER);
      return;
    }

    let cancelled = false;
    let idleHandle: IdleHandle | null = null;
    const totalSections = parsedBundle.sections.length;
    const initialCount = Math.min(CHUNKED_INITIAL_SECTION_COUNT, totalSections);
    setRenderedSectionCount(initialCount);

    const revealNext = (current: number) => {
      if (cancelled || current >= totalSections) return;
      const next = Math.min(current + CHUNKED_SECTIONS_PER_IDLE, totalSections);
      setRenderedSectionCount(next);
      if (next < totalSections) {
        idleHandle = scheduleIdleWork(() => revealNext(next));
      }
    };

    if (initialCount < totalSections) {
      idleHandle = scheduleIdleWork(() => revealNext(initialCount));
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) cancelIdleWork(idleHandle);
    };
  }, [message.id, parsedBundle, readyText.length]);

  useEffect(() => {
    if (!parsedBundle || !teiaTraceEnabled) return;
    const { parsedTeiaData, societaryMapSectionIndex } = parsedBundle;
    if (societaryMapSectionIndex < 0 && parsedTeiaData.companies.length === 0 && parsedTeiaData.warnings.length === 0) {
      return;
    }
    scoutDiag.trace('teia', 'SectionalBotMessage', 'parse textual da teia concluido', {
      traceId: teiaTraceIdRef.current,
      empresaAlvo,
      cnpj,
      hasSocietaryMapSection: societaryMapSectionIndex >= 0,
      geminiCompaniesCount: parsedTeiaData.companies.length,
      warnings: parsedTeiaData.warnings,
      companies: parsedTeiaData.companies.slice(0, 30).map(company => ({
        name: company.name,
        cnpj: company.cnpj || company.rawCnpjLabel || null,
        partnerName: company.partnerName,
        relationshipScope: company.relationshipScope,
        validationStatus: company.validationStatus,
      })),
    });
  }, [cnpj, empresaAlvo, parsedBundle, teiaTraceEnabled]);

  const parsedOptions = parsedBundle?.parsedOptions ?? [];
  const activeOptions =
    Array.isArray(message.suggestions) && message.suggestions.length > 0 ? message.suggestions : parsedOptions;

  const processedOptions = useMemo(() => {
    if (!Array.isArray(activeOptions) || activeOptions.length === 0) return [];
    if (!empresaAlvo) return activeOptions;
    return activeOptions.map(option =>
      option
        .replace(/\[NOME DA EMPRESA\]/gi, empresaAlvo)
        .replace(/\[Nome da Empresa\]/gi, empresaAlvo)
        .replace(/\[Empresa\]/gi, empresaAlvo)
        .replace(/\[NOME DO GRUPO \/ EMPRESA ALVO\]/gi, empresaAlvo),
    );
  }, [activeOptions, empresaAlvo]);

  if (!parsedBundle) {
    return <DeferredMessageSkeleton />;
  }

  const {
    displayText,
    sections,
    sectionSourcesMap,
    parsedTeiaData,
    societaryMapSectionIndex,
  } = parsedBundle;

  const llmCnpjsForMap = parsedTeiaData.companies.length > 0 ? parsedTeiaData.companies : undefined;

  const isRegenerating = Boolean(message.isRegeneratingSuggestions);

  const handleRegenerate = () => {
    if (onRegenerateSuggestions && message.id) {
      onRegenerateSuggestions(message.id);
    }
  };

  const shouldTruncateDossier = sections.length > TRUNCATION_SECTION_THRESHOLD && !isDossierExpanded;
  const maxVisibleByChunk = Math.min(renderedSectionCount, sections.length);
  const maxVisibleByTruncate = shouldTruncateDossier ? TRUNCATION_SECTION_THRESHOLD : sections.length;
  const visibleSections = sections.slice(0, Math.min(maxVisibleByChunk, maxVisibleByTruncate));
  const hiddenSectionCount = sections.length - TRUNCATION_SECTION_THRESHOLD;
  const showCopyButton = displayText.length > 300;
  const isChunkedRenderPending =
    readyText.length > CHUNKED_RENDER_CHARS && renderedSectionCount < sections.length && !shouldTruncateDossier;

  if (sections.length <= 1 && !/^(#{1,3})\s+/m.test(displayText)) {
    return (
      <div className="flex min-w-0 flex-col gap-2" data-testid="bot-message-content">
        {showCopyButton && (
          <div className="relative h-0">
            <CopyButton text={displayText} isDarkMode={isDarkMode} />
          </div>
        )}
        <Suspense fallback={<SectionSkeleton />}>
          <LazyMarkdownRenderer
            content={displayText}
            isDarkMode={isDarkMode}
            groundingSources={message.groundingSources}
            auditableSources={auditableSources}
          />
        </Suspense>
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
    <div className="sectional-message space-y-4" data-testid="bot-message-content">
      {showCopyButton && (
        <div className="relative flex justify-end mb-1">
          <CopyButton text={displayText} isDarkMode={isDarkMode} />
        </div>
      )}

      {visibleSections.map((section, idx) => {
        const sellerSectionKind = getSellerSectionKind(section.title);
        const sellerSectionClass = getSellerSectionClass(sellerSectionKind, isDarkMode);
        const isPrimaryModule = section.level === 1 && section.kind === 'module';

        const sectionSources = sectionSourcesMap[idx] ?? [];

        const framedClass =
          sellerSectionClass ||
          (isPrimaryModule
            ? isDarkMode
              ? 'rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm'
              : 'rounded-2xl border border-slate-200 bg-white/90 shadow-sm'
            : '');

        return (
          <div
            key={section.key}
            data-section-kind={sellerSectionKind}
            className={`section-block group relative ${framedClass}`}
          >
            {isPrimaryModule && (
              <div
                className={`flex items-center justify-between gap-3 px-4 pt-4 pb-1 md:px-5 ${
                  isDarkMode ? 'border-slate-800/70' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                      isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    Módulo{' '}
                    {sections.slice(0, idx + 1).filter(item => item.level === 1 && item.kind === 'module').length}
                  </span>
                </div>
              </div>
            )}
            <div
              className={
                isPrimaryModule || sellerSectionKind !== 'default'
                  ? 'section-content px-4 pb-4 pt-3 md:px-5 md:pb-5'
                  : 'section-content'
              }
            >
              {sectionSources.length > 0 && (
                <div
                  className={`flex items-center justify-end gap-1.5 mb-2 text-[10px] font-medium uppercase tracking-wider ${
                    isDarkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                  </svg>
                  <span>
                    {sectionSources.length} fonte{sectionSources.length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {idx === societaryMapSectionIndex && !isLoading ? (
                <SocietaryMap
                  cnpj={cnpj}
                  empresaAlvo={empresaAlvo}
                  isDarkMode={isDarkMode}
                  llmCnpjs={llmCnpjsForMap}
                  traceId={teiaTraceIdRef.current}
                  traceEnabled={teiaTraceEnabled}
                />
              ) : null}
              <Suspense fallback={<SectionSkeleton />}>
                <LazyMarkdownRenderer
                  content={(() => {
                    const raw =
                      section.key === 'intro'
                        ? section.content
                        : `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`;
                    if (idx === societaryMapSectionIndex) {
                      return stripSocietaryMapDuplicates(stripTabelaMestreCnpjs(raw));
                    }
                    if (societaryMapSectionIndex >= 0 && shouldShowSocietaryMap(section.title, section.content, cnpj)) {
                      return stripSocietaryMapDuplicates(raw);
                    }
                    return raw;
                  })()}
                  isDarkMode={isDarkMode}
                  groundingSources={message.groundingSources}
                  auditableSources={sectionSources}
                />
              </Suspense>
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

      {isChunkedRenderPending && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-400 dark:text-slate-500">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Renderizando seções do dossiê...</span>
        </div>
      )}

      {shouldTruncateDossier && (
        <button
          onClick={() => setIsDossierExpanded(true)}
          className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed
            font-medium text-sm transition-all duration-200
            ${
              isDarkMode
                ? 'border-slate-600 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 bg-slate-800/50 hover:bg-slate-800'
                : 'border-slate-300 hover:border-emerald-400 text-slate-500 hover:text-emerald-600 bg-slate-50 hover:bg-white'
            }`}
          aria-label={`Ver relatório completo (mais ${hiddenSectionCount} seções)`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <span>
            Ver relatório completo
            <span className={`ml-1 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              (+{hiddenSectionCount} seç{hiddenSectionCount > 1 ? 'ões' : 'ão'})
            </span>
          </span>
        </button>
      )}

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

const SectionalBotMessage: React.FC<SectionalBotMessageProps> = ({ auditableSources = EMPTY_AUDITABLE_SOURCES, ...props }) => {
  const content = props.message.text || '';
  const isHeavyContent = content.length > HEAVY_MARKDOWN_CHARS;
  const [readyText, setReadyText] = useState(() => (isHeavyContent ? '' : content));
  const [textReady, setTextReady] = useState(() => !isHeavyContent);

  useEffect(() => {
    let cancelled = false;
    let idleHandle: IdleHandle | null = null;

    if (content.length <= HEAVY_MARKDOWN_CHARS) {
      setReadyText(content);
      setTextReady(true);
      return () => {
        cancelled = true;
      };
    }

    setTextReady(false);
    setReadyText('');
    idleHandle = scheduleIdleWork(() => {
      if (cancelled) return;
      setReadyText(content);
      setTextReady(true);
    });

    return () => {
      cancelled = true;
      if (idleHandle !== null) cancelIdleWork(idleHandle);
    };
  }, [content, props.message.id]);

  if (!textReady || (isHeavyContent && !readyText)) {
    return <DeferredMessageSkeleton />;
  }

  return <SectionalBotMessageParsed {...props} auditableSources={auditableSources} readyText={readyText} />;
};

export default SectionalBotMessage;
