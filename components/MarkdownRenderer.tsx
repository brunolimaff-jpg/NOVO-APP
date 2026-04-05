"use no memo";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { stripVisiblePortaFeedSections } from '../utils/porta';
import { buildAuditableSources, normalizeSourceUrl, type AuditableSource } from '../utils/textCleaners';
import { loadWithChunkRetry } from '../utils/chunkRetry';

export interface GroundingSource {
  title: string;
  url: string;
}
import {
  fixFakeLinks,
  rewriteMarkdownLinksToGoogle,
  autoLinkSeniorTerms,
  cleanFakeSourcesBlock,
} from '../utils/linkFixer';

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
  if (React.isValidElement(node)) return extractNodeText((node as React.ReactElement<any>).props.children);
  return '';
}

function isHiddenSupportHeading(node: React.ReactNode): boolean {
  const text = extractNodeText(node).replace(/\s+/g, ' ').trim();
  return /BLOCO DE FEEDS PORTA/i.test(text);
}

// ---------------------------------------------------------------------------
// FIX #3 — Singleton Mermaid: initialize apenas uma vez por tema.
// Chamar initialize() antes de cada render() causava race conditions quando
// múltiplos diagramas carregavam simultaneamente na mesma página.
// ---------------------------------------------------------------------------
let _mermaidSingleton: typeof import('mermaid')['default'] | null = null;
let _mermaidTheme: string | null = null;

async function getMermaid(isDarkMode: boolean): Promise<typeof import('mermaid')['default']> {
  const themeKey = isDarkMode ? 'dark' : 'light';
  const mod = await loadWithChunkRetry(() => import('mermaid'));
  const mermaid = mod.default;

  if (!_mermaidSingleton || _mermaidTheme !== themeKey) {
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
    _mermaidSingleton = mermaid;
    _mermaidTheme = themeKey;
  }

  return mermaid;
}

// ---------------------------------------------------------------------------
// MermaidChart
// ---------------------------------------------------------------------------
const MermaidChart: React.FC<MermaidProps> = ({ chart, isDarkMode }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  // ID estável por instância de componente — evita colisões entre diagramas
  const idRef = useRef<string>('mermaid-' + Math.random().toString(36).substring(2, 9));

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
          const e = err as { str?: string; message?: string };
          console.error('Erro Mermaid:', err);
          setError(e?.str || e?.message || 'Falha ao renderizar diagrama');
        }
      }
    };

    initMermaid();
    return () => { cancelled = true; };
  }, [chart, isDarkMode]);

  if (error) {
    return (
      <div className="mt-2 mb-4 rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-950/40 dark:border-amber-700 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <p className="font-semibold">Não foi possível renderizar o diagrama.</p>
          </div>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-[10px] font-semibold underline underline-offset-2 shrink-0"
          >
            {showDetails ? 'Ocultar' : 'Ver erro'}
          </button>
        </div>
        {showDetails && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/5 dark:bg-black/40 p-2 text-[10px] leading-snug whitespace-pre-wrap">
            {error}
          </pre>
        )}
      </div>
    );
  }

  if (!svg) return null;

  return (
    <div className="my-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/50 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/50 backdrop-blur-sm">
      <div className="border-b border-slate-200/60 bg-slate-100/40 px-4 py-2.5 dark:border-slate-800/60 dark:bg-slate-800/40 flex items-center gap-2">
        <div className="flex h-2 w-2 items-center justify-center rounded-full bg-emerald-400"></div>
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

// ---------------------------------------------------------------------------
// sanitizeMermaidCode
// FIX #1 — Removidas as regexes unicode que mutilavam labels válidos gerados
// pelo Gemini (\u2600-\u27BF incluía ─ ┌ └ e símbolos técnicos legítimos;
// \u{1F000}-\u{1FFFF} era desnecessária para diagramas de fluxo).
// ---------------------------------------------------------------------------
function sanitizeMermaidCode(input: string): string {
  if (!input) return '';

  let code = input
    // Converte <br> e entidades em quebra de linha
    .replace(new RegExp('<br\\s*/?>\\s*', 'gi'), '\n')
    .replace(new RegExp('&lt;br\\s*/?&gt;\\s*', 'gi'), '\n')
    // Remove comentários HTML
    .replace(new RegExp('<' + '!--[\\s\\S]*?--' + '>', 'g'), '')
    // Normaliza travessões — único unicode que realmente quebra o parser Mermaid
    .replace(/[\u2013\u2014]/g, '-')
    // Remove prefixo não-alfabético antes do tipo de diagrama
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
    }
  );

  // Garante que subgraph labels com espaços/caracteres especiais ficam entre aspas
  code = code.replace(
    /^(\s*subgraph\s+)([^"'\n\[\]{]+?)(\s*)$/gm,
    (full, prefix, label, suffix) => {
      const t = label.trim();
      if (!t || /[\s()\[\]\/\\%:]/.test(t)) return full;
      return prefix + '"' + t.replace(/"/g, "'") + '"' + suffix;
    }
  );

  const mermaidStart =
    /(graph\s+(?:TB|TD|LR|RL|BT)?|flowchart\s+(?:TB|TD|LR|RL|BT)?|sequenceDiagram|gantt|classDiagram|stateDiagram-v2?|erDiagram|journey|pie|quadrantChart|gitGraph)/i;
  const match = code.match(mermaidStart);
  if (!match) return '';

  code = code.slice(match.index ?? 0).trim();

  const firstWord = code.split(/\s+/)[0].toLowerCase();
  if (
    !/^(graph|flowchart|sequencediagram|gantt|classdiagram|statediagram-v2?|erdiagram|journey|pie|quadrantchart|gitgraph)$/.test(
      firstWord
    )
  ) {
    return '';
  }

  if (collectedClassLines.length > 0) {
    code = `${code}\n${collectedClassLines.join('\n')}`;
  }

  return code;
}

// ---------------------------------------------------------------------------
// MarkdownRenderer
// ---------------------------------------------------------------------------
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isDarkMode = false,
  groundingSources = [],
  auditableSources,
  showCollapsibleSources = false,
  allowRawHtml = true,
}) => {
  const resolvedSources = useMemo(
    () => (auditableSources && auditableSources.length > 0 ? auditableSources : buildAuditableSources(content, groundingSources)),
    [auditableSources, content, groundingSources]
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

    let text = stripVisiblePortaFeedSections(content);
    const preservedMermaidBlocks: string[] = [];

    const preserveMermaid = (input: string): string =>
      input.replace(/```mermaid[\s\S]*?```/gi, (block) => {
        const key = `@@__MERMAID_BLOCK_${preservedMermaidBlocks.length}__@@`;
        preservedMermaidBlocks.push(block);
        return key;
      });

    const restoreMermaid = (input: string): string =>
      input.replace(/@@__MERMAID_BLOCK_(\d+)__@@/g, (_match, index) => preservedMermaidBlocks[Number(index)] || '');

    // FIX #2 — Converter JSON inline {"mermaid":"..."} ANTES do preserveMermaid,
    // para que esses blocos também sejam protegidos das transformações de links.
    // No código original, a conversão era feita DEPOIS, deixando o conteúdo
    // dos diagramas JSON expostos ao autoLinkSeniorTerms e outros processadores.
    const FENCE = '`'.repeat(3);
    text = text.replace(/\{"mermaid":"([\s\S]*?)"\}/g, (_m, raw: string) => {
      const unescaped = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return '\n' + FENCE + 'mermaid\n' + unescaped + '\n' + FENCE + '\n';
    });

    // Protege TODOS os blocos mermaid (incluindo os recém-convertidos)
    text = preserveMermaid(text);

    // Transformações de links e citações — agora seguras
    text = fixFakeLinks(text);
    text = rewriteMarkdownLinksToGoogle(text);
    text = autoLinkSeniorTerms(text);
    text = cleanFakeSourcesBlock(text);

    // Limpeza de emoji badges mantendo URL completa para auditoria
    text = text.replace(
      /\[(🟢|🟡|🟠|🔴)\s*(?:Fonte oficial|Não confirmado|Evidência forte|Suspeito)?[\s-–:]*([^\]\n]+?)\]/gi,
      (_, _emoji, rawUrl) => {
        let fullUrl = rawUrl.trim();
        if (!fullUrl.startsWith('http')) fullUrl = 'https://' + fullUrl;
        const displayDomain = fullUrl.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        const citationIndex = citationMap.get(normalizeSourceUrl(fullUrl));
        if (!citationIndex) {
          return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer">${displayDomain}</a>`;
        }
        return `<sup><a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="citation-link" title="${displayDomain}">[${citationIndex}]</a></sup>`;
      }
    );

    return restoreMermaid(text);
  }, [content, citationMap]);

  const components: Record<string, React.FC<any>> = {
    code: ({ inline, className, children, ...props }: any) => {
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

    a: ({ href, children, className, title, ...props }: any) => {
      if (className === 'citation-link') {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline no-underline" title={title} {...props}>
            {children}
          </a>
        );
      }

      const textContent = extractNodeText(children);
      const cleanText = textContent.trim();
      const isBadgeMatch = textContent.match(/^(🟢|🟡|🟠|🔴)/);
      const citationIndex = href ? citationMap.get(normalizeSourceUrl(href)) : undefined;
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
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline no-underline"
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
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline no-underline"
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
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" {...props}>
            {displayDomain}
          </a>
        );
      }

      return (
        <span>
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-words" {...props}>
            {children}
          </a>
          {citationIndex ? <sup className="ml-1 text-[10px] text-blue-600 dark:text-blue-400">[{citationIndex}]</sup> : null}
        </span>
      );
    },

    sup: ({ children }: any) => (
      <sup className="ml-0.5">{children}</sup>
    ),

    p: ({ children }: any) => (
      <p className="mb-2 last:mb-0 text-sm md:text-[0.95rem] leading-relaxed text-slate-800 dark:text-slate-100">{children}</p>
    ),
    ul: ({ children }: any) => (
      <ul className="list-disc pl-5 mb-2 space-y-1 text-sm md:text-[0.95rem] text-slate-800 dark:text-slate-100">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-5 mb-2 space-y-1 text-sm md:text-[0.95rem] text-slate-800 dark:text-slate-100">{children}</ol>
    ),
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }: any) => (
      <h1 className="text-lg md:text-[1.45rem] font-black tracking-tight mb-4 text-slate-900 dark:text-white border-b border-slate-200/80 dark:border-slate-800 pb-3">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-base md:text-lg font-black tracking-tight mt-6 mb-3 text-slate-900 dark:text-slate-50 border-b border-emerald-100 dark:border-emerald-900/60 pb-2 flex items-start gap-2">
        <span className="w-1.5 h-4 mt-1 rounded-full bg-emerald-500/80 shrink-0" />
        <span className="block leading-snug">{children}</span>
      </h2>
    ),
    h3: ({ children }: any) => (
      isHiddenSupportHeading(children) ? null : (
        <h3 className="text-[0.95rem] md:text-[1rem] font-extrabold mt-5 mb-2 text-slate-900 dark:text-slate-50 flex items-start gap-2">
          <span className="w-1.5 h-1.5 mt-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="block leading-snug">{children}</span>
        </h3>
      )
    ),
    hr: () => (
      <hr className="my-6 border-t-2 border-slate-100 dark:border-slate-800" />
    ),
    h4: ({ children }: any) => (
      isHiddenSupportHeading(children) ? null : (
        <h4 className="text-[0.9rem] font-bold mt-2 mb-1 text-slate-900 dark:text-slate-50">{children}</h4>
      )
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-emerald-400/80 bg-emerald-50/50 dark:bg-emerald-900/20 dark:border-emerald-500/70 px-3 py-2 my-2 rounded-r-md text-xs md:text-[0.9rem] text-emerald-900 dark:text-emerald-100">
        {children}
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/80">
        <table className="w-full min-w-[720px] border-collapse text-sm md:text-[0.92rem]">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-slate-200 dark:divide-slate-700/70">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="odd:bg-white even:bg-slate-50/70 dark:odd:bg-slate-900/20 dark:even:bg-slate-900/45 hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20 transition-colors">
        {children}
      </tr>
    ),
    th: ({ children }: any) => (
      <th className="px-3 py-2 text-left align-top font-bold tracking-wide whitespace-nowrap border-b border-slate-200 dark:border-slate-700/80">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-3 py-2 align-top leading-relaxed text-slate-800 dark:text-slate-100">
        {children}
      </td>
    ),
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={allowRawHtml ? [rehypeRaw] : []} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
