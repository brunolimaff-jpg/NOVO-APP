import { ERP_BANKING_CANONICAL_BLOCK } from './config';
import type { GroundingResponseLike, WarRoomSource } from './contracts';

export function extractGroundingSources(response: GroundingResponseLike | null | undefined): WarRoomSource[] {
  const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const dedupe = new Set<string>();
  const sources: WarRoomSource[] = [];

  for (const chunk of groundingChunks) {
    const uri = chunk?.web?.uri;
    if (!uri || dedupe.has(uri)) continue;

    try {
      const parsed = new URL(uri);
      const title = chunk?.web?.title || parsed.hostname;
      dedupe.add(uri);
      sources.push({ title, url: uri });
    } catch {
      // Ignore invalid URIs without breaking the full response.
    }
  }

  return sources;
}

/**
 * Detecta URLs na resposta do Gemini que não estão presentes nos matches do RAG.
 * URLs que não vieram do contexto RAG têm alta chance de serem alucinações.
 */
export function detectHallucinatedUrls(text: string, ragMatches: Array<{ url?: string }>): string[] {
  const knownUrls = new Set<string>();
  for (const match of ragMatches) {
    if (match.url) {
      knownUrls.add(match.url.replace(/[)>]+$/, ''));
    }
  }

  const responseUrls = text.match(/https:\/\/documentacao\.senior\.com\.br\/[^\s)>]+/g) || [];
  const hallucinated: string[] = [];

  for (const url of responseUrls) {
    const cleanUrl = url.replace(/[)>]+$/, '');
    if (!knownUrls.has(cleanUrl)) {
      console.warn('[HALLUCINATION] URL nao veio do RAG:', cleanUrl);
      hallucinated.push(cleanUrl);
    }
  }

  return hallucinated;
}

export function enforceBankingAnchors(text: string): string {
  let output = text || '';
  if (!output) return output;

  output = output
    .replace(/senior compensa/gi, 'ERP Banking da Senior comprova')
    .replace(/senior\s*\(erp banking\)\s*comprova/gi, 'ERP Banking da Senior comprova')
    .replace(/senior\s*bank\s*\/\s*fintech/gi, 'ERP Banking da Senior')
    .replace(/\bsenior\s*bank\b/gi, 'ERP Banking da Senior')
    .replace(/senior\s*\(erp banking\)\s*:/gi, 'ERP Banking da Senior:');

  const hasBankingMention = /\berp banking\b/i.test(output);
  const hasBankingLinks = /integracao-erp-banking|#banking\/banking\.htm/i.test(output);
  const hasCanonicalMapping =
    /erp banking da senior|pagamento eletr[oô]nico abrangente|registro online de t[ií]tulos e boletos via api/i.test(output);
  const hasCanonicalSection = /###\s*mapeamento can[oô]nico:\s*erp banking vs totvs/i.test(output);

  if (!hasCanonicalSection || !hasBankingMention || !hasBankingLinks || !hasCanonicalMapping) {
    output += `\n\n${ERP_BANKING_CANONICAL_BLOCK}`;
  }

  return output.trim();
}
