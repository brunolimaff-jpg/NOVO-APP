import type { ReportQualityInput, ReportQualityResult } from './types.js';

const REQUIRED_MODULE_HEADINGS = [
  '# Teia Societária',
  '# Raio-X Operacional',
  '# Tech Stack',
  '# Riscos',
  '# Radar',
] as const;

// Strict marker regex (for Gemini — expects exact [[PORTA_*]] format)
const PORTA_MARKER_STRICT = /\[\[PORTA(?:_FEED)?[_:][^\]]+\]\]/i;
const TEIA_COMPLEXIDADE_STRICT = /\[\[TEIA_COMPLEXIDADE:(BAIXA|MEDIA|ALTA)\]\]/i;

// Flexible marker regex (for non-Gemini — tolerates casing, spacing, no double brackets)
function hasFlexiblePortaMarker(text: string): boolean {
  return /\bPORTA(?:_FEED)?[:_]\s*\w+/i.test(text);
}

function hasFlexibleTeiaComplexidade(text: string): boolean {
  return /\bTEIA[:_]\s*COMPLEXIDADE\b/i.test(text) || /complexidade\s*(baixa|media|alta)/i.test(text);
}

function isNotContentLoop(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 100) return false; // Too short to judge

  // Check for repetitive line patterns (model stuck in a loop)
  const lines = trimmed.split('\n').filter(l => l.trim());
  if (lines.length >= 5) {
    const unique = new Set(lines.map(l => l.trim().toLowerCase()));
    if (unique.size <= 2) return false;
  }

  return true;
}

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
  const provider = input.provider ?? 'gemini';
  const isGemini = provider === 'gemini';

  if (!trimmed) {
    return {
      structuralScore: 0,
      isQualityFailure: true,
      problems: ['empty_report'],
      portaMarkersValid: false,
      teiaComplexidadePresent: false,
      requiredModulesPresent: false,
      parserFailed: false,
      markdownBroken: false,
      responseTruncated: Boolean(input.responseTruncated),
    };
  }

  let portaMarkersValid: boolean;
  let teiaComplexidadePresent: boolean;
  let requiredModulesPresent: boolean;

  if (isGemini) {
    // Strict: expect exact [[PORTA_*]] and [[TEIA_COMPLEXIDADE:*]] markers
    portaMarkersValid = PORTA_MARKER_STRICT.test(text);
    teiaComplexidadePresent = TEIA_COMPLEXIDADE_STRICT.test(text);
    requiredModulesPresent = countPresentModules(text) >= 3;
  } else {
    // Lenient: flexible matching, don't require specific headings or TEIA
    portaMarkersValid = hasFlexiblePortaMarker(text);
    teiaComplexidadePresent = hasFlexibleTeiaComplexidade(text);
    requiredModulesPresent = isNotContentLoop(text) && trimmed.length > 500;
  }

  const parserFailed = input.parserSuccess === false;
  const markdownBroken = hasBrokenMarkdown(text);
  const responseTruncated = Boolean(input.responseTruncated);

  if (isGemini) {
    if (!portaMarkersValid) problems.push('porta_markers_missing');
    if (!requiredModulesPresent) problems.push('required_modules_missing');
    if (!teiaComplexidadePresent) problems.push('teia_complexidade_missing');
  } else {
    if (!portaMarkersValid) problems.push('porta_markers_missing');
    if (!requiredModulesPresent) problems.push('insufficient_content');
    // teia_complexidade is not required for non-Gemini models
  }

  if (parserFailed) problems.push('parser_failed');
  if (markdownBroken) problems.push('markdown_broken');

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
