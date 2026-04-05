import { describe, it, expect } from 'vitest';
import {
  buildMainDossierExecutiveIntro,
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
    const sections = [
      'Faturamento: R$ 500 milhões, 1000 hectares',
      'Faturamento: R$ 500 milhões, 1000 hectares',
    ];
    expect(detectInconsistencies(sections)).toBe('');
  });

  it('detects faturamento inconsistency', () => {
    const sections = [
      'Faturamento: R$ 500 milhões',
      'Faturamento: R$ 800 milhões',
    ];
    const result = detectInconsistencies(sections);
    expect(result).toContain('INCONSISTÊNCIAS DETECTADAS');
    expect(result).toContain('Faturamento');
    expect(result).toContain('precisa validar');
  });

  it('detects employee count inconsistency', () => {
    const sections = [
      '1500 funcionários na empresa',
      '2000 funcionários na empresa',
    ];
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
    expect(summary).toContain('Validação obrigatória');
    expect(summary).toContain('precisa validar');
    expect(summary).toContain('Diagramas mermaid');
  });

  it('builds an executive intro for the main dossier without exposing PORTA language', () => {
    const intro = buildMainDossierExecutiveIntro(
      [
        '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL - GRUPO SCHEFFER',
        '',
        '**🎯 RADAR DE ESTRUTURA E CAPEX**',
        '* **O Calcanhar de Aquiles:** a logística de saída ainda opera fora da esteira nativa da Senior.',
        '',
        '# 🦅 DOSSIÊ SCOUT 360: ARQUITETURA DE TI E DÍVIDA TÉCNICA - GRUPO SCHEFFER',
        '',
        '**🎯 RADAR DO ECOSSISTEMA SISTÊMICO**',
        '* **A Ruptura Crítica:** o gap de WMS/TMS mantém shadow IT na ponta logística.',
      ].join('\n'),
      'Grupo Scheffer',
      { encontrado: true, grupo: 'GRUPO SCHEFFER', totalModulos: 74 },
    );

    expect(intro).toContain('## 📌 Resumo Executivo');
    expect(intro).toContain('## 🔭 Leitura do Caso');
    expect(intro).toContain('74 módulos confirmados');
    expect(intro).toContain('expansão de conta');
    expect(intro).not.toContain('Dimensão O');
    expect(intro).not.toContain('Nota O sugerida');
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
