"use no memo";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { stripPortaMarkers } from '../utils/porta';
import { buildAuditableSources, normalizeSourceUrl, type AuditableSource } from '../utils/textCleaners';
import { loadWithChunkRetry } from '../utils/chunkRetry';
import {
  getDisplayableMermaidCode,
  isMermaidRenderErrorOutput,
  normalizeMermaidBlocks,
  sanitizeMermaidCode,
} from '../utils/mermaid';
import {
  fixFakeLinks,
  rewriteMarkdownLinksToGoogle,
  autoLinkSeniorTerms,
  cleanFakeSourcesBlock,
} from '../utils/linkFixer';

// Module-level constants prevent new array references on every render, which would
// bypass react-markdown's internal memoisation and force a full re-parse each render.
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS_RAW = [rehypeRaw];
const REHYPE_PLUGINS_NONE: never[] = [];

export interface GroundingSource {
  title: string;
  url: string;
}

interface MarkdownRendererProps {
  content: string;
  isDarkMode?: boolean;
  groundingSources?: GroundingSource[];
  auditableSources?: AuditableSource[];
  allowRawHtml?: boolean;
  /** "compact" suppresses the "Inteligência Estratégica" header in Mermaid charts */
  variant?: 'default' | 'compact';
}

interface MermaidProps {
  chart: string;
  isDarkMode?: boolean;
  /** "compact" skips the "Inteligência Estratégica" header (use inside SocietaryMap) */
  variant?: 'default' | 'compact';
}

function isMermaidCodeNode(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  const props = (node as React.ReactElement<{ className?: string }>).props;
  return /\blanguage-mermaid\b/.test(props.className || '');
}

function extractNodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join('');
  if (React.isValidElement(node)) return extractNodeText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  return '';
}

function isHiddenSupportHeading(node: React.ReactNode): boolean {
  const text = extractNodeText(node).replace(/\s+/g, ' ').trim();
  return /BLOCO DE FEEDS PORTA/i.test(text);
}

function isCitationOnlyLabel(value: string): boolean {
  return /^\[?\d+(?:\.\d+)?\]?$/.test((value || '').trim());
}

function normalizeCitationArtifacts(input: string): string {
  if (!input) return '';
  return input
    // Remove numeric plain reference artifacts that often follow generated
    // source links in tables, e.g. `[1.4](url) [4]`.
    .replace(
      /(\[\d+(?:\.\d+)?\]\(https?:\/\/(?:[^\s()]+|\([^\s()]*\))+\))(?:\s+\[\d+(?:\.\d+)?\])+/gi,
      '$1',
    )
    // Collapse repeated numeric markdown citations that point to the same URL.
    .replace(
      /(\[\d+(?:\.\d+)?\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\))(?:\s+\[\d+(?:\.\d+)?\]\(\2\))+/gi,
      '$1',
    );
}

let mermaidSingleton: typeof import('mermaid')['default'] | null = null;
let mermaidTheme: string | null = null;

/** Module-level SVG cache: key = sanitizedChart + "::" + themeKey */
const mermaidSvgCache = new Map<string, string>();

async function getMermaid(isDarkMode: boolean): Promise<typeof import('mermaid')['default']> {
  const themeKey = isDarkMode ? 'dark' : 'light';
  const mod = await loadWithChunkRetry(() => import('mermaid'));
  const mermaid = mod.default;

  if (!mermaidSingleton || mermaidTheme !== themeKey) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        primaryColor: isDarkMode ? '#1e293b' : '#ffffff',
        primaryTextColor: isDarkMode ? '#f8fafc' : '#0f172a',
        primaryBorderColor: isDarkMode ? '#334155' : '#e2e8f0',
        lineColor: isDarkMode ? '#64748b' : '#cbd5e1',
        secondaryColor: isDarkMode ? '#0f172a' : '#f8fafc',
        tertiaryColor: isDarkMode ? '#020617' : '#ffffff',
        mainBkg: 'transparent',
        nodeBorder: isDarkMode ? '#334155' : '#e2e8f0',
        clusterBkg: isDarkMode ? '#0f172a' : '#f1f5f9',
        clusterBorder: isDarkMode ? '#475569' : '#cbd5e1',
        defaultLinkColor: isDarkMode ? '#94a3b8' : '#475569',
        textColor: isDarkMode ? '#f8fafc' : '#0f172a',
        fontSize: '13px',
        edgeLabelBackground: isDarkMode ? '#1e293b' : '#ffffff',
      },
      // strict: bloqueia click injection e outras execuções JS arbitrárias em diagramas
      securityLevel: 'strict',
    });
    mermaidSingleton = mermaid;
    mermaidTheme = themeKey;
  }

  return mermaid;
}

type MermaidWithParse = typeof import('mermaid')['default'] & {
  parse?: (chart: string) => Promise<unknown> | unknown;
};

const MermaidChart: React.FC<MermaidProps> = ({ chart, isDarkMode, variant = 'default' }) => {
  const themeKey = isDarkMode ? 'dark' : 'light';
  const sanitizedChart = useMemo(() => sanitizeMermaidCode(chart), [chart]);
  const cacheKey = `${sanitizedChart}::${themeKey}`;

  const [svg, setSvg] = useState<string>(() => mermaidSvgCache.get(cacheKey) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  // Stable render ID per component instance — never changes to avoid duplicate DOM ids
  const idRef = useRef<string>(`mermaid-${Math.random().toString(36).substring(2, 9)}`);
  const fallbackChart = useMemo(() => getDisplayableMermaidCode(chart), [chart]);

  useEffect(() => {
    if (!chart?.trim()) {
      setSvg('');
      setError(null);
      return;
    }

    // Hit cache first — avoids flicker on Virtuoso remount
    const cached = mermaidSvgCache.get(cacheKey);
    if (cached) {
      setSvg(cached);
      setError(null);
      return;
    }

    if (!sanitizedChart) {
      setError('Bloco Mermaid invalido ou incompleto.');
      return;
    }

    let cancelled = false;

    const initMermaid = async () => {
      try {
        const mermaid = (await getMermaid(isDarkMode ?? false)) as MermaidWithParse;
        if (typeof mermaid.parse === 'function') {
          await mermaid.parse(sanitizedChart);
        }

        const { svg: rendered } = await mermaid.render(idRef.current, sanitizedChart);

        // Remove temporary render container that mermaid injects into the body
        const tempEl = document.getElementById(idRef.current);
        tempEl?.remove();
        // Clean up lingering dmermaid-* nodes for this specific instance only
        document.querySelectorAll(`[id^="dmermaid-${idRef.current}"]`).forEach(el => el.remove());

        if (isMermaidRenderErrorOutput(rendered)) {
          throw new Error('Mermaid retornou um SVG de erro sintático');
        }

        if (!cancelled) {
          if (mermaidSvgCache.size >= 100) {
            const firstKey = mermaidSvgCache.keys().next().value;
            if (firstKey !== undefined) {
              mermaidSvgCache.delete(firstKey);
            }
          }
          mermaidSvgCache.set(cacheKey, rendered);
          setSvg(rendered);
          setError(null);
          setShowDetails(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const typedError = err as { str?: string; message?: string };
          setError(typedError?.str || typedError?.message || 'Falha ao renderizar diagrama');
        }
      }
    };

    void initMermaid();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, chart, isDarkMode, sanitizedChart]);

  if (error) {
    return (
      <div className="mt-2 mb-4 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <p className="font-semibold">Não foi possível renderizar o diagrama.</p>
          </div>
          <button
            onClick={() => setShowDetails(value => !value)}
            className="shrink-0 text-[10px] font-semibold underline underline-offset-2"
          >
            {showDetails ? 'Ocultar' : 'Ver erro'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug">
          O diagrama ficou disponivel em texto para o dossie continuar legivel.
        </p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-black/5 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap dark:bg-black/40">
          {fallbackChart || chart.trim()}
        </pre>
        {showDetails ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/5 p-2 text-[10px] leading-snug whitespace-pre-wrap dark:bg-black/40">
            {error}
          </pre>
        ) : null}
      </div>
    );
  }

  // Keep previous SVG visible while reloading instead of flashing null
  if (!svg) {
    return (
      <div
        className={`my-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${variant === 'compact' ? '' : 'my-8 rounded-[2rem]'}`}
        aria-hidden
      >
        <div className="h-40 rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className="mermaid-chart overflow-x-auto p-2"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  return (
    <div className="my-8 overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white shadow-lg shadow-slate-200/20 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/20">
      <div className="flex items-center gap-2 border-b border-slate-200/40 bg-slate-50 px-6 py-3.5 dark:border-slate-800/40 dark:bg-slate-900/60">
        <div className="flex h-1.5 w-1.5 items-center justify-center rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
          Inteligência Estratégica
        </span>
      </div>
      <div
        className="mermaid-chart flex items-center justify-center overflow-x-auto p-4 sm:p-6"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDarkMode = false,
  groundingSources = [],
  auditableSources,
  // ATENÇÃO: rehypeRaw renderiza HTML bruto sem sanitização.
  // Manter false por padrão para prevenir XSS via conteúdo gerado por IA.
  // Se true for necessário, usar DOMPurify antes de passar o conteúdo.
  allowRawHtml = false,
  variant = 'default',
}) => {
  const resolvedSources = useMemo(
    () =>
      auditableSources && auditableSources.length > 0
        ? auditableSources
        : buildAuditableSources(content, groundingSources),
    [auditableSources, content, groundingSources],
  );

  const citationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const source of resolvedSources) {
      if (source.url && source.citationIndex) {
        map.set(normalizeSourceUrl(source.url), source.citationIndex);
      }
    }
    return map;
  }, [resolvedSources]);

  const titleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const source of resolvedSources) {
      if (source.url && source.title) {
        map.set(normalizeSourceUrl(source.url), source.title);
      }
    }
    return map;
  }, [resolvedSources]);

  const processedContent = useMemo(() => {
    if (!content) return '';

    let text = normalizeMermaidBlocks(stripPortaMarkers(content));
    const preservedMermaidBlocks: string[] = [];

    const preserveMermaid = (input: string): string =>
      input.replace(/```mermaid[\s\S]*?```/gi, block => {
        const key = `@@__MERMAID_BLOCK_${preservedMermaidBlocks.length}__@@`;
        preservedMermaidBlocks.push(block);
        return key;
      });

    const restoreMermaid = (input: string): string =>
      input.replace(/@@__MERMAID_BLOCK_(\d+)__@@/g, (_match, index) => preservedMermaidBlocks[Number(index)] || '');

    text = preserveMermaid(text);
    text = normalizeCitationArtifacts(text);
    text = fixFakeLinks(text);
    text = rewriteMarkdownLinksToGoogle(text);
    text = autoLinkSeniorTerms(text);
    text = cleanFakeSourcesBlock(text);

    // Converte <a href="...">texto</a> HTML bruto para markdown [texto](url).
    // Necessário porque allowRawHtml=false (XSS prevention) desabilita rehypeRaw,
    // então HTML de resultados de pesquisa não seria renderizado como link.
    text = text.replace(
      /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi,
      (_match, url, linkText) => {
        const trimmedText = linkText.trim();
        if (!trimmedText || !url.trim()) return _match;
        return `[${trimmedText}](${url.trim()})`;
      },
    );

    text = text.replace(
      /\[(🟢|🟡|🟠|🔴)\s*(?:Fonte oficial|Não confirmado|Evidência forte|Suspeito)?[\s-–:]*([^\]\n]+?)\]/gi,
      (_match, _emoji, rawUrl) => {
        let fullUrl = rawUrl.trim();
        if (!fullUrl.startsWith('http')) fullUrl = `https://${fullUrl}`;
        const displayDomain = fullUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        const citationIndex = citationMap.get(normalizeSourceUrl(fullUrl));
        if (!citationIndex) {
          return `[${displayDomain}](${fullUrl})`;
        }
        return `[${citationIndex}](${fullUrl})`;
      },
    );

    return restoreMermaid(text);
  }, [content, citationMap]);

  // useMemo prevents a new object reference on every render. Without this, ReactMarkdown
  // would see new props on every render and re-run the full parse/transform pipeline.
  const components: NonNullable<React.ComponentProps<typeof ReactMarkdown>['components']> = useMemo(() => ({
    pre: ({ children }: { children: React.ReactNode }) => {
      const childNodes = React.Children.toArray(children);
      if (childNodes.some(isMermaidCodeNode)) {
        return <div className="my-4">{children}</div>;
      }

      return (
        <pre className="my-4 overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-[0.78rem] leading-relaxed text-slate-100 dark:bg-slate-950/90">
          {children}
        </pre>
      );
    },

    code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children: React.ReactNode }) => {
      const langMatch = /language-(\w+)/.exec(className || '');
      const isMermaid = !inline && langMatch && langMatch[1] === 'mermaid';

      if (isMermaid) {
        const chart = String(children).replace(/\n$/, '').trim();
        return <MermaidChart chart={chart} isDarkMode={isDarkMode} variant={variant} />;
      }

      return (
        <code
          className={
            'font-mono text-[0.75rem] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-900/60 ' +
            'text-emerald-700 dark:text-emerald-300 ' +
            (className || '')
          }
          {...props}
        >
          {children}
        </code>
      );
    },

    a: ({ href, children, className, title, ...props }: { href?: string; children: React.ReactNode; className?: string; title?: string }) => {
      if (!href) return <>{children}</>;

      if (className === 'citation-link') {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-600 visited:text-purple-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:visited:text-purple-400 dark:hover:text-blue-300"
            title={title}
            {...props}
          >
            {children}
          </a>
        );
      }

      const textContent = extractNodeText(children);
      const cleanText = textContent.trim();
      const isBadgeMatch = textContent.match(/^(🟢|🟡|🟠|🔴)/);
      const citationIndex = citationMap.get(normalizeSourceUrl(href));
      const isCitationLabel = isCitationOnlyLabel(cleanText);
      const isDomainLike = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?$/i.test(cleanText);
      const isLongLinkLabel = cleanText.length > 36 || /https?:\/\//i.test(cleanText);

      if (isBadgeMatch) {
        const displayDomain = href.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        return (
          <sup className="ml-0.5">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 visited:text-purple-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:visited:text-purple-400 dark:hover:text-blue-300"
              title={titleMap.get(normalizeSourceUrl(href)) || displayDomain}
              {...props}
            >
              [{citationIndex ?? '?'}]
            </a>
          </sup>
        );
      }

      if (citationIndex && (isDomainLike || isLongLinkLabel)) {
        return (
          <sup className="ml-0.5">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 visited:text-purple-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:visited:text-purple-400 dark:hover:text-blue-300"
              title={titleMap.get(normalizeSourceUrl(href)) || cleanText || href}
              {...props}
            >
              [{citationIndex}]
            </a>
          </sup>
        );
      }

      if (citationIndex && isCitationLabel) {
        return (
          <sup className="ml-0.5">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 visited:text-purple-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:visited:text-purple-400 dark:hover:text-blue-300"
              title={titleMap.get(normalizeSourceUrl(href)) || href}
              {...props}
            >
              [{citationIndex}]
            </a>
          </sup>
        );
      }

      if (!citationIndex && isDomainLike) {
        const displayDomain = cleanText.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 visited:text-purple-600 hover:underline dark:text-blue-400 dark:visited:text-purple-400" title={titleMap.get(normalizeSourceUrl(href)) || displayDomain} {...props}>
            {displayDomain} ↗
          </a>
        );
      }

      const isAlreadyCitation = isCitationOnlyLabel(textContent);

      return (
        <span className="inline-flex items-baseline">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-blue-600 visited:text-purple-600 transition-colors hover:underline dark:text-blue-400 dark:visited:text-purple-400"
            title={titleMap.get(normalizeSourceUrl(href)) || href}
            {...props}
          >
            {children} ↗
          </a>
          {citationIndex && !isAlreadyCitation ? (
            <sup className="ml-0.5 text-[10px] font-bold text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400">
              [{citationIndex}]
            </sup>
          ) : null}
        </span>
      );
    },

    sup: ({ children }: { children: React.ReactNode }) => <sup className="ml-0.5">{children}</sup>,
    p: ({ children }: { children: React.ReactNode }) => (
      <p className="mb-2 last:mb-0 text-sm leading-relaxed text-slate-800 dark:text-slate-100 md:text-[0.95rem]">
        {children}
      </p>
    ),
    ul: ({ children }: { children: React.ReactNode }) => (
      <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-100 md:text-[0.95rem]">
        {children}
      </ul>
    ),
    ol: ({ children }: { children: React.ReactNode }) => (
      <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-100 md:text-[0.95rem]">
        {children}
      </ol>
    ),
    li: ({ children }: { children: React.ReactNode }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }: { children: React.ReactNode }) => (
      <h1 className="mb-4 border-b border-slate-200/80 pb-3 text-lg font-black tracking-tight text-slate-900 dark:border-slate-800 dark:text-white md:text-[1.45rem]">
        {children}
      </h1>
    ),
    h2: ({ children }: { children: React.ReactNode }) => (
      <h2 className="mt-6 mb-3 flex items-start gap-2 border-b border-emerald-100 pb-2 text-base font-black tracking-tight text-slate-900 dark:border-emerald-900/60 dark:text-slate-50 md:text-lg">
        <span className="mt-1 h-4 w-1.5 shrink-0 rounded-full bg-emerald-500/80" />
        <span className="block leading-snug">{children}</span>
      </h2>
    ),
    h3: ({ children }: { children: React.ReactNode }) =>
      isHiddenSupportHeading(children) ? null : (
        <h3 className="mt-5 mb-2 flex items-start gap-2 text-[0.95rem] font-extrabold text-slate-900 dark:text-slate-50 md:text-[1rem]">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          <span className="block leading-snug">{children}</span>
        </h3>
      ),
    hr: () => <hr className="my-6 border-t-2 border-slate-100 dark:border-slate-800" />,
    h4: ({ children }: { children: React.ReactNode }) =>
      isHiddenSupportHeading(children) ? null : (
        <h4 className="mt-2 mb-1 text-[0.9rem] font-bold text-slate-900 dark:text-slate-50">{children}</h4>
      ),
    blockquote: ({ children }: { children: React.ReactNode }) => (
      <blockquote className="my-2 rounded-r-md border-l-4 border-emerald-400/80 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/70 dark:bg-emerald-900/20 dark:text-emerald-100 md:text-[0.9rem]">
        {children}
      </blockquote>
    ),
    table: ({ children }: { children: React.ReactNode }) => (
      <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/80">
        <table className="w-full min-w-[720px] border-collapse text-sm md:text-[0.92rem]">{children}</table>
      </div>
    ),
    thead: ({ children }: { children: React.ReactNode }) => (
      <thead className="bg-slate-100 text-slate-900 dark:bg-slate-800/80 dark:text-slate-100">{children}</thead>
    ),
    tbody: ({ children }: { children: React.ReactNode }) => (
      <tbody className="divide-y divide-slate-200 dark:divide-slate-700/70">{children}</tbody>
    ),
    tr: ({ children }: { children: React.ReactNode }) => (
      <tr className="odd:bg-white even:bg-slate-50/70 hover:bg-emerald-50/70 dark:odd:bg-slate-900/20 dark:even:bg-slate-900/45 dark:hover:bg-emerald-900/20">
        {children}
      </tr>
    ),
    th: ({ children }: { children: React.ReactNode }) => (
      <th className="border-b border-slate-200 px-3 py-2 text-left align-top font-bold tracking-wide whitespace-nowrap dark:border-slate-700/80">
        {children}
      </th>
    ),
    td: ({ children }: { children: React.ReactNode }) => (
      <td className="px-3 py-2 align-top leading-relaxed text-slate-800 dark:text-slate-100">{children}</td>
    ),
  }), [isDarkMode, citationMap, titleMap, variant]);

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={allowRawHtml ? REHYPE_PLUGINS_RAW : REHYPE_PLUGINS_NONE}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
