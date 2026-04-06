/**
 * linkFixer.ts - Intercepta e corrige links falsos gerados pelo Gemini
 * VERSÃO MELHORADA: Menos agressivo, preserva mais fontes
 */

import { findSeniorProductUrl, isFakeUrl, FAKE_DOMAINS } from '../services/apiConfig';

const MARKDOWN_HTTP_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;

/**
 * Corrige links no texto MARKDOWN (antes de renderizar)
 * MELHORADO: Só remove links REALMENTE falsos, preserva títulos
 */
export function fixFakeLinks(markdownText: string): string {
  if (!markdownText) return markdownText;

  // 1. Links markdown: [texto](url_fake) → tenta recuperar ou mantém texto
  let clean = markdownText.replace(
    MARKDOWN_HTTP_LINK_REGEX,
    (match, linkText, url) => {
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
    },
  );

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

  return html.replace(
    /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi,
    (match, url, linkText) => {
      if (!isFakeUrl(url)) return match;

      const realUrl = findSeniorProductUrl(linkText);
      if (realUrl) {
        return `<a href="${realUrl}" target="_blank" rel="noopener noreferrer" style="color:#059669;text-decoration:underline;">${linkText}</a>`;
      }

      return `<strong style="color:#059669;">${linkText}</strong>`;
    }
  );
}

/**
 * Remove bloco de "Fontes" que contém apenas URLs fake do Gemini
 * MELHORADO: Preserva linhas com título mesmo sem URL
 */
export function cleanFakeSourcesBlock(text: string): string {
  if (!text) return text;

  const sourcesMatch = text.match(/(\n\*?\*?(?:Fontes?|Referências?|Sources?)[\s\S]*$)/i);
  if (!sourcesMatch) return text;

  const sourcesBlock = sourcesMatch[1];
  const lines = sourcesBlock.split('\n');
  const cleanedLines: string[] = [];
  let hasValidContent = false;

  for (const line of lines) {
    const urlMatch = line.match(/(https?:\/\/[^\s)]+)/);
    
    if (urlMatch && isFakeUrl(urlMatch[1])) {
      // Linha com URL fake → TENTAR RECUPERAR o título
      const titleMatch = line.match(/^\s*[\^]?\d*\s*[-–—:"]?\s*(.+?)(?:\s*\(|\s*https?:\/\/)/);
      if (titleMatch && titleMatch[1] && titleMatch[1].trim().length > 3) {
        // Tem título válido → manter sem o link fake
        cleanedLines.push(line.replace(urlMatch[1], '').replace(/[()]/g, '').trim());
        hasValidContent = true;
      }
      continue;
    }
    
    if (urlMatch && !isFakeUrl(urlMatch[1])) {
      hasValidContent = true;
    }
    
    if (!urlMatch && line.trim().length > 5) {
      hasValidContent = true;
    }
    
    cleanedLines.push(line);
  }

  const cleaned = cleanedLines.join('\n').trim();
  if (!hasValidContent || cleaned.replace(/\*?\*?(?:Fontes?|Referências?|Sources?)\*?\*?:?\s*/i, '').trim().length < 10) {
    return text.replace(sourcesMatch[1], '').trim();
  }

  return text.replace(sourcesMatch[1], '\n' + cleaned);
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
    /(?:segundo|conforme|de acordo com|fonte:?)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)(?:\s*[,.\[]|\s*$)/gi,
    /(?:citado em|mencionado em|relatado por)\s+([A-Z][A-Za-zÀ-ÿ\s]+?)(?:\s*[,.\[]|\s*$)/gi,
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
