import { APP_NAME } from '../constants';
import { getDisplayableMermaidCode, normalizeMermaidBlocks } from './mermaid';
import { stripPortaMarkers } from './porta';
import { sanitizeSensitivePersonalData } from './privacy';

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  content: string;
  sources?: Array<{ title?: string; url: string }>;
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

const REPORT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap');

  @page { size: A4; margin: 14mm 12mm 16mm; }

  *, *::before, *::after { box-sizing: border-box; }

  :root {
    --primary: #059669;
    --primary-light: #34d399;
    --primary-dark: #047857;
    --primary-deeper: #064e3b;
    --accent: #6366f1;
    --accent-light: #818cf8;
    --bg: #ffffff;
    --bg-alt: #f8faf9;
    --text: #1e293b;
    --text-secondary: #64748b;
    --text-muted: #94a3b8;
    --border: #e2e8f0;
    --border-light: #f1f5f9;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
    --radius: 8px;
    --font-display: 'Space Grotesk', system-ui, sans-serif;
    --font-body: 'DM Sans', system-ui, sans-serif;
  }

  body {
    margin: 0;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.7;
    background: #f0f2f5;
    -webkit-font-smoothing: antialiased;
  }

  .report {
    max-width: 900px;
    margin: 0 auto;
    background: var(--bg);
    box-shadow: 0 0 80px rgba(0,0,0,0.08);
  }

  .cover {
    position: relative;
    background: linear-gradient(135deg, var(--primary-deeper) 0%, var(--primary-dark) 50%, var(--primary) 100%);
    color: #fff;
    padding: 48px 48px 40px;
    overflow: hidden;
  }
  .cover::before {
    content: '';
    position: absolute;
    top: -60px;
    right: -60px;
    width: 240px;
    height: 240px;
    border-radius: 50%;
    background: rgba(255,255,255,0.04);
    pointer-events: none;
  }
  .cover::after {
    content: '';
    position: absolute;
    bottom: -40px;
    left: 30%;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(255,255,255,0.03);
    pointer-events: none;
  }

  .cover-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.12);
    backdrop-filter: blur(4px);
    padding: 6px 14px;
    border-radius: 6px;
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.9);
    margin-bottom: 24px;
  }
  .cover-brand svg { width: 16px; height: 16px; }

  .cover h1 {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 700;
    line-height: 1.2;
    margin: 0 0 8px;
    color: #fff;
    position: relative;
  }

  .cover-subtitle {
    font-size: 14px;
    color: rgba(255,255,255,0.65);
    margin: 0 0 28px;
    line-height: 1.5;
  }

  .cover-notice {
    margin-top: 24px;
    padding: 10px 16px;
    background: rgba(255,255,255,0.08);
    border-left: 3px solid rgba(255,255,255,0.3);
    border-radius: 0 6px 6px 0;
    font-size: 11px;
    color: rgba(255,255,255,0.6);
    line-height: 1.5;
  }

  .content {
    padding: 40px 48px;
  }

  h2 {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--primary-deeper);
    margin: 40px 0 0;
    line-height: 1.3;
    page-break-after: avoid;
  }
  h3 {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--primary-dark);
    margin: 28px 0 0;
    line-height: 1.4;
    page-break-after: avoid;
  }
  h4 {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin: 20px 0 0;
    page-break-after: avoid;
  }

  .section-divider {
    height: 3px;
    background: linear-gradient(90deg, var(--primary) 0%, var(--primary-light) 60%, transparent 100%);
    border-radius: 2px;
    margin: 10px 0 20px;
  }

  p {
    margin: 10px 0;
    orphans: 3;
    widows: 3;
  }

  strong {
    color: var(--primary-deeper);
    font-weight: 700;
  }

  a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid var(--accent-light);
    overflow-wrap: anywhere;
  }

  code {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.875em;
    background: var(--bg-alt);
    color: var(--primary-dark);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-light);
  }

  ul, ol {
    margin: 10px 0 16px;
    padding-left: 24px;
  }
  li { margin: 5px 0; }
  li::marker { color: var(--primary); }

  blockquote {
    margin: 16px 0;
    padding: 12px 20px;
    border-left: 4px solid var(--primary);
    background: linear-gradient(90deg, rgba(5,150,105,0.04) 0%, transparent 100%);
    color: var(--text-secondary);
    border-radius: 0 var(--radius) var(--radius) 0;
    page-break-inside: avoid;
  }

  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    margin: 12px 0;
    page-break-inside: avoid;
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    color: var(--text);
  }

  hr {
    border: none;
    height: 1px;
    background: var(--border);
    margin: 32px 0;
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
    margin: 16px 0;
    page-break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    background: var(--primary-deeper);
    color: #fff;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 10px 12px;
    text-align: left;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .row-odd { background: var(--bg-alt); }
  tr { page-break-inside: avoid; }

  .diagram-container {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin: 20px 0;
    page-break-inside: avoid;
  }
  .diagram-label {
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--primary);
    padding: 10px 16px 0;
  }
  .diagram-container pre.mermaid {
    border: none;
    background: var(--bg-alt);
    margin: 8px;
    padding: 20px;
    border-radius: 6px;
    font-size: 12px;
  }
  .mermaid-fallback {
    border-color: var(--primary-light);
    background: linear-gradient(135deg, rgba(5,150,105,0.03) 0%, rgba(5,150,105,0.06) 100%);
    color: var(--primary-deeper);
  }

  .sources {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 2px solid var(--primary);
    page-break-before: auto;
  }
  .sources h2 { margin-top: 0; }
  .sources-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .sources-list li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border-light);
    font-size: 12px;
  }
  .sources-list li:last-child { border-bottom: none; }
  .source-num {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--primary);
    font-size: 11px;
    min-width: 24px;
  }
  .sources-list a {
    color: var(--text);
    border-bottom-color: var(--border);
    font-size: 12px;
  }

  .report-footer {
    padding: 20px 48px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
  }
  .footer-brand {
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--primary);
  }

  .print-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 48px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .print-bar button {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 700;
    padding: 8px 20px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
  }
  .btn-primary {
    background: var(--primary);
    color: #fff;
  }
  .btn-secondary {
    background: var(--bg);
    color: var(--text);
    border: 1px solid var(--border);
  }

  @media print {
    body { background: #fff; }
    .report { box-shadow: none; max-width: none; }
    .print-bar { display: none; }
    .cover { padding: 24px 0 20px; }
    .content { padding: 20px 0; }
    .report-footer { padding: 16px 0; }
    body { font-size: 11px; }
    .cover h1 { font-size: 24px; }
    h2 { font-size: 16px; }
    h3 { font-size: 14px; }
    a { color: var(--text); border: none; text-decoration: none; }
    .cover-notice { display: none; }
    .table-wrap { overflow: visible; }
    .diagram-container { break-inside: avoid; }
    .section-divider { margin: 8px 0 12px; }
    blockquote { background: none; padding: 8px 12px; }
    pre { border-width: 0.5px; padding: 10px; }
    .sources { page-break-before: always; }
  }
`;

export function buildPrintReportHtml(options: PrintReportOptions): string {
  const title = sanitizeVisibleText(options.title || 'Dossiê Scout 360') || 'Dossiê Scout 360';
  const subtitle = sanitizeVisibleText(options.subtitle || '');
  const appName = sanitizeVisibleText(APP_NAME) || 'Senior Scout 360';
  const body = renderMarkdownForPrint(options.content);
  const sourceRows = (options.sources || [])
    .map(source => ({ ...source, url: sanitizeUrl(source.url) }))
    .filter(source => source.url)
    .map((source, index) => {
      const label = sanitizeVisibleText(source.title || source.url);
      return `<li><span class="source-num">${String(index + 1).padStart(2, '0')}</span><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a></li>`;
    })
    .join('');

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
      ${sourceRows ? `<section class="sources"><h2>Fontes e Referências</h2><ul class="sources-list">${sourceRows}</ul></section>` : ''}
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
