import { DEFAULT_COMPETITOR_TARGET } from './config';
import type { WarRoomIntentFlags, WarRoomMode, WarRoomRoute } from './contracts';

const PROCESSO_AGRICOLA_PATTERNS = [
  /gest(?:ão|ao)\s+agr(?:ícola|icola)/i,
  /processo\s+agr(?:ícola|icola)/i,
  /\b(ordem\s+de\s+servi(?:ço|co)|o\.s\.)\b/i,
  /\b(safra|talh(?:ão|ao)|cultura|monitoramento|irriga(?:ção|cao))\b/i,
  /\bsimplefarm\b/i,
];

const INTEGRACAO_PATTERNS = [
  /integra(?:ção|cao)/i,
  /integrado\s+ao?\s+erp/i,
  /arquitetura/i,
  /\bbackoffice\b/i,
];

const FERCUS_PATTERNS = [/\bfercus\b/i, /custos?\s+gerenciais/i];
const TALHAO_PATTERNS = [/\btalh(?:ão|ao)\b/i, /agr0193/i, /consulta\s+anal(?:ítica|itica)/i];
const GATEC_AGRICOLA_PATTERNS = [
  /gest(?:ão|ao)\s+agr(?:ícola|icola).*gatec/i,
  /gatec.*gest(?:ão|ao)\s+agr(?:ícola|icola)/i,
  /processo.*agr(?:ícola|icola).*gatec/i,
];
const BANKING_PATTERNS = [
  /\bbanking\b/i,
  /integra(?:ção|cao)\s+banc(?:ária|aria)/i,
  /\bcnab\b/i,
  /\bted\b/i,
  /\bach\b/i,
  /pagamento\s+eletr(?:ônico|onico)/i,
];

const OUT_OF_SCOPE_PATTERNS = [
  /investigar?\s+(a\s+)?empresa/i,
  /dossi(?:ê|e)/i,
  /cnpj/i,
  /score\s+porta/i,
  /prospec(?:ção|cao)/i,
  /varredura/i,
  /capivara/i,
  /quero\s+saber\s+tudo\s+sobre/i,
  /quadro\s+societ(?:ário|ario)/i,
  /s(?:ó|o)cios?\s+d[aoe]/i,
  /receita\s+federal/i,
];

const BENCHMARK_INTENT_PATTERNS = [
  /\bbenchmark\b/i,
  /\bcompar(a|ar|e|ativo)\b/i,
  /\bversus\b/i,
  /\bvs\b/i,
  /\bcontra\b/i,
  /\bconcorr(?:ê|e)n/i,
  /\bdiferen(?:ç|c)a\b/i,
];

const BLOCKED_INTENT_PATTERNS = [
  /\bkill[-\s]?script\b/i,
  /\ban(?:á|a)lise de obje(?:ç|c)(?:õ|o)es\b/i,
  /\bquebrar obje(?:ç|c)(?:ã|a)o\b/i,
];

const CLEAN_TARGET_RE = /^[\s"'`(,-]+|[\s"'`).,;:!?-]+$/g;
const TARGET_TOKEN_RE = /[\p{L}0-9][\p{L}0-9 ._/-]{1,60}/u;
const SENIOR_FIRST_RE = new RegExp(`\\bsenior(?:\\s+sistemas)?\\s+(?:vs|versus|contra)\\s+(${TARGET_TOKEN_RE.source})`, 'iu');
const SENIOR_SECOND_RE = new RegExp(`(${TARGET_TOKEN_RE.source})\\s+(?:vs|versus|contra)\\s+senior(?:\\s+sistemas)?\\b`, 'iu');
const GENERIC_TARGET_RE = new RegExp(`\\b(?:vs|versus|contra)\\b\\s+(${TARGET_TOKEN_RE.source})`, 'iu');

export function isOutOfScope(message: string): boolean {
  return OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isProcessoAgricolaIntent(message: string): boolean {
  return PROCESSO_AGRICOLA_PATTERNS.some((pattern) => pattern.test(message));
}

export function isIntegracaoIntent(message: string): boolean {
  return INTEGRACAO_PATTERNS.some((pattern) => pattern.test(message));
}

export function hasFercusIntent(message: string): boolean {
  return FERCUS_PATTERNS.some((pattern) => pattern.test(message));
}

export function hasTalhaoIntent(message: string): boolean {
  return TALHAO_PATTERNS.some((pattern) => pattern.test(message));
}

export function hasGatecAgricolaIntent(message: string): boolean {
  return GATEC_AGRICOLA_PATTERNS.some((pattern) => pattern.test(message));
}

export function hasBankingIntent(message: string): boolean {
  return BANKING_PATTERNS.some((pattern) => pattern.test(message));
}

export function isBlockedIntent(text: string): boolean {
  return BLOCKED_INTENT_PATTERNS.some((pattern) => pattern.test(text));
}

export function resolveWarRoomIntent(text: string): WarRoomRoute {
  return BENCHMARK_INTENT_PATTERNS.some((pattern) => pattern.test(text)) ? 'benchmark' : 'tech';
}

export function normalizeCompetitorTarget(value: string): string {
  return value
    .replace(/^\s*(?:a|o|as|os)\s+/i, '')
    .replace(CLEAN_TARGET_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function isSeniorAlias(value: string): boolean {
  return /\b(senior|senior sistemas)\b/i.test(value);
}

export function extractCompetitorFromMessage(message: string): string {
  const text = message.trim();

  const compareWith = text.match(/\bcompar(?:e|ar)?\s+(.{2,80}?)\s+\bcom\b\s+(.{2,80}?)(?:$|[?.!,;])/i);
  if (compareWith) {
    const left = normalizeCompetitorTarget(compareWith[1]);
    const right = normalizeCompetitorTarget(compareWith[2]);
    if (isSeniorAlias(left) && !isSeniorAlias(right)) return right;
    if (isSeniorAlias(right) && !isSeniorAlias(left)) return left;
    if (!isSeniorAlias(right)) return right;
  }

  const seniorFirst = text.match(SENIOR_FIRST_RE);
  if (seniorFirst) {
    return normalizeCompetitorTarget(seniorFirst[1]);
  }

  const seniorSecond = text.match(SENIOR_SECOND_RE);
  if (seniorSecond) {
    return normalizeCompetitorTarget(seniorSecond[1]);
  }

  const generic = text.match(GENERIC_TARGET_RE);
  return normalizeCompetitorTarget(generic?.[1] || '');
}

export function normalizeTarget(target: string, message: string): string {
  const cleanTarget = (target || '').trim();
  if (cleanTarget) return cleanTarget;

  const inferred =
    message.match(GENERIC_TARGET_RE)?.[1]
      ?.trim()
      .replace(/[.,;:!?]+$/, '') || '';

  return inferred || DEFAULT_COMPETITOR_TARGET;
}

export function collectWarRoomIntentFlags(mode: WarRoomMode, message: string): WarRoomIntentFlags {
  const isTechMode = mode === 'tech';
  const isBenchmarkMode = mode === 'benchmark';

  return {
    wantsProcessoAgricola: isTechMode && isProcessoAgricolaIntent(message),
    wantsIntegracao: isTechMode && isIntegracaoIntent(message),
    wantsFercus: isTechMode && hasFercusIntent(message),
    wantsTalhao: isTechMode && hasTalhaoIntent(message),
    wantsGatecAgricola: isTechMode && hasGatecAgricolaIntent(message),
    wantsBanking: isBenchmarkMode && hasBankingIntent(message),
  };
}
