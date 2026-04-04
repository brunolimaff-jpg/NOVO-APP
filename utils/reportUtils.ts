import { Message, Sender } from '../types';
import { extractAllLinksFromMarkdown, SourceRef } from './textCleaners';

function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function pushSourceUnique(allLinks: SourceRef[], link: SourceRef): void {
  const normalized = normalizeSourceUrl(link.url);
  if (!normalized) return;
  if (!allLinks.find(l => normalizeSourceUrl(l.url) === normalized)) {
    allLinks.push({ title: link.title, url: normalized });
  }
}

export function collectFullReport(messages: Message[]): { text: string; sections: string[]; allLinks: SourceRef[] } {
  const botMessages = messages.filter(m => {
    return m.sender === Sender.Bot && typeof m.text === 'string' && m.text.length > 50;
  });
  if (botMessages.length === 0) return { text: '', sections: [], allLinks: [] };

  const sections: string[] = [];
  const allLinks: SourceRef[] = [];
  const dossieText = botMessages[0].text;
  sections.push(dossieText);
  const dossieLinks = extractAllLinksFromMarkdown(dossieText);
  dossieLinks.forEach(link => pushSourceUnique(allLinks, link));
  (botMessages[0].groundingSources || []).forEach(source =>
    pushSourceUnique(allLinks, { title: source.title || source.url, url: source.url }),
  );

  for (let i = 1; i < botMessages.length; i++) {
    const botText = botMessages[i].text;
    const botIndex = messages.indexOf(botMessages[i]);
    let userQuestion = '';
    for (let j = botIndex - 1; j >= 0; j--) {
      if (messages[j].sender === Sender.User) { userQuestion = messages[j].text; break; }
    }
    if (botText.length > 50) {
      const sectionHeader = userQuestion
        ? `\n\n---\n\n## 🔍 APROFUNDAMENTO: ${userQuestion}\n\n`
        : `\n\n---\n\n## 🔍 APROFUNDAMENTO #${i}\n\n`;
      sections.push(sectionHeader + botText);
      const sectionLinks = extractAllLinksFromMarkdown(botText);
      sectionLinks.forEach(link => pushSourceUnique(allLinks, link));
      (botMessages[i].groundingSources || []).forEach(source =>
        pushSourceUnique(allLinks, { title: source.title || source.url, url: source.url }),
      );
    }
  }
  return { text: sections.join('\n\n'), sections, allLinks };
}

const MERMAID_JSON_PATTERN = /\{"mermaid":"([\s\S]*?)"\}/g;

function normalizeInlineMermaidClasses(chart: string): string {
  const classLines: string[] = [];
  const seenClassAssignments = new Set<string>();
  const normalized = chart.replace(
    /([A-Za-z][\w-]*)(\s*(?:\[[^\]\n]+\]|\([^\)\n]+\)|\{[^\}\n]+\}|>"[^"\n]+"|>"[^"\n]*"|"(?:[^"\n]+)"))\s*:::\s*([A-Za-z][\w-]*)/g,
    (_full, nodeId: string, nodeShape: string, className: string) => {
      const classLine = `class ${nodeId} ${className};`;
      if (!seenClassAssignments.has(classLine)) {
        seenClassAssignments.add(classLine);
        classLines.push(classLine);
      }
      return `${nodeId}${nodeShape}`;
    }
  );

  if (classLines.length === 0) return normalized;
  return `${normalized}\n${classLines.join('\n')}`;
}

export function normalizeMermaidBlocks(markdown: string): string {
  if (!markdown) return '';
  const fence = '`'.repeat(3);
  return markdown
    .replace(MERMAID_JSON_PATTERN, (_m, raw: string) => {
      const unescaped = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return `\n${fence}mermaid\n${normalizeInlineMermaidClasses(unescaped)}\n${fence}\n`;
    })
    .replace(/```mermaid\s*([\s\S]*?)```/gi, (_m, raw: string) => {
      return `${fence}mermaid\n${normalizeInlineMermaidClasses(raw.trim())}\n${fence}`;
    });
}

function normalizeComparableValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickExecutiveContext(section: string): string {
  const candidates = section
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (/^#{1,6}\s/.test(line)) return false;
      if (/^```/.test(line)) return false;
      if (/^[-*]\s+/.test(line)) return false;
      if (/^\d+\.\s+/.test(line)) return false;
      return line.length >= 40;
    });
  return candidates[0] || 'Relatório consolidado a partir do dossiê e dos aprofundamentos da conversa.';
}

function collectMetricValues(text: string, regex: RegExp): string[] {
  regex.lastIndex = 0;
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = (match[1] || '').trim();
    if (!raw) continue;
    if (!values.find(v => normalizeComparableValue(v) === normalizeComparableValue(raw))) {
      values.push(raw);
    }
  }
  return values;
}

export function generateExecutiveSummary(fullText: string, sections: string[], inconsistenciesSection: string): string {
  const sourceText = normalizeMermaidBlocks(fullText);
  const mainSection = sections[0] || sourceText;
  const context = pickExecutiveContext(mainSection);
  const sectionCount = sections.length;
  const aprofundamentos = Math.max(0, sectionCount - 1);

  const metricPatterns = [
    { label: 'Faturamento/Receita', regex: /(?:faturamento|receita)[^:\n]*:?\s*(R?\$?\s*\d[\d.,]*(?:\s*(?:mil|mi|milhão|milhões|bi|bilhão|bilhões|tri|trilhão|trilhões))?)/gi },
    { label: 'Área (ha)', regex: /(\d[\d.,]*\s*(?:mil|mi|milhão|milhões)?\s*(?:hectares|ha)\b)/gi },
    { label: 'Funcionários', regex: /(\d[\d.,]*\s*(?:mil|mi|milhão|milhões)?\s*(?:funcionários|colaboradores|empregados)\b)/gi },
    { label: 'Unidades/Fábricas', regex: /(\d[\d.,]*\s*(?:unidades|filiais|fábricas|plantas|usinas)\b)/gi },
  ] as const;

  const metricLines = metricPatterns
    .map(({ label, regex }) => {
      const values = collectMetricValues(sourceText, regex);
      if (!values.length) return null;
      return `- **${label}:** ${values.slice(0, 2).join(' · ')}`;
    })
    .filter(Boolean)
    .join('\n');

  const mermaidBlocks =
    (sourceText.match(/```mermaid[\s\S]*?```/gi) || []).length +
    (fullText.match(MERMAID_JSON_PATTERN) || []).length;

  const inconsistencyNote = inconsistenciesSection
    ? '- **Validação obrigatória:** foram detectadas inconsistências entre seções; os pontos marcados como "precisa validar" devem ser confirmados antes de uso comercial.'
    : '- **Validação obrigatória:** não foram encontradas inconsistências numéricas automáticas entre seções.';

  return [
    '## 📌 RESUMO EXECUTIVO',
    '',
    `- **Escopo compilado:** ${sectionCount} seção(ões), com ${aprofundamentos} aprofundamento(s).`,
    `- **Síntese inicial:** ${context}`,
    mermaidBlocks > 0
      ? `- **Diagramas mermaid:** ${mermaidBlocks} bloco(s) incluído(s) no relatório para leitura visual dos fluxos.`
      : '- **Diagramas mermaid:** nenhum bloco mermaid identificado no conteúdo consolidado.',
    inconsistencyNote,
    metricLines,
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function detectInconsistencies(sections: string[]): string {
  if (sections.length < 2) return '';
  const inconsistencies = new Set<string>();
  const patterns = [
    { label: 'Faturamento/Receita', regex: /(?:faturamento|receita)[^:\n]*:?\s*(R?\$?\s*\d[\d.,]*(?:\s*(?:mil|mi|milhão|milhões|bi|bilhão|bilhões|tri|trilhão|trilhões))?)/gi },
    { label: 'Área/Hectares', regex: /(\d[\d.,]*\s*(?:mil|mi|milhão|milhões)?\s*(?:hectares|ha)\b)/gi },
    { label: 'Funcionários', regex: /(\d[\d.,]*\s*(?:mil|mi|milhão|milhões)?\s*(?:funcionários|colaboradores|empregados)\b)/gi },
    { label: 'Unidades', regex: /(\d[\d.,]*\s*(?:unidades|filiais|fábricas|plantas|usinas)\b)/gi },
  ];

  const mainSection = sections[0];
  const mainSectionNormalized = normalizeMermaidBlocks(mainSection);

  for (let i = 1; i < sections.length; i++) {
    const drilldown = normalizeMermaidBlocks(sections[i]);
    for (const { label, regex } of patterns) {
      const mainMatches = collectMetricValues(mainSectionNormalized, regex);
      const drillMatches = collectMetricValues(drilldown, regex);
      if (mainMatches.length > 0 && drillMatches.length > 0) {
        const overlap = drillMatches.some(dr =>
          mainMatches.some(main => normalizeComparableValue(main) === normalizeComparableValue(dr))
        );
        if (!overlap) {
          inconsistencies.add(
            `**${label}:** dossiê principal traz *${mainMatches[0]}* e aprofundamento traz *${drillMatches[0]}* — **precisa validar** qual valor está correto e mais atualizado.`
          );
        }
      }
    }
  }

  if (inconsistencies.size === 0) return '';
  return '\n\n---\n\n## ⚠️ INCONSISTÊNCIAS DETECTADAS\n\n' +
    '> Os dados abaixo apareceram com valores diferentes entre o dossiê principal e os aprofundamentos. Todos os itens estão marcados com "**precisa validar**" e devem ser confirmados antes de uso em proposta comercial.\n\n' +
    Array.from(inconsistencies).map((inc, i) => `${i + 1}. ${inc}`).join('\n') + '\n';
}
