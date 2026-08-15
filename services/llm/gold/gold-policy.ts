/**
 * RCA-05 — GOLD SEMANTIC POLICY (fonte canônica de política semântica).
 *
 * Definições, detectores e normalizadores SEMÂNTICOS compartilhados pelas
 * camadas do Gold: verifier, sanitizer, pipeline guard, Mermaid determinístico
 * e probe pré-Composer. Decisão do Planejador (2026-08-14): a política
 * conceitual tem UMA fonte canônica, mas as camadas NÃO precisam produzir a
 * mesma ação — a ação (remover/rebaixar/falhar/observar) continua em cada
 * boundary. Este módulo não decide nada; só define e detecta.
 *
 * Regra de governança (RCA-05): qualquer novo conceito semântico deve
 * entrar AQUI (primitiva canônica + corpus) antes de qualquer uso em
 * camada — nunca regex local em um arquivo de produção.
 */
import { z } from 'zod';

// ─── TEMA SENSÍVEL (internacionalização / holding / controle) ─────────────

/**
 * Formas de negócio de "tema sensível" observadas nas camadas. A detecção é
 * por formas explícitas (colômbia/colombiana/colombiano, cumaribo,
 * internacional[ização], exterior, holding, controlada/controladora/
 * controladoria, controle societário/acionário/familiar) — NÃO usa o
 * substring genérico "control" (casaria "controle de pragas" — falso
 * positivo de conceito de governança). Sem \b inicial para preservar
 * derivações como "internacionalização" e "colombiana" (substring de
 * "colombia").
 */
const SENSITIVE_THEME_PATTERN =
  /(col[oóô]mbi[aá]s?|colombian[ao]s?|cumaribo|internacional|exterior|holding|controlada\b|controladora\b|controladoria\b|controle\s+(societ[aá]rio|acion[aá]rio|familiar)\b)/i;

export function matchesSensitiveTheme(text: string): boolean {
  return SENSITIVE_THEME_PATTERN.test(text);
}

// ─── VOCABULÁRIO DE CERTEZA (confirmado/confirmada/plural/confirmadamente) ─

/** União das formas observadas: singular e plural, gênero e "confirmadamente". */
const CONFIRMED_VOCABULARY_PATTERN = /\b(confirmad[oa]s?|confirmadamente)\b/i;

export function matchesConfirmedVocabulary(text: string): boolean {
  return CONFIRMED_VOCABULARY_PATTERN.test(text);
}

/**
 * Frase que nega conhecimento (não é afirmação de fato) — não dispara hard
 * fail e o guard de certeza NÃO a neutraliza. Definição canônica única
 * (BRU-103): o guard usava um padrão amplo (qualquer "não" pulava a
 * neutralização), deixando "Operação internacional confirmada, mas não há
 * registro em Cumaribo." passar sem neutralizar — o verifier acusava e o
 * fail-closed (BRU-102) segurava no factual. Alinhar guard↔verifier na
 * MESMA definição de negação segura.
 */
const SAFE_KNOWLEDGE_NEGATION_PATTERN =
  /\b(n[aã]o\s+(est[áa]|foi|é)\s+(dispon[ií]vel|identificad[oa]s?|poss[ií]vel|confirmad[oa]s?)|deve\s+ser\s+confirmad[oa]s?|sem\s+evid[êe]ncia)\b/i;

export function matchesSafeKnowledgeNegation(text: string): boolean {
  return SAFE_KNOWLEDGE_NEGATION_PATTERN.test(text);
}

/**
 * Variante de REPLACE do vocabulário de certeza (sem o advérbio
 * "confirmadamente", que o guard de certeza trata como ocorrência separada).
 * Definida aqui para que nenhuma camada reescreva a regex à mão.
 */
export const confirmedVocabularyReplacementPattern = /\bconfirmad[ao]s?\b/gi;

/**
 * Neutraliza vocabulário de certeza para linguagem de pista/a validar,
 * preservando gênero e número (confirmada→mencionada, confirmados→
 * mencionados). Mantém a fusão de "operação internacional mencionada" →
 * "menção a operação internacional".
 */
export function neutralizeConfirmedVocabulary(claim: string): string {
  return claim
    .replace(/\bconfirmadamente\b/gi, 'possivelmente')
    .replace(/\bconfirmad[ao]s?\b/gi, (m) => {
      const plural = /s$/i.test(m);
      const fem = /as?$/i.test(m);
      return fem ? (plural ? 'mencionadas' : 'mencionada') : plural ? 'mencionados' : 'mencionado';
    })
    .replace(/\b(operaci[oó]n|opera[cç][aã]o)\s+(internacional\s+)?(mencionada|mencionado|mencionadas|mencionados)\b/gi, 'menção a operação internacional')
    .trim();
}

/**
 * I7 — variante de substituição para TEXTO do Gold (guard de certeza):
 * mesma cobertura de formas do detector (confirmado/confirmada/confirmados/
 * confirmadas/confirmadamente), SEM a fusão "operação internacional
 * mencionada → menção a operação internacional" (que é uma semântica de
 * claim do sanitizer; aplicá-la ao texto executivo mudaria frases além do
 * necessário). Equivalência de cobertura garantida por teste (detector ⇒
 * transformação para todas as formas do corpus).
 */
export function neutralizeConfirmedVocabularyInText(text: string): string {
  return text
    .replace(/\bconfirmadamente\b/gi, 'possivelmente')
    .replace(/\bconfirmad[ao]s?\b/gi, (m) => {
      const plural = /s$/i.test(m);
      const fem = /as?$/i.test(m);
      return fem ? (plural ? 'mencionadas' : 'mencionada') : plural ? 'mencionados' : 'mencionado';
    })
    .trim();
}

// ─── CAPACIDADE / PRODUTO / PRAZO / ROI / INTEGRAÇÃO ───────────────────────

/**
 * Claim de capacidade produtiva/operacional ou produto sem suporte (política
 * do Planejador). Definição mais completa entre as camadas (verifier): inclui
 * capacidade estática/produtiva/de produção/fabricação/armazenagem/estocagem/
 * processamento/esmagamento/moagem/refino/operação/atendimento/anual/mensal,
 * capacidade de medida (lookahead de valor com unidade), produção de, ROI,
 * retorno sobre, prazo de N, integração nativa, middleware. Não reprova
 * "capacidade de investimento/absorção/atender" (uso financeiro/gerencial).
 */
const UNSUPPORTED_OPERATIONAL_CLAIM_PATTERN =
  /\b(capacidade\s+(est[áa]tica|produtiva|de\s+(produ[cç][aã]o|fabrica[cç][aã]o|armazenagem|estocagem|processamento|esmagamento|moagem|refino|opera[cç][aã]o|atendimento|est[óo]cagem|anual|mensal|(?=\d+(?:[.,]\d+)?\s*(?:milh[oõ]es?|mil|sacas|toneladas|t\b|m³|m3|litros|kg))))|produ[cç][aã]o\s+de|roi|retorno\s+sobre|prazo\s+de\s+\d+|integra[cç][aã]o\s+nativa|middleware)\b/i;

export function matchesUnsupportedOperationalClaim(text: string): boolean {
  return UNSUPPORTED_OPERATIONAL_CLAIM_PATTERN.test(text);
}

// ─── MODALIDADE DE DISCOVERY (perguntas NÃO viram claims) ──────────────────

/** Valores numéricos com unidade (capacidade/medida) — removidos de perguntas. */
const PROTECTED_CLAIM_VALUE_PATTERN =
  /(?:\d+(?:[.,]\d+)?\s*(?:milh[oõ]es?|mil|sacas|toneladas|t\b|m³|m3|litros|kg))\b/gi;

/** Vocabulário protegido substituído por termo neutro em perguntas de discovery.
 *  BRU-108 (4): as regras são aplicadas em SINGLE-PASS (alternância) — o loop
 *  sequencial re-processava a saída da regra anterior ("capacidade de produção"
 *  → "volume de produção" → "produção de" → "volume de volume de"). */
const PROTECTED_CLAIM_VOCAB_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcapacidade\s+est[áa]tica\b/gi, 'volume'],
  [/\bcapacidade\s+produtiva\b/gi, 'volume'],
  [/\bcapacidade\s+de\s+armazenagem\b/gi, 'volume de armazenagem'],
  [/\bcapacidade\s+de\s+(produ[cç][aã]o|fabrica[cç][aã]o|processamento|esmagamento|moagem|refino|opera[cç][aã]o|atendimento|estocagem|est[óo]cagem)\b/gi, 'volume de $1'],
  [/\bcapacidade\s+(anual|mensal)\b/gi, 'volume $1'],
  [/\bprodu[cç][aã]o\s+de\b/gi, 'volume de'],
  [/\broi\b/gi, 'resultado'],
  [/\bretorno\s+sobre\b/gi, 'resultado sobre'],
  [/\bintegra[cç][aã]o\s+nativa\b/gi, 'integração'],
  [/\bmiddleware\b/gi, 'plataforma'],
  // RCA-03 (QUESTION MODALITY): vocabulário de certeza em PERGUNTAS de
  // discovery não pode virar afirmação (o verifier perde o "?" na
  // segmentação). A pergunta preserva o sentido sem a palavra de certeza.
  [/\bconfirmad(a|o)s?\b/gi, ''],
];

/** Marcadores de pergunta (interrogativa) — a normalização só se aplica a
 *  perguntas de discovery; afirmações NÃO são mascaradas (continuam sujeitas
 *  ao verifier). */
const INTERROGATIVE_MARKER = /\?|\b(qual|como|quando|onde|por\s+que|existe|h[aá]|é\s+poss[ií]vel|pode|seria|quanto|qual\s+é)\b/i;

/**
 * Normaliza uma pergunta de discovery para que a modalidade interrogativa
 * nunca vire claim factual (RCA-03): remove valores não comprovados e troca
 * vocabulário protegido por termo neutro. Aplica-se SOMENTE a interrogativas.
 *
 * BRU-108 (4): single-pass com alternância — cada regra casa UMA VEZ no texto
 * original; a saída de uma regra NÃO é re-processada pelas seguintes (o loop
 * sequencial antigo produzia "volume de volume" e "a volume").
 */
export function normalizeDiscoveryQuestion(question: string): string {
  if (!INTERROGATIVE_MARKER.test(question.trim())) return question;
  let normalized = question
    .replace(PROTECTED_CLAIM_VALUE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Single-pass: a alternância tenta todas as regras em cada posição; o
  // primeiro match (ordem do array, mais específica primeiro) vence e o
  // motor avança além dele — a substituição não realimenta o resto.
  const alternation = new RegExp(
    PROTECTED_CLAIM_VOCAB_REPLACEMENTS.map(([pattern]) => `(?:${pattern.source})`).join('|'),
    'gi',
  );
  normalized = normalized.replace(alternation, (match) => {
    for (const [pattern, replacement] of PROTECTED_CLAIM_VOCAB_REPLACEMENTS) {
      if (!pattern.test(match)) continue;
      // Aplica o replacement da regra sobre o trecho casado (preserva $1).
      return match.replace(pattern, replacement);
    }
    return match;
  });
  // BRU-108 (4): o artigo feminino do original ("a capacidade") sobrevive à
  // troca por "volume" (masculino) — "a volume"/"à volume" → "o volume"/"ao volume".
  normalized = normalized
    .replace(/\b(a|à)\s+(?=volume\b)/gi, (article) => (article.toLowerCase() === 'à' ? 'ao ' : 'o '))
    .replace(/\s+([?.!,;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalized;
}

// ─── CORPUS CANÔNICO (incidentes reais + variantes adversariais) ──────────

/**
 * Casos reais observados nos runs (2026-08-12 a 14) e variantes morfológicas
 * adversariais. Cada entrada declara: input, forma de tema (se aplicável),
 * e a família de política. Usado pelos invariantes cross-boundary e pela
 * matriz adversarial (RCA-05 Fase 2/5). Dados de pessoa/CNPJ são evitados —
 * as frases são genéricas ou da Scheffer pública (empresa-alvo do fixture).
 */
export const GOLD_POLICY_CORPUS = {
  sensitiveThemes: [
    'Colômbia',
    'Colombia',
    'colombiana',
    'colombiano',
    'colombianas',
    'colombianos',
    'Cumaribo',
    'internacional',
    'internacionalização',
    'exterior',
    'holding',
    'controladora',
    'controle societário',
    'controle acionário',
    'controle familiar',
  ] as const,
  nonSensitiveControls: ['controle de pragas', 'controle de qualidade', 'controlar estoque', 'controlador de temperatura'] as const,
  certaintyWords: ['confirmado', 'confirmada', 'confirmados', 'confirmadas', 'confirmadamente'] as const,
  unsupportedClaims: [
    'capacidade estática',
    'capacidade produtiva',
    'capacidade de produção',
    'capacidade de armazenagem',
    'capacidade de processamento',
    'capacidade de esmagamento',
    'capacidade de 120 mil sacas',
    'produção de algodão',
    'ROI',
    'retorno sobre investimento',
    'prazo de 30 dias',
    'integração nativa',
    'middleware',
  ] as const,
  incidents: [
    // Run 03447df2/2053de08: pergunta de discovery com certeza virava claim
    'A operação na Colômbia (Cumaribo) possui registro legal confirmado?',
    // Run 2053de08: claim "A validar" com derivado de Colômbia + certeza
    'Operação colombiana fora do perímetro confirmado do ERP Senior',
    // Run 2053de08: technologySignals.observedFact assertivo com certeza
    'Operação na Colômbia confirmada, mas CRM Senior não lista módulos com escopo internacional',
    // BRU-100: pergunta de capacidade na coluna Validar da tabela de elos
    'Qual é a capacidade estática total de armazenagem?',
  ] as const,
} as const;

// ─── VALIDAÇÃO DE CONTRATO (exportada para testes de invariantes) ─────────

/** Schema de contrato do corpus — garante que o corpus é versionado e válido. */
export const goldPolicyCorpusSchema = z.object({
  sensitiveThemes: z.array(z.string()),
  nonSensitiveControls: z.array(z.string()),
  certaintyWords: z.array(z.string()),
  unsupportedClaims: z.array(z.string()),
  incidents: z.array(z.string()),
});

export type GoldPolicyCorpus = z.infer<typeof goldPolicyCorpusSchema>;
