export const REPORT_CSS = `
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
