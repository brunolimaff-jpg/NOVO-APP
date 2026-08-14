/**
 * T3 — FindingSanitizer (V4 Pipeline Guarded).
 *
 * Uma passagem determinística única: RawFindingPack → SafeFindingPack.
 * Regras SEMÂNTICAS (estrutura de claim/status/fonte/relação/roleBasis),
 * nunca blocklist de produtos ("WMS não identificado" é observação válida;
 * "não possui WMS"/"gap WMS"/"processo manual" sem evidência são derivações).
 * Tudo que é removido/reescrito fica registrado em sanitizerEvents[] e
 * discardedClaims[] — pack continua rastreável.
 */
import type {
  CanonicalAccount,
  DiscardedClaim,
  Finding,
  PersonFinding,
  RawFindingPack,
  RelationshipFinding,
  SafeFindingPack,
  SanitizerEvent,
  SanitizerEventCode,
  TechnologySignal,
} from './gold-contracts';
import {
  matchesSensitiveTheme,
  matchesConfirmedVocabulary,
  neutralizeConfirmedVocabulary,
  matchesUnsupportedOperationalClaim,
} from './gold-policy';

const CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

/** Verbos de posse/uso: negação deles afirma ausência na empresa. */
// Lookahead no lugar de \b final: "há"/"á" não são \w no JS (acentuação).
const POSSESSION_NEGATION =
  /\bn[aã]o\s+(possui|possue|tem|h[áa]|utiliza|usa|adota|contratou|opera\s+com)(?=\s|[.,;!?]|$)/i;

/**
 * Formas epistemológicas de "não há" — NÃO são negação de posse:
 * "não há evidência/informação/registro disponível sobre X" sobrevive;
 * "não há WMS na empresa" continua bloqueado.
 */
const EPISTEMIC_ABSENCE =
  /\bn[aã]o\s+h[áa]\s+(evid[êe]ncia|informa[cç][aã]o|registro|dados?|dispon[ií]vel|men[cç][aã]o|prova|ind[ií]cio|como)\b/i;

/** Afirmação de gap sem evidência positiva do gap. */
const GAP_CLAIM =
  /\b(gap|gaps|lacuna|lacunas)\s+(de|em|confirmado|identificado)|(sem\s+(wms|tms|erp|sistema|solu[cç][aã]o))\b/i;

/** Processo manual/planilha afirmado como processo da empresa. */
const MANUAL_PROCESS_CLAIM =
  /\b(processo\s+(é|e)\s+manual|feito\s+em\s+planilha|planilha\s+(de\s+)?(excel|controle)|controle\s+manual|romaneio\s+manual|feito\s+à\s+m[aã]o|manualmente)\b/i;

/** Promoção de lateral a grupo/controlada. */
const GROUP_PROMOTION_CLAIM = /\b(grupo econ[oô]mico|integra o grupo|controlada|controladora|consolidada)\b/i;

/** Cargos funcionais que QSA não prova. */
const EXECUTIVE_ROLE =
  /\b(cfo|ceo|coo|cio|cto|diretor|diretora|presidente|decisor|head\s+de|gerente\s+geral|vice-presidente)\b/i;

/** Capacidade/produto/ROI/prazo/integração afirmados sem validação —
 * definição canônica em gold-policy (RCA-05): união verifier+sanitizer. */
const NON_EXTERNAL_SOURCE =
  /\b(estimativa|infer[êe]ncia|an[áa]lise de m[óo]dulos|dossi[êe] legado|crm interno)\b/i;

/** PACK_FORENSIC_REPLAY: fontes institucionais/releases NÃO provam registro
 * legal ou operação oficial (caso Colômbia: site institucional menciona
 * Cumaribo, mas registro legal colombiano não verificado). */
const WEAK_SOURCE_FOR_SENSITIVE =
  /\b(site\s+institucional|release|comunicado\s+de\s+imprensa|site\s+oficial|men[cç][aã]o)\b/i;

const MODULE_PROOF_SOURCE = /\b(m[óo]dulo\s+contratado|crm interno senior)\b/i;

function stripCpf(value: string): string {
  return value.replace(CPF_PATTERN, '[REDIGIDO]');
}

function hasCpf(value: string): boolean {
  CPF_PATTERN.lastIndex = 0;
  return CPF_PATTERN.test(value);
}

function normalizeForCanonical(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface SanitizeResult {
  safe: SafeFindingPack;
  sanitizerEvents: SanitizerEvent[];
}

export function sanitizeFindingPack(
  raw: RawFindingPack,
  canonical: CanonicalAccount,
): SafeFindingPack {
  const sanitizerEvents: SanitizerEvent[] = [];
  const discardedClaims: DiscardedClaim[] = [];

  const drop = (event: SanitizerEvent, claimText: string): void => {
    sanitizerEvents.push(event);
    discardedClaims.push({
      claim: stripCpf(claimText),
      reason: event.reason,
      originFindingId: event.findingId ?? null,
    });
  };

  const canonicalValues = [
    canonical.headOfficeCnpj ?? '',
    canonical.legalName,
    canonical.rootCnpj,
    ...canonical.directPjPartners.flatMap((p) => [p.cnpj, p.legalName]),
  ].map(normalizeForCanonical);

  const classifyFinding = (f: Finding, lateralEntities: Set<string>): SanitizerEvent | null => {
    const claim = f.claim;
    if (hasCpf(claim)) {
      return {
        findingId: f.id,
        code: 'CPF_LEAK',
        action: 'removed',
        before: claim,
        reason: 'CPF presente em claim — nunca expor CPF em payload de LLM',
      };
    }
    if (POSSESSION_NEGATION.test(claim) && !EPISTEMIC_ABSENCE.test(claim)) {
      return {
        findingId: f.id,
        code: 'NEGATIVE_EVIDENCE_AS_ABSENCE',
        action: 'removed',
        before: claim,
        reason: 'Negação de posse sem evidência positiva — ausência no recorte não prova ausência na empresa',
      };
    }
    if (GAP_CLAIM.test(claim)) {
      return {
        findingId: f.id,
        code: 'NEGATIVE_EVIDENCE_AS_GAP',
        action: 'removed',
        before: claim,
        reason: 'Ausência convertida em gap sem evidência positiva do gap',
      };
    }
    if (MANUAL_PROCESS_CLAIM.test(claim)) {
      return {
        findingId: f.id,
        code: 'MANUAL_PROCESS_INFERRED',
        action: 'removed',
        before: claim,
        reason: 'Processo manual/planilha inferido sem evidência de processo',
      };
    }
    if (f.kind === 'relationship' && GROUP_PROMOTION_CLAIM.test(claim)) {
      const mentionedLateral = lateralEntities.has(normalizeForCanonical(f.entity));
      if (mentionedLateral || /socio-search/i.test(f.source)) {
        return {
          findingId: f.id,
          code: 'LATERAL_PROMOTED',
          action: 'removed',
          before: claim,
          reason: 'Relação lateral promovida a grupo/controlada sem evidência (compartilhar sócio não prova grupo)',
        };
      }
    }
    // Uso ATIVO declarado (usa/utiliza/adota/opera com) — \b evita casar
    // "utilizado"/"usada" em contexto passivo ou epistemológico.
    if (MODULE_PROOF_SOURCE.test(f.source) && /\b(usa|utiliza|adota|opera\s+com)\b/i.test(claim)) {
      return {
        findingId: f.id,
        code: 'MODULE_AS_PROCESS_PROOF',
        action: 'rewritten',
        before: claim,
        after: `Módulo contratado (${f.source}) — presença de módulo não prova uso nem processo operacional`,
        reason: 'Presença de módulo contratado usada como prova de processo/uso',
      };
    }
    if (matchesUnsupportedOperationalClaim(claim) && (f.status !== 'Confirmado' || NON_EXTERNAL_SOURCE.test(f.source))) {
      return {
        findingId: f.id,
        code: 'UNSUPPORTED_PRODUCT_CLAIM',
        action: 'removed',
        before: claim,
        reason: 'Capacidade/produto/prazo/ROI/integração sem fonte externa validada',
      };
    }
    if (f.kind === 'identity' && canonicalValues.some((v) => v.length > 0 && normalizeForCanonical(claim).includes(v))) {
      return {
        findingId: f.id,
        code: 'CANONICAL_DUPLICATE',
        action: 'deduplicated',
        before: claim,
        reason: 'Fato já presente no canonical (fonte determinística vence narrativa)',
      };
    }
    // STATUS_PROMOTION (PACK_FORENSIC_REPLAY, Planejador 2026-08-10):
    // tema sensível (internacionalização/Colômbia/holding/controle) com
    // status Confirmado sustentado APENAS por fonte institucional/release/
    // menção — registro legal/operação oficial não verificado → rebaixa para
    // Pista forte. Evita que o Composer afirme "confirmada" com base em
    // vocabulário do claim (verifier R1 contornável quando o Compact marca
    // Confirmado — Caso B do dump).
    if (
      f.status === 'Confirmado' &&
      matchesSensitiveTheme(claim) &&
      WEAK_SOURCE_FOR_SENSITIVE.test(f.source)
    ) {
      // Micro-patch (Planejador 2026-08-10): o downgrade do status NÃO basta —
      // se o claim continuar com "confirmada", o fato rebaixado (Pista forte +
      // "confirmada") vira exatamente a contradição lexical que o Composer copia
      // → R8 PROMOTED_CLAIM. Neutraliza o vocabulário de certeza no MESMO evento.
      const neutralizedClaim = matchesConfirmedVocabulary(claim)
        ? neutralizeConfirmedVocabulary(claim)
        : claim;
      return {
        findingId: f.id,
        code: 'STATUS_PROMOTION',
        action: 'downgraded',
        before: `status=${f.status} | ${claim}`,
        after: neutralizedClaim,
        reason: 'Status Confirmado sobre tema sensível sustentado só por fonte institucional/release — registro legal não verificado; rebaixado para Pista forte e claim neutralizado',
      };
    }
    // CLAIM_LEXICAL_PROMOTION (SEMANTICS-FIX, Planejador 2026-08-10):
    // tema sensível + status != Confirmado + vocabulário "confirmada/confirmado"
    // no claim → contradição lexical interna (status diz pista, texto diz
    // confirmada). O STATUS_PROMOTION acima não pega (status não é Confirmado);
    // sem esta regra, o Composer copia "confirmada" → verifier R8 PROMOTED_CLAIM.
    // Reescreve SOMENTE o claim (mantém o status) para eliminar a palavra de
    // certeza e trocar por linguagem de pista/a validar.
    if (f.status !== 'Confirmado' && matchesSensitiveTheme(claim) && matchesConfirmedVocabulary(claim)) {
      return {
        findingId: f.id,
        code: 'CLAIM_LEXICAL_PROMOTION',
        action: 'rewritten',
        before: claim,
        after: neutralizeConfirmedVocabulary(claim),
        reason: 'Claim usa vocabulário de certeza ("confirmada") sobre tema sensível com status != Confirmado — reescrita para linguagem de pista (evita promoção pelo Composer)',
      };
    }
    // ENTITY_CONFLICT: afirmação de tipo cadastral (matriz/filial) que
    // contradiz o canonical — fonte determinística vence a narrativa.
    // Genérico (sem CNPJ/slug/setor): o padrão "é (a) matriz/filial" + o
    // tipo canônico do input decidem. ATENÇÃO: sem \b antes de "é"
    // (caracteres acentuados não são \w no JS — \b falharia).
    if (f.kind === 'identity') {
      const establishmentClaim = claim.match(/é\s+a?\s*(matriz|filial)\b/i);
      if (establishmentClaim) {
        const claimed = establishmentClaim[1].toLowerCase() === 'matriz' ? 'Matriz' : 'Filial';
        if (claimed !== canonical.establishmentType) {
          return {
            findingId: f.id,
            code: 'ENTITY_CONFLICT',
            action: 'removed',
            before: claim,
            reason: `Tipo cadastral afirmado (${claimed}) contradiz o canonical (${canonical.establishmentType})`,
          };
        }
      }
    }
    return null;
  };

  const lateralEntities = new Set(
    raw.relationships
      .filter((r) => r.relationType === 'partner_other_cnpj')
      .map((r) => normalizeForCanonical(r.relatedEntity)),
  );

  // === facts ===
  const facts: Finding[] = [];
  for (const f of raw.facts) {
    const event = classifyFinding(f, lateralEntities);
    if (!event) {
      facts.push(f);
      continue;
    }
    if (event.action === 'rewritten') {
      facts.push({ ...f, claim: event.after ?? f.claim, source: f.source });
    } else if (event.action === 'downgraded') {
      // STATUS_PROMOTION: mantém o fato com status rebaixado e, quando o evento
      // carrega `after` (claim neutralizado), aplica a reescrita lexical.
      facts.push({ ...f, status: 'Pista forte', claim: event.after ?? f.claim });
    } else if (event.action === 'deduplicated') {
      // removido do pack; registrado como deduplicado
    }
    drop(event, event.before ?? f.claim);
  }

  // === people (QSA não prova cargo funcional) ===
  const people: PersonFinding[] = [];
  for (const p of raw.people) {
    // "Sócio-Administrador" não é cargo funcional — excluir títulos de sócio
    // (o padrão "cio" casaria dentro de "Sócio" com acentuação).
    if (p.roleBasis === 'qsa' && EXECUTIVE_ROLE.test(p.role) && !/s[óo]cio/i.test(p.role)) {
      sanitizerEvents.push({
        findingId: p.id,
        code: 'QSA_AS_DECISOR',
        action: 'downgraded',
        before: p.role,
        after: 'Sócio (QSA)',
        reason: 'QSA é mapa de acesso, não prova de cargo funcional',
      });
      people.push({ ...p, role: 'Sócio (QSA)' });
      continue;
    }
    people.push(p);
  }

  // === relationships (lateral permanece lateral) ===
  // RCA-05 (I6 — paridade de cobertura): evidence é superfície ASSERTIVA —
  // mesma neutralização de certeza/tema sensível das claims (evita que o
  // texto final que deriva da evidence acuse R8 no verifier).
  const relationships: RelationshipFinding[] = [];
  for (const r of raw.relationships) {
    if (r.relationType === 'partner_other_cnpj' && GROUP_PROMOTION_CLAIM.test(r.evidence ?? '')) {
      sanitizerEvents.push({
        findingId: r.id,
        code: 'LATERAL_PROMOTED',
        action: 'downgraded',
        before: r.evidence ?? undefined,
        after: 'Compartilhamento de sócio (relação lateral)',
        reason: 'Evidência de lateral promovida a grupo por compartilhamento de sócio',
      });
      relationships.push({ ...r, evidence: 'Compartilhamento de sócio (relação lateral)' });
      continue;
    }
    if (r.evidence && matchesSensitiveTheme(r.evidence) && matchesConfirmedVocabulary(r.evidence)) {
      const neutralized = neutralizeConfirmedVocabulary(r.evidence);
      sanitizerEvents.push({
        findingId: r.id,
        code: 'CLAIM_LEXICAL_PROMOTION',
        action: 'rewritten',
        before: r.evidence,
        after: neutralized,
        reason: 'evidence usa vocabulário de certeza sobre tema sensível — reescrita para linguagem de pista (evita promoção pelo Composer)',
      });
      relationships.push({ ...r, evidence: neutralized });
      continue;
    }
    relationships.push(r);
  }

  // === technologySignals (RCA-04 F2): observedFact é superfície ASSERTIVA —
  // recebe a MESMA neutralização de certeza/tema sensível das claims (evita
  // que o Composer copie "confirmada" e o verifier acuse R8). validationQuestion
  // e whatIsNotKnown NÃO são tocados (modalidade interrogativa é tratada pelo
  // determinístico — RCA-03; escopo assertivo apenas). ===
  const technologySignals: TechnologySignal[] = [];
  for (const signal of raw.technologySignals) {
    if (matchesSensitiveTheme(signal.observedFact) && matchesConfirmedVocabulary(signal.observedFact)) {
      const neutralized = neutralizeConfirmedVocabulary(signal.observedFact);
      sanitizerEvents.push({
        code: 'CLAIM_LEXICAL_PROMOTION',
        action: 'rewritten',
        before: signal.observedFact,
        after: neutralized,
        reason: 'observedFact usa vocabulário de certeza ("confirmada") sobre tema sensível — reescrita para linguagem de pista (evita promoção pelo Composer)',
      });
      technologySignals.push({ ...signal, observedFact: neutralized });
      continue;
    }
    technologySignals.push(signal);
  }

  // === openQuestions: pergunta com pressuposto → pergunta neutra ===
  const openQuestions: string[] = [];
  for (const q of raw.openQuestions) {
    const pressuposition = q.match(/(.+?)\s+sem\s+[^?]+\??$/i);
    if (pressuposition && /(fazem|faz|opera|realiza|gerencia|controla|executa)/i.test(pressuposition[1])) {
      const processPart = pressuposition[1]
        .replace(/^(como|de que forma)\s+/i, '')
        .replace(/\b(voc[êe]s|vcs|a empresa|a companhia)\b/gi, '')
        .replace(/\b(fazem|faz|opera|operam|realiza|realizam|gerencia|gerenciam|controla|controlam|executa|executam)\b/gi, '')
        .replace(/^\s*(o|a|os|as)\s+/i, '')
        .trim();
      openQuestions.push(`Qual solução suporta hoje o processo de ${processPart}?`);
      sanitizerEvents.push({
        code: 'NEGATIVE_EVIDENCE_AS_ABSENCE',
        action: 'rewritten',
        before: q,
        after: `Qual solução suporta hoje o processo de ${processPart}?`,
        reason: 'Pergunta que pressupõe conclusão reescrita em pergunta neutra',
      });
      continue;
    }
    openQuestions.push(q);
  }

  return {
    module: raw.module,
    // SEMANTICS-FIX (Planejador 2026-08-10): accountIdentity é canonical-owned.
    // Antes: raw.accountIdentity atravessava sem canonicalização → se o
    // Compact errasse establishmentType (ex.: "Matriz" para CNPJ Filial), o
    // safePack carregava o erro sem barreira. Agora os campos determinísticos
    // (inputCnpj, legalName, establishmentType, rootCnpj) vêm do canonical;
    // conflicts (não-determinístico) é preservado do raw.
    accountIdentity: {
      inputCnpj: canonical.inputCnpj,
      legalName: canonical.legalName,
      establishmentType: canonical.establishmentType,
      rootCnpj: canonical.rootCnpj,
      conflicts: raw.accountIdentity.conflicts,
    },
    facts,
    relationships,
    technologySignals,
    people,
    metrics: raw.metrics,
    conflicts: raw.conflicts,
    openQuestions,
    discardedClaims,
    sanitized: true,
    sanitizerEvents,
    originalPack: raw,
  };
}

/** Veredito semântico de código de evento (uso externo). */
export function isSanitizerEventCode(code: string): code is SanitizerEventCode {
  return [
    'NEGATIVE_EVIDENCE_AS_ABSENCE',
    'NEGATIVE_EVIDENCE_AS_GAP',
    'MANUAL_PROCESS_INFERRED',
    'LATERAL_PROMOTED',
    'QSA_AS_DECISOR',
    'MODULE_AS_PROCESS_PROOF',
    'UNSUPPORTED_PRODUCT_CLAIM',
    'CANONICAL_DUPLICATE',
    'ENTITY_CONFLICT',
    'CPF_LEAK',
    'STATUS_PROMOTION',
    'CLAIM_LEXICAL_PROMOTION',
  ].includes(code);
}
