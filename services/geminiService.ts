import {
  AppError,
  DEEP_DIVE_SOURCES,
  Message,
  ParsedContent,
  PortaFeedAdjustment,
  PortaFlag,
  PortaFlagFeed,
  PortaSegmentFeed,
  PortaSegmento,
  ReportType,
  ScorePortaData,
  Sender,
  ClienteSeniorData,
} from '../types';
import { NOME_VENDEDOR_PLACEHOLDER } from '../constants';
import { normalizeAppError } from '../utils/errorHelpers';
import { withAutoRetry } from '../utils/retry';
import { parsePortaMarkerV2, stripPortaMarkers } from '../utils/porta';
import {
  lookupCliente,
  formatarParaPrompt,
  benchmarkClientes,
  formatarBenchmarkParaPrompt,
  isConcorrenteOuPropria,
  BenchmarkResponse,
  LookupResponse,
  formatarComexParaPrompt,
} from './clientLookupService';
import { addInvestigation } from './investigationStore';
import { CompetitorDetection, getContextoConcorrentesRegionais } from './competitorService';
import { buscarContextoPinecone, buscarContextoDocsPinecone } from './ragService';
import { buildLoadingCuriositiesFallback, parseLoadingCuriosities } from '../utils/loadingCuriosities';
import { extractClienteSeniorData } from '../utils/seniorEvidence';
import { applyPromptLeakShield, sanitizeLoadingContextText, stripInternalMarkers } from '../utils/textCleaners';
import { proxyChatSendMessage, proxyGenerateContent } from './geminiProxy';
import { BACKEND_URL } from './apiConfig';
import {
  addFeedAdjustment,
  addFlagFeed,
  addSegmentFeed,
  generatePortaContextForDeepDive,
  getPortaState,
  initPortaState,
  resetPortaState,
  setBaseScore,
} from './portaStateService';
export { getPortaState, resetPortaState, initPortaState };
import { scoutDiag } from '../utils/diagnosticLog';

export { parsePortaMarkerV2 } from '../utils/porta';

export interface GeminiRequestOptions {
  useGrounding?: boolean;
  thinkingMode?: boolean;
  useOpenWebSearch?: boolean;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onStatus?: (status: string) => void;
  onScorePorta?: (score: ScorePortaData) => void;
  onCompetitor?: (detection: CompetitorDetection) => void;
  onRagFailed?: () => void;
  nomeVendedor?: string;
  sessionId?: string;
  hintedCompany?: string | null;
}

export interface SpotterExtractedData {
  companyName?: string;
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  contactPhone?: string;
  segment?: string;
  size?: string;
  pains?: string[];
  currentSystems?: string[];
  summary?: string;
}

import { MODEL_IDS } from '../config/models';

const ROUTER_MODEL_ID = MODEL_IDS.router;
const TACTICAL_MODEL_ID = MODEL_IDS.tactical;
const DEEP_CHAT_MODEL_ID = MODEL_IDS.deepChat;
const STABLE_RESEARCH_MODEL_ID = MODEL_IDS.deepResearch;
const LOADING_CURIOSITY_MODEL_ID = MODEL_IDS.router;
const OPEN_QUESTION_RECOVERY_METRIC_KEY = 'scout360_open_question_recovery_count';
const RECOVERY_DEBUG_FLAG_KEY = 'scout360_debug_recovery';

// ─── Status granulares emitidos durante o dossiê ─────────────────────────────
const DOSSIE_STATUS = {
  intent: 'Capturando intenção tática da consulta...',
  complexity: 'Avaliando profundidade da infraestrutura...',
  context: 'Consolidando perímetro da conta alvo...',
  history: 'Recuperando inteligência de conversas anteriores...',
  enrichment: 'Enriquecendo sinais e contexto comercial estratégico...',
  prompt: 'Orquestrando protocolo de investigação forense...',
  cadastral: 'Rastreando registros cadastrais e fiscais...',
  rag: 'Consultando base de inteligência Senior...',
  concorrentes: 'Mapeando ecossistema competitivo regional...',
  benchmark: 'Auditando referências e contrapartidas de mercado...',
  deepResearch: 'Infiltrando em fontes externas e sinais digitais...',
  corporate: 'Desconstruindo teia societária e holdings...',
  tech: 'Analisando stack tecnológico e legados digitais...',
  compliance: 'Escaneando riscos fiscais e compliance SEFAZ...',
  rh: 'Mapeando centro de gravidade: Decisores e RH...',
  logistica: 'Investigando malha logística e supply chain...',
  scoring: 'Calibrando Score PORTA contra o setor...',
  model: 'Processando em motores de inferência tática...',
  validation: 'Validando integridade e consistência dos achados...',
  synthesis: 'Sintetizando narrativa executiva de alto impacto...',
  finalReview: 'Auditando consistência final da entrega...',
  response: 'Materializando recomendações práticas...',
  hooks: 'Preparando ganchos para fechamento...',
  consolidando: 'Consolidando dossiê de inteligência final...',
} as const;

const CONTINUITY_SYSTEM = `
Você é o estrategista de continuidade do 🦅 Senior Scout 360.
Sua missão é criar ganchos comerciais que forcem o cliente a admitir um gap de gestão ou tecnologia.

DIRETRIZES DE PENSAMENTO:
1. ANCORAGEM OBRIGATÓRIA: Cada pergunta deve conter ao menos UM dado específico do contexto.
2. FOCO EM VENDAS (SENIOR): Direcione para sistemas: ERP, HCM, WMS ou GATec.
3. ESTILO "SNIPER": Se o contexto diz que a empresa cresceu, pergunte sobre o caos que isso gera.

PROIBIÇÕES:
- PROIBIDO: Iniciar perguntas com "Como você..." (muito vago).
- PROIBIDO: Perguntas genéricas que sirvam para qualquer empresa.

Responda EXCLUSIVAMENTE em Português (Brasil) usando um Array JSON de strings.
`;

// ─── FIX: Remove blocos de benchmark do histórico enviado ao Gemini.
// Impede que o modelo confunda clientes similares (ex: CORREIOS) listados
// como referência de mercado com a empresa investigada na conversa atual.
const BENCHMARK_HISTORY_STRIP_REGEX =
  /## 🏷️ CLIENTES SIMILARES PARA REFERÊNCIA[\s\S]*?(?=\n##|\n\[|$)/g;

function sanitizeHistoryText(text: string): string {
  return sanitizeStreamText(text)
    .replace(BENCHMARK_HISTORY_STRIP_REGEX, '')
    .trim();
}

// ─── GUARD: nomes genéricos/placeholder que NÃO devem ir para o benchmark ────
// Evita consultas inúteis à planilha e retornos como CORREIOS quando
// empresaAlvo ainda não foi resolvida (ex: 1ª passada sem hintedCompany).
const BENCHMARK_NAME_BLOCKLIST =
  /^(empresa|empresas|companhia|cia|cliente|clientes|alvo|investigada|unknown|undefined|null|empresa\s+n[aã]o\s+identificada|a\s+empresa|nova\s+investiga[cç][aã]o)$/i;

function isValidEmpresaParaBenchmark(name: string | null): boolean {
  if (!name || name.trim().length < 3) return false;
  return !BENCHMARK_NAME_BLOCKLIST.test(name.trim());
}

function isRecoveryDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.localStorage.getItem(RECOVERY_DEBUG_FLAG_KEY) === '1' ||
      window.localStorage.getItem(RECOVERY_DEBUG_FLAG_KEY) === 'true'
    );
  } catch {
    return false;
  }
}

function debugRecovery(stage: string, payload: Record<string, unknown>): void {
  if (!isRecoveryDebugEnabled()) return;
  try { console.info(`[RecoveryDebug] ${stage}`, payload); } catch { /* no-op */ }
}

function sanitizeStreamText(text: string): string {
  return stripInternalMarkers(stripPortaMarkers(text));
}

function normalizeGroundingSources(response: unknown): Array<{ title: string; url: string }> {
  const out: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();

  const pushIfValid = (title: unknown, url: unknown) => {
    const normalizedUrl = typeof url === 'string' ? url.trim() : '';
    if (!/^https?:\/\//i.test(normalizedUrl)) return;
    if (seen.has(normalizedUrl)) return;
    seen.add(normalizedUrl);
    out.push({
      title: (typeof title === 'string' && title.trim()) || normalizedUrl,
      url: normalizedUrl,
    });
  };

  const r = (response || {}) as {
    sources?: unknown[];
    groundingChunks?: unknown[];
  };

  if (Array.isArray(r.sources)) {
    for (const item of r.sources) {
      const src = item as { title?: unknown; url?: unknown };
      pushIfValid(src.title, src.url);
    }
  }

  if (Array.isArray(r.groundingChunks)) {
    for (const chunk of r.groundingChunks) {
      const c = chunk as {
        web?: { title?: unknown; uri?: unknown; url?: unknown };
        retrievedContext?: { title?: unknown; uri?: unknown; url?: unknown };
        title?: unknown;
        uri?: unknown;
        url?: unknown;
      };
      pushIfValid(c.web?.title, c.web?.uri || c.web?.url);
      pushIfValid(c.retrievedContext?.title, c.retrievedContext?.uri || c.retrievedContext?.url);
      pushIfValid(c.title, c.uri || c.url);
    }
  }

  return out;
}

interface ParsedPortaFeeds {
  adjustments: Omit<PortaFeedAdjustment, 'timestamp'>[];
  flags: Omit<PortaFlagFeed, 'timestamp'>[];
  segments: Omit<PortaSegmentFeed, 'timestamp'>[];
}

type DeepDiveSource = (typeof DEEP_DIVE_SOURCES)[keyof typeof DEEP_DIVE_SOURCES] | 'UNKNOWN';

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
    pushAdjustment({ source, dimension, suggestedValue: value, justification: `Deep dive ${source} sugere ${dimension}=${value}`, metadata });
  }

  const tFeedRegex = /\[\[PORTA_FEED_T:(?:\[)?(\d+)(?:\])?:T1:(?:\[)?(\d+)(?:\])?:T2:(?:\[)?(\d+)(?:\])?:T3:(?:\[)?(\d+)(?:\])?(?::STACK:(?:\[)?([^\]]+)(?:\])?)?]]/g;
  while ((match = tFeedRegex.exec(content)) !== null) {
    const tFinal = clampFeedValue(Number.parseInt(match[1], 10));
    const t1 = clampFeedValue(Number.parseInt(match[2], 10));
    const t2 = clampFeedValue(Number.parseInt(match[3], 10));
    const t3 = clampFeedValue(Number.parseInt(match[4], 10));
    const stack = normalizeFeedToken(match[5]);
    pushAdjustment({ source, dimension: 'T', suggestedValue: tFinal, justification: `Deep dive ${source}: T1(stack)=${t1}, T2(dor)=${t2}, T3(liberdade)=${t3}`, subScores: { T1: t1, T2: t2, T3: t3 }, metadata: stack ? { STACK: stack } : undefined });
  }

  const aFeedRegex = /\[\[PORTA_FEED_A:(?:\[)?(\d+)(?:\])?:A1:(?:\[)?(\d+)(?:\])?:A2:(?:\[)?(\d+)(?:\])?(?::GERACAO:(?:\[)?([^\]]+)(?:\])?)?]]/g;
  while ((match = aFeedRegex.exec(content)) !== null) {
    const aFinal = clampFeedValue(Number.parseInt(match[1], 10));
    const a1 = clampFeedValue(Number.parseInt(match[2], 10));
    const a2 = clampFeedValue(Number.parseInt(match[3], 10));
    const geracao = normalizeFeedToken(match[4]);
    pushAdjustment({ source, dimension: 'A', suggestedValue: aFinal, justification: `Deep dive ${source}: A1(cultural)=${a1}, A2(timing)=${a2}, Geração=${geracao || 'N/A'}`, subScores: { A1: a1, A2: a2 }, metadata: geracao ? { GERACAO: geracao } : undefined });
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
    pushAdjustment({ source, dimension: 'P', suggestedValue: pFinal, justification: `Deep dive ${source} sugere P=${pFinal}`, metadata: Object.keys(metadata).length ? metadata : undefined });
  }

  const genericFeedRegex = /\[\[PORTA_FEED_([PORTA])(?:_[A-Z0-9]+)?:(?:\[)?(\d+)(?:\])?(?::([^\]]+))?]]/g;
  while ((match = genericFeedRegex.exec(content)) !== null) {
    const dimension = match[1] as 'P' | 'O' | 'R' | 'T' | 'A';
    const hasSpecific = result.adjustments.some(a => a.dimension === dimension);
    if (hasSpecific) continue;
    const suggestedValue = clampFeedValue(Number.parseInt(match[2], 10));
    const { subScores, metadata } = parseFeedPairs(match[3]);
    pushAdjustment({ source, dimension, suggestedValue, justification: `Deep dive ${source} sugere ${dimension}=${suggestedValue}`, subScores, metadata });
  }

  const proxyRegex = /\[\[PORTA_FEED_P_PROXY:FUNC:(?:\[)?(\d+)(?:\])?]]/g;
  while ((match = proxyRegex.exec(content)) !== null) {
    const value = normalizeFeedToken(match[1]);
    const existing = result.adjustments.find(a => a.dimension === 'P');
    if (existing) existing.metadata = { ...(existing.metadata || {}), FUNCIONARIOS: value };
  }

  const flagRegex = /\[\[PORTA_FLAG:(TRAD|LOCK|NOFIT):(?:\[)?(SIM|NAO|NÃO)(?:\])?(?::[^\]]+)?]]/g;
  while ((match = flagRegex.exec(content)) !== null) {
    result.flags.push({ source, flag: match[1] as PortaFlag, active: match[2] === 'SIM', justification: `Deep dive ${source} ${match[2] === 'SIM' ? 'ativou' : 'desativou'} flag ${match[1]}` });
  }

  const tradFlagRegex = /\[\[PORTA_FLAG:TRAD:(?:\[)?(SIM|NAO|NÃO)(?:\])?:NATUREZA:(?:\[)?(PRODUCAO|TRADING|MISTA)(?:\])?]]/g;
  while ((match = tradFlagRegex.exec(content)) !== null) {
    result.flags = result.flags.filter(flag => flag.flag !== 'TRAD');
    result.flags.push({ source, flag: 'TRAD', active: match[1] === 'SIM', justification: `Natureza da receita: ${match[2]}` });
  }

  const segmentRegex = /\[\[PORTA_SEG:(?:\[)?(PRD|AGI|COP)(?:\])?]]/g;
  while ((match = segmentRegex.exec(content)) !== null) {
    result.segments.push({ source, segmento: match[1] as PortaSegmento, justification: `Deep dive ${source} inferiu segmento ${match[1]}` });
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

function isDeepDiveMessage(message: string, isMegaPromptMessage: boolean): boolean {
  if (!isMegaPromptMessage) return false;
  const deepDiveHints = [
    'INTELIGÊNCIA OPERACIONAL',
    'ARQUITETURA DE TI',
    'COMPLIANCE, RISCO FISCAL',
    'TEIA SOCIETÁRIA',
    'RH, SST E GESTÃO DE PESSOAS',
    'CADEIA DE COMANDO',
    'ORÇAMENTO E JANELA DE COMPRA',
  ];
  return deepDiveHints.some(hint => message.includes(hint));
}

export function isMegaPromptRequest(userMessage: string, systemPrompt: string): boolean {
  const combined = `${systemPrompt}\n${userMessage}`.toUpperCase();
  return (
    combined.includes('INVESTIGACAO_COMPLETA_INTEGRADA') ||
    combined.includes('DOSSIE_COMPLETO') ||
    combined.includes('DOSSIE COMPLETO DE [') ||
    combined.includes('DOSSIÊ COMPLETO DE [') ||
    combined.includes('PROTOCOLO DE INVESTIGACAO FORENSE ESPECIALIZADA') ||
    combined.includes('PROTOCOLO DE INVESTIGAÇÃO FORENSE ESPECIALIZADA')
  );
}

function getDeepDiveSource(message: string): DeepDiveSource {
  if (message.includes('INTELIGÊNCIA OPERACIONAL') || message.includes('Raio-X')) return DEEP_DIVE_SOURCES.RAIO_X;
  if (message.includes('ARQUITETURA DE TI') || message.includes('Tech Stack')) return DEEP_DIVE_SOURCES.TECH;
  if (message.includes('COMPLIANCE') || message.includes('RISCOS')) return DEEP_DIVE_SOURCES.COMPLIANCE;
  if (message.includes('TEIA SOCIETÁRIA') || message.includes('M&A')) return DEEP_DIVE_SOURCES.EXPANSAO;
  if (message.includes('RH, SST') || message.includes('SINDICATOS')) return DEEP_DIVE_SOURCES.RH;
  if (message.includes('CADEIA DE COMANDO') || message.includes('DECISORES')) return DEEP_DIVE_SOURCES.DECISORES;
  if (message.includes('ORÇAMENTO') || message.includes('JANELA DE COMPRA')) return DEEP_DIVE_SOURCES.ORCAMENTO;
  return 'UNKNOWN';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function enforceOpeningWithSeller(rawText: string, nomeVendedor: string): string {
  if (!rawText) return rawText;
  const sellerName = (nomeVendedor || '').trim() || 'Vendedor';
  const withSellerName = rawText.replace(/\{\{\s*NOME_VENDEDOR\s*\}\}/gi, sellerName);
  const firstLine = withSellerName.split('\n')[0]?.trim();
  if (!firstLine) return withSellerName;
  const firstName = sellerName.split(' ')[0] || sellerName;
  const hasSellerName = new RegExp(escapeRegExp(firstName), 'i').test(firstLine);
  if (hasSellerName) return withSellerName;
  return withSellerName;
}

function looksLikeMissedOpenQuestionAnswer(text: string): boolean {
  if (!text) return false;
  return /((seu|sua)?\s*comando(\s+atual)?\s+veio\s+(vazi[ao]|em\s+branco)|comando\s+de\s+busca\s+veio\s+vazio|(sua\s+)?mensagem(\s+atual)?\s+veio\s+(vazi[ao]|em\s+branco)|sem\s+direcionamento(\s+espec[ií]fico)?|(digite|mande)\s+sua\s+d[uú]vida\s+espec[ií]fica|n[aã]o\s+enviou\s+um\s+novo\s+comando|radar\s+est[aá]\s+em\s+stand-?by|basta\s+mandar\s+o\s+nome\s+da\s+pr[oó]xima\s+empresa|n[aã]o\s+continha\s+texto\s+v[aá]lido|apenas\s+pontua[cç][õo]es|somente\s+pontua[cç][õo]es|n[aã]o\s+recebi\s+um\s+comando\s+claro|n[aã]o\s+ficou\s+claro\s+o\s+pedido|faltou\s+um\s+comando\s+claro|n[aã]o\s+conteve\s+uma\s+pergunta\s+clara|n[aã]o\s+continha\s+uma\s+pergunta\s+clara|n[aã]o\s+havia\s+uma\s+pergunta\s+clara|n[aã]o\s+entendi\s+o\s+que\s+voc[eê]\s+quis\s+(pedir|solicitar))/i.test(text);
}

async function shouldRecoverOpenQuestionByJudge(
  question: string,
  answer: string,
  confidenceThreshold: number = 0.55,
): Promise<boolean> {
  if (!question.trim() || !answer.trim()) return false;
  try {
    const response = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: `Você é um validador de alinhamento entre PERGUNTA e RESPOSTA.\n\nPERGUNTA:\n"${question}"\n\nRESPOSTA:\n"${answer.slice(0, 2500)}"\n\nRetorne EXCLUSIVAMENTE JSON:\n{\n  "shouldRetry": boolean,\n  "confidence": number,\n  "reason": "..."\n}\n\nUse shouldRetry=true quando a RESPOSTA:\n- não responde objetivamente a pergunta;\n- desvia para outro tema;\n- responde uma pergunta anterior;\n- diz que mensagem/comando veio vazio sem a pergunta estar vazia;\n- diz que faltou comando claro, texto válido ou direcionamento quando a pergunta é substantiva.`,
      config: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 400 },
    });
    const parsed = JSON.parse(
      (response.text || '{}')
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim(),
    );
    const confidence = Number(parsed?.confidence ?? 0);
    debugRecovery('judge-result', { shouldRetry: parsed?.shouldRetry, confidence, reason: parsed?.reason, threshold: confidenceThreshold });
    return parsed?.shouldRetry === true && confidence >= confidenceThreshold;
  } catch {
    return false;
  }
}

function emitDossieStatus(
  onStatus: ((s: string) => void) | undefined,
  key: keyof typeof DOSSIE_STATUS,
): void {
  onStatus?.(DOSSIE_STATUS[key]);
}

function buildConversationHistory(
  conversationHistory: Message[],
  isDeepDive: boolean,
): Array<{ role: 'user' | 'model'; text: string }> {
  const validMessages = conversationHistory.filter(m => m.text && m.text.trim().length > 0);
  const sourceMessages = isDeepDive
    ? validMessages.filter(m => m.sender === Sender.User).slice(-4)
    : validMessages;

  return sourceMessages.map(m => ({
    role: m.sender === Sender.User ? ('user' as const) : ('model' as const),
    text: sanitizeHistoryText(m.text || ''),
  }));
}

function buildTimeoutError(label: string, timeoutMs: number): Error {
  const error = new Error(`${label} timeout after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  return error;
}

async function runWithStepTimeout<T>(
  label: string,
  action: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<T> {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return action(signal);
  }

  const timeoutController = new AbortController();
  const relayAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', relayAbort, { once: true });

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      timeoutController.abort();
      reject(buildTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([action(timeoutController.signal), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    signal?.removeEventListener('abort', relayAbort);
  }
}

export async function generateLoadingCuriosities(
  loadingContext: string,
  searchQuery: string,
): Promise<string[]> {
  const safeContext = sanitizeLoadingContextText(loadingContext || '');
  const fallback = buildLoadingCuriositiesFallback(safeContext);
  const querySample = (searchQuery || '').slice(0, 240);

  const locationFromCadastro = querySample.match(/Cidade\s*=\s*([^;,\n]+)\s*;\s*UF\s*=\s*([A-Za-z]{2})/i);
  const locationFromNaturalText = querySample.match(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'`\-. ]{2,40})\s*[-/]\s*([A-Za-z]{2})\b/);
  const onlyUf = querySample.match(/\bUF\s*[:=]\s*([A-Za-z]{2})\b/i);

  const city = (locationFromCadastro?.[1] || locationFromNaturalText?.[1] || '').trim();
  const uf = (locationFromCadastro?.[2] || locationFromNaturalText?.[2] || onlyUf?.[1] || '').trim().toUpperCase();
  const regionalScope = city && uf ? `${city}/${uf}` : uf ? `UF ${uf}` : '';

  const regionalLine = regionalScope
    ? `- Curiosidades de mercado regional coerentes com a localização da empresa (${regionalScope})`
    : '- Sem localização explícita: usar curiosidades gerais do mercado brasileiro';

  const regionalRule = regionalScope
    ? `- Use contexto regional coerente com ${regionalScope}, sem presumir Mato Grosso/Centro-Oeste`
    : '- Não presumir MT/Centro-Oeste quando a localização não estiver explícita';
  try {
    const prompt = `Você é um gerador de mensagens de alto impacto (Sniper) para tela de carregamento de uma ferramenta de inteligência comercial chamada Senior Scout 360.
Contexto da investigação: "${safeContext}"
Consulta original: "${querySample}"

Gere um array JSON com 7 a 9 frases extremamente impactantes e informativas (máximo 180 caracteres cada), em português-BR, seguindo RIGOROSAMENTE esta proporção:
- [75% dos itens] FOCO NO SCOUT: Ações de "investigação profunda" que o Scout está realizando sobre a empresa "${safeContext}". Use verbos fortes e de inteligência: "Rastreando", "Desconstruindo", "Infiltrando", "Escaneando", "Expondo". Foque na sensação de que o Scout está descobrindo segredos operacionais valiosos.
- [25% dos itens] FOCO EM INOVAÇÃO SENIOR: Curiosidades de autoridade e diferenciação da Senior Sistemas ou inovações tecnológicas de ponta (IA, Agtech, Logtech).

Exemplos de tom desejado:
- "O Scout está agora cruzando dados de exportação com o histórico da Logística para expor gargalos ocultos no supply chain."
- "Desconstruindo a teia societária para identificar os reais centros de poder e influência na tomada de decisão."
- "Sabia? A tecnologia Senior orquestra os processos críticos de 1 em cada 4 grandes empresas do país."

Regras:
- Responda EXCLUSIVAMENTE com um array JSON de strings
- Tom: Premium, Executivo, Inteligência de Guerra
- No Scout: Sempre cite o nome da empresa se disponível
- Na inovação Senior: Foque em autoridade e escala nacional
${regionalLine}
${regionalRule}`;
    try {
      const flashResponse = await proxyGenerateContent({
        model: LOADING_CURIOSITY_MODEL_ID,
        contents: prompt,
        config: { temperature: 0.6, maxOutputTokens: 900 },
      });
      const parsed = parseLoadingCuriosities(flashResponse.text || '', safeContext);
      if (parsed.length > 0) return parsed;
    } catch {
      // fallback para o roteador atual quando o modelo Flash dedicado estiver indisponível
    }

    const routerResponse = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: prompt,
      config: { temperature: 0.6, maxOutputTokens: 900 },
    });
    return parseLoadingCuriosities(routerResponse.text || '', safeContext);
  } catch {
    return fallback;
  }
}

export async function generateContinuityQuestion(
  messages: Message[],
  empresaAlvo: string | null,
  nomeVendedor: string,
): Promise<string[]> {
  const recentMessages = messages
    .slice(-6)
    .map(m => `${m.sender === Sender.User ? 'Vendedor' : 'Scout'}: ${m.text?.slice(0, 300) || ''}`)
    .join('\n');
  const contextNote = empresaAlvo ? `Empresa em análise: ${empresaAlvo}` : '';
  const systemPrompt = CONTINUITY_SYSTEM;
  const userPrompt = `${contextNote}\n\nHistórico recente:\n${recentMessages}\n\nGere 4 perguntas de continuidade estratégica para o vendedor ${nomeVendedor} usar na próxima interação. Responda como array JSON de strings.`;
  try {
    const response = await proxyGenerateContent({
      model: ROUTER_MODEL_ID,
      contents: userPrompt,
      config: { temperature: 0.8, maxOutputTokens: 800, systemInstruction: systemPrompt },
    });
    const raw = (response.text || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

/**
 * Envia uma mensagem para o Gemini e retorna a resposta processada.
 *
 * @param userMessage    - Texto da mensagem do usuário (pode ser megaprompt)
 * @param conversationHistory - Histórico da conversa atual
 * @param systemPrompt   - System instruction do modo ativo
 * @param options        - Opções de request (streaming, callbacks, hints)
 * @param canUseLookup   - Se false, o lookup na planilha Senior é bloqueado (controle de acesso)
 */
export async function sendMessageToGemini(
  userMessage: string,
  conversationHistory: Message[],
  systemPrompt: string,
  options: GeminiRequestOptions = {},
  canUseLookup: boolean = true,
): Promise<{
  text: string;
  sources?: Array<{ title: string; url: string }>;
  suggestions?: string[];
  scorePorta?: ScorePortaData | null;
  clienteSeniorData?: ClienteSeniorData;
  ghostReason?: string | null;
}> {
  const {
    useGrounding = true,
    thinkingMode = false,
    useOpenWebSearch = false,
    signal,
    onText,
    onStatus,
    onScorePorta,
    onCompetitor,
    onRagFailed,
    nomeVendedor = 'Vendedor',
    sessionId,
    hintedCompany = null,
  } = options;

  if (signal?.aborted) throw new Error('AbortError');
  emitDossieStatus(onStatus, 'intent');
  emitDossieStatus(onStatus, 'complexity');

  // ── Detecção de empresa alvo ─────────────────────────────────────────────
  let empresaAlvo: string | null = hintedCompany || null;
  const cnpjMatch = userMessage.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})\b/);
  const cnpjDetected = cnpjMatch?.[1]?.replace(/\D/g, '') || null;
  let clienteData: LookupResponse | null = null;
  let benchmarkData: BenchmarkResponse | null = null;
  let clienteSeniorData: ClienteSeniorData | undefined;
  let comexData: any = null;
  emitDossieStatus(onStatus, 'context');
  emitDossieStatus(onStatus, 'enrichment');

  // ── Contexto RAG ────────────────────────────────────────────────────────
  let ragContext = '';
  let ragDocsContext = '';

  const portaSessionId = sessionId || 'session-unknown';
  const isMegaPromptMessage = isMegaPromptRequest(userMessage, systemPrompt);
  const isDeepDive = isDeepDiveMessage(userMessage, isMegaPromptMessage);
  const deepDiveSource = isDeepDive ? getDeepDiveSource(userMessage) : 'UNKNOWN';
  const shouldForceDirectAnswer = isMegaPromptMessage && !isDeepDive;
  const hasActiveContextHint = !!empresaAlvo || !!cnpjDetected || isMegaPromptMessage;

  // ── CIRURGIA 2: Extração do nome diretamente do megaprompt na 1ª passada ──
  // Quando empresaAlvo ainda é null (sem hintedCompany), o nome real da empresa
  // já está embutido no userMessage no padrão "Dossiê completo de [NOME]".
  // Isso garante que o lookup funcione na 1ª passada sem depender da sessão.
  if (!empresaAlvo && isMegaPromptMessage) {
    const nameFromMegaprompt = userMessage.match(
      /dossi[eê]\s+completo\s+de\s+\[?([A-ZÀ-Úa-zà-ú][^\]\n]{2,80})\]?/i,
    )?.[1]?.trim();
    if (nameFromMegaprompt && isValidEmpresaParaBenchmark(nameFromMegaprompt)) {
      empresaAlvo = nameFromMegaprompt;
      scoutDiag.info?.('EmpresaAlvo', 'extraído do megaprompt na 1ª passada', { empresaAlvo });
    }
  }

  // FIX: A planilha de clientes Senior é indexada por NOME, nunca por CNPJ.
  // targetCompanyForLookup usa apenas empresaAlvo (nome).
  // cnpjDetected é mantido separado para enriquecimento via BrasilAPI/Comex.
  // Se o usuário digitou apenas CNPJ (empresaAlvo=null), o lookup será tentado
  // após a resolução do nome via clienteData.nome mais abaixo no fluxo.
  // GUARD: só define targetCompanyForLookup se o usuário tiver permissão (canUseLookup).
  let targetCompanyForLookup: string | null = canUseLookup ? (empresaAlvo ?? null) : null;

  if (canUseLookup && !targetCompanyForLookup && isDeepDive && conversationHistory.length > 0) {
    // Em deep dive sem empresa alvo, tenta recuperar o nome do histórico
    const previousTargetMsg = [...conversationHistory]
      .reverse()
      .find(m => m.sender === Sender.User && m.text?.includes('DOSSIÊ'));
    if (previousTargetMsg) {
      // Tenta extrair o nome da empresa do histórico (busca por padrão "de [NOME]")
      const nameMatch = previousTargetMsg.text.match(/(?:DOSSIÊ|DOSSIE)\s+(?:COMPLETO\s+)?(?:DE\s+)?\[?([A-ZÀ-Ú][^\]\n]{2,60})\]?/i);
      if (nameMatch?.[1]) targetCompanyForLookup = nameMatch[1].trim();
    }
  }

  // ── Consultas Paralelas (Lookup Cliente Senior + Comex Stat) ─────────────
  if (targetCompanyForLookup) {
    emitDossieStatus(onStatus, 'cadastral');
    console.log('[LOOKUP 🔍] Iniciando lookup para:', targetCompanyForLookup);
    try {
      const lookupPromises: Promise<any>[] = [lookupCliente(targetCompanyForLookup)];

      const cleanCnpj = cnpjDetected || '';
      if (cleanCnpj.length === 14) {
        // TODO: A API /api/comex atual usa um mock determinístico para simular exportadores.
        // Descomente abaixo quando a base oficial do MDIC estiver disponível.
        /*
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const comexPromise = fetch(`${origin}/api/comex?cnpj=${cleanCnpj}`)
          .then(res => res.json())
          .catch(() => null);
        lookupPromises.push(comexPromise);
        */
      }

      const results = await Promise.allSettled(lookupPromises);

      if (results[0].status === 'rejected') {
        scoutDiag.error('Cadastral', 'lookupCliente rejeitado', {
          target: String(targetCompanyForLookup).slice(0, 80),
          reason: String((results[0] as PromiseRejectedResult).reason),
        });
      } else if (results[0].status === 'fulfilled' && results[0].value) {
        clienteData = results[0].value;
        // @ts-ignore
        if (clienteData?.nome && !empresaAlvo) empresaAlvo = clienteData.nome;

        if (clienteData?.error) {
          scoutDiag.warn('Cadastral', 'lookup com falha técnica ou resposta inválida', {
            query: clienteData.query,
            error: clienteData.error,
            ok: clienteData.ok,
            encontrado: clienteData.encontrado,
          });
        }

        if (clienteData?.results && clienteData.results.length > 0) {
          clienteSeniorData = extractClienteSeniorData(clienteData);
        }

        console.log('[LOOKUP 🔍] Resultado:', {
          encontrado: clienteData?.encontrado,
          query: clienteData?.query,
          ok: clienteData?.ok,
          totalModulos: clienteSeniorData?.totalModulos ?? null,
        });
      }

      if (results.length > 1 && results[1].status === 'fulfilled' && results[1].value) {
        comexData = results[1].value;
      }
    } catch (err: unknown) {
      scoutDiag.error('Cadastral', 'exceção no bloco de lookup', {
        target: String(targetCompanyForLookup).slice(0, 80),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Se for Deep Dive e falhou no lookup local, tenta puxar do histórico da sessão
  if (isDeepDive && (!clienteSeniorData || !clienteSeniorData.encontrado)) {
    const previousBotMessageWithClientData = [...conversationHistory]
      .reverse()
      .find(m => m.sender === Sender.Bot && m.clienteSeniorData?.encontrado);

    if (previousBotMessageWithClientData && previousBotMessageWithClientData.clienteSeniorData) {
      clienteSeniorData = previousBotMessageWithClientData.clienteSeniorData;
    }
  }

  // ── RAG ─────────────────────────────────────────────────────────────────
  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'rag');
    try {
      const [pinecone, docs] = await Promise.all([
        buscarContextoPinecone(userMessage, empresaAlvo || ''),
        buscarContextoDocsPinecone(userMessage),
      ]);
      ragContext = pinecone.context;
      ragDocsContext = docs.context;
      if (pinecone.failed || docs.failed) onRagFailed?.();
    } catch (err: unknown) {
      scoutDiag.error('RAG', 'exceção ao buscar contexto Pinecone/docs', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Concorrentes ─────────────────────────────────────────────────────────
  let concorrentesContext = '';
  if (isMegaPromptMessage) {
    emitDossieStatus(onStatus, 'concorrentes');
    try {
      concorrentesContext = await getContextoConcorrentesRegionais(empresaAlvo || userMessage);
    } catch (err: unknown) {
      scoutDiag.warn('Concorrentes', 'falha ao montar contexto regional', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Benchmark ────────────────────────────────────────────────────────────
  // CIRURGIA 3: O benchmark foi removido do dossiê principal e isolado em 
  // uma chamada separada (Prompt Chaining) para evitar alucinações de contexto.
  // Variável e fetch retirados daqui.

  // ── Sinaliza deep research ────────────────────────────────────────────────
  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'deepResearch');
  }

  // ── Sinaliza fases do deep dive ──────────────────────────────────────────
  if (isDeepDive) {
    if (userMessage.includes('TEIA SOCIETÁRIA') || userMessage.includes('M&A')) emitDossieStatus(onStatus, 'corporate');
    if (userMessage.includes('ARQUITETURA DE TI') || userMessage.includes('Tech')) emitDossieStatus(onStatus, 'tech');
    if (userMessage.includes('COMPLIANCE') || userMessage.includes('RISCOS')) emitDossieStatus(onStatus, 'compliance');
    if (userMessage.includes('RH, SST') || userMessage.includes('DECISORES')) emitDossieStatus(onStatus, 'rh');
    if (userMessage.includes('LOGÍSTICA') || userMessage.includes('SUPPLY')) emitDossieStatus(onStatus, 'logistica');
  }

  // ── Monta contexto adicional ─────────────────────────────────────────────
  const clienteFormatado = clienteData ? formatarParaPrompt(clienteData) : '';

  const comexFormatado = comexData?.isExportador ? formatarComexParaPrompt(comexData) : '';
  const portaContext = isMegaPromptMessage ? generatePortaContextForDeepDive(deepDiveSource || 'MEGA') : '';

  const extraContext = [
    clienteFormatado,
    comexFormatado,
    ragContext ? `\n[CONTEXTO RAG]\n${ragContext}` : '',
    ragDocsContext ? `\n[DOCS RAG]\n${ragDocsContext}` : '',
    concorrentesContext ? `\n[CONCORRENTES]\n${concorrentesContext}` : '',
    portaContext ? `\n[PORTA STATE]\n${portaContext}` : '',
  ].filter(Boolean).join('\n');

  const fullSystemPrompt = extraContext
    ? `${systemPrompt}\n\n${extraContext}`
    : systemPrompt;
  emitDossieStatus(onStatus, 'context');
  emitDossieStatus(onStatus, 'prompt');

  // ── Histórico ────────────────────────────────────────────────────────────
  // FIX: usa sanitizeHistoryText (que inclui strip do bloco de benchmark)
  // para evitar que clientes similares listados na resposta anterior
  // contaminem o contexto da próxima investigação com identidade errada.
  emitDossieStatus(onStatus, 'history');
  const history = buildConversationHistory(conversationHistory, isDeepDive);
  const historyChars = history.reduce((total, item) => total + item.text.length, 0);
  const promptBudget = {
    sessionId: sessionId ?? null,
    hintedCompany: hintedCompany ?? null,
    resolvedCompany: empresaAlvo ?? null,
    modelToUse: null as string | null,
    userChars: userMessage.length,
    systemChars: fullSystemPrompt.length,
    historyChars,
    historyMessages: history.length,
    isMegaPromptMessage,
    isDeepDive,
    shouldUseGrounding: false,
  };

  // ── Score PORTA inicial ──────────────────────────────────────────────────
  if (isMegaPromptMessage) {
    resetPortaState();
    initPortaState(empresaAlvo || userMessage.slice(0, 60), portaSessionId);
  } else if (isDeepDive) {
    const current = getPortaState();
    if (!current || current.sessionId !== portaSessionId) {
      initPortaState(empresaAlvo || userMessage.slice(0, 60), portaSessionId);
    }
  }

  // ── Seleciona modelo ─────────────────────────────────────────────────────
  const modelToUse = isDeepDive
    ? STABLE_RESEARCH_MODEL_ID
    : isMegaPromptMessage
      ? STABLE_RESEARCH_MODEL_ID
      : shouldForceDirectAnswer
        ? TACTICAL_MODEL_ID
        : DEEP_CHAT_MODEL_ID;
  const shouldUseGrounding = useGrounding;
  promptBudget.modelToUse = modelToUse;
  promptBudget.shouldUseGrounding = shouldUseGrounding;

  if (isMegaPromptMessage || isDeepDive) {
    scoutDiag.info?.('GeminiBudget', 'iniciando investigação com orçamento de contexto', promptBudget);
    const totalChars = promptBudget.userChars + promptBudget.systemChars + promptBudget.historyChars;
    if (totalChars > 120000) {
      scoutDiag.warn('GeminiBudget', 'payload elevado para investigação', {
        ...promptBudget,
        totalChars,
      });
    }
  }

  // ── Envia para o modelo ──────────────────────────────────────────────────
  let finalText: string;
  emitDossieStatus(onStatus, 'model');
  emitDossieStatus(onStatus, 'response');

  let response;
  const requestStartedAt = Date.now();
  let usedGroundingFallback = false;
  try {
    response = await withAutoRetry('Gemini:sendMessage', () =>
      proxyChatSendMessage({
        model: modelToUse,
        systemInstruction: fullSystemPrompt,
        history,
        message: userMessage,
        useGrounding: shouldUseGrounding,
        thinkingMode,
        useOpenWebSearch,
      }, signal),
      { maxRetries: 5, baseDelayMs: 2000, maxDelayMs: 30000, abortSignal: signal },
    );
  } catch (error) {
    const appError = normalizeAppError(error);
    const canFallbackWithoutGrounding =
      shouldUseGrounding &&
      ['TIMEOUT', 'NETWORK', 'MODEL_OVERLOADED', 'SERVER'].includes(appError.code);

    if (!canFallbackWithoutGrounding) throw error;

    onStatus?.('Entrando em contingência sem busca externa...');
    usedGroundingFallback = true;
    response = await withAutoRetry('Gemini:sendMessage:fallback-no-grounding', () =>
      proxyChatSendMessage({
        model: TACTICAL_MODEL_ID,
        systemInstruction: fullSystemPrompt,
        history,
        message: userMessage,
        useGrounding: false,
        thinkingMode,
      }, signal),
      { maxRetries: 4, baseDelayMs: 2000, maxDelayMs: 20000, abortSignal: signal },
    );
  }

  finalText = sanitizeStreamText(response.text || '');
  const leakShieldResult = applyPromptLeakShield(finalText, {
    companyHint: empresaAlvo || hintedCompany || '',
  });
  if (leakShieldResult.blocked) {
    scoutDiag.warn('PromptLeakShield', 'resposta bloqueada por possível vazamento de prompt', {
      sessionId: sessionId ?? null,
      resolvedCompany: empresaAlvo ?? hintedCompany ?? null,
      fingerprint: leakShieldResult.fingerprint,
      indicators: leakShieldResult.indicators,
      modelToUse,
      isMegaPromptMessage,
      isDeepDive,
    });
    finalText = leakShieldResult.text;
  }
  if (isMegaPromptMessage || isDeepDive) {
    scoutDiag.info?.('GeminiTiming', 'investigação concluída', {
      sessionId: sessionId ?? null,
      resolvedCompany: empresaAlvo ?? null,
      modelToUse,
      durationMs: Date.now() - requestStartedAt,
      responseChars: finalText.length,
      usedGroundingFallback,
      isMegaPromptMessage,
      isDeepDive,
    });
  }
  emitDossieStatus(onStatus, 'validation');
  emitDossieStatus(onStatus, 'synthesis');

  // ── Sinaliza score PORTA ──────────────────────────────────────────────────
  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'scoring');
  }

  // ── Processa feeds PORTA ─────────────────────────────────────────────────
  let scorePorta: ScorePortaData | null = null;
  if (isMegaPromptMessage || isDeepDive) {
    const source = isDeepDive ? deepDiveSource : 'MEGA';
    const baseScore = parsePortaMarkerV2(response.text || '');
    if (baseScore) {
      setBaseScore(baseScore);
    }

    const feeds = parsePortaFeeds(response.text || '', source);
    for (const adj of feeds.adjustments) addFeedAdjustment(adj);
    for (const flag of feeds.flags) addFlagFeed(flag);
    for (const seg of feeds.segments) addSegmentFeed(seg);

    const portaState = getPortaState();
    if (portaState?.consolidatedScore) {
      scorePorta = portaState.consolidatedScore;
      onScorePorta?.(scorePorta);
    } else if (baseScore) {
      scorePorta = baseScore;
      onScorePorta?.(scorePorta);
    }
  }

  // ── Detecção de concorrente no fluxo ─────────────────────────────────────
  if (onCompetitor && finalText) {
    try {
      const isCompetitor = isConcorrenteOuPropria(finalText);
      if (isCompetitor) {
        onCompetitor({ encontrado: true, detected: true, names: ['Concorrente Detectado'] });
      }
    } catch { /* silencioso */ }
  }

  // ── Consolida e emite status final ───────────────────────────────────────
  if (isMegaPromptMessage || isDeepDive) {
    emitDossieStatus(onStatus, 'consolidando');
  }

  // ── Streaming simulado via onText ────────────────────────────────────────
  if (onText && finalText) {
    onText(finalText);
  }
  emitDossieStatus(onStatus, 'finalReview');
  emitDossieStatus(onStatus, 'hooks');

  // ── Recovery de perguntas abertas ────────────────────────────────────────
  const shouldRecoverByFallback = looksLikeMissedOpenQuestionAnswer(finalText);
  debugRecovery('pre-check', {
    shouldForceDirectAnswer,
    hasActiveContextHint,
    shouldRecoverByFallback,
    finalTextSnippet: finalText.slice(0, 120),
  });

  if (shouldForceDirectAnswer && shouldRecoverByFallback) {
    const metric = Number(window?.localStorage?.getItem(OPEN_QUESTION_RECOVERY_METRIC_KEY) || 0);
    window?.localStorage?.setItem(OPEN_QUESTION_RECOVERY_METRIC_KEY, String(metric + 1));
  }

  const sources = leakShieldResult.blocked ? [] : normalizeGroundingSources(response);
  const suggestions: string[] = [];

  return {
    text: finalText,
    sources,
    suggestions,
    scorePorta: leakShieldResult.blocked ? null : scorePorta,
    clienteSeniorData: leakShieldResult.blocked ? undefined : clienteSeniorData,
    ghostReason: leakShieldResult.blocked ? 'prompt_leak_blocked' : null,
  };
}

/**
 * NOVA FUNÇÃO DE PROMPT CHAINING:
 * Gera apenas um módulo específico (Raio-X, Decisores, etc.) acoplado ao 
 * SHARED_FOUNDATION_BLOCK. Usado para orquestração sequencial (Waterfall).
 */
export async function generateDossierModule(
  moduleName: string,
  empresaAlvo: string,
  foundationBlock: string,
  specialistPrompt: string,
  extraContext: string = '',
  options: { signal?: AbortSignal; onText?: (text: string) => void; timeoutMs?: number } = {}
): Promise<string> {
  const finalPrompt = `${foundationBlock}\n\n${specialistPrompt}\n\n${extraContext}`;
  const promptChars = finalPrompt.length;
  const startedAt = Date.now();

  scoutDiag.info?.('DossierModule', 'iniciando módulo especializado', {
    moduleName,
    empresaAlvo,
    foundationChars: foundationBlock.length,
    specialistChars: specialistPrompt.length,
    extraContextChars: extraContext.length,
    promptChars,
  });
  if (promptChars > 80000) {
    scoutDiag.warn('DossierModule', 'módulo especializado com prompt elevado', {
      moduleName,
      empresaAlvo,
      promptChars,
    });
  }

  const response = await runWithStepTimeout(
    `DossierModule:${moduleName}`,
    stepSignal =>
      proxyGenerateContent({
        model: STABLE_RESEARCH_MODEL_ID, // Usando modelo de pesquisa para precisão
        contents: `Empresa alvo: ${empresaAlvo}\nGere APENAS o bloco de ${moduleName} com extrema precisão e profundidade comercial.`,
        config: { systemInstruction: finalPrompt, temperature: 0.2, maxOutputTokens: 8192 },
      }, stepSignal),
    options.signal,
    options.timeoutMs,
  );

  const shieldedResult = applyPromptLeakShield(response.text || '', { companyHint: empresaAlvo });
  if (shieldedResult.blocked) {
    scoutDiag.warn('PromptLeakShield', 'módulo do dossiê bloqueado por possível vazamento de prompt', {
      moduleName,
      empresaAlvo,
      fingerprint: shieldedResult.fingerprint,
      indicators: shieldedResult.indicators,
    });
  }
  const finalText = shieldedResult.text;
  scoutDiag.info?.('DossierModule', 'módulo especializado concluído', {
    moduleName,
    empresaAlvo,
    durationMs: Date.now() - startedAt,
    responseChars: finalText.length,
  });
  if (options.onText && finalText) options.onText(finalText);
  return finalText;
}

/**
 * BUSCA ISOLADA DE BENCHMARK:
 * Resolve o problema de alucinação 'Correios' isolando a busca de 
 * referências em uma chamada sem histórico de conversa poluído.
 */
export async function getIsolatedBenchmark(
  empresaAlvo: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<string> {
  if (!isValidEmpresaParaBenchmark(empresaAlvo)) return '';

  const benchmarkResult = await runWithStepTimeout(
    `Benchmark:Isolated:${empresaAlvo}`,
    stepSignal =>
      withAutoRetry('Benchmark:Isolated', () =>
        benchmarkClientes(empresaAlvo),
        { maxRetries: 3, abortSignal: stepSignal },
      ),
    options.signal,
    options.timeoutMs,
  );

  if (!benchmarkResult || !benchmarkResult.ok || !benchmarkResult.results?.length) return '';

  const benchmarkPrompt = formatarBenchmarkParaPrompt(benchmarkResult, empresaAlvo);

  const response = await proxyGenerateContent({
    model: TACTICAL_MODEL_ID,
    contents: `Sua tarefa é formatar Referências de Mercado Estratégicas para a empresa: ${empresaAlvo}.
Use EXCLUSIVAMENTE os dados abaixo:
${benchmarkPrompt}

Diretriz: Crie um bloco de alto impacto para o final do dossiê, listando cases similares atendidos pela Senior.`,
    config: { temperature: 0.1 }
  }, options.signal);

  return applyPromptLeakShield(response.text || '', { companyHint: empresaAlvo }).text;
}
