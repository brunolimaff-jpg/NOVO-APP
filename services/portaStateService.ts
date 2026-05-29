import {
  PORTA_FLAG_PENALTIES,
  PORTA_WEIGHTS,
  PortaDimension,
  PortaFeedAdjustment,
  PortaFlag,
  PortaFlagFeed,
  PortaSegmentFeed,
  PortaSegmento,
  PortaState,
  ScorePortaData,
} from '../types';
import { calculatePortaFlagMultiplier, calculatePortaScoreBruto, normalizePortaFlags } from '../utils/porta';

let currentPortaState: PortaState | null = null;

export function initPortaState(empresa: string, sessionId: string): PortaState {
  currentPortaState = {
    empresa,
    sessionId,
    baseScore: null,
    baseScoreTimestamp: null,
    feedAdjustments: [],
    flagFeeds: [],
    segmentFeeds: [],
    consolidatedScore: null,
    lastConsolidatedAt: null,
  };
  return currentPortaState;
}

export function getPortaState(): PortaState | null {
  return currentPortaState;
}

export function resetPortaState(): void {
  currentPortaState = null;
}

export function setBaseScore(score: ScorePortaData): void {
  if (!currentPortaState) return;
  const normalizedFlags = normalizePortaFlags(score.flags || []);
  const scoreBruto =
    typeof score.scoreBruto === 'number'
      ? score.scoreBruto
      : calculatePortaScoreBruto(score.p, score.o, score.r, score.t, score.a, score.segmento);

  currentPortaState.baseScore = {
    ...score,
    flags: normalizedFlags,
    scoreBruto,
    score: Math.round(scoreBruto * calculatePortaFlagMultiplier(normalizedFlags)),
  };
  currentPortaState.baseScoreTimestamp = Date.now();
  consolidateScore();
}

export function addFeedAdjustment(feed: Omit<PortaFeedAdjustment, 'timestamp'>): void {
  if (!currentPortaState) return;

  currentPortaState.feedAdjustments = currentPortaState.feedAdjustments.filter(
    f => !(f.source === feed.source && f.dimension === feed.dimension),
  );

  currentPortaState.feedAdjustments.push({
    ...feed,
    timestamp: Date.now(),
  });

  consolidateScore();
}

export function addFlagFeed(feed: Omit<PortaFlagFeed, 'timestamp'>): void {
  if (!currentPortaState) return;
  if (!normalizePortaFlags([feed.flag]).length) return;

  currentPortaState.flagFeeds = currentPortaState.flagFeeds.filter(
    f => !(f.source === feed.source && f.flag === feed.flag),
  );

  currentPortaState.flagFeeds.push({
    ...feed,
    timestamp: Date.now(),
  });

  consolidateScore();
}

export function addSegmentFeed(feed: Omit<PortaSegmentFeed, 'timestamp'>): void {
  if (!currentPortaState) return;

  currentPortaState.segmentFeeds = currentPortaState.segmentFeeds.filter(f => f.source !== feed.source);
  currentPortaState.segmentFeeds.push({
    ...feed,
    timestamp: Date.now(),
  });

  consolidateScore();
}

function consolidateScore(): void {
  if (!currentPortaState || !currentPortaState.baseScore) return;

  const base = currentPortaState.baseScore;

  let p = base.p;
  let o = base.o;
  let r = base.r;
  let t = base.t;
  let a = base.a;

  const latestByDimension = new Map<PortaDimension, PortaFeedAdjustment>();
  for (const feed of currentPortaState.feedAdjustments) {
    const existing = latestByDimension.get(feed.dimension);
    if (!existing || feed.timestamp > existing.timestamp) {
      latestByDimension.set(feed.dimension, feed);
    }
  }

  for (const [dimension, feed] of latestByDimension.entries()) {
    const diff = Math.abs(feed.suggestedValue - getDimensionValue(base, dimension));
    if (diff < 1) continue;
    switch (dimension) {
      case 'P':
        p = feed.suggestedValue;
        break;
      case 'O':
        o = feed.suggestedValue;
        break;
      case 'R':
        r = feed.suggestedValue;
        break;
      case 'T':
        t = feed.suggestedValue;
        break;
      case 'A':
        a = feed.suggestedValue;
        break;
      default:
        break;
    }
  }

  let segmento: PortaSegmento = base.segmento || 'PRD';
  if (currentPortaState.segmentFeeds.length > 0) {
    const latestSegment = currentPortaState.segmentFeeds.reduce((acc, curr) =>
      acc.timestamp > curr.timestamp ? acc : curr,
    );
    segmento = latestSegment.segmento;
  }

  const activeFlags = new Set<PortaFlag>(normalizePortaFlags(base.flags || []));
  for (const feed of currentPortaState.flagFeeds) {
    if (feed.active) activeFlags.add(feed.flag);
    else activeFlags.delete(feed.flag);
  }
  const flags = normalizePortaFlags(Array.from(activeFlags) as PortaFlag[]);

  const weights = PORTA_WEIGHTS[segmento];
  const scoreBruto = Math.round((p * weights.p + o * weights.o + r * weights.r + t * weights.t + a * weights.a) * 10);

  let multiplier = 1;
  for (const flag of flags) {
    const penalty = PORTA_FLAG_PENALTIES[flag];
    if (typeof penalty === 'number' && !isNaN(penalty)) {
      multiplier *= penalty;
    }
  }
  const score = Math.round(scoreBruto * multiplier);

  currentPortaState.consolidatedScore = {
    score,
    p,
    o,
    r,
    t,
    a,
    segmento,
    flags,
    scoreBruto,
  };
  currentPortaState.lastConsolidatedAt = Date.now();
}

function getDimensionValue(score: ScorePortaData, dimension: PortaDimension): number {
  switch (dimension) {
    case 'P':
      return score.p;
    case 'O':
      return score.o;
    case 'R':
      return score.r;
    case 'T':
      return score.t;
    case 'A':
      return score.a;
    default:
      return 0;
  }
}

export function generatePortaContextForDeepDive(_deepDiveSource: string): string {
  if (!currentPortaState?.consolidatedScore) {
    return '\n[PORTA: Nenhum score calculado ainda. Execute o dossiê completo primeiro.]\n';
  }

  const s = currentPortaState.consolidatedScore;
  const adjustments = currentPortaState.feedAdjustments
    .map(f => `  - ${f.source} ajustou ${f.dimension}: ${f.suggestedValue} (${f.justification})`)
    .join('\n');

  return `
📊 SCORE PORTA ATUAL (NÃO RECALCULE — SÓ SUGIRA AJUSTES NA SUA ÁREA):

Empresa: ${currentPortaState.empresa}
Score FINAL: ${s.score}/100 (bruto: ${s.scoreBruto ?? 'N/A'})
Segmento: ${s.segmento}
Flags: ${s.flags.length > 0 ? s.flags.join(', ') : 'NONE'}

Dimensões atuais:
  P (Porte):      ${s.p}/10
  O (Operação):   ${s.o}/10
  R (Retorno):    ${s.r}/10
  T (Tecnologia): ${s.t}/10
  A (Adoção):     ${s.a}/10

${adjustments ? `Ajustes já aplicados por deep dives anteriores:\n${adjustments}` : 'Nenhum deep dive executado ainda.'}

SUA MISSÃO: Investigar profundamente SUA ÁREA. Se encontrar dados que justifiquem alterar alguma nota, use os markers [[PORTA_FEED_*]] no final. Se as notas atuais estiverem corretas para sua área, diga explicitamente "Notas atuais confirmadas, sem ajuste necessário."
`;
}
