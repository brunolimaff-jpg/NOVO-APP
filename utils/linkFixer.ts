/**
 * linkFixer.ts - Intercepta e corrige links falsos gerados pelo LLM
 * VERSÃO MELHORADA: Menos agressivo, preserva mais fontes
 */

import { findSeniorProductUrl, isFakeUrl, FAKE_DOMAINS } from '../services/apiConfig';
import { normalizeSourceUrl } from './textCleaners';

const MARKDOWN_HTTP_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
const HTML_HREF_REGEX = /href=["'](https?:\/\/[^"']+)["']/gi;
const STANDALONE_HTTP_URL_REGEX = /https?:\/\/[^\s<>)]+/gi;

function addNormalizedUrl(urls: Set<string>, url: string): void {
  const normalized = normalizeSourceUrl(url);
  if (normalized) urls.add(normalized);
}

function collectInlineUrls(text: string): Set<string> {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;

  MARKDOWN_HTTP_LINK_REGEX.lastIndex = 0;
  while ((match = MARKDOWN_HTTP_LINK_REGEX.exec(text)) !== null) {
    addNormalizedUrl(urls, match[2]);
  }

  HTML_HREF_REGEX.lastIndex = 0;
  while ((match = HTML_HREF_REGEX.exec(text)) !== null) {
    addNormalizedUrl(urls, match[1]);
  }

  STANDALONE_HTTP_URL_REGEX.lastIndex = 0;
  while ((match = STANDALONE_HTTP_URL_REGEX.exec(text)) !== null) {
    addNormalizedUrl(urls, match[0]);
  }

  return urls;
}

/**
 * Corrige links no texto MARKDOWN (antes de renderizar)
 * MELHORADO: Só remove links REALMENTE falsos, preserva títulos
 */
export function fixFakeLinks(markdownText: string): string {
  if (!markdownText) return markdownText;

  // 1. Links markdown: [texto](url_fake) → tenta recuperar ou mantém texto
  let clean = markdownText.replace(MARKDOWN_HTTP_LINK_REGEX, (match, linkText, url) => {
    // Se for URL fake, tenta encontrar URL real ou lida com badges
    if (isFakeUrl(url)) {
      // Se for um badge de status (CONFIRMADO/AUDITORIA), apenas mantém como negrito limpo
      const isBadge = /confirmado|auditoria/i.test(linkText);
      if (isBadge) {
        return `**${linkText}**`;
      }

      const realUrl = findSeniorProductUrl(linkText);
      if (realUrl) {
        return `[${linkText}](${realUrl})`;
      }

      // NÃO remove o link - mantém como negrito com indicação para fontes não-badges
      return `**${linkText}** *[fonte não disponível]*`;
    }
    return match;
  });

  // 2. URLs soltas fake no texto → remover
  const domainsRegexPart = FAKE_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
  const fakeStandaloneRegex = new RegExp(`https?:\\/\\/(?:www\\.)?(?:${domainsRegexPart})[^\\s)>]*`, 'gi');

  clean = clean.replace(fakeStandaloneRegex, '');

  return clean;
}

/**
 * Corrige links no HTML JÁ RENDERIZADO
 */
export function fixFakeLinksHTML(html: string): string {
  if (!html) return html;

  return html.replace(/<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi, (match, url, linkText) => {
    if (!isFakeUrl(url)) return match;

    const realUrl = findSeniorProductUrl(linkText);
    if (realUrl) {
      return `<a href="${realUrl}" target="_blank" rel="noopener noreferrer" style="color:#059669;text-decoration:underline;">${linkText}</a>`;
    }

    return `<strong style="color:#059669;">${linkText}</strong>`;
  });
}

/**
 * NOVA: Deduplica o bloco "Fontes" ao final do texto.
 * Remove linhas cuja URL já apareceu inline no corpo do texto
 * (evita duplicação de fontes). Mantém apenas URLs complementares
 * que NÃO foram citadas inline e linhas de contexto sem URL.
 * Também remove fontes comprovadamente falsas (FAKE_DOMAINS).
 */
export function deduplicateSourcesBlock(text: string): string {
  if (!text) return text;

  // Rodapé gerado pelo pipeline (## 📚 Fontes) já separa citadas vs consultadas — não deduplicar.
  if (/\n##\s*📚\s*Fontes\s*\n/i.test(text)) {
    return text;
  }

  // 1. Encontra o bloco "Fontes" ao final
  const sourcesMatch = text.match(/(\n\*?\*?(?:Fontes?|Referências?|Sources?)[\s\S]*$)/i);
  if (!sourcesMatch) return text;

  const bodyText = text.slice(0, sourcesMatch.index!);
  const sourcesBlock = sourcesMatch[1];
  const lines = sourcesBlock.split('\n');

  // 2. Coleta URLs inline do corpo, incluindo markdown, HTML e URLs puras.
  const inlineUrls = collectInlineUrls(bodyText);

  // 3. Processa cada linha do bloco de fontes
  const cleanedLines: string[] = [];
  for (const line of lines) {
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);

    if (urlMatch) {
      const url = urlMatch[1];
      // Remove linhas com URLs comprovadamente falsas (FAKE_DOMAINS)
      if (isFakeUrl(url)) {
        const titleMatch = line.match(/^\s*\[?\^?\d*\]?\s*[-–—:"]?\s*(.+?)(?:\s*\(|\s*https?:\/\/)/);
        if (titleMatch && titleMatch[1] && titleMatch[1].trim().length > 3) {
          cleanedLines.push(line.replace(url, '').replace(/[()]/g, '').trim());
        }
        continue;
      }
      // Remove linhas cuja URL já apareceu inline no corpo do texto
      if (inlineUrls.has(normalizeSourceUrl(url))) {
        continue;
      }
    }

    // Mantém: linhas sem URL (contexto narrativo) e linhas com URL complementar
    cleanedLines.push(line);
  }

  // 4. Se após processamento não sobrou conteúdo relevante, remove o bloco inteiro
  const cleaned = cleanedLines.join('\n').trim();
  const headerPattern = /\*?\*?(?:Fontes?|Referências?|Sources?)\*?\*?:?\s*/i;
  const contentAfterHeader = cleaned.replace(headerPattern, '').trim();

  if (contentAfterHeader.length < 3) {
    return text.replace(sourcesMatch[1], '').trim();
  }

  return text.replace(sourcesMatch[1], '\n' + cleaned);
}

/**
 * Remove bloco de "Fontes" ao final do texto.
 * AGORA: preserva o bloco como consolidação complementar, removendo
 * apenas URLs duplicadas de links inline e URLs comprovadamente falsas.
 * Delega a lógica central para deduplicateSourcesBlock().
 */
export function cleanFakeSourcesBlock(text: string): string {
  if (!text) return text;
  return deduplicateSourcesBlock(text);
}

/**
 * Extrai apenas links VÁLIDOS do texto (não-fake).
 * Usado para gerar lista de fontes na exportação.
 */
export function extractValidLinks(text: string): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = [];
  if (!text) return links;

  const linkRegex = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();

    // Só adiciona se NÃO for URL fake
    if (!isFakeUrl(url)) {
      if (!links.find(l => l.url === url)) {
        links.push({ title, url });
      }
    }
  }

  return links;
}

/**
 * NOVO: Extrai TODAS as menções de fontes, mesmo sem URL
 * Para exibição completa na seção de fontes
 */
export function extractAllSourceMentions(text: string): Array<{ title: string; url?: string }> {
  const sources: Array<{ title: string; url?: string }> = [];
  if (!text) return sources;

  // 1. Links markdown
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();

    if (!isFakeUrl(url)) {
      if (!sources.find(s => s.url === url)) {
        sources.push({ title, url });
      }
    } else {
      // URL fake mas título válido
      if (!sources.find(s => s.title === title)) {
        sources.push({ title });
      }
    }
  }

  // 2. Menções de fontes no texto (ex: "segundo Valor Econômico", "conforme IBGE")
  const mentionPatterns = [
    /(?:segundo|conforme|de acordo com|fonte:?)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)(?:(?:\s*[,.])|(?:\s*\[)|\s*$)/gi,
    /(?:citado em|mencionado em|relatado por)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)(?:(?:\s*[,.])|(?:\s*\[)|\s*$)/gi,
  ];

  for (const pattern of mentionPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const title = match[1].trim();
      if (title.length > 3 && title.length < 100 && !sources.find(s => s.title === title)) {
        sources.push({ title });
      }
    }
  }

  return sources;
}

// Stubs seguros para manter compatibilidade com o MarkdownRenderer
// Podem ser evoluídos depois para reescrever links e auto-linkar produtos Senior
export function rewriteMarkdownLinksToGoogle(markdownText: string): string {
  if (!markdownText) return markdownText;
  return markdownText;
}

export function autoLinkSeniorTerms(markdownText: string): string {
  if (!markdownText) return markdownText;
  return markdownText;
}
