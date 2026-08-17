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
import {
  matchesSensitiveTheme,
  matchesConfirmedVocabulary,
  matchesSafeKnowledgeNegation,
  matchesPossessionNegation,
  matchesOperationalGap,
  matchesGroupPromotion,
  matchesExecutiveRole,
  matchesUnsupportedOperationalClaim,
  matchesNonExternalSource,
  matchesAbsenceDerivedWeakness,
  matchesGovernanceRolePromotion,
  matchesDiscoveryQuestion,
} from './gold-policy';

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
  | 'ABSENCE_DERIVED_WEAKNESS'
  | 'GOVERNANCE_ROLE_PROMOTION';

export interface GoldHardFail {
  code: GoldHardFailCode;
  reason: string;
}

export interface GoldVerificationResult {
  passed: boolean;
  hardFails: GoldHardFail[];
}

const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

// Detectores semânticos canônicos (ARCH-A/BRU-110): definições unificadas
// em gold-policy.ts — POSSESSION_NEGATION, GAP_CLAIM, GROUP_PROMOTION_CLAIM,
// EXECUTIVE_ROLE, UNSUPPORTED_CLAIM e NON_EXTERNAL_SOURCE não têm mais cópia
// local aqui (RCA-05: fonte única de significado, ação própria por boundary).

// ─── PACK_FORENSIC_REPLAY (Planejador 2026-08-10) — 3 regras determinísticas ───

/** R2: formulações semânticas que derivam governança/família/decisão do QSA. */
const QSA_GOVERNANCE_CLAIM =
  /\b(n[úu]cleo\s+familiar|decis[aã]o\s+concentrada|envolvimento\s+direto\s+na\s+gest[aã]o|transi[cç][aã]o\s+geracional|gera[cç][aã]o\s+mais\s+nova|gera[cç][aã]o\s+seguinte|grupo\s+familiar\s+controlador|controle\s+familiar)\b/i;

/**
 * B4 (EXPERIENCE-01C, Planejador 2026-08-10): exceção de proveniência da R10
 * por CATEGORIA com DIREÇÃO SEMÂNTICA e VÍNCULO DE ENTIDADE.
 * 1. A frase do Gold exige uma categoria (manualidade, planilha, desconexão,
 *    ausência de centralização, fragmentação, fragilidade); a evidência
 *    externa só libera quando comprova a MESMA categoria.
 * 2. Direção semântica: "sem sistema centralizado" NÃO pode ser liberado por
 *    "sistema centralizado" (oposto) — a evidência precisa sustentar
 *    ausência/descentralização.
 * 3. Entity-aware: a evidência precisa pertencer à MESMA entidade da frase
 *    (canonical.legalName quando a frase não menciona entidade explícita;
 *    a entidade mencionada quando há menção de entidade conhecida). Nada de
 *    empréstimo de evidência entre empresas.
 */
function hasMatchingWeaknessProvenance(
  sentence: string,
  safePack: SafeFindingPack,
  canonical: CanonicalAccount,
): boolean {
  const sentenceLower = sentence.toLowerCase();

  // 1) Categoria exigida pela frase + regex de evidência correspondente
  //    (com direção semântica: a evidência sustenta a MESMA afirmação).
  const categories: Array<{ pattern: RegExp; match: RegExp }> = [
    // "sem ... centralizado / centralização" → evidência de AUSÊNCIA/descentralização
    {
      pattern: /sem\s+(?:gest[aã]o|controle|sistema)\s+centralizad[oa]/,
      match: /(?:sem|n[aã]o\s+(?:possui|tem|utiliza|adota|h[aá]|existe))\s+(?:gest[aã]o|controle|sistema)\s+centralizad[oa]|descentralizad[oa]/i,
    },
    // fragmentação
    { pattern: /fragmentad[oa]/, match: /fragmentad[oa]/i },
    // manualidade (processo manual, dependência manual/manuais)
    { pattern: /manuais?/, match: /manua/i },
    // planilha
    { pattern: /planilhas?/, match: /planilha/i },
    // desconexão
    { pattern: /desconectad[oa]/, match: /desconect/i },
    // fragilidade
    { pattern: /fragilidade/, match: /fragilidade/i },
    // ponto de fragilidade
    { pattern: /ponto\s+de\s+fragilidade/, match: /fragilidade/i },
    // "processo potencialmente fragmentado" → fragmentação
    { pattern: /processo\s+potencialmente\s+fragmentado/, match: /fragmentad[oa]/i },
  ];
  const neededCategories = categories.filter((c) => c.pattern.test(sentenceLower));
  if (neededCategories.length === 0) return false;

  // 2) Entity-aware: entidade referida pela frase. Se a frase menciona uma
  //    entidade conhecida (relação do SafePack), a evidência deve ser dela;
  //    caso contrário, da conta canônica.
  const accountName = normalizeName(canonical.legalName);
  // BRU-100 (auditor, run 86850904): a resolução de entidade também reconhece
  // as entidades JÁ CANÔNICAS (directPjPartners + matriz) — não apenas as
  // relações do SafePack. Um fato Confirmado de sócia PJ canônica com a
  // identidade explícita na frase (com prefixo do determinístico) precisa
  // reconciliar com o fato DELA, e não cair na referência implícita da conta.
  // Resolver de identidade apenas — regex/códigos/política de suporte intactos.
  const canonicalEntityNames = [
    ...canonical.directPjPartners.map((p) => p.legalName),
    ...(canonical.headOfficeLegalName ? [canonical.headOfficeLegalName] : []),
  ].map(normalizeName);
  const mentionedEntity =
    [...safePack.relationships]
      .map((r) => normalizeName(r.relatedEntity))
      .find((name) => sentenceLower.includes(name)) ??
    canonicalEntityNames.find((name) => sentenceLower.includes(name));
  const referredEntity = mentionedEntity ?? accountName;

  // 3) TODAS as categorias presentes na frase precisam de evidência — uma
  //    frase com duas afirmações R10 ("sem sistema centralizado e com
  //    processos manuais") não pode passar comprovando apenas uma
  //    (B4 multi-claim, Planejador 2026-08-10).
  return neededCategories.every((needed) =>
    safePack.facts.some(
      (f) =>
        f.status === 'Confirmado' &&
        !matchesNonExternalSource(f.source) &&
        normalizeName(f.entity) === referredEntity &&
        needed.match.test(f.claim),
    ),
  );
}

/**
 * BRU-119 follow-up (despacho Planejador, c8e42839): proveniência da
 * promoção de holding/governança. DUAS categorias independentes:
 *  - papel societário (holding/controladora/estrutura de holding): exige
 *    fato Confirmado NÃO-QSA comprovando ESPECIFICAMENTE esse papel.
 *  - governança/decisão (sponsor/aprovação/autoridade/fluxo): exige fato
 *    Confirmado NÃO-QSA comprovando ESPECIFICAMENTE governança/decisão.
 * Confirmar "é holding" NÃO autoriza inferir "como se decide".
 */
function hasGovernanceRoleProvenanceFor(
  sentence: string,
  safePack: SafeFindingPack,
  canonical: CanonicalAccount,
): boolean {
  const sentenceLower = sentence.toLowerCase();
  const sentenceNormalized = normalizeName(sentence);

  // 1) Categoria exigida pela frase (papel societário vs governança/decisão).
  const demandsGovernance = /sponsor|aprova[cç][aã]o|autoridade\s+de\s+decis[aã]o|fluxo\s+decis[óo]rio|processo\s+de\s+aprova[cç][aã]o/i.test(sentenceLower);
  const demandsRole = /holding|controladora|estrutura\s+de\s+holding/i.test(sentenceLower);

  // 2) Entidade referida: sócia PJ directa (directPjPartners) ou conta.
  const accountName = normalizeName(canonical.legalName);
  const partnerNames = (canonical.directPjPartners ?? []).map((p) => normalizeName(p.legalName));
  const mentionedPartner = partnerNames.find((name) => sentenceNormalized.includes(name));
  const referredEntity = mentionedPartner ?? accountName;

  // 3) Evidência Confirmada NÃO-QSA que comprove a categoria específica.
  const hasEvidence = (pattern: RegExp): boolean =>
    safePack.facts.some(
      (f) =>
        f.status === 'Confirmado' &&
        !matchesNonExternalSource(f.source) &&
        normalizeName(f.entity) === referredEntity &&
        pattern.test(f.claim),
    );

  // Papel societário: precisa comprovar "holding"/"controladora" (não só "sócia").
  const roleProven = /(holding|controladora|controladoria)/i;
  // Governança/decisão: precisa comprovar "governança"/"decisão"/"aprovação".
  const governanceProven = /(governan[cç]a|decis[aã]o|aprova[cç][aã]o|sponsor|fluxo\s+decis[óo]rio)/i;

  // Cada categoria exigida pela frase precisa da sua própria prova.
  if (demandsRole && !hasEvidence(roleProven)) return false;
  if (demandsGovernance && !hasEvidence(governanceProven)) return false;
  return true;
}

/**
 * R3: ausência de módulo/tecnologia → fragilidade operacional derivada.
 * Primitiva canônica em gold-policy (RCA-05): matchesAbsenceDerivedWeakness.
 * Corpus histórico + BRU-119 follow-up (run d06cf268): "criam uma
 * desconexão", "podem não estar integrados", "pode estar limitada",
 * "impactando a eficiência" — ausência de tecnologia NÃO prova dor.
 * Com exceção de proveniência externa da MESMA categoria.
 */

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
  // BRU-100 (auditor, run 86850904): a resolução de entidade também reconhece
  // as entidades JÁ CANÔNICAS (directPjPartners + matriz) — não apenas as
  // relações do SafePack. Um fato Confirmado de sócia PJ canônica com a
  // identidade explícita na frase (com prefixo do determinístico) precisa
  // reconciliar com o fato DELA, e não cair na referência implícita da conta.
  // Resolver de identidade apenas — regex/códigos/política de suporte intactos.
  const canonicalEntityNames = [
    ...canonical.directPjPartners.map((p) => p.legalName),
    ...(canonical.headOfficeLegalName ? [canonical.headOfficeLegalName] : []),
  ].map(normalizeName);
  const mentionedEntity =
    [...safePack.relationships]
      .map((r) => normalizeName(r.relatedEntity))
      .find((name) => sentenceLower.includes(name)) ??
    canonicalEntityNames.find((name) => sentenceLower.includes(name));
  const referredEntity = mentionedEntity ?? accountName;

  return safePack.facts.some((f) => {
    if (f.status !== 'Confirmado') return false;
    if (matchesNonExternalSource(f.source)) return false;
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
    if (matchesOperationalGap(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_GAP', `Frase afirma gap sem evidência positiva: "${sentence}"`);
    }

    // 3) Ausência → tecnologia inexistente (negação de posse).
    if (matchesPossessionNegation(sentence)) {
      push('NEGATIVE_EVIDENCE_AS_ABSENCE', `Frase nega posse sem evidência positiva: "${sentence}"`);
    }

    // 4) Lateral promovida a grupo.
    if (matchesGroupPromotion(sentence)) {
      const hasLateralName = [...lateralNames].some((name) => sentenceLower.includes(name));
      if (hasLateralName) {
        push('LATERAL_PROMOTED', `Frase promove relação lateral a grupo: "${sentence}"`);
      }
    }

    // 5) QSA → decisor funcional.
    if (matchesExecutiveRole(sentenceLower)) {
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
      matchesUnsupportedOperationalClaim(sentenceLower) &&
      !matchesSafeKnowledgeNegation(sentenceLower) &&
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
    //    holding/controle) é promoção indevida → hard fail.
    //    BRU-48 (Planejador 2026-08-11): política conservadora ALINHADA ao
    //    guard do pipeline — SEM exceção por similaridade lexical. Qualquer
    //    "confirmada/o" em tema sensível sem negação = PROMOTED_CLAIM,
    //    independentemente de existir fato Confirmado sobre palavra
    //    compartilhada ("Escritório cadastrado em Cumaribo" NÃO autoriza
    //    "Operação industrial confirmada em Cumaribo"). O pipeline rebaixa
    //    antes; o verifier é a segunda barreira para texto introduzido
    //    depois (ex.: etapa determinística de Mermaid).
    //    RCA-05: tema sensível e vocabulário de certeza usam as primitivas
    //    canônicas de gold-policy (fonte única — o "control" substring
    //    genérico saiu; formas de governança são explícitas).
    if (matchesConfirmedVocabulary(sentenceLower) && !matchesSafeKnowledgeNegation(sentenceLower)) {
      if (matchesSensitiveTheme(sentenceLower)) {
        push('PROMOTED_CLAIM', `Frase afirma "confirmada" sobre tema sensível sem autorização (política conservadora): "${sentence}"`);
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
    //    PROVENANCE EXCEPTION (Planejador 2026-08-10): se existir fato
    //    Confirmado com fonte NÃO-QSA comprovando sucessão/governança
    //    familiar, a afirmação passa (ex.: "Empresa anuncia processo formal
    //    de sucessão familiar", source=comunicado oficial, status=Confirmado).
    if (QSA_GOVERNANCE_CLAIM.test(sentenceLower) && qsaPeople.size > 0) {
      const hasExternalProvenance = safePack.facts.some(
        (f) =>
          f.status === 'Confirmado' &&
          !/qsa/i.test(f.source) &&
          /sucess[aã]o|governan[cç]a|gera[cç][aã]o|familiar|transi[cç][aã]o/i.test(f.claim),
      );
      if (!hasExternalProvenance) {
        push('QSA_GOVERNANCE_CLAIM', `Frase deriva governança/família do QSA sem evidência: "${sentence}"`);
      }
    }

    // 10) PACK_FORENSIC_REPLAY: ausência de módulo/tecnologia → fragilidade
    //     operacional derivada ("ponto de fragilidade", "depender de sistemas
    //     desconectados ou manuais"). A ausência no portfólio NÃO prova dor
    //     operacional (grupo manual_desconectado só apareceu no Gold) → hard fail.
    //     PROVENANCE EXCEPTION (Planejador 2026-08-10): se existir fato
    //     Confirmado com fonte externa comprovando processo manual/fragilidade
    //     (ex.: auditoria oficial), a afirmação passa.
    if (matchesAbsenceDerivedWeakness(sentenceLower)) {
      // Exceção por CATEGORIA (B4): a evidência externa precisa comprovar a
      // MESMA categoria da frase (manual → manual; centralizado → ausência
      // de centralização; fragmentado → fragmentação), nunca conceito
      // vagamente próximo.
      const hasExternalProvenance = hasMatchingWeaknessProvenance(sentence, safePack, canonical);
      if (!hasExternalProvenance) {
        push('ABSENCE_DERIVED_WEAKNESS', `Frase deriva fragilidade operacional de ausência: "${sentence}"`);
      }
    }

    // 11) BRU-119 follow-up (despacho Planejador, comentário c8e42839):
    //     governança/papel societário derivado de sócia PJ direta NÃO é
    //     autorizado por palavra. O prompt proíbe; esta é a barreira final
    //     determinística (equiv. R10). DUAS categorias, cada uma com a sua
    //     proveniência:
    //      - PAPEL SOCIETÁRIO: rotular "holding"/"controladora"/"estrutura
    //        de holding" só passa com fato Confirmado NÃO-QSA comprovando
    //        especificamente esse papel. Sócia PJ direta NÃO basta.
    //      - GOVERNANÇA/DECISÃO: sponsor/aprovação/autoridade/fluxo exige
    //        evidência Confirmada especificamente sobre governança/decisão.
    //     Negative controls: "é sócia PJ direta" (sem rotular) e perguntas de
    //     discovery NÃO disparam o padrão (coberto por matches... estrita).
    if (matchesGovernanceRolePromotion(sentenceLower) && !matchesDiscoveryQuestion(sentenceLower)) {
      const hasGovernanceProvenance = hasGovernanceRoleProvenanceFor(sentence, safePack, canonical);
      if (!hasGovernanceProvenance) {
        push('GOVERNANCE_ROLE_PROMOTION', `Frase promove holding/governança além da superfície provada: "${sentence}"`);
      }
    }
  }

  return { passed: hardFails.length === 0, hardFails };
}
