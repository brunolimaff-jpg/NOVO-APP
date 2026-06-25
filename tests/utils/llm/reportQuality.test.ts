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
const REDACTED_THINKING_TAG = 'redacted_' + 'thinking';

// DeepSeek V3.2 generates different headings and lacks [[TEIA_COMPLEXIDADE]] markers
// but still produces valid PORTA markers and meaningful content
const DEEPSEEK_EXCERPT = `# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL - SCHEFFER

**🎯 RADAR DE ESTRUTURA E CAPEX**

- **DNA Operacional:** Empresa verticalizada no agronegócio, com produção agrícola própria de grãos.
- **Pegada de Chão:** Opera em 220-230 mil hectares distribuídos em duas safras.

### 🔗 MAPA DE ELOS DA CADEIA DE VALOR

| Elo | Status | Evidência |
| --- | ------ | --------- |
| Plantio próprio | ✅ | Produção própria. |

### 🗺️ MAPA DO CAOS OPERACIONAL

Descrição do mapa operacional.

### 🩸 PONTOS DE FALHA OPERACIONAL

Ponto de Falha 1: Gestão de Custos Agrícolas por Talhão

### 🔍 DISCREPÂNCIAS OPERACIONAIS (se houver)

Discrepância descrita.

[[PORTA_FEED_O:6:ELOS:Plantio,Armazenagem,Beneficiamento,Industrialização]]
[[PORTA_FEED_R:5:PRESSOES:Rastreabilidade,Certificacoes]]
[[PORTA_FLAG:NOFIT:NAO]]

**Fontes Citadas:**
1. [[1]](https://www.scheffer.com.br/sobre) - Site Institucional Scheffer.`;

// Sonnet 4.6 also uses different headings, no TEIA marker, but has valid PORTA markers
const SONNET_EXCERPT = `# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL — SCHEFFER AGROPECUÁRIA

> **Nota de escopo:** O CNPJ 04.733.767/0001-80 corresponde à Scheffer Agropecuária.

## 🎯 RADAR DE ESTRUTURA E CAPEX

- **DNA Operacional:** Produção agrícola em larga escala com verticalização.
- **Pegada de Chão:** ~220.000–230.000 ha cultivados em duas safras.

## 🔗 MAPA DE ELOS DA CADEIA DE VALOR

| Elo | Status | Evidência |
| --- | ------ | --------- |
| Plantio próprio | ✅ | Confirmado. |

## 🗺️ MAPA DO CAOS OPERACIONAL

\`\`\`mermaid
graph LR
    A["Plantio"] ==> B["Armazenagem"]
\`\`\`

## 🩸 PONTOS DE FALHA OPERACIONAL

Ponto de Falha 1: Reconciliação Multi-Unidade.

## 🔍 DISCREPÂNCIAS OPERACIONAIS

Descrição de discrepância.

## 📋 FONTES CONSULTADAS

| # | URL | Uso |
| 1 | https://schefferagro.com.br | Site institucional |

[[PORTA_FEED_O:8:ELOS:Plantio,Armazenagem,Beneficiamento,Sementes]]
[[PORTA_FEED_R:6:PRESSOES:CertificacaoBCI,Regenagri,ABR]]
[[PORTA_FLAG:NOFIT:NAO]]`;

// Content that looks like a model stuck in a loop
const LOOP_CONTENT = `De acordo com a sua solicitação, preciso analisar os dados.
De acordo com a sua solicitação, preciso analisar os dados.
De acordo com a sua solicitação, preciso analisar os dados.
De acordo com a sua solicitação, preciso analisar os dados.
De acordo com a sua solicitação, preciso analisar os dados.`;

// PORTA-like content without double brackets (alternative format)
const FLEXIBLE_PORTA_CONTENT = `# Dossiê

## Radar
Conteúdo com PORTA: 7

A pontuação PORTA indica:

- Porte: grande
- Operação: verticalizada

Score PORTA_FEED: 6`;

describe('checkReportQuality', () => {
  // --- Existing tests (must still pass) ---

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

  it('dossiê vazio é quality_failure', () => {
    const result = checkReportQuality({ text: '   ' });
    expect(result.isQualityFailure).toBe(true);
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
    const thinkingOnly = `<${REDACTED_THINKING_TAG}>só raciocínio</${REDACTED_THINKING_TAG}>`;
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

  // --- Non-Gemini lenient mode tests ---

  it('DeepSeek V3.2 output com provider litellm não falha qualidade', () => {
    const result = checkReportQuality({
      text: DEEPSEEK_EXCERPT,
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.isQualityFailure).toBe(false);
    expect(result.portaMarkersValid).toBe(true);
    expect(result.problems).not.toContain('teia_complexidade_missing');
    expect(result.problems).not.toContain('required_modules_missing');
  });

  it('DeepSeek V3.2 output sem provider (modo Gemini) falha qualidade', () => {
    const result = checkReportQuality({
      text: DEEPSEEK_EXCERPT,
      parserSuccess: true,
      // provider defaults to 'gemini' — strict mode
    });
    // DeepSeek lacks # Teia Societária headings and [[TEIA_COMPLEXIDADE:*]]
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('required_modules_missing');
    expect(result.problems).toContain('teia_complexidade_missing');
  });

  it('Sonnet 4.6 output com provider litellm não falha qualidade', () => {
    const result = checkReportQuality({
      text: SONNET_EXCERPT,
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.isQualityFailure).toBe(false);
    expect(result.portaMarkersValid).toBe(true);
    expect(result.problems).not.toContain('teia_complexidade_missing');
    expect(result.problems).not.toContain('required_modules_missing');
  });

  it('Sonnet 4.6 output sem provider (modo Gemini) falha qualidade', () => {
    const result = checkReportQuality({
      text: SONNET_EXCERPT,
      parserSuccess: true,
      // provider defaults to 'gemini' — strict mode
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('required_modules_missing');
    expect(result.problems).toContain('teia_complexidade_missing');
  });

  it('PORTA markers flexíveis (sem colchetes duplos) reconhecidos em modo lenient', () => {
    const result = checkReportQuality({
      text: FLEXIBLE_PORTA_CONTENT,
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.portaMarkersValid).toBe(true);
    expect(result.isQualityFailure).toBe(false);
  });

  it('PORTA markers flexíveis NÃO são reconhecidos em modo Gemini', () => {
    const result = checkReportQuality({
      text: FLEXIBLE_PORTA_CONTENT,
      parserSuccess: true,
      // provider defaults to 'gemini'
    });
    // Strict regex requires [[...]] format
    expect(result.portaMarkersValid).toBe(false);
    expect(result.isQualityFailure).toBe(true);
  });

  it('conteúdo em loop falha em modo lenient', () => {
    const result = checkReportQuality({
      text: LOOP_CONTENT,
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('insufficient_content');
  });

  it('conteúdo curto falha em modo lenient', () => {
    const result = checkReportQuality({
      text: 'Texto curto de 40 chars - muito pouco conteúdo.',
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('insufficient_content');
  });

  it('report vazio falha em qualquer modo', () => {
    const result = checkReportQuality({
      text: '',
      parserSuccess: true,
      provider: 'litellm',
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('empty_report');
  });

  it('Gemini continua rigoroso mesmo com provider explicit gemini', () => {
    const result = checkReportQuality({
      text: DEEPSEEK_EXCERPT,
      parserSuccess: true,
      provider: 'gemini',
    });
    expect(result.isQualityFailure).toBe(true);
    expect(result.problems).toContain('required_modules_missing');
    expect(result.problems).toContain('teia_complexidade_missing');
  });
});
