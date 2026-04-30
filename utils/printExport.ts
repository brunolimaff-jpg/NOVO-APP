import { APP_NAME } from '../constants';
import { normalizeMermaidBlocks } from './mermaid';
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
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => {
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

function renderTable(lines: string[], startIndex: number): { html: string; nextIndex: number } {
  const header = splitTableRow(lines[startIndex]);
  let index = startIndex + 2;
  const rows: string[][] = [];

  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const headerHtml = header.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
  const rowsHtml = rows
    .map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
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

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push(`<ul>${listItems.join('')}</ul>`);
      listItems = [];
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
        blocks.push(`<div class="diagram-title">Diagrama Mermaid</div><pre class="mermaid">${escapeHtml(code)}</pre>`);
      } else {
        blocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
      continue;
    }

    if (!trimmed) {
      flushList();
      continue;
    }

    if (trimmed.startsWith('|') && lines[i + 1] && isTableSeparator(lines[i + 1])) {
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
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      listItems.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
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
  const sourceRows = (options.sources || [])
    .map(source => ({ ...source, url: sanitizeUrl(source.url) }))
    .filter(source => source.url)
    .map((source, index) => {
      const label = sanitizeVisibleText(source.title || source.url);
      return `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${index + 1}. ${escapeHtml(label)}</a></li>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #1e293b; font-family: Inter, Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.55; background: #ffffff; }
    .shell { max-width: 920px; margin: 0 auto; padding: 28px 32px; }
    .cover { border-bottom: 3px solid #059669; padding-bottom: 18px; margin-bottom: 24px; }
    .brand { color: #047857; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { color: #064e3b; font-size: 25px; line-height: 1.18; margin: 10px 0 8px; page-break-after: avoid; }
    h2 { color: #064e3b; font-size: 19px; line-height: 1.24; margin: 28px 0 10px; padding-bottom: 5px; border-bottom: 1px solid #a7f3d0; page-break-after: avoid; }
    h3 { color: #065f46; font-size: 15px; line-height: 1.3; margin: 20px 0 8px; page-break-after: avoid; }
    h4 { color: #047857; font-size: 13px; margin: 16px 0 6px; page-break-after: avoid; }
    p { margin: 7px 0; orphans: 3; widows: 3; }
    a { color: #047857; text-decoration: underline; overflow-wrap: anywhere; }
    ul { margin: 7px 0 12px 18px; padding: 0; }
    li { margin: 4px 0; padding-left: 2px; }
    strong { color: #064e3b; }
    code { background: #f1f5f9; color: #065f46; padding: 1px 4px; border-radius: 3px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; page-break-inside: avoid; }
    blockquote { margin: 12px 0; padding: 8px 12px; border-left: 4px solid #059669; background: #f0fdf4; color: #334155; page-break-inside: avoid; }
    hr { border: 0; border-top: 1px solid #e2e8f0; margin: 22px 0; }
    .table-wrap { width: 100%; overflow: visible; margin: 12px 0 18px; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.5px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 7px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #ecfdf5; color: #064e3b; font-weight: 800; }
    tr { page-break-inside: avoid; }
    .subtitle { color: #64748b; margin: 0; }
    .diagram-title { color: #047857; font-weight: 800; margin: 12px 0 6px; }
    .sources { margin-top: 32px; border-top: 2px solid #a7f3d0; padding-top: 14px; page-break-before: auto; }
    .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; text-align: center; }
    .actions { position: sticky; top: 0; z-index: 2; display: flex; justify-content: flex-end; gap: 8px; padding: 10px 0; background: #ffffff; border-bottom: 1px solid #e2e8f0; }
    .actions button { border: 1px solid #059669; background: #059669; color: white; border-radius: 6px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
    @media print {
      .shell { max-width: none; padding: 0; }
      .actions { display: none; }
      body { font-size: 11px; }
      h1 { font-size: 22px; }
      h2 { font-size: 17px; }
      a { color: #064e3b; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="actions"><button onclick="window.print()">Salvar como PDF</button></div>
    <header class="cover">
      <div class="brand">${escapeHtml(appName)} - Inteligência Comercial</div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </header>
    ${body}
    ${sourceRows ? `<section class="sources"><h2>Fontes e Referências</h2><ul>${sourceRows}</ul></section>` : ''}
    <footer class="footer">Gerado por ${escapeHtml(appName)} - ${new Date().toLocaleDateString('pt-BR')}</footer>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>if (window.mermaid) window.mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });</script>
</body>
</html>`;
}

export function openPrintReportWindow(options: PrintReportOptions): boolean {
  if (typeof window === 'undefined') return false;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return false;

  printWindow.document.open();
  printWindow.document.write(buildPrintReportHtml(options));
  printWindow.document.close();
  printWindow.focus();
  return true;
}
