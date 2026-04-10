/**
 * textCleaners.ts - Utilitários para limpeza e formatação de texto
 * VERSÃO CONSOLIDADA: Remove duplicações com linkFixer.ts
 */

/**
 * Remove formatação Markdown básica de uma string para exibição em texto puro.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;

  return text
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/(?:[^\s()]+|\([^\s()]*\))+|[^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s+/gm, '')
    .trim();
}

/**
 * Limpa títulos de sessão removendo formatação markdown.
 */
export function cleanTitle(title: string | null | undefined): string {
  if (!title) return '';
  return title
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#+\s*/g, '')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/(?:[^\s()]+|\([^\s()]*\))+|[^)]+)\)/g, '$1')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Limpa e padroniza o texto das sugestões de follow-up.
 */
export function cleanSuggestionText(text: string): string {
  let cleaned = stripMarkdown(text);
  cleaned = cleaned.replace(/[?:.]+$/, '');
  
  const startersToRemove = [
    /^quer\s+/i, /^você quer\s+/i, /^você gostaria de\s+/i,
    /^gostaria de\s+/i, /^podemos\s+/i, /^seria bom\s+/i,
    /^que tal\s+/i, /^vamos\s+/i, /^bora\s+/i, /^posso\s+/i, /^dá pra\s+/i
  ];
  
  for (const regex of startersToRemove) {
    cleaned = cleaned.replace(regex, '');
  }
  
  cleaned = cleaned.trim();
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned;
}

/**
 * Remove marcadores [[STATUS:...]] do texto.
 */
export function cleanStatusMarkers(text: string): { cleanText: string; lastStatus: string | null } {
  let lastStatus: string | null = null;
  
  if (!text) return { cleanText: '', lastStatus: null };

  const cleanText = text.replace(
    /\[\[STATUS:(.*?)\]\]\n?/g, 
    (_, status) => {
      lastStatus = status.trim();
      return '';
    }
  );
  
  return { cleanText: cleanText.trim(), lastStatus };
}

const INTERNAL_MARKER_TEST_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/i;
const INTERNAL_MARKER_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/gi;
const INTERNAL_MARKER_OPEN_TAIL_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*$/i;
const SENSITIVE_INTERNAL_PATTERNS: RegExp[] = [
  /investigacao_completa_integrada/i,
  /protocolo de investiga[çc][aã]o forense/i,
  /contexto cadastral obrigat[oó]rio/i,
  /\bdiretriz(?:es)?\b/i,
  /\bm?odo live status\b/i,
  /\bporta_feed\b/i,
  /\[\[\s*porta/i,
  /\[\[\s*status/i,
  /\[\[\s*competitor/i,
];

const HARD_PROMPT_LEAK_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  { id: 'internal_markers', regex: INTERNAL_MARKER_TEST_REGEX },
  { id: 'internal_marker_tail', regex: INTERNAL_MARKER_OPEN_TAIL_REGEX },
  { id: 'investigacao_integrada', regex: /investigacao_completa_integrada/i },
  { id: 'forense_protocol', regex: /protocolo de investiga[çc][aã]o forense/i },
  { id: 'system_urgente', regex: /urgente:\s*ignore\s+metadiscuss[õo]es/i },
  { id: 'absolute_mission', regex: /sua miss[aã]o absoluta/i },
  { id: 'dont_discuss_internal', regex: /n[aã]o discuta o funcionamento interno do modelo/i },
  { id: 'contexto_cadastral', regex: /contexto cadastral obrigat[oó]rio/i },
];

const SOFT_PROMPT_LEAK_PATTERNS: Array<{ id: string; regex: RegExp }> = [
  { id: 'urgente_dossie', regex: /urgente:.*dossi[eê]\s+de\s+agroneg[oó]cio/i },
  { id: 'score_porta_cnpj', regex: /score porta.*preciso.*cnpj/i },
  { id: 'protocolos_combinados', regex: /execute um dossi[eê] completo combinando os protocolos/i },
  { id: 'priorize_objetividade_fontes', regex: /priorize objetividade.*fontes audit[aá]veis/i },
];

export interface PromptLeakDetection {
  detected: boolean;
  indicators: string[];
  fingerprint: string | null;
}

export interface PromptLeakShieldResult extends PromptLeakDetection {
  text: string;
  blocked: boolean;
}

function normalizeForFingerprint(text: string): string {
  return (text || '')
    .trim()
    .slice(0, 320)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hashTextFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function looksLikeInternalPromptText(text: string): boolean {
  const sample = (text || '').trim();
  if (!sample) return false;
  if (INTERNAL_MARKER_TEST_REGEX.test(sample) || INTERNAL_MARKER_OPEN_TAIL_REGEX.test(sample)) return true;
  return SENSITIVE_INTERNAL_PATTERNS.some((pattern) => pattern.test(sample));
}

export function detectPromptLeakIndicators(text: string): PromptLeakDetection {
  const sample = (text || '').trim();
  if (!sample) {
    return { detected: false, indicators: [], fingerprint: null };
  }

  const hardHits = HARD_PROMPT_LEAK_PATTERNS
    .filter((pattern) => pattern.regex.test(sample))
    .map((pattern) => pattern.id);
  const softHits = SOFT_PROMPT_LEAK_PATTERNS
    .filter((pattern) => pattern.regex.test(sample))
    .map((pattern) => pattern.id);
  const detected = hardHits.length > 0 || softHits.length >= 2;
  const fingerprint = detected ? hashTextFNV1a(normalizeForFingerprint(sample)) : null;

  return {
    detected,
    indicators: [...hardHits, ...softHits],
    fingerprint,
  };
}

export function buildPromptLeakFallback(companyHint?: string): string {
  const safeCompany = cleanTitle(companyHint).trim();
  if (safeCompany) {
    return `Para continuar com segurança na análise de ${safeCompany}, confirme o CNPJ (14 dígitos).`;
  }
  return 'Para continuar com segurança na análise, confirme o CNPJ da empresa (14 dígitos).';
}

export function stripInternalMarkers(text: string): string {
  if (!text) return '';

  const withoutMarkers = text
    .replace(INTERNAL_MARKER_REGEX, '')
    .replace(INTERNAL_MARKER_OPEN_TAIL_REGEX, '');

  const sanitizedLines = withoutMarkers
    .split('\n')
    .filter((line) => !SENSITIVE_INTERNAL_PATTERNS.some((pattern) => pattern.test(line)))
    .join('\n');

  return sanitizedLines
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\]\s*$/gm, '')
    .trim();
}

export function applyPromptLeakShield(
  text: string,
  options: { companyHint?: string; fallbackText?: string } = {},
): PromptLeakShieldResult {
  const cleaned = stripInternalMarkers(text || '');
  const sample = cleaned || (text || '').trim();
  const detection = detectPromptLeakIndicators(sample);

  if (!detection.detected) {
    return {
      text: sample,
      blocked: false,
      detected: false,
      indicators: [],
      fingerprint: null,
    };
  }

  return {
    text: options.fallbackText || buildPromptLeakFallback(options.companyHint),
    blocked: true,
    detected: true,
    indicators: detection.indicators,
    fingerprint: detection.fingerprint,
  };
}

export function sanitizeLoadingContextText(rawText: string, companyHint = ''): string {
  const raw = (rawText || '').trim();
  const hint = (companyHint || '').trim();
  if (!raw) return hint;
  if (looksLikeInternalPromptText(raw)) {
    return hint ? `Investigação da empresa ${hint}` : '';
  }

  const cleaned = stripInternalMarkers(raw).replace(/\s+/g, ' ').trim();
  if (!cleaned || looksLikeInternalPromptText(cleaned)) {
    return hint ? `Investigação da empresa ${hint}` : '';
  }
  return cleaned.slice(0, 240);
}

// ============================================
// SOURCE EXTRACTION
// ============================================

export interface SourceRef {
  id: string;
  title: string;
  url: string;
}

export type AuditableSourceType = 'inline_citation' | 'grounding_consulted' | 'inferred_without_url';

export interface AuditableSource {
  key: string;
  citationIndex: number | null;
  title: string;
  url?: string;
  sourceTypes: AuditableSourceType[];
  contexts: string[];
  requiresManualValidation: boolean;
}

/**
 * Extrai fontes do texto de forma estruturada.
 * NOTA: Para extração completa de links, use extractAllLinksFromMarkdown
 */
export function extractSources(text: string): SourceRef[] {
  const sources: SourceRef[] = [];
  if (!text) return sources;
  const lines = text.split('\n');
  
  const patterns = [
    /\^(\d+)\s*[-–—:]\s*(.*?)(?:\((https?:\/\/[^\s)]+)\))?$/,
    /\[\^(\d+)\]:\s*(https?:\/\/\S+)\s*[-–—]?\s*(.*)?$/,
    /^[¹²³⁴⁵⁶⁷⁸⁹⁰]+\s*(https?:\/\/\S+)\s*[-–—]?\s*(.*)?$/,
    /^(\d+)\.\s+(.*?)(?:\s*[-–—]\s*)?(https?:\/\/\S+)?$/,
    /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/,
  ];

  let inSourcesBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (/^(?:\*\*)?(?:fontes?|referências?|sources?|refs?)(?:\*\*)?:?\s*$/i.test(trimmed)) {
      inSourcesBlock = true;
      continue;
    }

    if (inSourcesBlock || trimmed.match(/^\^?\d/) || trimmed.match(/^\[.*\]\(http/)) {
      for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          const id = match[1] || String(sources.length + 1);
          let title = '';
          let url = '';
          
          for (let i = 2; i <= match.length; i++) {
            const val = match[i] || '';
            if (val.startsWith('http')) {
              url = val;
            } else if (val.length > 0) {
              title = val;
            }
          }
          
          if (!url) {
            const urlMatch = (title || trimmed).match(/(https?:\/\/[^\s)]+)/);
            if (urlMatch) {
              url = urlMatch[1];
              title = title.replace(urlMatch[0], '').replace(/[()]/g, '').trim();
            }
          }

          const cleanTitle = (t: string) => 
            t.replace(/\*\*/g, '')
             .replace(/__/g, '')
             .replace(/[`*]/g, '')
             .replace(/^[:\-\s]+|[:\-\s]+$/g, '')
             .trim();

          if (url && url.startsWith('http')) {
            sources.push({ 
              id: id.replace(/\D/g, ''), 
              title: cleanTitle(title) || cleanTitle(new URL(url).hostname.replace('www.', '')), 
              url 
            });
          }
          break;
        }
      }
    }
  }

  return sources;
}

/**
 * Extrai TODOS os links markdown do texto (não só do bloco de fontes).
 * Usado para gerar lista de fontes na exportação.
 */
export function extractAllLinksFromMarkdown(text: string): SourceRef[] {
  const links: SourceRef[] = [];
  if (!text) return links;
  
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/g;
  let match;
  let id = 1;
  
  while ((match = linkRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const url = match[2].trim();
    
    if (!links.find(l => l.url === url)) {
      links.push({ id: String(id++), title, url });
    }
  }
  
  return links;
}

const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+)\)/gi;

export function normalizeSourceUrl(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';

  const withoutWrapping = raw.replace(/^<|>$/g, '');
  const withoutTrailingPunctuation = withoutWrapping.replace(/[),.;:!?]+$/g, '');

  try {
    const parsed = new URL(withoutTrailingPunctuation);

    // Remove params de tracking para reduzir duplicatas de auditoria.
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    trackingParams.forEach((param) => parsed.searchParams.delete(param));

    const query = parsed.searchParams.toString();
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${query ? `?${query}` : ''}`;
  } catch {
    return withoutTrailingPunctuation.replace(/\/+$/, '');
  }
}

function extractUsageContext(text: string, index: number): string {
  if (!text) return '';
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function pushUniqueContext(target: string[], context: string): void {
  if (!context) return;
  if (!target.includes(context)) target.push(context);
}

/**
 * Consolida referências para auditoria:
 * - links inline no markdown
 * - links consultados via grounding (quando vierem separados)
 * - menções inferidas sem URL explícita
 */
export function buildAuditableSources(
  text: string,
  groundingSources: Array<{ title: string; url: string }> = []
): AuditableSource[] {
  const items: AuditableSource[] = [];
  const byUrl = new Map<string, AuditableSource>();
  const byTitleNoUrl = new Map<string, AuditableSource>();
  let citationIndex = 1;
  let match: RegExpExecArray | null;

  while ((match = MARKDOWN_LINK_REGEX.exec(text || '')) !== null) {
    const rawTitle = (match[1] || '').trim();
    const rawUrl = (match[2] || '').trim();
    if (!rawUrl) continue;
    const normalizedUrl = normalizeSourceUrl(rawUrl);
    const displayUrl = normalizedUrl || rawUrl;
    let source = byUrl.get(normalizedUrl);

    if (!source) {
      source = {
        key: normalizedUrl || `inline-${citationIndex}`,
        citationIndex: citationIndex++,
        title: rawTitle || displayUrl,
        url: displayUrl,
        sourceTypes: ['inline_citation'],
        contexts: [],
        requiresManualValidation: false,
      };
      byUrl.set(normalizedUrl, source);
      items.push(source);
    } else {
      if (!source.sourceTypes.includes('inline_citation')) {
        source.sourceTypes.push('inline_citation');
      }
      if (!source.title && rawTitle) source.title = rawTitle;
    }

    pushUniqueContext(source.contexts, extractUsageContext(text, match.index));
  }

  // Captura URLs "cruas" no texto para não perder fontes que não vieram em markdown.
  const RAW_URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;
  while ((match = RAW_URL_REGEX.exec(text || '')) !== null) {
    const rawUrl = (match[0] || '').trim();
    if (!rawUrl) continue;
    const normalizedUrl = normalizeSourceUrl(rawUrl);
    const displayUrl = normalizedUrl || rawUrl;
    if (!normalizedUrl) continue;

    let source = byUrl.get(normalizedUrl);
    if (!source) {
      let hostname = rawUrl;
      try {
        hostname = new URL(rawUrl).hostname.replace(/^www\./i, '');
      } catch {
        // mantém URL como título se parser falhar
      }

      source = {
        key: normalizedUrl || `inline-${citationIndex}`,
        citationIndex: citationIndex++,
        title: hostname || rawUrl,
        url: displayUrl,
        sourceTypes: ['inline_citation'],
        contexts: [],
        requiresManualValidation: false,
      };
      byUrl.set(normalizedUrl, source);
      items.push(source);
    } else if (!source.sourceTypes.includes('inline_citation')) {
      source.sourceTypes.push('inline_citation');
    }

    pushUniqueContext(source.contexts, extractUsageContext(text, match.index));
  }

  for (const g of groundingSources || []) {
    const title = (g?.title || '').trim();
    const url = (g?.url || '').trim();
    if (!url) continue;
    const normalizedUrl = normalizeSourceUrl(url);
    const displayUrl = normalizedUrl || url;

    let source = byUrl.get(normalizedUrl);
    if (!source) {
      source = {
        key: normalizedUrl || `grounding-${citationIndex}`,
        citationIndex: citationIndex++,
        title: title || displayUrl,
        url: displayUrl,
        sourceTypes: ['grounding_consulted'],
        contexts: ['Fonte consultada pelo mecanismo de grounding.'],
        requiresManualValidation: false,
      };
      byUrl.set(normalizedUrl, source);
      items.push(source);
      continue;
    }

    if (!source.sourceTypes.includes('grounding_consulted')) {
      source.sourceTypes.push('grounding_consulted');
    }
    if (!source.title && title) source.title = title;
    pushUniqueContext(source.contexts, 'Fonte consultada pelo mecanismo de grounding.');
  }

  const inferredRegex = /\*\*([^*]+)\*\*\s*\*\[\s*fonte não disponível\s*\]\*/gi;
  while ((match = inferredRegex.exec(text || '')) !== null) {
    const title = (match[1] || '').trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (byTitleNoUrl.has(key)) continue;

    const inferred: AuditableSource = {
      key: `inferred-${key}`,
      citationIndex: null,
      title,
      sourceTypes: ['inferred_without_url'],
      contexts: [extractUsageContext(text, match.index) || 'Citação inferida sem URL explícita no texto.'],
      requiresManualValidation: true,
    };
    byTitleNoUrl.set(key, inferred);
    items.push(inferred);
  }

  return items;
}

/**
 * Remove o bloco de fontes APENAS para exibição na UI.
 * MANTÉM links inline no texto.
 */
export function removeSourcesBlock(text: string): string {
  return text
    .replace(/\n\*?\*?(?:Fontes?|Referências?|Sources?)\*?\*?:?\s*\n[\s\S]*$/i, '')
    .replace(/\n\[\^\d+\]:[\s\S]*$/i, '')
    .trim();
}

/**
 * Formata lista de fontes para inclusão no PDF/DOC.
 */
export function formatSourcesForExport(sources: SourceRef[]): string {
  if (!sources || sources.length === 0) return '';
  
  const links = sources
    .filter(s => s.url && s.url.startsWith('http'))
    .map((s) => `<li><a href="${s.url}" target="_blank">${s.title || s.url}</a></li>`)
    .join('\n');
  
  if (!links) return '';
  
  return `
    <div class="sources-section" style="margin-top: 24px; padding-top: 16px; border-top: 2px solid #059669;">
      <h2 style="color: #064e3b; font-size: 14px; font-weight: 700; margin-bottom: 10px;">📚 Fontes e Referências</h2>
      <ul style="list-style: decimal; padding-left: 20px; font-size: 11px; color: #475569;">
        ${links}
      </ul>
    </div>
  `;
}
