// utils/promptLeakShield.ts — Extraído de textCleaners.ts
import { cleanTitle } from './textCleaners';
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
  return (text || '').trim().slice(0, 320).toLowerCase().replace(/\s+/g, ' ');
}

function hashTextFNV1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function looksLikeInternalPromptText(text: string): boolean {
  const sample = (text || '').trim();
  if (!sample) return false;
  if (INTERNAL_MARKER_TEST_REGEX.test(sample) || INTERNAL_MARKER_OPEN_TAIL_REGEX.test(sample)) return true;
  return SENSITIVE_INTERNAL_PATTERNS.some(pattern => pattern.test(sample));
}

export function detectPromptLeakIndicators(text: string): PromptLeakDetection {
  const sample = (text || '').trim();
  if (!sample) {
    return { detected: false, indicators: [], fingerprint: null };
  }

  const hardHits = HARD_PROMPT_LEAK_PATTERNS.filter(pattern => pattern.regex.test(sample)).map(pattern => pattern.id);
  const softHits = SOFT_PROMPT_LEAK_PATTERNS.filter(pattern => pattern.regex.test(sample)).map(pattern => pattern.id);
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

  const withoutMarkers = text.replace(INTERNAL_MARKER_REGEX, '').replace(INTERNAL_MARKER_OPEN_TAIL_REGEX, '');

  const sanitizedLines = withoutMarkers
    .split('\n')
    .filter(line => !SENSITIVE_INTERNAL_PATTERNS.some(pattern => pattern.test(line)))
    .join('\n');

  return sanitizedLines
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\]\s*$/gm, '')
    .trim();
}

export function applyPromptLeakShield(
  text: string,
  options: { companyHint?: string; fallbackText?: string; preserveInternalMarkersWhenSafe?: boolean } = {},
): PromptLeakShieldResult {
  const raw = (text || '').trim();
  const cleaned = stripInternalMarkers(raw);
  const sample = cleaned || raw;
  const detection = detectPromptLeakIndicators(sample);

  if (!detection.detected) {
    return {
      text: options.preserveInternalMarkersWhenSafe ? raw : sample,
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
