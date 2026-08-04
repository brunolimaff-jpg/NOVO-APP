import { describe, it, expect } from 'vitest';
import {
  collectFullReport,
  detectInconsistencies,
  generateExecutiveSummary,
  normalizeMermaidBlocks,
} from '../../utils/reportUtils';
import { Sender, type Message } from '../../types';

describe('detectInconsistencies', () => {
  it('returns empty string for single section', () => {
    expect(detectInconsistencies(['Some text'])).toBe('');
  });

  it('returns empty string when no inconsistencies found', () => {
    const sections = ['Faturamento: R$ 500 milhões, 1000 hectares', 'Faturamento: R$ 500 milhões, 1000 hectares'];
    expect(detectInconsistencies(sections)).toBe('');
  });

  it('detects faturamento inconsistency', () => {
    const sections = ['Faturamento: R$ 500 milhões', 'Faturamento: R$ 800 milhões'];
    const result = detectInconsistencies(sections);
    expect(result).toContain('INCONSISTÊNCIAS DETECTADAS');
    expect(result).toContain('Faturamento');
    expect(result).toContain('precisa validar');
  });

  it('detects employee count inconsistency', () => {
    const sections = ['1500 funcionários na empresa', '2000 funcionários na empresa'];
    const result = detectInconsistencies(sections);
    expect(result).toContain('Funcionários');
  });

  it('returns empty for less than 2 sections', () => {
    expect(detectInconsistencies([])).toBe('');
    expect(detectInconsistencies(['one'])).toBe('');
  });
});

describe('report export helpers', () => {
  it('normalizes JSON mermaid payload to fenced block', () => {
    const input = 'Antes {"mermaid":"graph TD\\nA-->B"} Depois';
    const result = normalizeMermaidBlocks(input);
    expect(result).toContain('```mermaid');
    expect(result).toContain('graph TD');
  });

  it('builds executive summary with validation warning when inconsistencies exist', () => {
    const fullText = '# Empresa X\n\nA empresa opera no agro.\n\n```mermaid\ngraph TD\nA-->B\n```';
    const sections = [fullText, 'Área total: 40 mil ha'];
    const inconsistency = '## ⚠️ INCONSISTÊNCIAS DETECTADAS\n\n1. **Área/Hectares:** ... precisa validar ...';
    const summary = generateExecutiveSummary(fullText, sections, inconsistency);
    expect(summary).toContain('RESUMO EXECUTIVO');
    expect(summary).toContain('Tese da Conta');
    expect(summary).toContain('Por Que Agir Agora');
    expect(summary).toContain('Risco de Inação');
    expect(summary).toContain('Direção Recomendada');
    expect(summary).toContain('Sinal de Confiança');
    expect(summary).toContain('Validação obrigatória');
    expect(summary).toContain('precisa validar');
    expect(summary).not.toContain('movimento estrutural');
  });

  it('does not leak compile telemetry into the executive summary', () => {
    const fullText = '# Empresa X\n\nA empresa opera no agro.\n\n```mermaid\ngraph TD\nA-->B\n```';
    const summary = generateExecutiveSummary(fullText, [fullText], '');
    expect(summary).not.toContain('Escopo compilado');
    expect(summary).not.toContain('seção(ões)');
    expect(summary).not.toContain('Diagramas mermaid');
    expect(summary).not.toContain('Síntese inicial');
  });

  it('does not repeat the same long gap phrase in thesis, urgency and risk', () => {
    const pontoCego =
      'O Ponto Cego: A estrutura de controle é dominada por uma holding patrimonial e uma família com 6 sócios-administradores, indicando governança familiar consolidada, mas a escala operacional real permanece oculta nas fontes públicas.';
    const fullText = `# Empresa X\n\n${pontoCego}\n\nA operação é verticalizada da lavoura ao beneficiamento.`;
    const summary = generateExecutiveSummary(fullText, [fullText], '');

    // A frase longa do Ponto Cego não pode ser colada inteira na tese nem no risco
    const longFragment = 'A estrutura de controle é dominada por uma holding patrimonial e uma família com 6 sócios';
    expect(summary).not.toContain(longFragment);

    // Tese, urgência e risco devem ter textos distintos entre si
    const thesis = summary.match(/\*\*Tese da Conta:\*\* ([^\n]+)/)?.[1] ?? '';
    const urgency = summary.match(/\*\*Por Que Agir Agora:\*\* ([^\n]+)/)?.[1] ?? '';
    const risk = summary.match(/\*\*Risco de Inação:\*\* ([^\n]+)/)?.[1] ?? '';
    const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    expect(normalize(thesis)).not.toBe(normalize(urgency));
    expect(normalize(thesis)).not.toBe(normalize(risk));
    expect(normalize(urgency)).not.toBe(normalize(risk));
  });

  it('includes grounding sources from bot messages in exported links', () => {
    const messages: Message[] = [
      {
        id: 'u1',
        sender: Sender.User,
        text: 'Investigar empresa X',
        timestamp: new Date(),
      },
      {
        id: 'b1',
        sender: Sender.Bot,
        text: 'Relatório base com conteúdo extenso o suficiente para exportar.'.repeat(2),
        timestamp: new Date(),
        groundingSources: [
          { title: 'Fonte Oficial', url: 'https://example.com/source' },
          { title: 'Fonte Oficial duplicada', url: 'https://example.com/source/' },
        ],
      },
    ];

    const result = collectFullReport(messages);
    expect(result.allLinks.some(link => link.url === 'https://example.com/source')).toBe(true);
    expect(result.allLinks.filter(link => link.url === 'https://example.com/source')).toHaveLength(1);
  });
});
