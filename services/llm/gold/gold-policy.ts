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

// ─── NEGAÇÃO DE POSSE (ARCH-A/BRU-110: definição canônica unificada) ────────

/**
 * ARCH-A (BRU-110): o sanitizer tinha "há"/"opera com" (com lookahead) e o
 * verifier não — "não há WMS" era removido pelo sanitizer mas não era hard
 * fail no verifier. Definição canônica única: união das formas observadas
 * (possui/possue/tem/há/utiliza/usa/adota/contratou/opera com), com lookahead
 * em vez de \b final (acentuação não é \w no JS).
 */
const POSSESSION_NEGATION_PATTERN =
  /\bn[aã]o\s+(possui|possue|tem|h[áa]|utiliza|usa|adota|contratou|opera\s+com)(?=\s|[.,;!?]|$)/i;

export function matchesPossessionNegation(text: string): boolean {
  return POSSESSION_NEGATION_PATTERN.test(text);
}

/**
 * Formas epistemológicas de "não há" — NÃO são negação de posse:
 * "não há evidência/informação/registro disponível sobre X" sobrevive;
 * "não há WMS na empresa" continua bloqueado.
 */
const EPISTEMIC_ABSENCE_PATTERN =
  /\bn[aã]o\s+h[áa]\s+(evid[êe]ncia|informa[cç][aã]o|registro|dados?|dispon[ií]vel|men[cç][aã]o|prova|ind[ií]cio|como)\b/i;

export function matchesEpistemicAbsence(text: string): boolean {
  return EPISTEMIC_ABSENCE_PATTERN.test(text);
}

// ─── GAP/LACUNA OPERACIONAL (ARCH-A/BRU-110) ────────────────────────────────

/**
 * Gap/lacuna OPERACIONAL ou TECNOLÓGICO (política B congelada): reprova
 * somente quando ausência de tecnologia/processo é convertida em deficiência
 * operacional ("gap de WMS", "lacuna operacional de TMS"). Lacuna de
 * INFORMAÇÃO é permitida. Definição canônica = a do verifier (lista de
 * tecnologia após a forma do gap) — NÃO inclui "sem <tecnologia>", que é
 * coberto por matchesAbsenceClaim (ação do sanitizer) e, no Gold, pela R10
 * (fraqueza derivada com exceção de proveniência).
 */
const OPERATIONAL_GAP_PATTERN =
  /\b(gap|gaps|lacuna|lacunas)\s+(de|em|operacional\s+de|confirmad[oa]\s+em|identificad[oa]\s+em)\s+(?:(gest[aã]o|controle|gerenciamento|monitoramento|administra[cç][aã]o)\s+(?:de\s+)?)?(wms|tms|erp|crm|automa[cç][aã]o|sistema|sistemas|software|tecnologia|processo|opera[cç][aã]o|produ[cç][aã]o|log[ií]stica|estoque|fabrica[cç][aã]o|integra[cç][aã]o|infraestrutura)\b/i;

export function matchesOperationalGap(text: string): boolean {
  return OPERATIONAL_GAP_PATTERN.test(text);
}

/**
 * Afirmação de AUSÊNCIA de tecnologia/processo ("sem WMS", "sem sistema",
 * "sem solução") — o sanitizer remove claims que afirmam ausência sem
 * evidência positiva. NO Gold final, "sem X" NÃO é gap: é tratado pela R10
 * (ABSENCE_DERIVED_WEAKNESS) com exceção de proveniência por categoria.
 * Detector canônico na policy (RCA-05), mas de uso exclusivo do sanitizer.
 */
const ABSENCE_CLAIM_PATTERN = /\b(sem\s+(wms|tms|erp|sistema|solu[cç][aã]o))\b/i;

export function matchesAbsenceClaim(text: string): boolean {
  return ABSENCE_CLAIM_PATTERN.test(text);
}

// ─── FRAGILIDADE DERIVADA DE AUSÊNCIA (R10 / ABSENCE_DERIVED_WEAKNESS) ───────

/**
 * R10 — ausência de módulo/tecnologia NÃO prova fragilidade operacional.
 * Primitiva canônica (RCA-05) agora na policy — antes vivia só no verifier.
 * Qualquer formulação que derive fragilidade/manualidade/desconexão da
 * ausência de tecnologia é hard fail (com exceção de proveniência externa
 * da MESMA categoria — hasMatchingWeaknessProvenance).
 *
 * BLOQUEADOR 4 (Planejador 2026-08-10) — sinônimos da rodada real: o
 * Composer atravessou com "processo potencialmente fragmentado",
 * "planilhas ou sistemas pontuais", "sem sistema centralizado",
 * "dependência de sistemas desconectados".
 * BRU-119 follow-up (2026-08-17, run d06cf268): ausência de TMS/WMS virou
 * "criam uma desconexão", "processos podem não estar integrados",
 * "gestão da frota pode estar limitada", "impactando a eficiência do
 * pátio" — novas formas que o matcher antigo não cobria.
 */
const ABSENCE_DERIVED_WEAKNESS_PATTERN =
  /\b(ponto\s+de\s+fragilidade|fragilidade\s+operacional|depender\s+de\s+sistemas\s+desconectados\s+ou\s+manuais|depend[eê]ncia\s+de\s+sistemas\s+desconectados|sistemas\s+desconectados\s+ou\s+manuais|processo\s+potencialmente\s+fragmentado|processos?\s+(fragmentados?|manuais?)|via\s+planilhas?\s+ou\s+sistemas\s+pontuais|planilhas?\s+ou\s+sistemas\s+pontuais|sem\s+sistema\s+centralizado|sem\s+(gest[aã]o|controle|sistema)\s+centralizad[oa]|depend[eê]ncia\s+de\s+(processos|sistemas|planilhas)\s+manuais|criam\s+uma\s+desconex[ãa]o|desconex[ãa]o\s+(log[ií]stica|operacional)|podem\s+n[ãa]o\s+estar\s+integrad[oa]s?|n[ãa]o\s+integrad[oa]s?\b|pode\s+estar\s+limitad[oa]|impactando\s+(?:a\s+eff?ici[êe]ncia|a\s+efici[êe]ncia)|efici[êe]ncia\s+do\s+p[aá]tio)\b/i;

export function matchesAbsenceDerivedWeakness(text: string): boolean {
  return ABSENCE_DERIVED_WEAKNESS_PATTERN.test(text);
}

// ─── PAPEL EXECUTIVO (ARCH-A/BRU-110) ───────────────────────────────────────

/** Cargos funcionais que QSA não prova (união verifier + sanitizer — o
 *  sanitizer tinha "gerente geral" que o verifier não reconhecia). */
const EXECUTIVE_ROLE_PATTERN =
  /\b(cfo|ceo|coo|cio|cto|diretor|diretora|presidente|decisor|head\s+de|gerente\s+geral|vice-presidente)\b/i;

export function matchesExecutiveRole(text: string): boolean {
  return EXECUTIVE_ROLE_PATTERN.test(text);
}

// ─── PROMOÇÃO DE LATERAL A GRUPO (ARCH-A/BRU-110) ───────────────────────────

const GROUP_PROMOTION_PATTERN = /\b(grupo econ[oô]mico|integra o grupo|controlada|controladora|consolidada)\b/i;

export function matchesGroupPromotion(text: string): boolean {
  return GROUP_PROMOTION_PATTERN.test(text);
}

// ─── PROMOÇÃO DE HOLDING / GOVERNANÇA (BRU-119 follow-up, veredito Planejador 2026-08-17) ─

/**
 * Governança/papel societário derivado de sócia PJ direta NÃO é autorizado
 * por palavra — o padrão só detecta a FORMA; a proveniência decide (verifier).
 *
 * DUAS categorias separadas (despacho do Planejador, comentário c8e42839):
 *  - PAPEL SOCIETÁRIO: rotular "holding"/"controladora"/"estrutura de
 *    holding" exige fato Confirmado NÃO-QSA comprovando especificamente
 *    esse papel. Sócia PJ direta na Tabela de CNPJs NÃO basta.
 *  - GOVERNANÇA/DECISÃO: sponsor, aprovação, autoridade ou fluxo decisório
 *    exigem evidência Confirmada especificamente sobre governança/decisão.
 *    Criar uma holding verdadeira não autoriza inferir como se decide.
 *
 * Negative controls (NÃO reprovar): "é sócia PJ direta" (sem rotular);
 * perguntas de discovery sobre "possível holding"/"governança?"; "não há
 * evidência para afirmar holding/governança"; holding comprovada por fonte
 * externa NÃO-QSA (proveniência resolve no verifier).
 */
const GOVERNANCE_ROLE_PROMOTION_PATTERN =
  /\b(?:estrutura\s+de\s+holding|holding\s+de\s+capital\s+aberto|holding\s+(?:familiar|controladora)|[ée]\s+um[a]?\s+holding|governan[cç]a\s+[^.?!]{0,80}\bholding\b|aprova[cç][aã]o\s+segue\s+a\s+governan[cç]a|fluxo\s+decis[óo]rio|autoridade\s+de\s+decis[aã]o|processo\s+de\s+aprova[cç][aã]o\s+de\s+investimentos|sponsor\s+(?:da|do|de)\s+(?:holding|grupo|governan[cç]a)|controladora\s+(?:de|do|da)\b)(?:[.?!]|\b)/i;

export function matchesGovernanceRolePromotion(text: string): boolean {
  return GOVERNANCE_ROLE_PROMOTION_PATTERN.test(text);
}

// ─── FONTE NÃO-EXTERNA (ARCH-A/BRU-110) ─────────────────────────────────────

const NON_EXTERNAL_SOURCE_PATTERN =
  /\b(estimativa|infer[êe]ncia|an[áa]lise de m[óo]dulos|dossi[êe] legado|crm interno)\b/i;

export function matchesNonExternalSource(text: string): boolean {
  return NON_EXTERNAL_SOURCE_PATTERN.test(text);
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

/** Detector de modalidade interrogativa (negative control comum: perguntas de
 *  discovery NUNCA viram afirmação/claim — usado pelo verifier para não hard
 *  failar questionamentos; também usado na normalização RCA-03). */
export function matchesDiscoveryQuestion(text: string): boolean {
  return INTERROGATIVE_MARKER.test(text.trim());
}

/**
 * Normaliza uma pergunta de discovery para que a modalidade interrogativa
 * nunca vire claim factual (RCA-03): remove valores não comprovados e troca
 * vocabulário protegido por termo neutro. Aplica-se SOMENTE a interrogativas.
 *
 * BRU-108 (4): o loop sequencial aplica as regras na ordem (mais específica
 * primeiro) e o COLAPSO final de "volume de volume" elimina a duplicação que a
 * cascata de substituições produzia ("capacidade de produção" → "volume de
 * produção" → regra "produção de" → "volume de volume"). Manter a cascata é
 * intencional: sem ela, "volume DE produção de algodão" sobra com "produção de"
 * (vocabulário protegido do verifier → UNSUPPORTED_PRODUCT_CLAIM no run
 * b3294247). O colapso entrega texto limpo e inofensivo à régua.
 */
export function normalizeDiscoveryQuestion(question: string): string {
  if (!INTERROGATIVE_MARKER.test(question.trim())) return question;
  let normalized = question
    .replace(PROTECTED_CLAIM_VALUE_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  for (const [pattern, replacement] of PROTECTED_CLAIM_VOCAB_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  // BRU-108 (4): colapso da duplicação da cascata + correção de gênero do
  // artigo ("a capacidade" → "o volume") + espaço antes de pontuação.
  normalized = normalized
    .replace(/\bvolume\s+de\s+volume\b/gi, 'volume')
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
