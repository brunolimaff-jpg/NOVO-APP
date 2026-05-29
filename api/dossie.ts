import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const HTML_HEAD = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Senior Scout 360 — Dossiê Compartilhado</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
  .container { max-width: 860px; margin: 0 auto; padding: 24px 20px 80px; }
  .header { background: linear-gradient(135deg, #059669, #0369a1); color: white; padding: 32px 24px; border-radius: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 1.5rem; font-weight: 700; }
  .header .cnpj { font-size: 0.85rem; opacity: 0.8; margin-top: 4px; }
  .score-badge { display: inline-flex; align-items: center; gap: 8px; margin-top: 12px; background: rgba(255,255,255,0.15); padding: 8px 16px; border-radius: 24px; font-size: 0.9rem; }
  .score-value { font-size: 1.5rem; font-weight: 800; }
  .message { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 16px; }
  .message .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 12px; }
  .message .content { font-size: 0.95rem; color: #334155; word-wrap: break-word; }
  .message .content h1, .message .content h2, .message .content h3 { margin: 16px 0 8px; color: #0f172a; }
  .message .content h2 { font-size: 1.15rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .message .content ul, .message .content ol { padding-left: 20px; margin: 8px 0; }
  .message .content li { margin-bottom: 4px; }
  .message .content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.85rem; }
  .message .content th, .message .content td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
  .message .content th { background: #f1f5f9; font-weight: 600; }
  .message .content strong { color: #0f172a; }
  .message .content p { margin: 8px 0; }
  .message .content code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; }
  .message .content pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; }
  .message .content pre code { background: none; color: inherit; padding: 0; }
  .message .content blockquote { border-left: 3px solid #059669; padding-left: 16px; margin: 12px 0; color: #475569; }
  .sources { background: #f1f5f9; border-radius: 8px; padding: 16px; margin-top: 12px; }
  .sources h4 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px; }
  .sources a { color: #0369a1; font-size: 0.85rem; word-break: break-all; }
  .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 0.8rem; border-top: 1px solid #e2e8f0; margin-top: 40px; }
  .expired { text-align: center; padding: 80px 20px; }
  .expired h2 { font-size: 1.25rem; color: #64748b; }
  .expired p { color: #94a3b8; margin-top: 8px; }
  @media (max-width: 640px) {
    .header { padding: 24px 16px; }
    .header h1 { font-size: 1.2rem; }
    .message { padding: 16px; }
  }
</style>
</head>
<body>`;

const HTML_FOOT = `<div class="footer">Senior Scout 360 — Inteligência Comercial para Agronegócio</div></body></html>`;

function toPlainText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMarkdown(text: string): string {
  let html = toPlainText(text);

  // Code blocks (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links — must be after toPlainText (escaped) but before other formatting
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold e italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(/((?:<li>.*?<\/li>)+)/g, '<ul>$1</ul>');

  return html;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.query?.token;

  if (!token || typeof token !== 'string' || token.length < 10) {
    res
      .status(400)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `${HTML_HEAD}<div class="expired"><h2>Link inválido</h2><p>O link de compartilhamento não é válido.</p></div>${HTML_FOOT}`,
      );
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res
      .status(500)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `${HTML_HEAD}<div class="expired"><h2>Serviço indisponível</h2><p>Tente novamente mais tarde.</p></div>${HTML_FOOT}`,
      );
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Lookup shared_dossiers — fetch id + current view_count for increment
  const { data: shareData, error: shareError } = await supabase
    .from('shared_dossiers')
    .select('id, dossier_id, view_count')
    .eq('access_token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (shareError || !shareData) {
    res
      .status(404)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `${HTML_HEAD}<div class="expired"><h2>Link expirado ou não encontrado</h2><p>Este link de compartilhamento expirou ou foi removido. Links duram 7 dias.</p></div>${HTML_FOOT}`,
      );
    return;
  }

  // Fetch dossier content
  const { data: dossierData, error: dossierError } = await supabase
    .from('dossies')
    .select('content')
    .eq('id', shareData.dossier_id)
    .is('deleted_at', null)
    .single();

  if (dossierError || !dossierData?.content) {
    res
      .status(404)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `${HTML_HEAD}<div class="expired"><h2>Dossiê não encontrado</h2><p>O dossiê vinculado a este link não está mais disponível.</p></div>${HTML_FOOT}`,
      );
    return;
  }

  const dossier = dossierData.content as Record<string, unknown>;
  const companyName = String(dossier.empresaAlvo || dossier.title || 'Empresa');
  const cnpj = dossier.cnpj ? String(dossier.cnpj) : '';
  const score = typeof dossier.scoreOportunidade === 'number' ? dossier.scoreOportunidade : null;
  const messages = Array.isArray(dossier.messages) ? (dossier.messages as Array<Record<string, unknown>>) : [];

  const botMessages = messages.filter(
    msg => msg.sender === 'bot' && !msg.isThinking && !msg.isError && typeof msg.text === 'string' && msg.text.trim(),
  );

  let messagesHtml = '';
  for (const msg of botMessages) {
    const text = String(msg.text || '');
    const sources = Array.isArray(msg.groundingSources) ? (msg.groundingSources as Array<Record<string, unknown>>) : [];
    const renderedContent = renderMarkdown(text);

    messagesHtml += `<div class="message"><div class="content">${renderedContent}</div>`;

    if (sources.length > 0) {
      messagesHtml += '<div class="sources"><h4>Fontes consultadas</h4>';
      for (const src of sources) {
        const title = String(src.title || 'Fonte');
        const url = String(src.url || '#');
        messagesHtml += `<div style="margin-bottom:4px">&#8226; <a href="${toPlainText(url)}" target="_blank" rel="noopener">${toPlainText(title)}</a></div>`;
      }
      messagesHtml += '</div>';
    }

    messagesHtml += '</div>';
  }

  const scoreHtml =
    score !== null ? `<div class="score-badge">Score PORTA: <span class="score-value">${score}/100</span></div>` : '';

  // Increment view_count (fire-and-forget — não bloqueia o response)
  void (async () => {
    try {
      await supabase
        .from('shared_dossiers')
        .update({ view_count: (shareData.view_count || 0) + 1 })
        .eq('id', shareData.id);
    } catch {
      /* não bloqueia a resposta */
    }
  })();

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60')
    .send(
      `${HTML_HEAD}
<div class="container">
  <div class="header">
    <h1>${toPlainText(companyName)}</h1>
    ${cnpj ? `<div class="cnpj">CNPJ: ${cnpj}</div>` : ''}
    ${scoreHtml}
  </div>
  ${messagesHtml || '<div class="expired"><p>Nenhum conteúdo de análise disponível neste dossiê.</p></div>'}
</div>
${HTML_FOOT}`,
    );
}
