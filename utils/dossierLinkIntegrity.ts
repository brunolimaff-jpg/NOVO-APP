import { isFakeUrl } from '../services/apiConfig';
import type { DossierSourceRef } from './dossierSourcePool';
import { normalizeSourceUrl } from './textCleaners';
import { stripTeiaHypothesisLegend } from './teiaLegend';

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
const DOUBLE_BRACKET_LINK_REGEX = /\[\[(\d+)\]\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;
const URGENCY_HEADING_REGEX = /^##\s*⏰\s*Sinais de Urgência\s*$/im;
const GENERATED_SOURCES_FOOTER_REGEX = /\n##\s*📚\s*Fontes\s*\n[\s\S]*$/i;

export interface DossierLinkIntegrityOptions {
  allowedPool?: DossierSourceRef[];
  renumberUrgencySection?: boolean;
}

function isUrlAllowed(url: string, allowedNormalized: Set<string>): boolean {
  if (allowedNormalized.size === 0) return !isFakeUrl(url);
  const normalized = normalizeSourceUrl(url);
  return allowedNormalized.has(normalized);
}

function findPoolReplacement(
  allowedPool: DossierSourceRef[],
  linkText: string,
): string | null {
  const lower = linkText.toLowerCase();
  for (const source of allowedPool) {
    const title = (source.title || '').toLowerCase();
    let host = '';
    try {
      host = new URL(source.url).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      host = '';
    }
    if (title && lower.includes(title.slice(0, Math.min(12, title.length)))) return source.url;
    if (host && lower.includes(host)) return source.url;
  }
  return allowedPool[0]?.url ?? null;
}

export function normalizeDoubleBracketCitations(input: string): string {
  if (!input) return '';
  return input.replace(DOUBLE_BRACKET_LINK_REGEX, (_match, index, url) => `[${index}](${url})`);
}

export function stripGeneratedSourcesFooter(text: string): string {
  if (!text) return '';
  return text.replace(GENERATED_SOURCES_FOOTER_REGEX, '').trimEnd();
}

function renumberUrgencySectionLinks(text: string): string {
  const headingMatch = text.match(URGENCY_HEADING_REGEX);
  if (!headingMatch || headingMatch.index === undefined) return text;

  const start = headingMatch.index + headingMatch[0].length;
  const rest = text.slice(start);
  const nextHeading = rest.search(/\n##\s+/);
  const end = nextHeading === -1 ? text.length : start + nextHeading;
  const before = text.slice(0, start);
  const section = text.slice(start, end);
  const after = text.slice(end);

  let index = 0;
  const updatedSection = section.replace(MARKDOWN_LINK_REGEX, (full, label, url) => {
    index += 1;
    return `[${index}](${url})`;
  });

  return before + updatedSection + after;
}

export function applyDossierLinkIntegrity(
  rawText: string,
  options: DossierLinkIntegrityOptions = {},
): string {
  if (!rawText) return '';

  const allowedNormalized = new Set(
    (options.allowedPool || [])
      .map(source => normalizeSourceUrl(source.url))
      .filter(Boolean),
  );

  let text = stripGeneratedSourcesFooter(rawText);
  text = stripTeiaHypothesisLegend(text);
  text = normalizeDoubleBracketCitations(text);

  text = text.replace(MARKDOWN_LINK_REGEX, (match, linkText, url) => {
    const trimmedUrl = (url || '').trim();
    if (!trimmedUrl || isFakeUrl(trimmedUrl)) {
      const replacement = options.allowedPool?.length
        ? findPoolReplacement(options.allowedPool, linkText)
        : null;
      if (replacement && !isFakeUrl(replacement) && isUrlAllowed(replacement, allowedNormalized)) {
        const numLabel = /^\[?\d+\]?$/.test(linkText.trim()) ? linkText.trim().replace(/^\[|\]$/g, '') : linkText;
        return `[${numLabel}](${replacement})`;
      }
      return `**${linkText.trim()}** *(sem fonte URL verificável)*`;
    }

    if (!isUrlAllowed(trimmedUrl, allowedNormalized)) {
      const replacement = options.allowedPool?.length
        ? findPoolReplacement(options.allowedPool, linkText)
        : null;
      if (replacement && isUrlAllowed(replacement, allowedNormalized)) {
        const numLabel = /^\[?\d+\]?$/.test(linkText.trim()) ? linkText.trim().replace(/^\[|\]$/g, '') : linkText;
        return `[${numLabel}](${replacement})`;
      }
      return `**${linkText.trim()}** *(sem fonte URL verificável)*`;
    }

    return match;
  });

  if (options.renumberUrgencySection !== false) {
    text = renumberUrgencySectionLinks(text);
  }

  return text;
}

export function collectInlineNormalizedUrls(text: string): Set<string> {
  const urls = new Set<string>();
  if (!text) return urls;

  const body = stripGeneratedSourcesFooter(text);
  const matches = body.matchAll(new RegExp(MARKDOWN_LINK_REGEX.source, MARKDOWN_LINK_REGEX.flags));
  for (const match of matches) {
    const normalized = normalizeSourceUrl(match[2] || '');
    if (normalized) urls.add(normalized);
  }

  return urls;
}
