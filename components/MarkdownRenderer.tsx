"use no memo";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { stripPortaMarkers } from '../utils/porta';
import { buildAuditableSources, normalizeSourceUrl, type AuditableSource } from '../utils/textCleaners';
import { loadWithChunkRetry } from '../utils/chunkRetry';
import {
  fixFakeLinks,
  rewriteMarkdownLinksToGoogle,
  autoLinkSeniorTerms,
  cleanFakeSourcesBlock,
} from '../utils/linkFixer';

export interface GroundingSource {
  title: string;
  url: string;
}

interface MarkdownRendererProps {
  content: string;
  isDarkMode?: boolean;
  groundingSources?: GroundingSource[];
  auditableSources?: AuditableSource[];
  showCollapsibleSources?: boolean;
  allowRawHtml?: boolean;
}

interface MermaidProps {
  chart: string;
  isDarkMode?: boolean;
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

let mermaidSingleton: typeof import('mermaid')['default'] | null = null;
let mermaidTheme: string | null = null;

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
        primaryColor: isDarkMode ? '#1e293b' : '#f1f5f9',
        primaryTextColor: isDarkMode ? '#f8fafc' : '#334155',
        primaryBorderColor: isDarkMode ? '#334155' : '#cbd5e1',
        lineColor: isDarkMode ? '#475569' : '#94a3b8',
        secondaryColor: isDarkMode ? '#0f172a' : '#f8fafc',
        tertiaryColor: isDarkMode ? '#020617' : '#ffffff',
        mainBkg: 'transparent',
        nodeBorder: isDarkMode ? '#334155' : '#e2e8f0',
        clusterBkg: isDarkMode ? '#0f172a' : '#f8fafc',
        clusterBorder: isDarkMode ? '#334155' : '#cbd5e1',
        defaultLinkColor: isDarkMode ? '#64748b' : '#94a3b8',
        textColor: isDarkMode ? '#f8fafc' : '#0f172a',
      },
      securityLevel: 'loose',
    });
    mermaidSingleton = mermaid;
    mermaidTheme = themeKey;
  }

  return mermaid;
}

const MermaidChart: React.FC<MermaidProps> = ({ chart, isDarkMode }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const idRef = useRef<string>(`mermaid-${Math.random().toString(36).substring(2, 9)}`);

  useEffect(() => {
    if (!chart?.trim()) return;
    let cancelled = false;

    const initMermaid = async () => {
      try {
        const clean = sanitizeMermaidCode(chart);
        if (!clean) return;

        const mermaid = await getMermaid(isDarkMode ?? false);
        const { svg: rendered } = await mermaid.render(idRef.current, clean);

        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const typedError = err as { str?: string; message?: string };
          console.error('Erro Mermaid:', err);
          setError(typedError?.str || typedError?.message || 'Falha ao renderizar diagrama');
        }
      }
    };

    void initMermaid();
    return () => {
      cancelled = true;
    };
  }, [chart, isDarkMode]);

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
        {showDetails ? (
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/5 p-2 text-[10px] leading-snug whitespace-pre-wrap dark:bg-black/40">
            {error}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!svg) return null;

  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/50 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/50">
      <div className="flex items-center gap-2 border-b border-slate-200/60 bg-slate-100/40 px-4 py-2.5 dark:border-slate-800/60 dark:bg-slate-800/40">
        <div className="flex h-2 w-2 items-center justify-center rounded-full bg-emerald-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Mapa Visual
        </span>
      </div>
      <div
        className="mermaid-chart flex items-center justify-center overflow-x-auto p-4 sm:p-6"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

function sanitizeMermaidCode(input: string): string {
  if (!input) return '';

  let code = input
    .replace(/<br\s*\/?>\s*/gi, '\n')
    .replace(/&lt;br\s*\/?&gt;\s*/gi, '\n')
    .replace(/<\!--[\s\S]*?-->/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/^[^a-zA-Z]+/, '')
    .trim();

  const collectedClassLines: string[] = [];
  const seenClassAssignments = new Set<string>();
  code = code.replace(
    /([A-Za-z][\w-]*)(\s*(?:\[[^\]\n]+\]|\([^\)\n]+\)|\{[^\}\n]+\}|>"[^"\n]+"|>"[^"\n]*"|"(?:[^"\n]+)"))\s*:::\s*([A-Za-z][\w-]*)/g,
    (_full, nodeId: string, nodeShape: string, className: string) => {
      const classLine = `class ${nodeId} ${className};`;
      if (!seenClassAssignments.has(classLine)) {
        seenClassAssignments.add(classLine);
        collectedClassLines.push(classLine);
      }
      return `${nodeId}${nodeShape}`;
    },
  );

  code = code.replace(
    /^(\s*subgraph\s+)([^"'\n\[\]{]+?)(\s*)$/gm,
    (full, prefix, label, suffix) => {
      const trimmed = label.trim();
      if (!trimmed || /[\s()\[\]\/\\%:]/.test(trimmed)) return full;
      return `${prefix}"${trimmed.replace(/"/g, "'")}"${suffix}`;
    },
  );

  const mermaidStart =
    /(graph\s+(?:TB|TD|LR|RL|BT)?|flowchart\s+(?:TB|TD|LR|RL|BT)?|sequenceDiagram|gantt|classDiagram|stateDiagram-v2?|erDiagram|journey|pie|quadrantChart|gitGraph)/i;
  const match = code.match(mermaidStart);
  if (!match) return '';

  code = code.slice(match.index ?? 0).trim();

  const firstWord = code.split(/\s+/)[0].toLowerCase();
  if (
    !/^(graph|flowchart|sequencediagram|gantt|classdiagram|statediagram-v2?|erdiagram|journey|pie|quadrantchart|gitgraph)$/.test(
      firstWord,
    )
  ) {
    return '';
  }

  if (collectedClassLines.length > 0) {
    code = `${code}\n${collectedClassLines.join('\n')}`;
  }

  return code;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDarkMode = false,
  groundingSources = [],
  auditableSources,
  showCollapsibleSources = false,
  allowRawHtml = true,
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

  const processedContent = useMemo(() => {
    if (!content) return '';

    let text = stripPortaMarkers(content);
    const preservedMermaidBlocks: string[] = [];

    const preserveMermaid = (input: string): string =>
      input.replace(/```mermaid[\s\S]*?```/gi, block => {
        const key = `@@__MERMAID_BLOCK_${preservedMermaidBlocks.length}__@@`;
        preservedMermaidBlocks.push(block);
        return key;
      });

    const restoreMermaid = (input: string): string =>
      input.replace(/@@__MERMAID_BLOCK_(\d+)__@@/g, (_match, index) => preservedMermaidBlocks[Number(index)] || '');

    const fence = '`'.repeat(3);
    text = text.replace(/\{"mermaid":"([\s\S]*?)"\}/g, (_match, raw: string) => {
      const unescaped = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return `\n${fence}mermaid\n${unescaped}\n${fence}\n`;
    });

    text = preserveMermaid(text);
    text = fixFakeLinks(text);
    text = rewriteMarkdownLinksToGoogle(text);
    text = autoLinkSeniorTerms(text);
    text = cleanFakeSourcesBlock(text);

    text = text.replace(
      /\[(🟢|🟡|🟠|🔴)\s*(?:Fonte oficial|Não confirmado|Evidência forte|Suspeito)?[\s-–:]*([^\]\n]+?)\]/gi,
      (_match, _emoji, rawUrl) => {
        let fullUrl = rawUrl.trim();
        if (!fullUrl.startsWith('http')) fullUrl = `https://${fullUrl}`;
        const displayDomain = fullUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        const citationIndex = citationMap.get(normalizeSourceUrl(fullUrl));
        if (!citationIndex) {
          return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer">${displayDomain}</a>`;
        }
        return `<sup><a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="citation-link" title="${displayDomain}">[${citationIndex}]</a></sup>`;
      },
    );

    return restoreMermaid(text);
  }, [content, citationMap]);

  const components: Record<string, React.FC<any>> = {
    code: ({ inline, className, children, ...props }: { inline?: boolean; className?: string; children: React.ReactNode }) => {
      const langMatch = /language-(\w+)/.exec(className || '');
      const isMermaid = !inline && langMatch && langMatch[1] === 'mermaid';

      if (isMermaid) {
        const chart = String(children).replace(/\n$/, '').trim();
        return <MermaidChart chart={chart} isDarkMode={isDarkMode} />;
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
            className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:hover:text-blue-300"
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
              className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:hover:text-blue-300"
              title={displayDomain}
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
              className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline no-underline dark:text-blue-400 dark:hover:text-blue-300"
              title={cleanText || href}
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
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400" {...props}>
            {displayDomain}
          </a>
        );
      }

      const isAlreadyCitation = typeof children === 'string' && /^\[\d+\]$/.test(children.trim());

      return (
        <span className="inline-flex items-baseline">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-blue-600 transition-colors hover:underline dark:text-blue-400"
            {...props}
          >
            {children}
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
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={allowRawHtml ? [rehypeRaw] : []}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
