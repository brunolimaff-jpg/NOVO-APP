import { Message, Sender, type ClienteSeniorData } from '../types';
import { parseMarkdownSections } from './sectionParser';
import { extractAllLinksFromMarkdown, SourceRef } from './textCleaners';
import { normalizeMermaidBlocks as mermaidNormalize } from './mermaid';

export { normalizeMermaidBlocks } from './mermaid';

export function sanitizeMermaidLabel(label: string): string {
  return `"${label.replace(/"/g, '\\"')}"`;
}

function normalizeSourceUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function pushSourceUnique(allLinks: SourceRef[], link: SourceRef): void {
  const normalized = normalizeSourceUrl(link.url);
  if (!normalized) return;
  if (!allLinks.find(l => normalizeSourceUrl(l.url) === normalized)) {
    allLinks.push({ id: `src-${allLinks.length + 1}`, title: link.title, url: normalized });
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
    pushSourceUnique(allLinks, { id: `grnd-0-${allLinks.length}`, title: source.title || source.url, url: source.url }),
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
        pushSourceUnique(allLinks, { id: `grnd-${i}-${allLinks.length}`, title: source.title || source.url, url: source.url }),
      );
    }
  }
  return { text: sections.join('\n\n'), sections, allLinks };
}

const MERMAID_JSON_PATTERN = /\{"mermaid":"([\s\S]*?)"\}/g;

function stripMarkdownFormatting(value: string): string {
  return value
    .replace(/\[\[PORTA[^\]]*\]\]/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapModuleTitleToLabel(title: string): string {
  const normalized = stripMarkdownFormatting(title).toLowerCase();
  if (/inteligencia operacional|operacional/.test(normalized)) return 'Operação';
  if (/arquitetura de ti|divida tecnica|tech stack/.test(normalized)) return 'Arquitetura';
  if (/compliance|risco fiscal/.test(normalized)) return 'Compliance';
  if (/teia societaria|massa real|expansao/.test(normalized)) return 'Escala';
  if (/rh|gestao de pessoas|sst/.test(normalized)) return 'Pessoas';
  if (/cadeia de comando|decisores/.test(normalized)) return 'Decisão';
  if (/orcamento|janela/.test(normalized)) return 'Orçamento';
  return 'Leitura';
}

function extractExecutiveSignal(sectionContent: string): string | null {
  const lines = sectionContent
    .split('\n')
    .map(line => stripMarkdownFormatting(line))
    .filter(line => {
      if (!line) return false;
      if (/^#{1,6}\s/.test(line)) return false;
      if (/^```/.test(line)) return false;
      if (/^\|/.test(line)) return false;
      if (/^[-–—]{3,}$/.test(line)) return false;
      if (/^(o fato|a mecanica da dor|impacto estimado|conexao com sistema|evidencia|status)$/i.test(line)) {
        return false;
      }
      return line.length >= 28;
    });

  for (const line of lines) {
    const afterLabel = line.match(/^[A-Za-zÀ-ÿ0-9\s()/.-]{3,40}:\s*(.+)$/)?.[1]?.trim();
    if (afterLabel && afterLabel.length >= 24) {
      return afterLabel.replace(/\.+$/, '');
    }
  }

  return lines[0]?.replace(/\.+$/, '') || null;
}

function extractStrategicGap(text: string): string | null {
  const lines = text
    .split('\n')
    .map(line => stripMarkdownFormatting(line))
    .filter(Boolean);

  const targetLabels = [
    'calcanhar de aquiles',
    'ruptura critica',
    'ponto cego',
    'bomba relogio',
    'fraqueza do incumbente',
    'hemorragias da fragmentacao',
  ];

  for (const line of lines) {
    const normalized = line
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (targetLabels.some(label => normalized.includes(label))) {
      const afterColon = line.match(/:\s*(.+)$/)?.[1]?.trim();
      return (afterColon || line).replace(/\.+$/, '');
    }
  }

  return null;
}

export function buildMainDossierExecutiveIntro(
  fullText: string,
  companyName?: string | null,
  clienteSeniorData?: ClienteSeniorData,
): string {
  const sections = parseMarkdownSections(fullText);
  const modules = sections.filter(section => section.level === 1 && section.kind === 'module');
  if (modules.length === 0) return '';

  const displayCompany =
    stripMarkdownFormatting(companyName || '') ||
    stripMarkdownFormatting(clienteSeniorData?.grupo || '') ||
    'A conta analisada';
  const totalModulos = clienteSeniorData?.totalModulos;
  const primaryGap =
    extractStrategicGap(fullText) ||
    extractExecutiveSignal(modules[0]?.content || '') ||
    'há sinais de fricção operacional e necessidade de maior integração entre operação e gestão';

  const opening = clienteSeniorData?.encontrado
    ? `${displayCompany} já opera uma base relevante do ecossistema Senior${
        totalModulos ? ` (${totalModulos} módulos confirmados)` : ''
      }, o que desloca a tese comercial para expansão de conta, consolidação e defesa do território já conquistado.`
    : `${displayCompany} reúne sinais de escala e complexidade suficientes para uma abordagem executiva orientada a governança, eficiência operacional e captura de margem.`;

  const approach = clienteSeniorData?.encontrado
    ? 'A abordagem dominante deve fechar gaps periféricos, ampliar cobertura e impedir que soluções satélite avancem sobre uma conta que já tem core instalado.'
    : 'A abordagem dominante deve conectar dor observável, ganho executivo e janela real de decisão, evitando narrativa genérica de prospecção.'
    ;

  const bullets = modules
    .slice(0, 4)
    .map(section => {
      const label = mapModuleTitleToLabel(section.title);
      const signal = extractExecutiveSignal(section.content);
      if (!signal) return null;
      return `- **${label}:** ${signal}.`;
    })
    .filter((line): line is string => Boolean(line));

  if (bullets.length === 0) {
    bullets.push('- **Leitura consolidada:** o dossiê organiza a conta por operação, arquitetura, compliance e capacidade de execução comercial.');
  }

  return [
    '## 📌 Resumo Executivo',
    '',
    `${opening} A maior fissura observável hoje está em ${primaryGap}. ${approach}`,
    '',
    '## 🔭 Leitura do Caso',
    '',
    ...bullets,
    '',
  ].join('\n');
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
  const sourceText = mermaidNormalize(fullText);
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
  const mainSectionNormalized = mermaidNormalize(mainSection);

  for (let i = 1; i < sections.length; i++) {
    const drilldown = mermaidNormalize(sections[i]);
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
