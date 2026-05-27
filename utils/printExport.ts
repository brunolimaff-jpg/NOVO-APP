import { APP_NAME } from '../constants';
import { getDisplayableMermaidCode, normalizeMermaidBlocks } from './mermaid';
import { stripPortaMarkers } from './porta';
import { sanitizeSensitivePersonalData } from './privacy';
import { REPORT_CSS } from './printExport.css';
import { formatAuditableSourcesForExport, type AuditableSource } from './textCleaners';

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  content: string;
  sources?: Array<{ title?: string; url: string }>;
  auditableSources?: AuditableSource[];
}

const EMOJI_AND_SYMBOLS_REGEX = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeVisibleText(value: string): string {
  return sanitizeSensitivePersonalData(value).replace(EMOJI_AND_SYMBOLS_REGEX, '').replace(/\s+/g, ' ').trim();
}

function sanitizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

function decodeEscapedMarkdownUrl(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(sanitizeVisibleText(value));
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g, (_match, label, url) => {
      const safeUrl = sanitizeUrl(decodeEscapedMarkdownUrl(url));
      return safeUrl ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${label}</a>` : label;
    });
}

function splitTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function isTableSeparator(row: string): boolean {
  const cells = splitTableRow(row);
  return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isTableDataRow(row: string): boolean {
  const cells = splitTableRow(row);
  return row.includes('|') && cells.length > 1 && !isTableSeparator(row);
}

function renderTable(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const header = splitTableRow(lines[startIndex]);
  let index = startIndex + 2;
  const rows: string[][] = [];

  while (index < lines.length && isTableDataRow(lines[index] || '')) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const headerHtml = header.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
  const rowsHtml = rows
    .map((row, ri) => `<tr class="${ri % 2 === 0 ? 'row-even' : 'row-odd'}">${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
    .join('');

  return {
    html: `<div class="table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`,
    nextIndex: index,
  };
}

export function renderMarkdownForPrint(markdown: string): string {
  const normalized = sanitizeSensitivePersonalData(normalizeMermaidBlocks(stripPortaMarkers(markdown || '')));
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let listItems: string[] = [];
  let orderedList = false;

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(orderedList ? `<ol>${listItems.join('')}</ol>` : `<ul>${listItems.join('')}</ul>`);
      listItems = [];
      orderedList = false;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? '';
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const fence = trimmed.match(/^```(\w+)?\s*$/);
    if (fence) {
      flushList();
      const lang = (fence[1] || '').toLowerCase();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test((lines[i] || '').trim())) {
        codeLines.push(lines[i] || '');
        i += 1;
      }
      const code = codeLines.join('\n').trim();
      if (lang === 'mermaid' || lang === 'mmd') {
        const displayableCode = getDisplayableMermaidCode(code);
        blocks.push(
          `<div class="diagram-container">` +
          `<div class="diagram-label">Diagrama</div>` +
          `<pre class="mermaid">${escapeHtml(displayableCode)}</pre>` +
          `</div>`,
        );
      } else {
        blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
      continue;
    }

    if (!trimmed) {
      flushList();
      continue;
    }

    if (isTableDataRow(trimmed) && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      flushList();
      const table = renderTable(lines, i);
      blocks.push(table.html);
      i = table.nextIndex - 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList();
      blocks.push('<hr>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 4);
      const text = renderInlineMarkdown(heading[2]);
      if (level === 2) {
        blocks.push(`<h${level}>${text}</h${level}><div class="section-divider"></div>`);
      } else {
        blocks.push(`<h${level}>${text}</h${level}>`);
      }
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (orderedList && listItems.length > 0) flushList();
      orderedList = false;
      listItems.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numbered) {
      if (!orderedList && listItems.length > 0) flushList();
      orderedList = true;
      listItems.push(`<li>${renderInlineMarkdown(numbered[2])}</li>`);
      continue;
    }

    const quote = trimmed.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      blocks.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  }

  flushList();
  return blocks.join('\n');
}

export function buildPrintReportHtml(options: PrintReportOptions): string {
  const title = sanitizeVisibleText(options.title || 'Dossiê Scout 360') || 'Dossiê Scout 360';
  const subtitle = sanitizeVisibleText(options.subtitle || '');
  const appName = sanitizeVisibleText(APP_NAME) || 'Senior Scout 360';
  const body = renderMarkdownForPrint(options.content);
  const hasGeneratedFooter = /\n##\s*📚\s*Fontes\s*\n/i.test(options.content || '');
  const auditableSourcesHtml =
    !hasGeneratedFooter && options.auditableSources?.length
      ? formatAuditableSourcesForExport(options.auditableSources)
      : '';
  const sourceRows =
    !hasGeneratedFooter && !auditableSourcesHtml
      ? (options.sources || [])
          .map(source => ({ ...source, url: sanitizeUrl(source.url) }))
          .filter(source => source.url)
          .map((source, index) => {
            const label = sanitizeVisibleText(source.title || source.url);
            return `<li><span class="source-num">${String(index + 1).padStart(2, '0')}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></li>`;
          })
          .join('')
      : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — ${escapeHtml(appName)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <div class="report">
    <nav class="print-bar">
      <button class="btn-secondary" onclick="var r=document.createRange();r.selectNodeContents(document.querySelector('.report')||document.body);var s=window.getSelection();if(s){s.removeAllRanges();s.addRange(r)}">Selecionar tudo</button>
      <button class="btn-primary" onclick="window.print()">Salvar como PDF</button>
    </nav>

    <header class="cover">
      <div class="cover-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        ${escapeHtml(appName)}
      </div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="cover-subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <div class="cover-notice">Uso interno — Documento de apoio à prospecção. Não distribuir externamente.</div>
    </header>

    <main class="content">
      ${body}
      ${auditableSourcesHtml || (sourceRows ? `<section class="sources"><h2>Fontes e Referências</h2><ul class="sources-list">${sourceRows}</ul></section>` : '')}
    </main>

    <footer class="report-footer">
      <span>Gerado por <span class="footer-brand">${escapeHtml(appName)}</span></span>
      <span>${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
    </footer>
  </div>

  <script>
    (function () {
      function showMermaidFallback() {
        document.querySelectorAll('pre.mermaid').forEach(function (node) {
          node.classList.add('mermaid-fallback');
          node.setAttribute('data-render-status', 'fallback');
        });
      }
      window.__scoutRenderMermaid = function () {
        if (!window.mermaid) { showMermaidFallback(); return; }
        try {
          window.mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
          Promise.resolve(window.mermaid.run({ querySelector: 'pre.mermaid' })).catch(showMermaidFallback);
        } catch (_error) { showMermaidFallback(); }
      };
      window.__scoutMermaidFallback = showMermaidFallback;
      window.setTimeout(function () { if (!window.mermaid) showMermaidFallback(); }, 2500);
    })();
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" async onload="window.__scoutRenderMermaid && window.__scoutRenderMermaid()" onerror="window.__scoutMermaidFallback && window.__scoutMermaidFallback()"></script>
</body>
</html>`;
}

export function openPrintReportWindow(options: PrintReportOptions): boolean {
  if (typeof window === 'undefined') return false;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  const html = buildPrintReportHtml(options);
  const doc = printWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  printWindow.focus();
  return true;
}
