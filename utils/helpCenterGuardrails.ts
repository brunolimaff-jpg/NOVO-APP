import { HELP_CENTER_REFUSAL_MESSAGE } from '../config/helpCenterContent';

export interface HelpCenterGuardrailResult {
  allowed: boolean;
  reason: string;
  suggestedRedirect: string;
}

const DEFAULT_REDIRECT = HELP_CENTER_REFUSAL_MESSAGE;

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(ignore|ignorar|desconsidere|burlar|jailbreak|developer|system|prompt interno|instru[cç][oõ]es?)\b/i,
    reason: 'prompt_injection',
  },
  {
    pattern:
      /\b(api key|chave|token|senha|secret|segredo|env|vari[aá]vel de ambiente|c[oó]digo|codigo|reposit[oó]rio)\b/i,
    reason: 'sensitive_or_code_request',
  },
  {
    pattern: /\b(clima|tempo hoje|not[ií]cia|noticia|pol[ií]tica|futebol|cot[aç][aã]o|d[oó]lar|bitcoin)\b/i,
    reason: 'off_topic',
  },
  {
    pattern: /\b(investigue|investigar|pesquise|pesquisar|analise|analisar|levanta a capivara|capivara completa)\b/i,
    reason: 'company_investigation_request',
  },
  {
    pattern: /\b(cnpj\s*\d|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/i,
    reason: 'company_investigation_request',
  },
  {
    pattern: /\b(dossi[eê]\s+(da|de|do)\s+[a-z0-9])/i,
    reason: 'company_investigation_request',
  },
];

const ALLOWED_PATTERNS = [
  /\b(scout|senior scout|ferramenta|app|aplicativo|plataforma)\b/i,
  /\b(usar|uso|como uso|come[cç]o|come[cç]ar|funciona|serve|explica|entender)\b/i,
  /\b(fase|fases|etapa|etapas|jornada|fluxo)\b/i,
  /\b(feature|features|funcionalidade|funcionalidades|recurso|recursos)\b/i,
  /\b(dossi[eê] 360|dossi[eê]|porta|score porta|radar|crm|deep dive|smart options|war room)\b/i,
  /\b(exporta[cç][aã]o|exportar|pdf|word|markdown|email|e-mail|follow-up|follow up)\b/i,
  /\b(limite|limites|at[eé] onde|nao faz|n[aã]o faz|guardrail|trava|seguran[cç]a|validar|fontes?)\b/i,
  /\b(cnpj|cidade|uf|empresa correta|hom[oô]nimo)\b/i,
];

export function normalizeHelpCenterQuestion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isHelpCenterAllowedQuestion(text: string): HelpCenterGuardrailResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      allowed: false,
      reason: 'empty_question',
      suggestedRedirect: 'Digite uma pergunta sobre como usar o Senior Scout 360.',
    };
  }

  for (const blocked of BLOCKED_PATTERNS) {
    if (blocked.pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: blocked.reason,
        suggestedRedirect: DEFAULT_REDIRECT,
      };
    }
  }

  if (ALLOWED_PATTERNS.some(pattern => pattern.test(trimmed))) {
    return {
      allowed: true,
      reason: 'help_scope',
      suggestedRedirect: '',
    };
  }

  return {
    allowed: false,
    reason: 'unknown_scope',
    suggestedRedirect: DEFAULT_REDIRECT,
  };
}
