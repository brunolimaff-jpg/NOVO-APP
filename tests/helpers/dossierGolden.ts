import { readFileSync } from 'node:fs';

export interface DossierGoldenCase {
  cnpj: string;
  companyName: string;
  requiredHeadings: string[];
  requiredPhrases: string[];
  forbiddenPhrases: string[];
  minimumMermaidBlocks: number;
  minimumExpectedLengthRatio?: number;
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
  return dossierCase;
}

export async function evaluateDossierGolden(
  actualMarkdown: string,
  expectedMarkdown: string,
  dossierCase: DossierGoldenCase,
): Promise<{ passed: boolean; errors: string[]; sources: string[] }> {
  const errors = validateDossierGolden(actualMarkdown, expectedMarkdown, dossierCase);
  const sources = [...actualMarkdown.matchAll(/https?:\/\/[^\s)>\]]+/g)].map(match =>
    match[0].replace(/[.,;:]+$/, ''),
  );
  return {
    passed: errors.length === 0,
    errors,
    sources,
  };
}
