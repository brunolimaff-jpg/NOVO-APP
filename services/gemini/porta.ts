import {
  ParsedContent,
  PortaFeedAdjustment,
  PortaFlag,
  PortaFlagFeed,
  PortaSegmentFeed,
  PortaSegmento,
} from '../../types';
import { parsePortaMarkerV2, stripPortaMarkers } from '../../utils/porta';
import { stripInternalMarkers } from '../../utils/textCleaners';

export interface ParsedPortaFeeds {
  adjustments: Omit<PortaFeedAdjustment, 'timestamp'>[];
  flags: Omit<PortaFlagFeed, 'timestamp'>[];
  segments: Omit<PortaSegmentFeed, 'timestamp'>[];
}

function normalizeFeedToken(raw: string | undefined): string {
  if (!raw) return '';
  return raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
}

function parseFeedInt(raw: string | undefined): number | null {
  const cleaned = normalizeFeedToken(raw);
  const match = cleaned.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampFeedValue(value: number): number {
  return Math.min(10, Math.max(0, value));
}

function parseFeedPairs(raw: string | undefined): { subScores?: Record<string, number>; metadata?: Record<string, string> } {
  const extras = normalizeFeedToken(raw);
  if (!extras) return {};
  const pieces = extras.split(':').map(part => part.trim()).filter(Boolean);
  if (pieces.length < 2) return {};
  const subScores: Record<string, number> = {};
  const metadata: Record<string, string> = {};
  for (let i = 0; i < pieces.length - 1; i += 2) {
    const key = normalizeFeedToken(pieces[i]);
    const valueRaw = normalizeFeedToken(pieces[i + 1]);
    const valueNum = parseFeedInt(valueRaw);
    if (!key) continue;
    if (valueNum !== null && /^\d+$/.test(valueRaw.replace(/[^\d]/g, ''))) {
      subScores[key] = valueNum;
    } else {
      metadata[key] = valueRaw;
    }
  }
  return {
    subScores: Object.keys(subScores).length > 0 ? subScores : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function parsePortaFeeds(content: string, source: string): ParsedPortaFeeds {
  const result: ParsedPortaFeeds = { adjustments: [], flags: [], segments: [] };

  const pushAdjustment = (adjustment: Omit<PortaFeedAdjustment, 'timestamp'>) => {
    result.adjustments.push(adjustment);
  };

  const feedORRegex = /\[\[PORTA_FEED_([OR]):(?:\[)?(\d+)(?:\])?(?::([^:\]]+):(?:\[)?([^\]]+)(?:\])?)?]]/g;
  let match: RegExpExecArray | null;
  while ((match = feedORRegex.exec(content)) !== null) {
    const dimension = match[1] as 'O' | 'R';
    const value = clampFeedValue(Number.parseInt(match[2], 10));
    const key = normalizeFeedToken(match[3]);
    const rawValue = normalizeFeedToken(match[4]);
    const metadata = key && rawValue ? { [key]: rawValue } : undefined;
    pushAdjustment({
      source,
      dimension,
      suggestedValue: value,
      justification: `Deep dive ${source} sugere ${dimension}=${value}`,
      metadata,
    });
  }

  const tFeedRegex = /\[\[PORTA_FEED_T:(?:\[)?(\d+)(?:\])?:T1:(?:\[)?(\d+)(?:\])?:T2:(?:\[)?(\d+)(?:\])?:T3:(?:\[)?(\d+)(?:\])?(?::STACK:(?:\[)?([^\]]+)(?:\])?)?]]/g;
  while ((match = tFeedRegex.exec(content)) !== null) {
    const tFinal = clampFeedValue(Number.parseInt(match[1], 10));
    const t1 = clampFeedValue(Number.parseInt(match[2], 10));
    const t2 = clampFeedValue(Number.parseInt(match[3], 10));
    const t3 = clampFeedValue(Number.parseInt(match[4], 10));
    const stack = normalizeFeedToken(match[5]);
    pushAdjustment({
      source,
      dimension: 'T',
      suggestedValue: tFinal,
      justification: `Deep dive ${source}: T1(stack)=${t1}, T2(dor)=${t2}, T3(liberdade)=${t3}`,
      subScores: { T1: t1, T2: t2, T3: t3 },
      metadata: stack ? { STACK: stack } : undefined,
    });
  }

  const aFeedRegex = /\[\[PORTA_FEED_A:(?:\[)?(\d+)(?:\])?:A1:(?:\[)?(\d+)(?:\])?:A2:(?:\[)?(\d+)(?:\])?(?::GERACAO:(?:\[)?([^\]]+)(?:\])?)?]]/g;
  while ((match = aFeedRegex.exec(content)) !== null) {
    const aFinal = clampFeedValue(Number.parseInt(match[1], 10));
    const a1 = clampFeedValue(Number.parseInt(match[2], 10));
    const a2 = clampFeedValue(Number.parseInt(match[3], 10));
    const geracao = normalizeFeedToken(match[4]);
    pushAdjustment({
      source,
      dimension: 'A',
      suggestedValue: aFinal,
      justification: `Deep dive ${source}: A1(cultural)=${a1}, A2(timing)=${a2}, Geração=${geracao || 'N/A'}`,
      subScores: { A1: a1, A2: a2 },
      metadata: geracao ? { GERACAO: geracao } : undefined,
    });
  }

  const pFeedRegex = /\[\[PORTA_FEED_P:(?:\[)?(\d+)(?:\])?(?::HA:(?:\[)?([^\]:]*)\]?)?(?::CNPJS:(?:\[)?([^\]:]*)\]?)?(?::FAT:(?:\[)?([^\]]*)\]?)?]]/g;
  while ((match = pFeedRegex.exec(content)) !== null) {
    const pFinal = clampFeedValue(Number.parseInt(match[1], 10));
    const metadata: Record<string, string> = {};
    const ha = normalizeFeedToken(match[2]);
    const cnpjs = normalizeFeedToken(match[3]);
    const fat = normalizeFeedToken(match[4]);
    if (ha) metadata.HA = ha;
    if (cnpjs) metadata.CNPJS = cnpjs;
    if (fat) metadata.FAT = fat;
    pushAdjustment({
      source,
      dimension: 'P',
      suggestedValue: pFinal,
      justification: `Deep dive ${source} sugere P=${pFinal}`,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  }

  const genericFeedRegex = /\[\[PORTA_FEED_([PORTA])(?:_[A-Z0-9]+)?:(?:\[)?(\d+)(?:\])?(?::([^\]]+))?]]/g;
  while ((match = genericFeedRegex.exec(content)) !== null) {
    const dimension = match[1] as 'P' | 'O' | 'R' | 'T' | 'A';
    const hasSpecific = result.adjustments.some(adjustment => adjustment.dimension === dimension);
    if (hasSpecific) continue;
    const suggestedValue = clampFeedValue(Number.parseInt(match[2], 10));
    const { subScores, metadata } = parseFeedPairs(match[3]);
    pushAdjustment({
      source,
      dimension,
      suggestedValue,
      justification: `Deep dive ${source} sugere ${dimension}=${suggestedValue}`,
      subScores,
      metadata,
    });
  }

  const proxyRegex = /\[\[PORTA_FEED_P_PROXY:FUNC:(?:\[)?(\d+)(?:\])?]]/g;
  while ((match = proxyRegex.exec(content)) !== null) {
    const value = normalizeFeedToken(match[1]);
    const existing = result.adjustments.find(adjustment => adjustment.dimension === 'P');
    if (existing) existing.metadata = { ...(existing.metadata || {}), FUNCIONARIOS: value };
  }

  const flagRegex = /\[\[PORTA_FLAG:(TRAD|LOCK|NOFIT):(?:\[)?(SIM|NAO|NÃO)(?:\])?(?::[^\]]+)?]]/g;
  while ((match = flagRegex.exec(content)) !== null) {
    const flag = match[1] as PortaFlag;
    if (flag === 'LOCK') continue;
    result.flags.push({
      source,
      flag,
      active: match[2] === 'SIM',
      justification: `Deep dive ${source} ${match[2] === 'SIM' ? 'ativou' : 'desativou'} flag ${flag}`,
    });
  }

  const tradFlagRegex = /\[\[PORTA_FLAG:TRAD:(?:\[)?(SIM|NAO|NÃO)(?:\])?:NATUREZA:(?:\[)?(PRODUCAO|TRADING|MISTA)(?:\])?]]/g;
  while ((match = tradFlagRegex.exec(content)) !== null) {
    result.flags = result.flags.filter(flag => flag.flag !== 'TRAD');
    result.flags.push({
      source,
      flag: 'TRAD',
      active: match[1] === 'SIM',
      justification: `Natureza da receita: ${match[2]}`,
    });
  }

  const segmentRegex = /\[\[PORTA_SEG:(?:\[)?(PRD|AGI|COP)(?:\])?]]/g;
  while ((match = segmentRegex.exec(content)) !== null) {
    result.segments.push({
      source,
      segmento: match[1] as PortaSegmento,
      justification: `Deep dive ${source} inferiu segmento ${match[1]}`,
    });
  }

  return result;
}

export function cleanPortaFeedMarkers(text: string): string {
  return stripPortaMarkers(text);
}

export function parseMarkers(content: string): ParsedContent {
  const scorePorta = parsePortaMarkerV2(content);
  const text = stripInternalMarkers(stripPortaMarkers(content)).trim();

  return {
    text,
    statuses: [],
    scorePorta,
  };
}
