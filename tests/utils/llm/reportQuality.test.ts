import { describe, expect, it } from 'vitest';
import { checkReportQuality } from '../../../utils/llm/reportQuality.js';

const VALID_DOSSIER = `# Teia Societária
[[TEIA_COMPLEXIDADE:MEDIA]]
[[PORTA_FEED_O:7:ELOS:A]]

# Raio-X Operacional
Conteúdo operacional.

# Tech Stack
ERP TOTVS.

# Riscos
Compliance ok.

# Radar
Expansão norte.`;

describe('checkReportQuality', () => {
  it('dossiê válido tem score alto e sem quality_failure', () => {
    const result = checkReportQuality({ text: VALID_DOSSIER, parserSuccess: true });
    expect(result.isQualityFailure).toBe(false);
    expect(result.structuralScore).toBeGreaterThanOrEqual(80);
    expect(result.portaMarkersValid).toBe(true);
    expect(result.teiaComplexidadePresent).toBe(true);
  });

  it('quality_failure quando faltam PORTA e TEIA', () => {
    const result = checkReportQuality({
      text: '# Teia Societária\nSem markers.',
      parserSuccess: true,
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('porta_markers_missing');
    expect(result.problems).toContain('teia_complexidade_missing');
  });

  it('dossiê vazio não é quality_failure', () => {
    const result = checkReportQuality({ text: '   ' });
    expect(result.isQualityFailure).toBe(false);
    expect(result.problems).toContain('empty_report');
  });

  it('um único problema não é quality_failure', () => {
    const result = checkReportQuality({
      text: `# Teia Societária
[[TEIA_COMPLEXIDADE:BAIXA]]
[[PORTA_FEED_O:7:ELOS:A]]
# Raio-X Operacional
# Tech Stack
# Riscos
# Radar`,
      parserSuccess: true,
    });
    expect(result.isQualityFailure).toBe(false);
  });

  it('reasoning removido com estrutura válida permanece ok', () => {
    const result = checkReportQuality({ text: VALID_DOSSIER, parserSuccess: true });
    expect(result.isQualityFailure).toBe(false);
    expect(result.structuralScore).toBeGreaterThan(0);
  });

  it('modelo só com raciocínio falha qualidade', () => {
    const thinkingOnly = `<${'redacted_' + 'thinking'}>só raciocínio</${'redacted_' + 'thinking'}>`;
    const result = checkReportQuality({
      text: thinkingOnly,
      parserSuccess: false,
    });
    expect(result.isQualityFailure).toBe(true);
  });

  it('truncamento sozinho não força quality_failure', () => {
    const result = checkReportQuality({
      text: VALID_DOSSIER,
      parserSuccess: true,
      responseTruncated: true,
    });
    expect(result.responseTruncated).toBe(true);
    expect(result.isQualityFailure).toBe(false);
  });

  it('parser_failed conta como problema', () => {
    const result = checkReportQuality({
      text: VALID_DOSSIER,
      parserSuccess: false,
    });
    expect(result.problems).toContain('parser_failed');
  });

  it('markdown quebrado conta como problema', () => {
    const result = checkReportQuality({
      text: '# Teia Societária\n```json\n{ "open": true',
      parserSuccess: true,
    });
    expect(result.markdownBroken).toBe(true);
    expect(result.problems).toContain('markdown_broken');
  });

  it('required_modules_missing quando poucos módulos', () => {
    const result = checkReportQuality({
      text: '# Teia Societária\n[[PORTA_FEED_O:1:ELOS:A]]',
      parserSuccess: true,
    });
    expect(result.problems).toContain('required_modules_missing');
  });

  it('porta markers válidos detectados', () => {
    const result = checkReportQuality({
      text: '[[PORTA_FEED_T:6:T1:7]]',
      parserSuccess: true,
    });
    expect(result.portaMarkersValid).toBe(true);
  });

  it('teia complexidade detectada', () => {
    const result = checkReportQuality({
      text: '[[TEIA_COMPLEXIDADE:ALTA]]',
      parserSuccess: true,
    });
    expect(result.teiaComplexidadePresent).toBe(true);
  });
});
