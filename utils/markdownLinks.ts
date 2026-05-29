import { seniorOfficialLinks } from './seniorLinks';

export function rewriteMarkdownLinksToGoogle(text: string): string {
  if (!text) return text;

  // Regex para capturar links Markdown: [Label](URL)
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/(?:[^\s()]+|\([^\s()]*\))+|[^)]+)\)/g;

  return text.replace(linkRegex, (match, label) => {
    const cleanLabel = label.trim();

    // 1) Citação com [🔗](URL) → mantém URL original (usado para fontes)
    if (cleanLabel === '🔗') {
      return match;
    }

    // 2) Se é um produto/solução Senior/GAtec com URL oficial no mapa → usar oficial
    const officialUrl = seniorOfficialLinks[cleanLabel];
    if (officialUrl) {
      return `[${label}](${officialUrl})`;
    }

    // 3) Se o texto do link contém "Senior" ou "GAtec" → fallback para busca específica otimizada
    const lower = cleanLabel.toLowerCase();
    if (lower.includes('senior') || lower.includes('gatec')) {
      // ANTERIOR: const searchUrl = buildSeniorOrGAtecSearchUrl(cleanLabel); return `[${label}](${searchUrl})`;
      // AGORA: Retorna o match original ou apenas o texto, pois links de busca google são considerados fake e bloqueados.
      // Manter o link original se existir, ou se for um link gerado pelo LLM que pode ser válido (ex: site oficial).
      return match;
    }

    // 4) Demais casos → Retornar o match original ou converter para texto se a URL for inválida/fake
    // NÃO GERAR MAIS LINKS DE BUSCA GOOGLE GENÉRICOS (google.com/search?q=...)
    // Pois google.com/search é considerado link fake e deve ser removido.

    // Se a URL original for válida e não fake, mantemos.
    // Se for fake, o fixFakeLinks já deve ter tratado ou tratará se rodar de novo.
    // Mas como esta função roda DEPOIS de fixFakeLinks no pipeline atual,
    // devemos apenas retornar o match original para preservar links externos válidos (ex: ibge.gov.br)

    return match;
  });
}
