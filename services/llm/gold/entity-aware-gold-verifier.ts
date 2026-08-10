/**
 * T4 — Entity/Semantic Gold Verifier (V4 Pipeline Guarded).
 *
 * Barreira final sobre o Gold Brief: extração estruturada de entidades
 * (CNPJ normalizado) — NUNCA regex de proximidade para pares entidade/atributo.
 * Responde apenas: "o Gold viola algum invariante que deveria ser impossível
 * depois do sanitizer?" — não reexecuta o sanitizer.
 */
import type { CanonicalAccount, SafeFindingPack } from './gold-contracts';
import { normalizeCnpj } from './canonical-relation-resolver';

export type GoldHardFailCode =
  | 'WRONG_ESTABLISHMENT_TYPE'
  | 'INVENTED_CNPJ'
  | 'LATERAL_PROMOTED'
  | 'NEGATIVE_EVIDENCE_AS_GAP'
  | 'NEGATIVE_EVIDENCE_AS_ABSENCE'
  | 'QSA_AS_DECISOR'
  | 'UNSUPPORTED_PRODUCT_CLAIM'
  | 'RELATIONSHIP_INVERTED'
  | 'ENTITY_CONFLICT'
  | 'PROMOTED_CLAIM'
  | 'QSA_GOVERNANCE_CLAIM'
  | 'ABSENCE_DERIVED_WEAKNESS';

export interface GoldHardFail {
  code: GoldHardFailCode;
  reason: string;
}

export interface GoldVerificationResult {
  passed: boolean;
  hardFails: GoldHardFail[];
}

const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

const POSSESSION_NEGATION =
  /\bn[aã]o\s+(possui|possue|tem|utiliza|usa|adota|contratou)\b/i;

/**
 * Gap/lacuna OPERACIONAL ou TECNOLÓGICO (política B congelada pelo
 * Planejador): reprova somente quando ausência de tecnologia/processo é
 * convertida em deficiência operacional ("gap de WMS", "lacuna operacional
 * de TMS"). Lacuna de INFORMAÇÃO ("lacuna de dados financeiros", "lacuna
 * de informação") é PERMITIDA — não é gap operacional.
 */
const GAP_CLAIM =
  /\b(gap|gaps|lacuna|lacunas)\s+(de|em|operacional\s+de|confirmad[oa]\s+em|identificad[oa]\s+em)\s+(wms|tms|erp|crm|automa[cç][aã]o|sistema|sistemas|software|tecnologia|processo|opera[cç][aã]o|produ[cç][aã]o|log[ií]stica|estoque|fabrica[cç][aã]o|integra[cç][aã]o|infraestrutura)\b/i;

const GROUP_PROMOTION_CLAIM = /\b(grupo econ[oô]mico|integra o grupo|controlada|controladora|consolidada)\b/i;

const EXECUTIVE_ROLE =
  /\b(cfo|ceo|coo|cio|cto|diretor|diretora|presidente|decisor|head\s+de|vice-presidente)\b/i;

/**
 * Claim de capacidade PRODUTIVA/OPERACIONAL não sustentado (política do
 * Planejador): reprova "capacidade estática/produtiva/de produção/
 * armazenagem/estocagem/processamento/...", "capacidade de <medida>"
 * (ex.: "capacidade de 120 mil sacas"), "ROI", "prazo de N",
 * "integração nativa", "middleware". NÃO reprova "capacidade de
 * investimento/absorção/atender" (uso financeiro/gerencial).
 */
const UNSUPPORTED_CLAIM =
  /\b(capacidade\s+(est[áa]tica|produtiva|de\s+(produ[cç][aã]o|fabrica[cç][aã]o|armazenagem|estocagem|processamento|esmagamento|moagem|refino|opera[cç][aã]o|atendimento|est[óo]cagem|anual|mensal|(?=\d+(?:[.,]\d+)?\s*(?:milh[oõ]es?|mil|sacas|toneladas|t\b|m³|m3|litros|kg))))|produ[cç][aã]o\s+de|roi|retorno\s+sobre|prazo\s+de\s+\d+|integra[cç][aã]o\s+nativa|middleware)\b/i;

/** Frase que nega conhecimento (não é afirmação de fato) — não dispara hard fail. */
const KNOWLEDGE_NEGATION =
  /\b(n[aã]o\s+(est[áa]|foi|é)\s+(dispon[ií]vel|identificad[oa]s?|poss[ií]vel|confirmad[oa]s?)|deve\s+ser\s+confirmad[oa]s?|sem\s+evid[êe]ncia)\b/i;

/** Fonte não aceitável como prova externa (estimativa/inferência/recorte interno). */
const NON_EXTERNAL_SOURCE =
  /\b(estimativa|infer[êe]ncia|an[áa]lise de m[óo]dulos|dossi[êe] legado|crm interno)\b/i;

// ─── PACK_FORENSIC_REPLAY (Planejador 2026-08-10) — 3 regras determinísticas ───

/** R1: frase afirma "confirmada/o" como fato (promoção de claim Pista→Confirmado por vocabulário). */
const CONFIRMED_CLAIM =
  /\b(confirmad[oa]|confirmad[oa]s?)\b/i;

/** R2: formulações semânticas que derivam governança/família/decisão do QSA. */
const QSA_GOVERNANCE_CLAIM =
  /\b(n[úu]cleo\s+familiar|decis[aã]o\s+concentrada|envolvimento\s+direto\s+na\s+gest[aã]o|transi[cç][aã]o\s+geracional|gera[cç][aã]o\s+mais\s+nova|gera[cç][aã]o\s+seguinte|grupo\s+familiar\s+controlador|controle\s+familiar)\b/i;

/** R3: ausência de módulo/tecnologia → fragilidade operacional derivada. */
const ABSENCE_DERIVED_WEAKNESS =
  /\b(ponto\s+de\s+fragilidade|fragilidade\s+operacional|depender\s+de\s+sistemas\s+desconectados\s+ou\s+manuais|depend[eê]ncia\s+de\s+sistemas\s+desconectados|sistemas\s+desconectados\s+ou\s+manuais)\b/i;

interface Measure {
  quantity: string;
  unit: string;
}

/** Palavras que encerram a unidade de medida (contexto posterior, não medida). */
const MEASURE_STOPWORDS = new Set([
  'confirmada', 'confirmado', 'registrada', 'registrado', 'laudo', 'fonte', 'com', 'e', 'ou', 'licença',
]);

/**
 * Parser determinístico de medida ANCORADO NA CATEGORIA do claim:
 * procura o termo da categoria (capacidade/ROI/prazo/etc.) e captura o
 * PRIMEIRO número APÓS ele (com token colado e até 5 palavras de unidade,
 * incluindo modificadores materiais como "por ano"/"por mês").
 * Números ANTERIORES ao termo (unidade 2, filial, CNPJ, ano) nunca são
 * interpretados como medida do claim.
 */
function parseMeasure(text: string, categoryPattern: RegExp): Measure | null {
  // match da categoria sobre o texto em lowercase (patterns sem flag 'i');
  // o índice é idêntico no texto original (lowercase preserva comprimento).
  const categoryMatch = text.toLowerCase().match(categoryPattern);
  if (!categoryMatch || categoryMatch.index === undefined) return null;
  const afterCategory = text.slice(categoryMatch.index + categoryMatch[0].length);

  const m = afterCategory.match(
    /(\d+(?:[.,]\d+)?)\s*([a-zà-ú%²³°]*)(?:\s+([a-zà-ú%²³°]+))?(?:\s+([a-zà-ú%²³°]+))?(?:\s+([a-zà-ú%²³°]+))?(?:\s+([a-zà-ú%²³°]+))?(?:\s+([a-zà-ú%²³°]+))?/i,
  );
  if (!m) return null;
  const [, number, attached, w1, w2, w3, w4, w5] = m;
  const tokens = [attached, w1, w2, w3, w4, w5].filter(Boolean);
  const unitTokens: string[] = [];
  for (const token of tokens) {
    if (MEASURE_STOPWORDS.has(token.toLowerCase())) break;
    unitTokens.push(token);
  }
  return { quantity: number.replace(',', '.'), unit: normalizeName(unitTokens.join(' ')) };
}

function measuresEqual(a: Measure, b: Measure): boolean {
  return a.quantity === b.quantity && a.unit === b.unit;
}

/**
 * Reconciliação por PROVENIÊNCIA REAL em nível de CLAIM: a afirmação do Gold
 * só deixa de ser UNSUPPORTED_PRODUCT_CLAIM quando existe um fato no
 * SafeFindingPack com status Confirmado, fonte aceitável, MESMA CATEGORIA,
 * MESMA ENTIDADE e VALOR COMPATÍVEL. A evidência não pode ser "emprestada":
 * um fato "120 mil sacas" da entidade B não legitima "900 mil sacas" da conta A.
 */
function isSupportedBySafePack(
  sentenceLower: string,
  sentence: string,
  safePack: SafeFindingPack,
  canonical: CanonicalAccount,
): boolean {
  const terms: Array<{ pattern: RegExp; match: (c: string) => boolean }> = [
    { pattern: /capacidade\s+(est[áa]tica|produtiva|de\s+(produ[cç][aã]o|fabrica[cç][aã]o|armazenagem|estocagem|processamento|esmagamento|moagem|refino|opera[cç][aã]o|atendimento|est[óo]cagem|anual|mensal|(?=\d+(?:[.,]\d+)?\s*(?:milh[oõ]es?|mil|sacas|toneladas|t\b|m³|m3|litros|kg))))/, match: (c) => /capacidade/.test(c) },
    { pattern: /produ[cç][aã]o\s+de/, match: (c) => /produ[cç][aã]o\s+de/.test(c) },
    { pattern: /roi|retorno\s+sobre/, match: (c) => /roi|retorno\s+sobre/.test(c) },
    { pattern: /prazo\s+de\s+\d+/, match: (c) => /prazo\s+de\s+\d+/.test(c) },
    { pattern: /integra[cç][aã]o\s+nativa/, match: (c) => /integra[cç][aã]o/.test(c) },
    { pattern: /middleware/, match: (c) => /middleware/.test(c) },
  ];
  const hit = terms.find((t) => t.pattern.test(sentenceLower));
  if (!hit) return false;

  const goldMeasure = parseMeasure(sentence, hit.pattern);
  // Entidade referida na frase: menção explícita de entidade conhecida;
  // caso contrário, a referência é a CONTA CANÔNICA.
  const accountName = normalizeName(canonical.legalName);
  const mentionedEntity = [...safePack.relationships]
    .map((r) => normalizeName(r.relatedEntity))
    .find((name) => sentenceLower.includes(name));
  const referredEntity = mentionedEntity ?? accountName;

  return safePack.facts.some((f) => {
    if (f.status !== 'Confirmado') return false;
    if (NON_EXTERNAL_SOURCE.test(f.source)) return false;
    if (!hit.match(f.claim.toLowerCase())) return false;
    // Mesma entidade: o fato precisa pertencer à entidade referida na frase.
    if (normalizeName(f.entity) !== referredEntity) return false;
    // Valor compatível: Gold sem medida é sustentado por fato com medida;
    // Gold com medida exige fato com MESMA quantidade E MESMA unidade.
    const factMeasure = parseMeasure(f.claim, hit.pattern);
    if (goldMeasure) {
      if (!factMeasure) return false;
      if (!measuresEqual(goldMeasure, factMeasure)) return false;
    }
    return true;
  });
}

/** Verbos de participação societária (para detectar inversão de relação direta). */
const PARTICIPATION_VERB =
  /\b(participa\s+do\s+capital|é\s+s[óo]cia|s[óo]cia\s+de|controla|é\s+controladora|det[ée]m\s+participa[cç][aã]o)\b/i;

function normalizeName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function splitSentences(goldBrief: string): string[] {
  // Protege CNPJs formatados (contêm pontos) para o split de sentenças
  // não quebrar dentro deles.
  const placeholders: string[] = [];
  const protectedText = goldBrief.replace(CNPJ_PATTERN, (m) => {
    placeholders.push(m);
    return `__CNPJ${placeholders.length - 1}__`;
  });
  return protectedText
    .split(/[.;!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/__CNPJ(\d+)__/g, (_, i) => placeholders[Number(i)]));
}

export function verifyGold(
  goldBrief: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
): GoldVerificationResult {
  const hardFails: GoldHardFail[] = [];
  const push = (code: GoldHardFailCode, reason: string): void => {
    if (!hardFails.some((h) => h.code === code && h.reason === reason)) {
      hardFails.push({ code, reason });
    }
  };

  // === entidades conhecidas (canonical + pack) ===
  const expectedTypeByCnpj = new Map<string, 'Matriz' | 'Filial'>();
  const knownCnpjs = new Set<string>();
  const addKnown = (cnpj: string, type?: 'Matriz' | 'Filial'): void => {
    const digits = normalizeCnpj(cnpj);
    if (!digits) return;
    knownCnpjs.add(digits);
    if (type) expectedTypeByCnpj.set(digits, type);
  };
  addKnown(canonical.inputCnpj, canonical.establishmentType);
  if (canonical.headOfficeCnpj) {
    addKnown(canonical.headOfficeCnpj, canonical.establishmentType === 'Filial' ? 'Matriz' : 'Filial');
  }
  for (const partner of canonical.directPjPartners) addKnown(partner.cnpj);
  for (const rel of safePack.relationships) addKnown(rel.relatedEntity);

  const lateralNames = new Set(
    safePack.relationships
      .filter((r) => r.relationType === 'partner_other_cnpj')
      .map((r) => r.relatedEntity.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );
  const qsaPeople = new Set(
    safePack.people
      .filter((p) => p.roleBasis === 'qsa')
      .map((p) => p.personName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
  );

  const sentences = splitSentences(goldBrief);

  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1) Entity-aware: tipo cadastral atribuído na frase vs canonical.
    const mentions = [...sentence.matchAll(CNPJ_PATTERN)];
    const hasMatrizWord = /\bmatriz\b/.test(sentenceLower);
    const hasFilialWord = /\bfilial\b/.test(sentenceLower);
    const attributedType =
      hasMatrizWord && !hasFilialWord ? 'Matriz' : hasFilialWord && !hasMatrizWord ? 'Filial' : undefined;

    for (const mention of mentions) {
      const digits = normalizeCnpj(mention[0]);
      if (!digits) continue;

      if (!knownCnpjs.has(digits)) {
        push('INVENTED_CNPJ', `CNPJ ${mention[0]} não pertence ao canonical nem às relações conhecidas`);
        continue;
      }
      if (attributedType) {
        const expected = expectedTypeByCnpj.get(digits);
        if (expected && attributedType !== expected) {
          push(
            'WRONG_ESTABLISHMENT_TYPE',
            `${mention[0]} classificado como ${attributedType}; canonical diz ${expected}`,
          );
        }
      }
    }

    // 2) Ausência → gap.
    if (GAP_CLAIM.test(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_GAP', `Frase afirma gap sem evidência positiva: "${sentence}"`);
    }

    // 3) Ausência → tecnologia inexistente (negação de posse).
    if (POSSESSION_NEGATION.test(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_ABSENCE', `Frase nega posse sem evidência positiva: "${sentence}"`);
    }

    // 4) Lateral promovida a grupo.
    if (GROUP_PROMOTION_CLAIM.test(sentence)) {
      const hasLateralName = [...lateralNames].some((name) => sentenceLower.includes(name));
      if (hasLateralName) {
        push('LATERAL_PROMOTED', `Frase promove relação lateral a grupo: "${sentence}"`);
      }
    }

    // 5) QSA → decisor funcional.
    if (EXECUTIVE_ROLE.test(sentenceLower)) {
      const mentionsQsaPerson = [...qsaPeople].some((name) => sentenceLower.includes(name));
      if (mentionsQsaPerson) {
        // legalRole (decisão congelada do Planejador 2026-08-08):
        // "consta no QSA como Presidente/Diretor" = qualificação literal da
        // fonte cadastral (roleBasis=qsa, functionalRole=unknown) → PERMITIDO.
        // "é Presidente/CFO/CTO/decisor" = papel funcional inferido → PROIBIDO.
        const qualificacaoLiteral =
          /\bconsta\s+no\s+qsa\s+como\b|\bno\s+qsa\s+como\b|\bqsa\s+o\s+registra\s+como\b|\bqsa\s+registra\s+como\b/i;
        if (qualificacaoLiteral.test(sentenceLower)) continue;
        push('QSA_AS_DECISOR', `Frase atribui cargo funcional a pessoa do QSA: "${sentence}"`);
      }
    }

    // 6) Capacidade/produto/prazo/ROI/integração afirmados sem validação.
    //    A exceção NUNCA vem do texto do Gold (o modelo poderia inventar
    //    "confirmada em laudo" na saída): ela só existe quando a afirmação é
    //    RECONCILIADA com um fato do SafeFindingPack com status Confirmado
    //    e fonte aceitável (proveniência real, não linguagem).
    if (
      UNSUPPORTED_CLAIM.test(sentenceLower) &&
      !KNOWLEDGE_NEGATION.test(sentenceLower) &&
      !isSupportedBySafePack(sentenceLower, sentence, safePack, canonical)
    ) {
      push('UNSUPPORTED_PRODUCT_CLAIM', `Frase afirma capacidade/produto/prazo/ROI sem fonte: "${sentence}"`);
    }

    // 7) Relação societária direta invertida: a CONTA não pode ser quem
    //    participa do capital da PJ direta — o canonical define a direção
    //    (PJ direta/holding participa da conta, não o contrário).
    const verbMatch = sentenceLower.match(PARTICIPATION_VERB);
    if (verbMatch) {
      const verbIndex = verbMatch.index ?? -1;
      const accountIndex = sentenceLower.indexOf(normalizeName(canonical.legalName));
      for (const partner of canonical.directPjPartners) {
        const partnerIndex = sentenceLower.indexOf(normalizeName(partner.legalName));
        if (accountIndex >= 0 && partnerIndex >= 0 && accountIndex < verbIndex && partnerIndex > verbIndex) {
          push(
            'RELATIONSHIP_INVERTED',
            `Frase inverte a relação direta: a conta participa do capital de ${partner.legalName} sem evidência`,
          );
        }
      }
    }

    // 8) PACK_FORENSIC_REPLAY (Planejador 2026-08-10): promoção de claim
    //    Pista/Estimativa → "confirmada" por VOCABULÁRIO. O Compact pode
    //    produzir claims com a palavra "confirmada" mesmo com status
    //    Pista forte/inicial (caso Colômbia: "Operação internacional
    //    confirmada em Cumaribo" com status "Pista forte"). O Gold que
    //    reafirma "confirmada" sobre TEMA SENSÍVEL (internacionalização/
    //    holding/controle) sem fato Confirmado no safePack é promoção
    //    indevida → hard fail. Não dispara para "confirmada" sobre temas
    //    sem sensibilidade (ex.: MT/MA com fato Confirmado).
    if (CONFIRMED_CLAIM.test(sentenceLower) && !KNOWLEDGE_NEGATION.test(sentenceLower)) {
      const touchesSensitiveTheme = /col[oó]mbia|cumaribo|internacional|holding|control/i.test(sentenceLower);
      if (touchesSensitiveTheme) {
        const hasConfirmedFact = safePack.facts.some(
          (f) => f.status === 'Confirmado' && /col[oó]mbia|cumaribo|internacional|holding|control/i.test(f.claim),
        );
        if (!hasConfirmedFact) {
          push('PROMOTED_CLAIM', `Frase afirma "confirmada" sobre tema sem fato Confirmado no safePack: "${sentence}"`);
        }
      }
    }

    // 9) PACK_FORENSIC_REPLAY: QSA → governança/estrutura familiar derivada.
    //    O QSA dá papel cadastral/legal; formulações como "núcleo familiar",
    //    "decisão concentrada", "envolvimento direto na gestão",
    //    "transição geracional", "geração mais nova" extrapolam o QSA e
    //    viraram fato narrativo no Gold (grupo gerações/família só apareceu
    //    no Gold, nunca no raw/frontier) → hard fail. O gatilho é a presença
    //    de pessoas QSA no safePack (não precisa estar na MESMA frase — o
    //    contexto do Gold inteiro já deriva do QSA).
    if (QSA_GOVERNANCE_CLAIM.test(sentenceLower) && qsaPeople.size > 0) {
      push('QSA_GOVERNANCE_CLAIM', `Frase deriva governança/família do QSA sem evidência: "${sentence}"`);
    }

    // 10) PACK_FORENSIC_REPLAY: ausência de módulo/tecnologia → fragilidade
    //     operacional derivada ("ponto de fragilidade", "depender de sistemas
    //     desconectados ou manuais"). A ausência no portfólio NÃO prova dor
    //     operacional (grupo manual_desconectado só apareceu no Gold) → hard fail.
    if (ABSENCE_DERIVED_WEAKNESS.test(sentenceLower)) {
      push('ABSENCE_DERIVED_WEAKNESS', `Frase deriva fragilidade operacional de ausência: "${sentence}"`);
    }
  }

  return { passed: hardFails.length === 0, hardFails };
}
