import { extractValidLinks } from './linkFixer';
import { formatSourcesForExport, SourceRef } from './textCleaners';
import { fixFakeLinksHTML } from './linkFixer';
import { APP_NAME } from '../constants';
import {
  getPortaCompatibility,
  parsePortaMarkerV2,
  PORTA_FLAG_META,
  PORTA_SEGMENT_LABELS,
  stripPortaMarkers,
} from './porta';

export function convertMarkdownToHTML(md: string, includeSources: boolean = true): string {
  const allLinks = extractValidLinks(md);
  const markdownHttpLinkRegex = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g;
  const porta = parsePortaMarkerV2(md);
  const portaHtml = porta
    ? (() => {
        const compatibility = getPortaCompatibility(porta.score);
        const bgColor = porta.score >= 71 ? '#f0fdf4' : porta.score >= 41 ? '#fefce8' : '#fef2f2';
        const scoreDetail =
          typeof porta.scoreBruto === 'number'
            ? `Score final ${porta.score} (bruto: ${porta.scoreBruto}${porta.flags.length ? ` - penalizado por ${porta.flags.join(', ')}` : ''})`
            : `Score final ${porta.score}`;
        const flagsHtml = porta.flags.length
          ? porta.flags
              .map(
                flag => `<span class="pill">${PORTA_FLAG_META[flag].icon} ${PORTA_FLAG_META[flag].shortLabel}</span>`,
              )
              .join('')
          : '<span class="pill">Flags: NONE</span>';

        return `<div class="porta-score" style="border:2px solid ${compatibility.color};background:${bgColor};">
            <div class="header"><span class="label-porta">🎯 PORTA</span><span><span class="score-num" style="color:${compatibility.color};">${porta.score}</span><span class="score-max">/100</span></span></div>
            <div style="font-size:11px;color:#64748b;margin:6px 0 8px;">${scoreDetail}</div>
            <div class="bar-bg" style="background:${compatibility.color}20;"><div class="bar-fill" style="width:${Math.min(porta.score, 100)}%;background:${compatibility.color};"></div></div>
            <div class="compat" style="color:${compatibility.color};">${compatibility.emoji} ${compatibility.label}</div>
            <div class="pillars"><span class="pill"><b>SEG</b> ${porta.segmento}</span>${flagsHtml}</div>
            <div class="pillars"><span class="pill"><b>P</b> ${porta.p}</span><span class="pill"><b>O</b> ${porta.o}</span><span class="pill"><b>R</b> ${porta.r}</span><span class="pill"><b>T</b> ${porta.t}</span><span class="pill"><b>A</b> ${porta.a}</span></div>
            <div style="font-size:11px;color:#64748b;margin-top:8px;">${PORTA_SEGMENT_LABELS[porta.segmento]}</div>
          </div>`;
      })()
    : '';
  let html = stripPortaMarkers(md)
    .replace(/^>\s*(.*$)/gm, '<blockquote>$1</blockquote>')
    .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(markdownHttpLinkRegex, (_match, text, url) => {
      if (url.includes('ai.studio') || url.includes('google.com/search') || url.includes('vertexai')) {
        return `<strong style="color:#059669;">${text}</strong>`;
      }
      return `<a href="${url}" target="_blank" style="color:#059669;text-decoration:underline;">${text}</a>`;
    })
    .replace(
      /\^(\d+)/g,
      '<sup style="background:#059669;color:#fff;padding:1px 5px;border-radius:8px;font-size:10px;margin:0 1px;">$1</sup>',
    )
    .replace(/^[-*] (.*$)/gm, '<li>$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^-----+$/gm, '<hr>')
    .replace(/^---+$/gm, '<hr>');
  html = html.replace(/(<li>[\s\S]*?<\/li>(?:\s*<li>[\s\S]*?<\/li>)*)/g, '<ul>$1</ul>');
  html = html.replace(/(<blockquote>[\s\S]*?<\/blockquote>)(\s*<blockquote>[\s\S]*?<\/blockquote>)*/g, match => {
    const content = match.replace(/<\/?blockquote>/g, '');
    return '<blockquote>' + content + '</blockquote>';
  });
  html = html.replace(/<p><hr><\/p>/g, '<hr>');
  if (includeSources && allLinks.length > 0) {
    const sources: SourceRef[] = allLinks.map((l, i) => ({ id: `src-${i}`, ...l }));
    html += formatSourcesForExport(sources);
  }
  return '<p>' + portaHtml + html + '</p>';
}

export function simpleMarkdownToHtml(md: string, title: string): string {
  const htmlBody = fixFakeLinksHTML(convertMarkdownToHTML(md, true));
  return `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #333; }
        h1, h2, h3, h4 { color: #059669; font-family: Arial, sans-serif; }
        a { color: #059669; text-decoration: underline; }
        ul { padding-left: 20px; } li { margin-bottom: 5px; }
        blockquote { border-left: 4px solid #f59e0b; background: #fffbeb; padding: 10px; margin: 10px 0; color: #92400e; }
        .sources-section { margin-top: 20px; padding-top: 10px; border-top: 1px solid #059669; }
        .sources-section h2 { color: #064e3b; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1 style="font-size: 24px; border-bottom: 2px solid #059669; padding-bottom: 10px;">${title}</h1>
      ${htmlBody}
      <br>
      <p style="font-size: 10px; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px;">Gerado por ${APP_NAME} - Inteligência Comercial</p>
    </body>
    </html>
  `;
}
