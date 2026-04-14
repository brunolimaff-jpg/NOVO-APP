import { Message, Sender, type ClienteSeniorData } from '../types';
import { parseMarkdownSections } from './sectionParser';
import { extractAllLinksFromMarkdown, SourceRef } from './textCleaners';
import { normalizeMermaidBlocks } from './mermaid';

export { normalizeMermaidBlocks } from './mermaid';

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

interface ExecutiveSummarySpine {
  thesis: string;
  urgency: string;
  risk: string;
  direction: string;
  confidence: string;
}

interface EvidenceCandidate {
  moduleLabel: string;
  text: string;
  normalized: string;
}

function countPublicDataGaps(text: string): number {
  const matches = text.match(/não encontrado(?: nas fontes públicas)?/gi);
  return matches ? matches.length : 0;
}

function normalizeForMatch(text: string): string {
  return stripMarkdownFormatting(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatCompanyDisplayName(value: string): string {
  const cleaned = stripMarkdownFormatting(value);
  if (!cleaned) return '';

  const hasLowercase = /[a-zà-ÿ]/.test(cleaned);
  const hasUppercase = /[A-ZÀ-Ý]/.test(cleaned);
  const shouldNormalize = !hasLowercase || cleaned === cleaned.toLowerCase();
  if (!shouldNormalize) return cleaned;

  return cleaned
    .split(/\s+/)
    .map(word => {
      const trimmed = word.trim();
      if (!trimmed) return trimmed;
      if (/^[A-Z0-9]{2,4}$/.test(trimmed)) return trimmed.toUpperCase();
      const lower = trimmed.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function looksLikeGenericExecutivePhrase(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return [
    'movimento estrutural',
    'janela real de decisao',
    'reposicionar a conversa',
    'abordagem executiva orientada',
    'narrativa generica de prospeccao',
    'priorizacao comercial',
  ].some(fragment => normalized.includes(fragment));
}

function cleanEvidenceSnippet(text: string): string {
  return stripMarkdownFormatting(text)
    .replace(/^[A-Za-zÀ-ÿ0-9\s()/.-]{3,40}:\s*/g, '')
    .replace(/\s*\([^)]{0,100}\)/g, '')
    .replace(/\bshadow IT\b/gi, 'dependências laterais')
    .replace(/\besteira nativa da Senior\b/gi, 'core atual')
    .replace(/\bCRM Senior\b/gi, 'core atual')
    .replace(/\bWMS\/TMS\b/gi, 'camadas logísticas paralelas')
    .replace(/\bbackoffice\b/gi, 'retaguarda')
    .replace(/\s+/g, ' ')
    .replace(/[.]+$/g, '')
    .trim();
}

function summarizePainPoint(rawText: string): string {
  const cleaned = cleanEvidenceSnippet(rawText);
  const normalized = normalizeForMatch(cleaned);

  if (/\b(logist|frete|patio|pátio|expedic|pluma|graos|grãos)\b/.test(normalized)) {
    return 'uma borda logística crítica ainda fora do core operacional';
  }
  if (/\b(compliance|fiscal|auditoria|esocial|sst|multa|autu)\b/.test(normalized)) {
    return 'uma frente de compliance com impacto operacional direto';
  }
  if (/\b(planilha|manual|integracao manual|camadas logisticas paralelas|dependencias laterais|legado|retaguarda)\b/.test(normalized)) {
    return 'uma fricção operacional ainda sustentada por controles paralelos';
  }
  if (/\b(decisor|cadeia de comando|orcamento|orçamento|janela)\b/.test(normalized)) {
    return 'uma frente decisória ainda aberta para captura comercial';
  }

  if (cleaned.length <= 110) return cleaned;
  return cleaned.split(/,|;| — /)[0].trim();
}

function collectEvidenceCandidates(modules: Array<{ title: string; content: string }>): EvidenceCandidate[] {
  const candidates: EvidenceCandidate[] = [];

  modules.forEach(section => {
    const moduleLabel = mapModuleTitleToLabel(section.title);
    const lines = section.content.split('\n');

    lines.forEach(line => {
      const cleaned = cleanEvidenceSnippet(line);
      if (!cleaned || cleaned.length < 26) return;
      if (/^#{1,6}\s/.test(line) || /^```/.test(line) || /^\|/.test(line)) return;
      if (looksLikeGenericExecutivePhrase(cleaned)) return;

      const normalized = normalizeComparableValue(cleaned);
      if (!normalized || candidates.some(candidate => candidate.normalized === normalized)) return;

      candidates.push({ moduleLabel, text: cleaned, normalized });
    });
  });

  return candidates;
}

function detectUrgencyNarrative(
  candidates: EvidenceCandidate[],
  primaryGap: string,
  foundSeniorBase: boolean,
): string {
  const realTriggerRules: Array<{ regex: RegExp; build: (evidence: string) => string }> = [
    {
      regex: /\b(expans|capex|investimento|planta|unidade|aquisicao|fusao)\b/,
      build: evidence => `A urgência vem de ${evidence}, um gatilho concreto para discutir controle antes que essa borda ganhe mais peso na operação.`,
    },
    {
      regex: /\b(compliance|fiscal|auditoria|esocial|sst|multa|autu)\b/,
      build: evidence => `A urgência vem de ${evidence}, um sinal de pressão regulatória que tende a encarecer rápido quando fica fora da conversa.`,
    },
    {
      regex: /\b(safra|plantio|colheita|orcamento|orçamento|budget)\b/,
      build: evidence => `A urgência vem de ${evidence}, o que abre uma janela prática para discutir padronização sem recorrer a senso artificial de urgência.`,
    },
  ];

  for (const candidate of candidates) {
    const normalized = normalizeForMatch(candidate.text);
    const matchedRule = realTriggerRules.find(rule => rule.regex.test(normalized));
    if (matchedRule) return matchedRule.build(summarizePainPoint(candidate.text));
  }

  const pressureCandidate = candidates.find(candidate =>
    /\b(logist|frete|patio|pátio|manual|integracao manual|legado|shadow it|wms|tms|compliance|fiscal|auditoria|expedic)\b/.test(
      normalizeForMatch(candidate.text),
    ),
  );

  if (pressureCandidate) {
    return `A prioridade aqui não depende de calendário: ${summarizePainPoint(pressureCandidate.text)}, e essa fricção tende a encarecer à medida que o volume cresce.`;
  }

  return foundSeniorBase
    ? 'Não há gatilho temporal forte nas fontes; a prioridade vem do espaço real de expansão sobre uma borda que a Senior ainda não domina por completo.'
    : `Não há gatilho temporal forte nas fontes; a prioridade vem de ${summarizePainPoint(primaryGap)}, sem inflar urgência.`;
}

function buildThesis(
  displayCompany: string,
  primaryGap: string,
  foundSeniorBase: boolean,
  totalModulos?: number,
): string {
  const moduleSuffix = totalModulos ? `, com ${totalModulos} módulos confirmados,` : '';
  const gapSummary = summarizePainPoint(primaryGap);
  return foundSeniorBase
    ? `${displayCompany} já é uma conta instalada Senior${moduleSuffix} e a melhor expansão de conta hoje está em ${gapSummary}.`
    : `${displayCompany} concentra uma dor executiva clara em ${gapSummary}, suficiente para abrir a conta por controle e eficiência.`;
}

function buildRiskStatement(primaryGap: string, foundSeniorBase: boolean): string {
  const gapSummary = summarizePainPoint(primaryGap);
  return foundSeniorBase
    ? `Se ${gapSummary} seguir fora do core, a Senior deixa espaço para satélites exatamente na borda que deveria puxar a próxima expansão.`
    : `Se ${gapSummary} entrar na conversa como tema secundário, a conta tende a seguir com remendos laterais e adiar uma discussão executiva de verdade.`;
}

function buildDirectionStatement(foundSeniorBase: boolean): string {
  return foundSeniorBase
    ? 'Entrar pela borda crítica já exposta e conduzir a conversa como expansão de controle, padronização e domínio operacional sobre um fluxo ainda fora do core.'
    : 'Abrir a conta pela dor mais visível e sustentar a tese em controle, eficiência e redução de exposição antes de discutir desenho de solução.';
}

function buildConfidenceStatement(
  representativeSignals: Array<{ label: string; signal: string }>,
  publicDataGaps: number,
  inconsistencyDetected: boolean,
): string {
  const uniqueLabels = new Set(representativeSignals.map(signal => signal.label));
  if (inconsistencyDetected) {
    return 'Confiança moderada: a tese aparece em mais de um módulo, mas o dossiê ainda traz pontos que exigem validação antes de avançar para proposta.';
  }
  if (uniqueLabels.size >= 2 && publicDataGaps === 0) {
    return 'Confiança alta: a tese se repete em múltiplos módulos e não depende de um único indício do dossiê.';
  }
  if (publicDataGaps >= 6) {
    return 'Confiança moderada: a direção comercial é válida, mas as fontes públicas ainda deixam áreas cegas relevantes.';
  }
  return 'Confiança moderada: a leitura tem fundamento, mas ainda se apoia em poucos sinais independentes.';
}

function buildExecutiveSummarySpine(
  text: string,
  modules: Array<{ title: string; content: string }>,
  options?: {
    companyName?: string | null;
    clienteSeniorData?: ClienteSeniorData;
    inconsistencyDetected?: boolean;
  },
): ExecutiveSummarySpine {
  const displayCompany =
    formatCompanyDisplayName(options?.companyName || '') ||
    formatCompanyDisplayName(options?.clienteSeniorData?.grupo || '') ||
    'A conta analisada';
  const totalModulos = options?.clienteSeniorData?.totalModulos;
  const foundSeniorBase = Boolean(options?.clienteSeniorData?.encontrado);
  const evidenceCandidates = collectEvidenceCandidates(modules);
  const primaryGap =
    extractStrategicGap(text) ||
    extractExecutiveSignal(modules[0]?.content || '') ||
    'uma fricção operacional relevante entre operação, arquitetura e governança';

  const representativeSignals = modules
    .slice(0, 3)
    .map(section => {
      const label = mapModuleTitleToLabel(section.title);
      const signal = extractExecutiveSignal(section.content);
      if (!signal) return null;
      return { label, signal };
    })
    .filter((item): item is { label: string; signal: string } => Boolean(item));

  const publicDataGaps = countPublicDataGaps(text);
  const thesis = buildThesis(displayCompany, primaryGap, foundSeniorBase, totalModulos);
  const urgency = detectUrgencyNarrative(evidenceCandidates, primaryGap, foundSeniorBase);
  const risk = buildRiskStatement(primaryGap, foundSeniorBase);
  const direction = buildDirectionStatement(foundSeniorBase);
  const confidence = buildConfidenceStatement(
    representativeSignals,
    publicDataGaps,
    Boolean(options?.inconsistencyDetected),
  );

  return {
    thesis,
    urgency,
    risk,
    direction,
    confidence,
  };
}

export function buildMainDossierExecutiveIntro(
  fullText: string,
  companyName?: string | null,
  clienteSeniorData?: ClienteSeniorData,
): string {
  const sections = parseMarkdownSections(fullText);
  const modules = sections.filter(section => section.level === 1 && section.kind === 'module');
  if (modules.length === 0) return '';
  const spine = buildExecutiveSummarySpine(fullText, modules, {
    companyName,
    clienteSeniorData,
    inconsistencyDetected: false,
  });

  return [
    '## 📌 Resumo Executivo',
    '',
    `- **Tese da Conta:** ${spine.thesis}`,
    `- **Por Que Agir Agora:** ${spine.urgency}`,
    `- **Risco de Inação:** ${spine.risk}`,
    `- **Direção Recomendada:** ${spine.direction}`,
    `- **Sinal de Confiança:** ${spine.confidence}`,
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
  const sourceText = normalizeMermaidBlocks(fullText);
  const mainSection = sections[0] || sourceText;
  const context = pickExecutiveContext(mainSection);
  const sectionCount = sections.length;
  const aprofundamentos = Math.max(0, sectionCount - 1);
  const parsedSections = parseMarkdownSections(sourceText);
  const modules = parsedSections.filter(section => section.level === 1 && section.kind === 'module');
  const spine = buildExecutiveSummarySpine(sourceText, modules, {
    inconsistencyDetected: Boolean(inconsistenciesSection),
  });

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
    `- **Tese da Conta:** ${spine.thesis}`,
    `- **Por Que Agir Agora:** ${spine.urgency}`,
    `- **Risco de Inação:** ${spine.risk}`,
    `- **Direção Recomendada:** ${spine.direction}`,
    `- **Sinal de Confiança:** ${spine.confidence}`,
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
