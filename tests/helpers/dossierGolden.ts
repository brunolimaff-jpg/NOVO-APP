import { readFileSync } from 'node:fs';
import mermaid from 'mermaid';

export interface DossierGoldenCase {
  cnpj: string;
  companyName: string;
  requiredHeadings: string[];
  requiredPhrases: string[];
  forbiddenPhrases: string[];
  minimumMermaidBlocks: number;
  minimumExpectedLengthRatio?: number;
  locality?: { city: string; state: string; forbidden?: string[] };
  semanticFacts?: Array<{ label: string; aliases: string[]; requiresSource?: boolean }>;
  minimumSources?: number;
  minimumSourceDomains?: number;
  primarySourceDomains?: string[];
  requiredEvidenceLabels?: Array<{ label: string; aliases: string[] }>;
  placeholderPatterns?: string[];
  contradictionGroups?: Array<{ label: string; alternatives: string[] }>;
  mutuallyExclusiveClaims?: Array<{
    label: string;
    claims: Array<{ value: string; aliases: string[] }>;
  }>;
}

export interface DossierGoldenRubric {
  passed: boolean;
  errors: string[];
  metrics: {
    normalizedLength: number;
    expectedLengthRatio: number;
    headingsFound: number;
    headingsRequired: number;
    factsFound: number;
    factsRequired: number;
    mermaidBlocks: number;
    sourceCount: number;
    sourceDomainCount: number;
    primarySourceFound: boolean;
    nonEmptySections: number;
    identityFound: boolean;
    cnpjValid: boolean;
    localityFound: boolean;
    sourcedFactsFound: number;
    sourcedFactsRequired: number;
  };
  sources: string[];
  sourceDomains: string[];
}

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

export function normalizeMarkdownForGolden(value: string): string {
  return stripBom(value)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForMatch(value: string): string {
  return normalizeMarkdownForGolden(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export function countMermaidBlocks(value: string): number {
  return (normalizeMarkdownForGolden(value).match(/```mermaid[\s\S]*?```/gi) || []).length;
}

export function loadJsonFixture<T>(fixturePath: string): T {
  return JSON.parse(stripBom(readFileSync(fixturePath, 'utf8'))) as T;
}

export function loadTextFixture(fixturePath: string): string {
  return readFileSync(fixturePath, 'utf8');
}

function extractMarkdownSources(value: string): string[] {
  const sources = new Set<string>();
  const markdownLink = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi;
  for (const match of value.matchAll(markdownLink)) {
    sources.add(match[1].replace(/[.,;:]+$/, ''));
  }
  return [...sources];
}

function getSourceDomain(source: string): string | null {
  try {
    return new URL(source).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function containsAlias(value: string, aliases: string[]): boolean {
  return aliases.some(alias => value.includes(normalizeForMatch(alias)));
}

function extractMermaidBlocks(value: string): string[] {
  return [...normalizeMarkdownForGolden(value).matchAll(/```mermaid\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
}

function findNonEmptyRequiredSections(value: string, headings: string[]): number {
  const lines = normalizeMarkdownForGolden(value).split('\n');
  let count = 0;
  for (const heading of headings) {
    const headingIndex = lines.findIndex(line => normalizeForMatch(line) === normalizeForMatch(heading));
    if (headingIndex === -1) continue;
    const nextHeadingOffset = lines.slice(headingIndex + 1).findIndex(line => /^#{1,6}\s+/.test(line));
    const endIndex = nextHeadingOffset === -1 ? lines.length : headingIndex + 1 + nextHeadingOffset;
    const body = lines
      .slice(headingIndex + 1, endIndex)
      .join(' ')
      .replace(/[-_*`#|]/g, '')
      .trim();
    if (body.length >= 20) count += 1;
  }
  return count;
}

function factHasAssociatedSource(value: string, aliases: string[]): boolean {
  const normalized = normalizeMarkdownForGolden(value);
  const paragraphMatch = normalized
    .split(/\n\s*\n/)
    .some(
      paragraph => containsAlias(normalizeForMatch(paragraph), aliases) && /\[[^\]]+\]\(https?:\/\//i.test(paragraph),
    );
  if (paragraphMatch) return true;
  return normalized
    .split(/\n(?=#{1,6}\s+)/)
    .some(section => containsAlias(normalizeForMatch(section), aliases) && /\[[^\]]+\]\(https?:\/\//i.test(section));
}

export function validateDossierGolden(
  actualMarkdown: string,
  expectedMarkdown: string,
  dossierCase: DossierGoldenCase,
): string[] {
  const errors: string[] = [];
  const normalizedActual = normalizeMarkdownForGolden(actualMarkdown);
  const matchableActual = normalizeForMatch(actualMarkdown);
  const matchableExpected = normalizeForMatch(expectedMarkdown);

  if (!normalizedActual) {
    return ['o markdown exportado está vazio'];
  }

  const minimumExpectedLengthRatio = dossierCase.minimumExpectedLengthRatio ?? 0;
  if (minimumExpectedLengthRatio > 0) {
    const minimumLength = Math.floor(matchableExpected.length * minimumExpectedLengthRatio);
    if (matchableActual.length < minimumLength) {
      errors.push(
        `o markdown exportado ficou curto demais (${matchableActual.length} caracteres normalizados; esperado ao menos ${minimumLength})`,
      );
    }
  }

  let headingCursor = 0;
  for (const heading of dossierCase.requiredHeadings) {
    const normalizedHeading = normalizeForMatch(heading);
    const headingIndex = matchableActual.indexOf(normalizedHeading, headingCursor);
    if (headingIndex === -1) {
      errors.push(`faltou seção obrigatória: ${heading}`);
      continue;
    }
    headingCursor = headingIndex + normalizedHeading.length;
  }

  for (const phrase of dossierCase.requiredPhrases) {
    const normalizedPhrase = normalizeForMatch(phrase);
    if (!matchableActual.includes(normalizedPhrase)) {
      errors.push(`faltou trecho obrigatório: ${phrase}`);
    }
  }

  for (const phrase of dossierCase.forbiddenPhrases) {
    const normalizedPhrase = normalizeForMatch(phrase);
    if (matchableActual.includes(normalizedPhrase)) {
      errors.push(`apareceu trecho proibido: ${phrase}`);
    }
  }

  const mermaidBlocks = countMermaidBlocks(normalizedActual);
  if (mermaidBlocks < dossierCase.minimumMermaidBlocks) {
    errors.push(
      `blocos mermaid insuficientes: ${mermaidBlocks} encontrado(s), mínimo esperado ${dossierCase.minimumMermaidBlocks}`,
    );
  }

  return errors;
}

export function withSchefferGoldenRubric(dossierCase: DossierGoldenCase): DossierGoldenCase {
  return {
    ...dossierCase,
    minimumExpectedLengthRatio: Math.max(dossierCase.minimumExpectedLengthRatio ?? 0, 0.85),
    minimumSources: 5,
    minimumSourceDomains: 3,
    primarySourceDomains: ['scheffer.agr.br'],
    requiredEvidenceLabels: [
      { label: 'fato confirmado', aliases: ['O Fato', 'Confirmado', 'Evidência'] },
      { label: 'inferência', aliases: ['Inferência', 'Sugere', 'Provável', 'Quase certo'] },
      { label: 'estimativa', aliases: ['Estimativa', 'Estimado', 'Projeção'] },
    ],
    semanticFacts: [
      {
        label: 'identidade Scheffer',
        aliases: ['Scheffer & CIA LTDA', 'Grupo Scheffer'],
        requiresSource: true,
      },
      {
        label: 'CRM Senior com 74 módulos',
        aliases: ['74 módulos Senior', '74 módulos ativos'],
        requiresSource: false,
      },
      {
        label: 'Scheffer Colombia',
        aliases: ['Scheffer Colombia SAS', 'Scheffer Colômbia SAS'],
        requiresSource: true,
      },
      { label: 'PRODEIC', aliases: ['PRODEIC'], requiresSource: false },
      { label: 'Jobconvo', aliases: ['Jobconvo integrado', 'Jobconvo'], requiresSource: false },
      {
        label: 'Commerce Log/TMS/WMS',
        aliases: ['Commerce Log (TMS/WMS)', 'Commerce Log', 'TMS/WMS'],
        requiresSource: false,
      },
    ],
    contradictionGroups: [
      { label: 'quantidade de módulos Senior', alternatives: ['74 módulos Senior', '74 módulos ativos'] },
    ],
    mutuallyExclusiveClaims: [
      {
        label: 'identidade da empresa',
        claims: [
          { value: 'Scheffer', aliases: ['Scheffer & CIA LTDA', 'Grupo Scheffer'] },
          { value: 'empresa incorreta', aliases: ['SLC Agrícola', 'Amaggi Exportação'] },
        ],
      },
      {
        label: 'módulos Senior',
        claims: [
          { value: '74 módulos', aliases: ['74 módulos Senior', '74 módulos ativos'] },
          { value: 'quantidade divergente', aliases: ['73 módulos Senior', '75 módulos Senior'] },
        ],
      },
    ],
  };
}

export async function evaluateDossierGolden(
  actualMarkdown: string,
  expectedMarkdown: string,
  dossierCase: DossierGoldenCase,
): Promise<DossierGoldenRubric> {
  const errors = validateDossierGolden(actualMarkdown, expectedMarkdown, dossierCase);
  const normalizedActual = normalizeMarkdownForGolden(actualMarkdown);
  const matchableActual = normalizeForMatch(actualMarkdown);
  const matchableExpected = normalizeForMatch(expectedMarkdown);
  const sources = extractMarkdownSources(actualMarkdown);
  const sourceDomains = [
    ...new Set(sources.map(getSourceDomain).filter((domain): domain is string => Boolean(domain))),
  ];
  const semanticFacts = dossierCase.semanticFacts ?? [];
  const sourcedFacts = semanticFacts.filter(fact => fact.requiresSource);
  const factsFound = semanticFacts.filter(fact => containsAlias(matchableActual, fact.aliases)).length;
  const sourcedFactsFound = sourcedFacts.filter(fact => factHasAssociatedSource(actualMarkdown, fact.aliases)).length;
  const identityFound = containsAlias(matchableActual, [dossierCase.companyName]);
  const cnpjDigits = dossierCase.cnpj.replace(/\D/g, '');
  const cnpjValid =
    cnpjDigits.length === 14 &&
    (actualMarkdown.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g) ?? []).some(
      candidate => candidate.replace(/\D/g, '') === cnpjDigits,
    );

  if (!identityFound) errors.push(`identidade da empresa incorreta: ${dossierCase.companyName}`);
  if (!cnpjValid) errors.push(`CNPJ canônico ausente ou inválido no Markdown: ${dossierCase.cnpj}`);

  let localityFound = true;
  if (dossierCase.locality) {
    const { city, state } = dossierCase.locality;
    const localityMatch =
      matchableActual.includes(normalizeForMatch(`${city}`)) ||
      matchableActual.includes(normalizeForMatch(`${city}/${state}`)) ||
      matchableActual.includes(normalizeForMatch(`${city} - ${state}`));
    if (!localityMatch) {
      errors.push(`localidade divergente: esperado ${city}/${state} não encontrado no dossiê`);
      localityFound = false;
    }
    for (const forbiddenLoc of dossierCase.locality.forbidden ?? []) {
      if (matchableActual.includes(normalizeForMatch(forbiddenLoc))) {
        errors.push(`localidade proibida encontrada: "${forbiddenLoc}". Scheffer real é ${city}/${state}`);
        localityFound = false;
      }
    }
  }

  const mermaidBlocks = extractMermaidBlocks(normalizedActual);
  const mermaidParseResults = await Promise.all(
    mermaidBlocks.map(block => mermaid.parse(block, { suppressErrors: true }).catch(() => false)),
  );
  const invalidMermaidCount = mermaidParseResults.filter(result => result === false).length;
  if (invalidMermaidCount > 0) errors.push(`blocos mermaid inválidos: ${invalidMermaidCount}`);

  for (const fact of semanticFacts) {
    if (!containsAlias(matchableActual, fact.aliases)) {
      errors.push(`faltou fato crítico: ${fact.label}`);
    }
  }
  for (const fact of sourcedFacts) {
    if (!factHasAssociatedSource(actualMarkdown, fact.aliases)) {
      errors.push(`fato crítico sem fonte associada no mesmo parágrafo: ${fact.label}`);
    }
  }

  const nonEmptySections = findNonEmptyRequiredSections(actualMarkdown, dossierCase.requiredHeadings);
  if (nonEmptySections < dossierCase.requiredHeadings.length) {
    errors.push(
      `seções obrigatórias vazias ou rasas: ${nonEmptySections}/${dossierCase.requiredHeadings.length} preenchidas`,
    );
  }

  const minimumSources = dossierCase.minimumSources ?? 0;
  if (sources.length < minimumSources) {
    errors.push(`fontes insuficientes: ${sources.length} encontrada(s), mínimo esperado ${minimumSources}`);
  }

  const minimumSourceDomains = dossierCase.minimumSourceDomains ?? 0;
  if (sourceDomains.length < minimumSourceDomains) {
    errors.push(
      `domínios de fonte insuficientes: ${sourceDomains.length} encontrado(s), mínimo esperado ${minimumSourceDomains}`,
    );
  }

  const primaryDomains = (dossierCase.primarySourceDomains ?? []).map(domain =>
    domain.toLowerCase().replace(/^www\./, ''),
  );
  const primarySourceFound =
    primaryDomains.length === 0 ||
    sourceDomains.some(domain => primaryDomains.some(primary => domain === primary || domain.endsWith(`.${primary}`)));
  if (!primarySourceFound) {
    errors.push(`faltou fonte primária (${primaryDomains.join(', ')})`);
  }

  for (const evidence of dossierCase.requiredEvidenceLabels ?? []) {
    if (!containsAlias(matchableActual, evidence.aliases)) {
      errors.push(`faltou distinção de evidência: ${evidence.label}`);
    }
  }

  const defaultPlaceholders = ['[inserir', '[preencher', '[placeholder', 'lorem ipsum', 'todo:'];
  for (const placeholder of dossierCase.placeholderPatterns ?? defaultPlaceholders) {
    if (matchableActual.includes(normalizeForMatch(placeholder))) {
      errors.push(`placeholder encontrado: ${placeholder}`);
    }
  }

  for (const group of dossierCase.contradictionGroups ?? []) {
    const presentAlternatives = group.alternatives.filter(alternative =>
      matchableActual.includes(normalizeForMatch(alternative)),
    );
    if (presentAlternatives.length === 0) {
      errors.push(`faltou valor canônico para ${group.label}`);
    }
  }

  for (const group of dossierCase.mutuallyExclusiveClaims ?? []) {
    const presentClaims = group.claims.filter(claim => containsAlias(matchableActual, claim.aliases));
    if (presentClaims.length > 1) {
      errors.push(`contradição em ${group.label}: ${presentClaims.map(claim => claim.value).join(' versus ')}`);
    }
  }

  const headingCount = dossierCase.requiredHeadings.filter(heading =>
    matchableActual.includes(normalizeForMatch(heading)),
  ).length;
  const expectedLengthRatio = matchableExpected.length > 0 ? matchableActual.length / matchableExpected.length : 0;

  return {
    passed: errors.length === 0,
    errors,
    metrics: {
      normalizedLength: matchableActual.length,
      expectedLengthRatio,
      headingsFound: headingCount,
      headingsRequired: dossierCase.requiredHeadings.length,
      factsFound,
      factsRequired: semanticFacts.length,
      mermaidBlocks: countMermaidBlocks(normalizedActual),
      sourceCount: sources.length,
      sourceDomainCount: sourceDomains.length,
      primarySourceFound,
      nonEmptySections,
      identityFound,
      cnpjValid,
      localityFound,
      sourcedFactsFound,
      sourcedFactsRequired: sourcedFacts.length,
    },
    sources,
    sourceDomains,
  };
}
