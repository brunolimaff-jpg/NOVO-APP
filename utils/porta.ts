import {
  PORTA_FLAG_PENALTIES,
  PORTA_WEIGHTS,
  PortaDimension,
  PortaFlag,
  PortaSegmento,
  ScorePortaData,
} from '../types';

export const PORTA_MARKER_ANY_REGEX = /\[\[(?:PORTA(?::[^\]]*|_[^\]]*))\]\]/g;
export const PORTA_MARKER_V2_REGEX =
  /\[\[PORTA:(\d+):P(\d+):O(\d+):R(\d+):T(\d+):A(\d+):(PRD|AGI|COP):(NONE|(?:(?:TRAD|LOCK|NOFIT)(?:,(?:TRAD|LOCK|NOFIT))*))\]\]/;
export const PORTA_MARKER_V1_REGEX = /\[\[PORTA:(\d+):P(\d+):O(\d+):R(\d+):T(\d+):A(\d+)\]\]/;
const PORTA_SEGMENT_REGEX = /\[\[PORTA_SEG:(PRD|AGI|COP)\]\]/g;
const PORTA_FLAG_REGEX = /\[\[PORTA_FLAG:(TRAD|LOCK|NOFIT):(SIM|NAO|NÃO)(?::[^\]]+)?\]\]/g;
const PORTA_FEED_O_REGEX = /\[\[PORTA_FEED_O:(\d+):ELOS:([^\]]*)\]\]/g;
const PORTA_FEED_R_REGEX = /\[\[PORTA_FEED_R:(\d+):PRESSOES:([^\]]*)\]\]/g;
const PORTA_FEED_T_REGEX = /\[\[PORTA_FEED_T:(\d+):T1:(\d+):T2:(\d+):T3:(\d+):STACK:([^\]]*)\]\]/g;
const PORTA_FEED_P_REGEX = /\[\[PORTA_FEED_P:(\d+):HA:([^:\]]*):CNPJS:([^:\]]*):FAT:([^\]]*)\]\]/g;
const PORTA_FEED_P_PROXY_REGEX = /\[\[PORTA_FEED_P_PROXY:FUNC:([^\]]*)\]\]/g;
const PORTA_FEED_R_TRAB_REGEX = /\[\[PORTA_FEED_R_TRAB:(\d+):PASSIVOS:([^\]]*)\]\]/g;
const PORTA_FEED_A2_REGEX = /\[\[PORTA_FEED_A2:(\d+):TIMING:([^:\]]*):FASE:([^\]]*)\]\]/g;
const PORTA_FEED_A_REGEX = /\[\[PORTA_FEED_A:(\d+):A1:(\d+):A2:(\d+):GERACAO:([^\]]*)\]\]/g;
const PORTA_FLAG_ORDER: PortaFlag[] = ['TRAD', 'LOCK', 'NOFIT'];

export const PORTA_SEGMENT_LABELS: Record<PortaSegmento, string> = {
  PRD: 'Produtor Rural',
  AGI: 'Agroindústria',
  COP: 'Cooperativa',
};

export const PORTA_FLAG_META: Record<
  PortaFlag,
  { icon: string; label: string; shortLabel: string; description: string }
> = {
  TRAD: {
    icon: '🚩',
    label: 'Trading puro',
    shortLabel: 'TRAD',
    description: 'Receita concentrada em compra e revenda de commodities.',
  },
  LOCK: {
    icon: '🔒',
    label: 'ERP corporativo travado',
    shortLabel: 'LOCK',
    description: 'Decisão local travada por contrato ou governança corporativa.',
  },
  NOFIT: {
    icon: '⛔',
    label: 'Sem fit GAtec',
    shortLabel: 'NOFIT',
    description: 'Core operacional fora do portfólio Senior/GAtec.',
  },
};

export function getPortaCompatibility(score: number): {
  emoji: string;
  label: string;
  color: string;
  background: string;
} {
  if (score >= 71) {
    return {
      emoji: '🟢',
      label: 'Alta Compatibilidade',
      color: '#059669',
      background: 'rgba(5,150,105,0.15)',
    };
  }

  if (score >= 41) {
    return {
      emoji: '🟡',
      label: 'Média Compatibilidade',
      color: '#eab308',
      background: 'rgba(234,179,8,0.15)',
    };
  }

  return {
    emoji: '🔴',
    label: 'Baixa Compatibilidade',
    color: '#ef4444',
    background: 'rgba(239,68,68,0.15)',
  };
}

export function stripPortaMarkers(content: string): string {
  let cleaned = normalizePortaContent(content).replace(PORTA_MARKER_ANY_REGEX, '');
  
  // Limpa o bloco de texto onde o Gemini explica as notas para n poluir o layout, já q vao no hover agora.
  // Pode vir como "**SCORE PORTA**" ou "### SCORE PORTA" etc.
  cleaned = cleaned.replace(/(?:\*\*|###\s*)SCORE PORTA(?:\*\*|:)?[\s\S]*?(?=\n\n|\n*$)/ig, '');
  
  return cleaned;
}

function normalizePortaContent(content: string): string {
  return content.replace(/:\[([^[\]]*)\]/g, ':$1');
}

function clampPortaNote(value: number): number {
  return Math.max(0, Math.min(10, Math.round(value)));
}

function parseLooseInteger(raw: string): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function collectMatches(regex: RegExp, content: string): RegExpExecArray[] {
  return Array.from(content.matchAll(regex));
}

function averageRounded(values: number[]): number | null {
  if (values.length === 0) return null;
  return clampPortaNote(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function lastNumberMatch(regex: RegExp, content: string): number | null {
  const matches = collectMatches(regex, content);
  const last = matches[matches.length - 1];
  if (!last) return null;
  return parseLooseInteger(last[1]);
}

function mapEmployeesToPScore(employeeCount: number): number {
  if (employeeCount < 50) return 1;
  if (employeeCount < 100) return 2;
  if (employeeCount < 200) return 3;
  if (employeeCount < 500) return 4;
  if (employeeCount < 1000) return 5;
  if (employeeCount < 2000) return 6;
  if (employeeCount < 5000) return 7;
  if (employeeCount < 10000) return 8;
  if (employeeCount < 20000) return 9;
  return 10;
}

export function calculatePortaScoreBruto(
  p: number,
  o: number,
  r: number,
  t: number,
  a: number,
  segmento: PortaSegmento,
): number {
  const weights = PORTA_WEIGHTS[segmento];

  return Math.round((p * weights.p + o * weights.o + r * weights.r + t * weights.t + a * weights.a) * 10);
}

export function calculatePortaFlagMultiplier(flags: PortaFlag[]): number {
  return flags.reduce((acc, flag) => acc * PORTA_FLAG_PENALTIES[flag], 1);
}

export function buildPortaScoreFromFeeds(content: string): ScorePortaData | null {
  const normalizedContent = normalizePortaContent(content);
  const segmentoMatches = collectMatches(PORTA_SEGMENT_REGEX, normalizedContent);
  const segmento = (segmentoMatches[segmentoMatches.length - 1]?.[1] as PortaSegmento | undefined) || 'PRD';

  const activeFlags = new Set<PortaFlag>();
  for (const match of collectMatches(PORTA_FLAG_REGEX, normalizedContent)) {
    const flag = match[1] as PortaFlag;
    const isActive = match[2] === 'SIM';
    if (isActive) activeFlags.add(flag);
  }
  const flags = PORTA_FLAG_ORDER.filter(flag => activeFlags.has(flag));

  const o = lastNumberMatch(PORTA_FEED_O_REGEX, normalizedContent);
  const t = lastNumberMatch(PORTA_FEED_T_REGEX, normalizedContent);

  const pBase = lastNumberMatch(PORTA_FEED_P_REGEX, normalizedContent);
  const employeeCount = lastNumberMatch(PORTA_FEED_P_PROXY_REGEX, normalizedContent);
  const pProxy = employeeCount === null ? null : mapEmployeesToPScore(employeeCount);
  const p = pBase !== null && pProxy !== null ? clampPortaNote(pBase * 0.8 + pProxy * 0.2) : (pBase ?? pProxy);

  const rValues = [
    ...collectMatches(PORTA_FEED_R_REGEX, normalizedContent)
      .map(match => parseLooseInteger(match[1]))
      .filter((value): value is number => value !== null),
    ...collectMatches(PORTA_FEED_R_TRAB_REGEX, normalizedContent)
      .map(match => parseLooseInteger(match[1]))
      .filter((value): value is number => value !== null),
  ];
  const r = averageRounded(rValues);

  const aFeedMatches = collectMatches(PORTA_FEED_A_REGEX, normalizedContent);
  const lastAFeed = aFeedMatches[aFeedMatches.length - 1];
  const aFinalFromDecision = lastAFeed ? parseLooseInteger(lastAFeed[1]) : null;
  const a1 = lastAFeed ? parseLooseInteger(lastAFeed[2]) : null;
  const a2FromDecision = lastAFeed ? parseLooseInteger(lastAFeed[3]) : null;
  const a2FromRh = lastNumberMatch(PORTA_FEED_A2_REGEX, normalizedContent);

  let a: number | null = null;
  if (a1 !== null && a2FromDecision !== null) {
    const mergedA2 =
      a2FromRh !== null ? (averageRounded([a2FromDecision, a2FromRh]) ?? a2FromDecision) : a2FromDecision;
    a = clampPortaNote(a1 * 0.6 + mergedA2 * 0.4);
  } else if (aFinalFromDecision !== null) {
    a = aFinalFromDecision;
  } else if (a2FromRh !== null) {
    a = a2FromRh;
  }

  if ([p, o, r, t, a].some(value => value === null)) {
    return null;
  }

  const scoreBruto = calculatePortaScoreBruto(p!, o!, r!, t!, a!, segmento);
  const score = Math.round(scoreBruto * calculatePortaFlagMultiplier(flags));

  return {
    score,
    p: p!,
    o: o!,
    r: r!,
    t: t!,
    a: a!,
    segmento,
    flags,
    scoreBruto,
  };
}

export function parsePortaMarkerV2(content: string): ScorePortaData | null {
  const normalizedContent = normalizePortaContent(content);
  const v2Match = normalizedContent.match(PORTA_MARKER_V2_REGEX);

  if (v2Match) {
    const p = Number.parseInt(v2Match[2], 10);
    const o = Number.parseInt(v2Match[3], 10);
    const r = Number.parseInt(v2Match[4], 10);
    const t = Number.parseInt(v2Match[5], 10);
    const a = Number.parseInt(v2Match[6], 10);
    const segmento = v2Match[7] as PortaSegmento;
    const flags = v2Match[8] === 'NONE' ? [] : (v2Match[8].split(',') as PortaFlag[]);

    // Extrai as justificativas das notas usando regex para capturar as linhas de texto "Letra:" ou "**Letra:**"
    const justificativas: Record<PortaDimension, string> = {
      P: '',
      O: '',
      R: '',
      T: '',
      A: ''
    };

    const lines = content.split('\n');
    
    // Procura por formato ex: "- **P (Porte) [8]:** texto..." ou "**P:** texto..." ou "P: texto" ou "- P: texto"
    for (const line of lines) {
      // Formato: - **P (Porte) [8]:** texto...
      // Vamos usar uma Regex mais leniente para capturar a letra do pilar
      // Deve iniciar a linha com opcional de -, asteriscos, depois UM caractere entre PORTA, 
      // depois opcionalmente pode ter parênteses ou colchetes ou asteriscos, terminando em dois-pontos e o texto.
      const m1 = line.match(/^\s*(?:-\s*)?(?:\*\*)?([PORTA])(?:(?:[^:]*?)):\s*(.+)$/i);
      
      if (m1) {
         const letter = m1[1].toUpperCase() as PortaDimension;
         const justif = m1[2].trim();
         
         // Impede de pegar linhas aleatórias que por acaso começam com P:
         // Exigimos que o tamanho não seja gigante (ex: max 200 chars pra uma justificativa breve)
         if (!justificativas[letter] && justif.length > 5 && justif.length < 250) { 
            // limpa aspas e asteriscos ao redor do conteúdo capturado
            let cleanJustif = justif.replace(/\s*\*+$/, '');
            cleanJustif = cleanJustif.replace(/^"(.*)"$/, '$1');
            justificativas[letter] = cleanJustif;
         }
      }
    }

    const hasAnyJustificativa = Object.values(justificativas).some(value => value.trim().length > 0);

    return {
      score: Number.parseInt(v2Match[1], 10),
      p,
      o,
      r,
      t,
      a,
      segmento,
      flags,
      scoreBruto: calculatePortaScoreBruto(p, o, r, t, a, segmento),
      ...(hasAnyJustificativa ? { justificativas } : {}),
    };
  }

  const v1Match = normalizedContent.match(PORTA_MARKER_V1_REGEX);

  if (v1Match) {
    return {
      score: Number.parseInt(v1Match[1], 10),
      p: Number.parseInt(v1Match[2], 10),
      o: Number.parseInt(v1Match[3], 10),
      r: Number.parseInt(v1Match[4], 10),
      t: Number.parseInt(v1Match[5], 10),
      a: Number.parseInt(v1Match[6], 10),
      segmento: 'PRD',
      flags: [],
    };
  }

  return buildPortaScoreFromFeeds(normalizedContent);
}
