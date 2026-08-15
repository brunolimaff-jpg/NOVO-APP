/**
 * BRU-109 DECISÃO 3 (C) — Política canônica de detecção de prompt leak.
 *
 * Veredito do Planejador (2026-08-15): extrair a política/detectores de leak
 * para um módulo compartilhado — api/llm.ts (serverless) e utils/textCleaners.ts
 * (cliente) usam a MESMA definição dos patterns, sem copiar regex (recriaria o
 * drift que o ARCH-A eliminou). As AÇÕES/limpeza continuam específicas da
 * boundary (o server preserva o comportamento JSON-safe; o cliente mantém o
 * strip com SENSITIVE_INTERNAL_PATTERNS e o allowlist da PORTA).
 *
 * Módulo puro (regex + lógica), sem dependências Node/DOM — importável pelo
 * serverless e pelo bundle browser.
 */

export interface LeakPattern {
  id: string;
  regex: RegExp;
}

const INTERNAL_MARKER_TEST_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*?\]\]/i;
const INTERNAL_MARKER_OPEN_TAIL_REGEX = /\[\[\s*[A-Z_]+\s*:[\s\S]*$/i;

/** 10 hard patterns canônicos (ids estáveis — fonte única para o serverless e o cliente). */
export const HARD_PROMPT_LEAK_PATTERNS: LeakPattern[] = [
  { id: 'internal_markers', regex: INTERNAL_MARKER_TEST_REGEX },
  { id: 'internal_marker_tail', regex: INTERNAL_MARKER_OPEN_TAIL_REGEX },
  { id: 'investigacao_integrada', regex: /investigacao_completa_integrada/i },
  { id: 'forense_protocol', regex: /protocolo de investiga[çc][aã]o forense/i },
  { id: 'system_urgente', regex: /urgente:\s*ignore\s+metadiscuss[õo]es/i },
  { id: 'absolute_mission', regex: /sua miss[aã]o absoluta/i },
  { id: 'dont_discuss_internal', regex: /n[aã]o discuta o funcionamento interno do modelo/i },
  { id: 'contexto_cadastral', regex: /contexto cadastral obrigat[oó]rio/i },
  { id: 'nota_de_escopo', regex: /nota de escopo:\s*este m[óo]dulo/i },
  { id: 'aviso_metodologico', regex: /aviso metodol[óo]gico:\s*(este m[óo]dulo|este dossi[eê]|esta an[áa]lise)/i },
];

/** 4 soft patterns canônicos (ids estáveis). */
export const SOFT_PROMPT_LEAK_PATTERNS: LeakPattern[] = [
  { id: 'urgente_dossie', regex: /urgente:.*dossi[eê]\s+de\s+agroneg[oó]cio/i },
  { id: 'score_porta_cnpj', regex: /score porta.*preciso.*cnpj/i },
  { id: 'protocolos_combinados', regex: /execute um dossi[eê] completo combinando os protocolos/i },
  { id: 'priorize_objetividade_fontes', regex: /priorize objetividade.*fontes audit[aá]veis/i },
];

export interface PromptLeakCoreDetection {
  detected: boolean;
  /** ids dos patterns atingidos (hard + soft), na ordem dos arrays. */
  indicators: string[];
}

/**
 * Detector canônico compartilhado: hard > 0 OU soft >= 2 → detectado.
 * Ações (bloquear/substituir/limpar) são da boundary que chama.
 */
export function detectPromptLeakIndicators(text: string): PromptLeakCoreDetection {
  const sample = (text || '').trim();
  if (!sample) return { detected: false, indicators: [] };

  const hardHits = HARD_PROMPT_LEAK_PATTERNS.filter((p) => p.regex.test(sample)).map((p) => p.id);
  const softHits = SOFT_PROMPT_LEAK_PATTERNS.filter((p) => p.regex.test(sample)).map((p) => p.id);
  return {
    detected: hardHits.length > 0 || softHits.length >= 2,
    indicators: [...hardHits, ...softHits],
  };
}
