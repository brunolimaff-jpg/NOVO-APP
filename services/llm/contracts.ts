import type { ClienteSeniorData, ScorePortaData, WebVerificationStatus } from '../../types';
import type { CompetitorDetection } from '../competitorService';
import type { VerifiedSource } from '../../utils/webVerification';

export interface LlmRequestOptions {
  thinkingLevel?: 'low' | 'medium' | 'high';
  thinkingMode?: boolean;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  onStatus?: (status: string) => void;
  onScorePorta?: (score: ScorePortaData) => void;
  onCompetitor?: (detection: CompetitorDetection) => void;
  onRagFailed?: () => void;
  nomeVendedor?: string;
  sessionId?: string;
  hintedCompany?: string | null;
  isFollowUp?: boolean;
  maxOutputTokens?: number;
}

export interface DossierModuleOptions {
  signal?: AbortSignal;
  onText?: (text: string) => void;
  timeoutMs?: number;
  temperature?: number;
  onGroundingSources?: (sources: VerifiedSource[], moduleName: string) => void;
  onVerificationStatus?: (status: WebVerificationStatus, moduleName: string) => void;
  /**
   * BRU-99 — allowlist estrita de markers internos legítimos (Reconciliação PORTA).
   * Quando definida, o PromptLeakShield NÃO bloqueia um texto composto SOMENTE
   * por markers `[[<prefix>_<DIM>:...]]` com prefixo e dimensão autorizados.
   * Qualquer outro conteúdo continua sujeito ao shield.
   */
  internalMarkerAllowlist?: { prefix: string; dimensions: string[] };
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

export interface SendMessageToLlmResult {
  text: string;
  sources?: Array<{ title: string; url: string }>;
  webVerificationStatus?: WebVerificationStatus;
  suggestions?: string[];
  scorePorta?: ScorePortaData | null;
  clienteSeniorData?: ClienteSeniorData;
  ghostReason?: string | null;
}
