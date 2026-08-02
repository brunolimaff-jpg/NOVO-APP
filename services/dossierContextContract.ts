import {
  DOSSIER_EVIDENCE_CATEGORIES,
  type DossierEvidenceCategory,
  type DossierEvidenceCategoryPresence,
  type DossierEvidenceContract,
  type GenerateDossierRequest,
} from '../shared/dossierGatewayContracts';

export const DOSSIER_CONTEXT_CONTRACT_VERSION = 'dossier-context.v1' as const;
export const DOSSIER_CONTEXT_MAX_CHARS = 200_000;

export type DossierContextSection = {
  category: DossierEvidenceCategory;
  content: string;
  itemCount: number;
  sourceCount: number;
};

export type DeterministicDossierContextInput = {
  companyName: string;
  cnpj?: string;
  sections: Partial<Record<DossierEvidenceCategory, DossierContextSection>>;
  maxChars?: number;
};

export type BuiltDossierContext = {
  version: typeof DOSSIER_CONTEXT_CONTRACT_VERSION;
  context: string;
  evidence: DossierEvidenceContract;
  sections: readonly DossierEvidenceCategoryPresence[];
};

export type BuiltGenerateDossierRequest = Pick<GenerateDossierRequest, 'action' | 'runId' | 'companyName' | 'cnpj' | 'context' | 'evidence'>;

export class DossierContextContractError extends Error {
  readonly code:
    | 'INVALID_COMPANY'
    | 'INVALID_SECTION'
    | 'MISSING_SECTION'
    | 'CONTEXT_TOO_LARGE'
    | 'DIGEST_UNAVAILABLE';
  readonly category?: DossierEvidenceCategory;

  constructor(
    code: DossierContextContractError['code'],
    message: string,
    category?: DossierEvidenceCategory,
  ) {
    super(message);
    this.name = 'DossierContextContractError';
    this.code = code;
    this.category = category;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

function assertNonNegativeInteger(value: number, field: string, category: DossierEvidenceCategory): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new DossierContextContractError(
      'INVALID_SECTION',
      `${field} deve ser um inteiro não negativo para a seção ${category}`,
      category,
    );
  }
}

function normalizeSection(
  category: DossierEvidenceCategory,
  section: DossierContextSection | undefined,
): DossierContextSection {
  if (!section) {
    throw new DossierContextContractError(
      'MISSING_SECTION',
      `A seção determinística obrigatória está ausente: ${category}`,
      category,
    );
  }
  if (section.category !== category || typeof section.content !== 'string') {
    throw new DossierContextContractError(
      'INVALID_SECTION',
      `Contrato inválido para a seção determinística: ${category}`,
      category,
    );
  }
  assertNonNegativeInteger(section.itemCount, 'itemCount', category);
  assertNonNegativeInteger(section.sourceCount, 'sourceCount', category);

  return {
    category,
    content: normalizeText(section.content),
    itemCount: section.itemCount,
    sourceCount: section.sourceCount,
  };
}

function encodeSection(section: DossierContextSection): string {
  return [
    `[DOSSIER_CONTEXT_SECTION:${section.category}]`,
    section.content || '(sem evidência determinística disponível)',
    `[END_DOSSIER_CONTEXT_SECTION:${section.category}]`,
  ].join('\n');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digestContext(context: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new DossierContextContractError(
      'DIGEST_UNAVAILABLE',
      'Web Crypto não está disponível para gerar o digest do contexto',
    );
  }
  const encoded = new TextEncoder().encode(context);
  const digest = await subtle.digest('SHA-256', encoded);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

function buildPresence(sections: readonly DossierContextSection[]): DossierEvidenceCategoryPresence[] {
  return sections.map(section => ({
    category: section.category,
    present: Boolean(section.content),
    itemCount: section.itemCount,
    sourceCount: section.sourceCount,
  }));
}

/**
 * Constrói o payload completo apenas com transformações determinísticas.
 * Este módulo não importa LLM, fetch, Supabase ou lifecycle RPCs de propósito.
 */
export async function buildDeterministicDossierContext(
  input: DeterministicDossierContextInput,
): Promise<BuiltDossierContext> {
  const companyName = normalizeText(input.companyName);
  if (!companyName) {
    throw new DossierContextContractError('INVALID_COMPANY', 'companyName é obrigatório');
  }

  const maxChars = input.maxChars ?? DOSSIER_CONTEXT_MAX_CHARS;
  if (!Number.isInteger(maxChars) || maxChars <= 0 || maxChars > DOSSIER_CONTEXT_MAX_CHARS) {
    throw new DossierContextContractError('INVALID_SECTION', 'maxChars fora do limite permitido');
  }

  const sections = DOSSIER_EVIDENCE_CATEGORIES.map(category => normalizeSection(category, input.sections[category]));
  const header = [
    `[DOSSIER_CONTEXT_VERSION:${DOSSIER_CONTEXT_CONTRACT_VERSION}]`,
    `Empresa: ${companyName}`,
    input.cnpj ? `CNPJ: ${normalizeText(input.cnpj)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const context = [header, ...sections.map(encodeSection)].join('\n\n');

  if (context.length > maxChars) {
    throw new DossierContextContractError(
      'CONTEXT_TOO_LARGE',
      `Contexto determinístico excede o limite de ${maxChars} caracteres`,
    );
  }

  const presence = buildPresence(sections);
  return {
    version: DOSSIER_CONTEXT_CONTRACT_VERSION,
    context,
    evidence: {
      version: 'dossier-evidence.v1',
      categories: presence,
      sanitizedContextDigest: await digestContext(context),
    },
    sections: presence,
  };
}

export async function buildGenerateDossierRequest(input: {
  runId: string;
  companyName: string;
  cnpj?: string;
  sections: DeterministicDossierContextInput['sections'];
  maxChars?: number;
}): Promise<BuiltGenerateDossierRequest> {
  const runId = normalizeText(input.runId);
  if (!runId) throw new DossierContextContractError('INVALID_COMPANY', 'runId é obrigatório');

  const built = await buildDeterministicDossierContext({
    companyName: input.companyName,
    cnpj: input.cnpj,
    sections: input.sections,
    maxChars: input.maxChars,
  });

  return {
    action: 'generate',
    runId,
    companyName: normalizeText(input.companyName),
    ...(input.cnpj ? { cnpj: normalizeText(input.cnpj) } : {}),
    context: built.context,
    evidence: built.evidence,
  };
}
