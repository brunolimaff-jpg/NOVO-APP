/**
 * BRU-73 — classificação de intenção da mensagem do chat.
 *
 * Separa criação normal (copy/email/script/resumo), pesquisa explícita,
 * pesquisa ambígua e acionamento de próximo passo, impedindo que mensagens
 * vagas ou tarefas comerciais iniciem deep research sem escopo.
 *
 * Quatro intents conceituais + ampliação de escopo:
 * - craft: copy, email, script, resumo, objeções, preparação comercial.
 * - explicit: pesquisa com alvo claro (ex.: "pesquise mais sobre a holding").
 * - ambiguous: pedido vago (ex.: "pesquise mais", "aprofunde", "descubra mais").
 * - followup: pedido explícito ligado a um próximo passo (ex.: "aprofundar holding agora").
 * - scope-expansion: "pesquise tudo" — ampliação material de escopo.
 */
export type ChatIntent = 'craft' | 'explicit' | 'ambiguous' | 'followup' | 'scope-expansion';

export function classifyChatIntent(text: string): ChatIntent {
  const t = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // Negação explícita de pesquisa nunca dispara deep research — o usuário
  // pediu para NÃO pesquisar; o pedido segue o caminho normal (craft).
  if (/(?:não|nao|pare de|evite|para de|sem\s+pesquisar)\s+(?:pesquis\w*|aprofund\w*|investig\w*|descubr\w*)/.test(t)) {
    return 'craft';
  }

  // FOLLOWUP_NEXT_STEP: "aprofundar X agora" / "pesquisar X agora"
  if (/(?:aprofundar|pesquisar|investigar|descobrir)\s+\S+(?:\s+(?:agora|em seguida|na sequencia))/.test(t)) {
    return 'followup';
  }

  // Scope expansion: "pesquise tudo"
  if (/pesquis\w*\s+(?:tudo|todos|toda|todas|integralmente|completamente)/.test(t)) {
    return 'scope-expansion';
  }

  // Explicit: "pesquise mais sobre X" / "pesquise sobre X" (alvo claro)
  if (/pesquis\w*\s+(?:mais\s+)?(?:sobre|a respeito de|o que|quem|como|onde|quando)\b/.test(t)) {
    return 'explicit';
  }

  // Ambiguous: "pesquise mais", "aprofunde", "descubra mais", "investigue mais"
  if (/pesquis\w*\s+mais|aprofund\w*|descubr\w*\s+mais|investig\w*\s+mais|tente\s+descobrir/.test(t)) {
    return 'ambiguous';
  }

  // CRAFT_FROM_CONTEXT: qualquer outro pedido usa o contexto já disponível.
  return 'craft';
}

export type IntentRoutingInput = {
  /** Texto bruto recebido pelo processMessage — fala do usuário OU payload interno de sistema. */
  text: string;
  /** Texto visível fornecido pelo chamador quando difere de text (ex.: "🔍 Investigando X..."). */
  visibleText?: string;
};

/**
 * BRU-80 — fronteira do roteamento de intenção.
 *
 * `classifyChatIntent` só deve avaliar a intenção explícita do usuário.
 * Quando o chamador fornece um `visibleText` distinto do `text` bruto, o
 * `text` é um payload interno de sistema (ex.: protocolo de investigação com
 * dezenas de milhares de caracteres acionado por deep dive / nova pesquisa) —
 * nunca a fala do usuário. Classificar esse payload gera falsos
 * `ambiguous`/`scope-expansion` que bloqueiam o waterfall antes de começar.
 * Nesses fluxos a intenção é de pesquisa explícita por construção.
 */
export function resolveResearchIntent(input: IntentRoutingInput): ChatIntent {
  const isSystemPayload = Boolean(input.visibleText && input.visibleText !== input.text);
  if (isSystemPayload) return 'explicit';
  return classifyChatIntent(input.text);
}
