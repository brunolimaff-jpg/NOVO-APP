import type { ReportQualityInput, ReportQualityResult } from './types.js';

const REQUIRED_MODULE_HEADINGS = [
  '# Teia Societária',
  '# Raio-X Operacional',
  '# Tech Stack',
  '# Riscos',
  '# Radar',
] as const;

const PORTA_MARKER_REGEX = /\[\[PORTA(?:_FEED)?[_:][^\]]+\]\]/i;
const TEIA_COMPLEXIDADE_REGEX = /\[\[TEIA_COMPLEXIDADE:(BAIXA|MEDIA|ALTA)\]\]/i;

function countPresentModules(text: string): number {
  const lower = text.toLowerCase();
  return REQUIRED_MODULE_HEADINGS.filter(heading => lower.includes(heading.toLowerCase().replace('# ', ''))).length;
}

function hasBrokenMarkdown(text: string): boolean {
  const lines = text.split('\n');
  let openFence = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      openFence = !openFence;
    }
  }

  return openFence;
}

export function checkReportQuality(input: ReportQualityInput): ReportQualityResult {
  const text = input.text ?? '';
  const trimmed = text.trim();
  const problems: string[] = [];

  if (!trimmed) {
    return {
      structuralScore: 0,
      isQualityFailure: false,
      problems: ['empty_report'],
      portaMarkersValid: false,
      teiaComplexidadePresent: false,
      requiredModulesPresent: false,
      parserFailed: false,
      markdownBroken: false,
      responseTruncated: Boolean(input.responseTruncated),
    };
  }

  const portaMarkersValid = PORTA_MARKER_REGEX.test(text);
  const teiaComplexidadePresent = TEIA_COMPLEXIDADE_REGEX.test(text);
  const modulesPresentCount = countPresentModules(text);
  const requiredModulesPresent = modulesPresentCount >= 3;
  const parserFailed = input.parserSuccess === false;
  const markdownBroken = hasBrokenMarkdown(text);
  const responseTruncated = Boolean(input.responseTruncated);

  if (!portaMarkersValid) problems.push('porta_markers_missing');
  if (!requiredModulesPresent) problems.push('required_modules_missing');
  if (parserFailed) problems.push('parser_failed');
  if (markdownBroken) problems.push('markdown_broken');
  if (!teiaComplexidadePresent) problems.push('teia_complexidade_missing');

  let structuralScore = 0;
  if (portaMarkersValid) structuralScore += 30;
  if (teiaComplexidadePresent) structuralScore += 20;
  if (requiredModulesPresent) structuralScore += 30;
  if (!parserFailed) structuralScore += 10;
  if (!markdownBroken) structuralScore += 10;
  if (responseTruncated) structuralScore = Math.max(0, structuralScore - 15);

  const isQualityFailure = problems.length >= 2;

  return {
    structuralScore,
    isQualityFailure,
    problems,
    portaMarkersValid,
    teiaComplexidadePresent,
    requiredModulesPresent,
    parserFailed,
    markdownBroken,
    responseTruncated,
  };
}
