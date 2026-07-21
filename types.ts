export enum Sender {
  User = 'user',
  Bot = 'bot',
}

export type Feedback = 'up' | 'down';

export type FeedbackScope = 'message' | 'section' | 'error';

export type FeedbackReason = 'generic' | 'no_evidence' | 'wrong_info' | 'not_actionable' | 'too_long' | 'other';

export interface FeedbackSubmissionOptions {
  scope?: FeedbackScope;
  sectionKey?: string | null;
  sectionTitle?: string | null;
  reason?: FeedbackReason | null;
  metadata?: Record<string, unknown>;
}

export type ExportFormat = 'md' | 'pdf' | 'doc' | 'html';

export type ReportType = 'executive' | 'full' | 'tech';

export type WebVerificationStatus = 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable';

export type ErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'MODEL_OVERLOADED'
  | 'AUTH'
  | 'BILLING'
  | 'BAD_REQUEST'
  | 'SERVER'
  | 'PARSER'
  | 'UNKNOWN'
  | 'ABORTED'
  | 'BLOCKED_CONTENT';

export type ErrorSource = 'LLM' | 'BRASIL_API' | 'APPS_SCRIPT' | 'EXPORT' | 'PARSER' | 'UI' | 'GUARD' | 'UNKNOWN';

export interface AppError {
  code: ErrorCode;
  message: string;
  friendlyMessage: string;
  httpStatus?: number;
  retryable: boolean;
  transient: boolean;
  source: ErrorSource;
  details?: Record<string, unknown>;
}

// ===================================================================
// SCORE PORTA
// ===================================================================
export type PortaSegmento = 'PRD' | 'AGI' | 'COP';

export type PortaFlag = 'TRAD' | 'LOCK' | 'NOFIT';
export type MatchType = 'exact' | 'partial' | 'broad';

export interface ScorePortaData {
  score: number; // 0-100, score final com penalizacoes
  p: number; // 0-10
  o: number; // 0-10
  r: number; // 0-10
  t: number; // 0-10
  a: number; // 0-10
  segmento: PortaSegmento;
  flags: PortaFlag[];
  scoreBruto?: number; // 0-100, antes das penalizacoes
  justificativas?: Record<PortaDimension, string>; // Mapeia a dimensão (P, O, R, T, A) para sua justificativa
}

export const PORTA_WEIGHTS: Record<PortaSegmento, { p: number; o: number; r: number; t: number; a: number }> = {
  PRD: { p: 0.1, o: 0.25, r: 0.1, t: 0.3, a: 0.25 },
  AGI: { p: 0.15, o: 0.3, r: 0.2, t: 0.2, a: 0.15 },
  COP: { p: 0.15, o: 0.2, r: 0.25, t: 0.2, a: 0.2 },
};

export const PORTA_FLAG_PENALTIES: Record<PortaFlag, number> = {
  TRAD: 0.6,
  LOCK: 1,
  NOFIT: 0.3,
};

export type PortaDimension = 'P' | 'O' | 'R' | 'T' | 'A';

export interface PortaFeedAdjustment {
  source: string;
  dimension: PortaDimension;
  suggestedValue: number; // 0-10
  justification: string;
  subScores?: Record<string, number>;
  metadata?: Record<string, string>;
  timestamp: number;
}

export interface PortaFlagFeed {
  source: string;
  flag: PortaFlag;
  active: boolean;
  justification: string;
  timestamp: number;
}

export interface PortaSegmentFeed {
  source: string;
  segmento: PortaSegmento;
  justification: string;
  timestamp: number;
}

export interface PortaState {
  empresa: string;
  sessionId: string;
  baseScore: ScorePortaData | null;
  baseScoreTimestamp: number | null;
  feedAdjustments: PortaFeedAdjustment[];
  flagFeeds: PortaFlagFeed[];
  segmentFeeds: PortaSegmentFeed[];
  consolidatedScore: ScorePortaData | null;
  lastConsolidatedAt: number | null;
}

export const DEEP_DIVE_SOURCES = {
  RAIO_X: 'RAIO_X_OPERACIONAL',
  TECH: 'TECH_STACK',
  COMPLIANCE: 'RISCOS_COMPLIANCE',
  EXPANSAO: 'RADAR_EXPANSAO',
  RH: 'RH_SINDICATOS',
  DECISORES: 'MAPEAMENTO_DECISORES',
  ORCAMENTO: 'ORCAMENTO_JANELA',
} as const;

export interface ParsedContent {
  text: string;
  statuses: string[];
  scorePorta: ScorePortaData | null;
}

export interface Message {
  id: string;
  sender: Sender;
  text: string;
  timestamp: Date;
  isThinking?: boolean;
  loadingVariant?: 'hero' | 'inline';
  isDeepDiveResult?: boolean;
  groundingSources?: Array<{
    title: string;
    url: string;
    verification?: 'grounding' | 'fallback';
  }>;
  feedback?: Feedback;
  sectionFeedback?: Record<string, Feedback>;
  suggestions?: string[];
  isRegeneratingSuggestions?: boolean;
  isError?: boolean;
  errorDetails?: AppError;
  isSourcesOpen?: boolean;
  // NOVO: Score PORTA
  scorePorta?: ScorePortaData;
  // NOVO: Statuses extraídos
  statuses?: string[];
  // NOVO: Detalhes técnicos do ghost message (stream timeout)
  ghostDetails?: string;
  // NOVO: Dados de Cliente Senior (Lookup)
  clienteSeniorData?: ClienteSeniorData;
  /**
   * false = fallback silencioso foi acionado (grounding falhou, resposta gerada sem busca web).
   * true  = grounding funcionou normalmente com chunks retornados.
   * undefined = grounding não era aplicável nesta mensagem (thinking mode, megaprompt, deep dive).
   */
  groundingUsed?: boolean;
  webVerificationStatus?: WebVerificationStatus;
}

export interface ClienteSeniorData {
  encontrado: boolean;
  matchType?: MatchType;
  grupo?: string;
  totalModulos?: number;
  familias?: string[];
  familiasAusentes?: string[];
  modulosPorFamilia?: Record<string, string[]>;
  temErp?: boolean;
  temHcm?: boolean;
  temGatec?: boolean;
  temLogistica?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  empresaAlvo: string | null;
  cnpj: string | null;
  modoPrincipal: string | null;
  scoreOportunidade: number | null;
  resumoDossie: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  // NOVO: Contexto da empresa
  companyContext?: string;
}

export interface LastAction {
  type: 'sendMessage' | 'regenerateSuggestions';
  payload: { text?: string; displayText?: string; messageId?: string };
}

export interface RunMegaPromptWaterfallArgs {
  sessionId: string;
  text: string;
  safeVisibleText: string;
  hintedCompany: string | null;
  normalizedCompany: string;
  historyToPass: Message[];
  botMessageId: string;
  signal: AbortSignal;
  isFirstInteraction: boolean;
  sessionCnpjDigits: string;
  // Cost tracking (optional — waterfall may not have all fields)
  operatorId?: string;
  operatorEmail?: string;
  operatorSessionId?: string;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatInterfaceProps {
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onDeepDive: (
    displayMessage: string,
    hiddenPrompt: string,
    forcedCompanyName?: string,
    cnpj?: string | null,
  ) => Promise<void>;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  onSendMessage: (text: string, displayText?: string, hintedCompanyOverride?: string | null) => void;
  onFeedback: (messageId: string, feedback: Feedback) => void;
  onSendFeedback: (
    messageId: string,
    feedback: Feedback,
    comment: string,
    content: string,
    options?: FeedbackSubmissionOptions,
  ) => void;
  onSectionFeedback: (messageId: string, sectionTitle: string, feedback: Feedback) => void;
  onLoadMore: () => void;
  onExportConversation: (format: ExportFormat, reportType: ReportType) => void;
  onExportPDF: () => void;
  onExportMessage: (messageId: string) => void;
  onRetry: () => void;
  onClearChat: () => void;
  onRegenerateSuggestions: (messageId: string) => void;
  onStop?: () => void;
  onReportError?: (messageId: string, error: AppError) => void;
  onSaveRemote: () => void;
  isSavingRemote: boolean;
  remoteSaveStatus: 'idle' | 'success' | 'error';
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onToggleMessageSources: (messageId: string) => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
  exportError: string | null;
  pdfReportContent: string | null;
  onOpenEmailModal: () => void;
  onOpenFollowUpModal: () => void;
  canDeepDive?: boolean;
  onClearOperator: () => void;
  lastUserQuery?: string;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
  };
  loadingVariant?: 'hero' | 'inline';
  loadingPinnedLabel?: string | null;
  // Deletar mensagem do usuário
  onDeleteMessage?: (id: string) => void;
}

// ===================================================================
// RADAR COMPETITIVO & SETORIAL
// ===================================================================

export type RadarCategory = 'concorrentes' | 'regulatorio' | 'mercado' | 'ma_expansao' | 'agro_tech' | 'rh_trabalho';

export const RADAR_CATEGORY_LABELS: Record<RadarCategory, string> = {
  concorrentes: 'Radar da Concorrência',
  regulatorio: 'Regulatório & Compliance',
  mercado: 'Mercado & Commodities',
  ma_expansao: 'M&A & Expansão',
  agro_tech: 'Inovação & AgTech',
  rh_trabalho: 'RH & Trabalhista',
};

export const RADAR_CATEGORY_ICONS: Record<RadarCategory, string> = {
  concorrentes: '⚔️',
  regulatorio: '📋',
  mercado: '📈',
  ma_expansao: '🏢',
  agro_tech: '💡',
  rh_trabalho: '👥',
};

export const RADAR_CATEGORY_COLORS: Record<RadarCategory, string> = {
  concorrentes: 'bg-red-500/15 text-red-600 dark:text-red-400',
  regulatorio: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  mercado: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  ma_expansao: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  agro_tech: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  rh_trabalho: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
};

export const BRASIL_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

export type BrasilUF = (typeof BRASIL_UFS)[number];

export interface RadarAlert {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceName: string;
  category: RadarCategory;
  relevance: 'alta' | 'media' | 'baixa';
  impacto?: 'oportunidade' | 'ameaca' | 'vulnerabilidade' | 'neutro';
  estagio?: 'fato_consumado' | 'sinal_fraco';
  publishedAt: string;
  scannedAt: string;
  estado?: string;
  read?: boolean;
}

export interface RadarConfig {
  enabled: boolean;
  isConfigured: boolean;
  categories: RadarCategory[];
  estados: string[];
  scanIntervalHours: number;
}

export const DEFAULT_RADAR_CONFIG: RadarConfig = {
  enabled: false,
  isConfigured: false,
  categories: [],
  estados: [],
  scanIntervalHours: 12,
};
