export enum Sender {
  User = 'user',
  Bot = 'bot',
}

export type Feedback = 'up' | 'down';

export type ExportFormat = 'md' | 'pdf' | 'doc';

export type ReportType = 'executive' | 'full' | 'tech';

export type ErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'MODEL_OVERLOADED'
  | 'AUTH'
  | 'BAD_REQUEST'
  | 'SERVER'
  | 'PARSER'
  | 'UNKNOWN'
  | 'ABORTED'
  | 'BLOCKED_CONTENT';

export type ErrorSource = 'GEMINI' | 'BRASIL_API' | 'APPS_SCRIPT' | 'EXPORT' | 'PARSER' | 'UI' | 'GUARD' | 'UNKNOWN';

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
  LOCK: 0.5,
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
  groundingSources?: Array<{
    title: string;
    url: string;
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
}

export interface ClienteSeniorData {
  encontrado: boolean;
  grupo?: string;
  totalModulos?: number;
  familias?: string[];
  modulosPorFamilia?: Record<string, string[]>;
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
  // Props anteriormente faltantes — adicionadas na Fase 1
  onSaveToCRM: (sessionId: string) => void;
  onDeepDive: (displayMessage: string, hiddenPrompt: string, forcedCompanyName?: string) => Promise<void>;
  onOpenKanban: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  onSendMessage: (text: string, displayText?: string) => void;
  onFeedback: (messageId: string, feedback: Feedback) => void;
  onSendFeedback: (messageId: string, feedback: Feedback, comment: string, content: string) => void;
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
  canAccessMiniCRM?: boolean;
  canAccessDashboard?: boolean;
  canAccessIntegrityCheck?: boolean;
  canDeepDive?: boolean;
  canWarRoom?: boolean;
  onLogout: () => void;
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
// REVENUE INTELLIGENCE
// ===================================================================

export type RevenueStreamType = 'licenca' | 'suporte' | 'subscricao' | 'implantacao' | 'treinamento' | 'customizacao';

export type RevenueConfidence = 'confirmado' | 'estimado' | 'potencial';

export type PorteCliente = 'pequeno' | 'medio' | 'grande';

export interface RevenueStream {
  id: string;
  tipo: RevenueStreamType;
  familiasProduto: string; // 'GATec', 'ERP', 'HCM', etc.
  modulo?: string;
  descricao: string;
  valorMensal?: number;
  valorAnual?: number;
  custoImplantacao?: number;
  prazoContratoMeses?: number;
  recorrente: boolean; // true = RR, false = NR
  confianca: RevenueConfidence;
  fonte: string;
  criadoEm: string;
}

export interface CustomerRevenueProfile {
  cardId: string;
  porte: PorteCliente;
  totalRRAnual: number;
  totalNR: number;
  streamsAtivos: RevenueStream[];
  oportunidadesExpansao: RevenueStream[];
  tcvEstimado?: number; // Total Contract Value (RR * prazo + NR)
  prazoContratoPadrao: number; // meses
  atualizadoEm: string;
}

// ===================================================================
// MINI CRM - Kanban
// ===================================================================

export type CRMStage = 'prospeccao' | 'primeira_reuniao' | 'levantamento' | 'defesa_tecnica' | 'dossie_final';

export const CRM_STAGE_LABELS: Record<CRMStage, string> = {
  prospeccao: 'Prospecção',
  primeira_reuniao: '1ª Reunião',
  levantamento: 'Levantamento',
  defesa_tecnica: 'Defesa Técnica',
  dossie_final: 'Dossiê Final',
};

export type DealHealth = 'green' | 'yellow' | 'red';

export interface CRMTranscriptionFile {
  id: string;
  name: string;
  content: string;
  uploadedAt: string;
  type: 'txt' | 'docx';
}

export interface CRMStageData {
  transcriptions: CRMTranscriptionFile[];
  executiveNotes: string;
  technicalNotes: string;
  aiReport?: string;
  crmNotes?: string;
  generatedAt?: string;
  objections?: string[];
  competitors?: string[];
}

export interface CRMCard {
  id: string;
  companyName: string;
  // Compat: cnpj unico legado
  cnpj?: string | null;
  // NOVO: lista de CNPJs
  cnpjs?: string[];
  // NOVO: campos basicos do cadastro
  website?: string;
  briefDescription?: string;
  // NOVO: ExactSpotter
  exactLink?: string;

  linkedSessionIds: string[];
  stage: CRMStage;
  createdAt: string;
  updatedAt: string;
  movedToStageAt: Partial<Record<CRMStage, string>>;
  stages: Partial<Record<CRMStage, CRMStageData>>;
  latestScorePorta?: number;
  health: DealHealth;
  newsRadarEnabled: boolean;
  lastNewsCheckAt?: string;
  unreadNewsCount?: number;
  // Revenue Intelligence
  revenueProfile?: CustomerRevenueProfile;
}

export interface CRMPipelineProps {
  cards: CRMCard[];
  onMoveCard: (cardId: string, toStage: CRMStage) => void;
  onSelectCard: (cardId: string) => void;
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
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
] as const;

export type BrasilUF = typeof BRASIL_UFS[number];

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
