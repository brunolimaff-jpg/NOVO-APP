const TEIA_HYPOTHESIS_LEGEND_LINE =
  /^\s*\*?\s*=\s*hip[oó]tese\s+a\s+validar[^\n]*$/gim;

const TEIA_HYPOTHESIS_LEGEND_INLINE =
  /\*?\s*=\s*hip[oó]tese\s+a\s+validar[^.\n]*(?:n[aã]o\s+confirmado[^.\n]*)?(?:core\s+operacional|core\s+instalado)?[^.\n]*\.?/gi;

/**
 * Remove legenda obrigatoria antiga da Teia (* = hipotese a validar...).
 * Mantem asterisco em CNPJs (##.###.###/####-##*).
 */
export function stripTeiaHypothesisLegend(text: string): string {
  if (!text) return text;
  return text
    .replace(TEIA_HYPOTHESIS_LEGEND_LINE, '')
    .replace(TEIA_HYPOTHESIS_LEGEND_INLINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
