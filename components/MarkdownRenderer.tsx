import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { scoutDiag } from '../utils/diagnosticLog';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Função para reparar Markdown malformado gerado pela IA (tabelas e blocos de código).
 * Essencial para evitar crash de renderização em dossiês complexos.
 */
function repairMarkdown(text: string): string {
  if (!text) return '';
  let repaired = text;

  // 1. Garante que blocos de código ``` estejam fechados
  const codeBlockCount = (repaired.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    repaired += '\n```';
  }

  // 2. Garante que tabelas Markdown tenham o fechamento mínimo de pipes
  // Se houver uma linha de tabela detectada (contendo |), garante que a última linha termine com |
  const lines = repaired.split('\n');
  const lastLine = lines[lines.length - 1];
  if (repaired.includes('|') && lastLine.trim().startsWith('|') && !lastLine.trim().endsWith('|')) {
    repaired += '|';
  }

  return repaired;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const repairedContent = useMemo(() => repairMarkdown(content), [content]);

  return (
    <div className={`markdown-body prose prose-slate max-w-none dark:prose-invert ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Customização de componentes Markdown
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
              {children}
            </td>
          ),
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              {children}
            </a>
          ),
        }}
      >
        {repairedContent}
      </ReactMarkdown>
    </div>
  );
};

export default React.memo(MarkdownRenderer);
