const COMPANY_PATTERNS: RegExp[] = [
  // "dossiê completo da X", "análise completa da X"
  /completa?\s+d[oa]s?\s+(.+)/i,
  // "empresa X", "grupo X", "companhia X"
  /(?:empresa|grupo|companhia)\s+(.+)/i,
  // "investigando X", "analisando X", "pesquisando X", "mapeando X"
  /(?:investigando|analisando|pesquisando|mapeando)\s+(?:a\s+|o\s+)?(.+)/i,
  // "investigar (a) X", "analisar (o) X", "pesquisar X"
  /(?:investigar|analisar|pesquisar|mapear)\s+(?:a\s+|o\s+)?(.+)/i,
  // "sobre a X", "sobre o X", "sobre X" (artigo opcional)
  /(?:sobre\s+(?:a\s+|o\s+)?)(.+)/i,
  // "dossiê da X", "dossie do X"
  /(?:dossie?\s+d[oa]s?\s+)(.+)/i,
  // "capivara da X"
  /(?:capivara\s+d[oa]s?\s+)(.+)/i,
  // "me fala da X", "fala sobre a X", "me conta da X"
  /(?:(?:me\s+)?(?:fala|conta|diz)\s+(?:d[oa]s?\s+|sobre\s+(?:a\s+|o\s+)?))(.+)/i,
  // "informações da X", "dados da X", "situação da X", "histórico da X"
  /(?:informa[çc][õo]es|dados|situa[çc][ãa]o|hist[óo]rico|detalhes)\s+d[oa]s?\s+(.+)/i,
  // "como está a X", "como vai a X"
  /(?:como\s+(?:est[áa]|vai|anda)\s+(?:a\s+|o\s+)?)(.+)/i,
  // "quero saber sobre (a) X", "quero conhecer a X"
  /(?:quero\s+(?:saber|conhecer|ver)\s+(?:sobre\s+)?(?:a\s+|o\s+)?)(.+)/i,
  // "qual a situação da X", "qual o status da X"
  /(?:qual\s+[ao]\s+\w+\s+d[oa]s?\s+)(.+)/i,
  // "cliente X", "prospect X"
  /(?:cliente|prospect)\s+(.+)/i,
];

/**
 * Sufixos e complementos que devem ser removidos da captura greedy.
 * Ex.: "investigar a Bom Futuro e suas operações" → "Bom Futuro"
 */
const TRAILING_NOISE = /\s+(?:e\s+(?:su[ao]s?|del[ea]s?|d?ess[ea]s?)|por\s+favor|pra\s+mim|,\s*por\s+favor|para\s+(?:mim|[ao]|eu)|no\s+(?:mercado|setor|agro|brasil)|na\s+senior|\.{1,3}$|\?\s*$).*/i;

/**
 * Extrai o nome da empresa a partir do texto visível da mensagem do usuário.
 * Retorna 'Empresa' se nada for encontrado, nunca retorna o texto original inteiro.
 */
export function extractCompanyName(title: string | null | undefined): string {
  if (!title) return 'Empresa';

  const cleaned = title
    .trim()
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
    .trim();

  for (const pattern of COMPANY_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const name = match[1]
        .trim()
        .replace(TRAILING_NOISE, '')
        .replace(/[.!?,;:]+$/, '')
        .replace(/\.{3}$/, '')
        .trim();
      if (name.length > 2 && name.length < 60) return name;
    }
  }

  // Não retorna o texto inteiro como fallback — prefere "Empresa" a mandar lixo para o lookup
  return 'Empresa';
}
