export type DossierGatewayMode = 'generate' | 'chat';

export type DossierUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type GenerateDossierRequest = {
  action: 'generate';
  runId: string;
  companyName: string;
  cnpj?: string;
  context: string;
  evidence?: DossierEvidenceContract;
};

export type ChatDossierRequest = {
  action: 'chat';
  runId: string;
  dossierId: string;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type DossierGatewaySuccess = {
  ok: true;
  runId: string;
  dossierId: string;
  correlationId: string;
  status: 'COMPLETED';
  text: string;
  usage: DossierUsage;
  finishReason: string;
};

export type DossierChatSuccess = Omit<DossierGatewaySuccess, 'dossierId' | 'status'> & {
  dossierId: string;
  status: 'COMPLETED';
};

export type DossierGatewayFailure = {
  ok: false;
  runId?: string;
  correlationId: string;
  status: 'FAILED' | 'CANCELLED';
  error: {
    code: string;
    message: string;
    stage: 'validation' | 'auth' | 'ownership' | 'lease' | 'gateway' | 'persistence' | 'request';
    retryable: boolean;
  };
};

export type DossierGatewayResponse = DossierGatewaySuccess | DossierGatewayFailure;

export const DOSSIER_EVIDENCE_CATEGORIES = [
  'empresa',
  'cnpj',
  'qsa',
  'dados_cadastrais',
  'crm',
  'concorrentes',
  'porta',
  'modulos',
  'benchmark',
  'evidence_pack',
  'fontes',
  'historico',
  'contexto_visivel',
] as const;

export type DossierEvidenceCategory = (typeof DOSSIER_EVIDENCE_CATEGORIES)[number];

export type DossierEvidenceCategoryPresence = {
  category: DossierEvidenceCategory;
  present: boolean;
  itemCount: number;
  sourceCount: number;
};

/**
 * Metadata-only contract. It records evidence presence/counts without putting
 * company data or source contents into snapshots or telemetry.
 */
export type DossierEvidenceContract = {
  version: 'dossier-evidence.v1';
  categories: readonly DossierEvidenceCategoryPresence[];
  sanitizedContextDigest?: string;
};

const categorySet = new Set<string>(DOSSIER_EVIDENCE_CATEGORIES);
const evidenceKeys = new Set(['version', 'categories', 'sanitizedContextDigest']);
const categoryKeys = new Set(['category', 'present', 'itemCount', 'sourceCount']);
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every(key => allowed.has(key));
}

/**
 * Validates and rebuilds the evidence metadata at the trust boundary. The
 * returned object contains only the fields in the public metadata contract,
 * so callers cannot accidentally persist arbitrary evidence values.
 */
export function sanitizeDossierEvidenceContract(value: unknown): DossierEvidenceContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Dossier evidence contract is required');
  }
  const candidate = value as { version?: unknown; categories?: unknown; sanitizedContextDigest?: unknown } & Record<string, unknown>;
  if (
    !hasOnlyKeys(candidate, evidenceKeys) ||
    candidate.version !== 'dossier-evidence.v1' ||
    !Array.isArray(candidate.categories)
  ) {
    throw new Error('Invalid dossier evidence contract');
  }

  const seen = new Set<string>();
  const categories = candidate.categories.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid dossier evidence category');
    }
    const item = entry as Record<string, unknown>;
    if (!hasOnlyKeys(item, categoryKeys)) {
      throw new Error('Invalid dossier evidence category fields');
    }
    if (typeof item.category !== 'string' || !categorySet.has(item.category) || seen.has(item.category)) {
      throw new Error('Invalid dossier evidence category');
    }
    if (
      typeof item.present !== 'boolean' ||
      typeof item.itemCount !== 'number' ||
      !Number.isInteger(item.itemCount) ||
      item.itemCount < 0 ||
      typeof item.sourceCount !== 'number' ||
      !Number.isInteger(item.sourceCount) ||
      item.sourceCount < 0
    ) {
      throw new Error('Invalid dossier evidence counts');
    }
    seen.add(item.category);
    return {
      category: item.category as DossierEvidenceCategory,
      present: item.present,
      itemCount: item.itemCount,
      sourceCount: item.sourceCount,
    };
  });

  if (seen.size !== DOSSIER_EVIDENCE_CATEGORIES.length) {
    throw new Error('Dossier evidence contract omits one or more pipeline categories');
  }
  if (
    candidate.sanitizedContextDigest !== undefined &&
    (typeof candidate.sanitizedContextDigest !== 'string' || !SHA256_DIGEST_PATTERN.test(candidate.sanitizedContextDigest))
  ) {
    throw new Error('Invalid dossier evidence digest');
  }

  return {
    version: 'dossier-evidence.v1',
    categories,
    ...(candidate.sanitizedContextDigest !== undefined
      ? { sanitizedContextDigest: candidate.sanitizedContextDigest }
      : {}),
  };
}

export function assertDossierEvidenceContract(value: unknown): asserts value is DossierEvidenceContract {
  sanitizeDossierEvidenceContract(value);
}
