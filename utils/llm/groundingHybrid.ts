import { scoutDiag } from '../diagnosticLog.js';

export interface HybridGroundingSources {
  /** Fontes consolidadas como texto para injeção no prompt (CRM + Brasil API). */
  contextBlock: string;
  /** Array de fontes verificáveis (URLs, nomes) para rastreabilidade. */
  sources: Array<{ title: string; url: string; kind: 'cadastral' | 'crm' | 'web' }>;
  /** Se dados cadastrais oficiais foram obtidos com sucesso. */
  hasCadastralData: boolean;
  /** Se dados de CRM/Cliente Senior foram obtidos. */
  hasCrmData: boolean;
}

export function buildHybridGroundingContext(params: {
  cnpj: string;
  empresaAlvo: string;
  cnpjData?: {
    razaoSocial?: string;
    nomeFantasia?: string;
    cnaePrincipal?: string;
    naturezaJuridica?: string;
    capitalSocial?: number;
    dataAbertura?: string;
    municipio?: string;
    uf?: string;
    situacaoCadastral?: string;
  } | null;
  clienteSeniorData?: {
    encontrado?: boolean;
    totalModulos?: number;
    descricao?: string;
  } | null;
}): HybridGroundingSources {
  const { cnpj, empresaAlvo, cnpjData, clienteSeniorData } = params;
  const sources: HybridGroundingSources['sources'] = [];
  const blocks: string[] = [];

  // Cadastral (Brasil API)
  if (cnpjData) {
    blocks.push(
      `[DADOS CADASTRAIS — Receita Federal]\nRazão Social: ${cnpjData.razaoSocial || empresaAlvo}\nCNPJ: ${cnpj}\nNatureza Jurídica: ${cnpjData.naturezaJuridica || 'N/D'}\nCapital Social: ${cnpjData.capitalSocial != null ? `R$ ${cnpjData.capitalSocial.toLocaleString('pt-BR')}` : 'N/D'}\nAbertura: ${cnpjData.dataAbertura || 'N/D'}\nLocalização: ${[cnpjData.municipio, cnpjData.uf].filter(Boolean).join(', ') || 'N/D'}\nSituação: ${cnpjData.situacaoCadastral || 'N/D'}`,
    );
    sources.push({
      title: `CNPJ ${cnpj} — Receita Federal`,
      url: `https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp?cnpj=${cnpj.replace(/\D/g, '')}`,
      kind: 'cadastral',
    });
  }

  // CRM Cliente Senior
  if (clienteSeniorData?.encontrado) {
    blocks.push(
      `[CLIENTE SENIOR]\nStatus: CONFIRMADO\nMódulos ativos: ${clienteSeniorData.totalModulos ?? 'N/D'}\nDescrição: ${clienteSeniorData.descricao || 'ERP Senior'}`,
    );
    sources.push({
      title: `Cliente Senior — ${empresaAlvo}`,
      url: '',
      kind: 'crm',
    });
  }

  scoutDiag.info?.('GroundingHybrid', 'contexto híbrido construído', {
    empresaAlvo,
    cnpj,
    hasCadastral: Boolean(cnpjData),
    hasCrm: clienteSeniorData?.encontrado === true,
    sourcesCount: sources.length,
    contextChars: blocks.join('\n\n').length,
  });

  return {
    contextBlock: blocks.join('\n\n'),
    sources,
    hasCadastralData: Boolean(cnpjData),
    hasCrmData: clienteSeniorData?.encontrado === true,
  };
}

/**
 * Extrai web sources de uma resposta Gemini (com grounding/googleSearch ativo).
 * Usado quando fazemos uma chamada Gemini Flash só para busca — o texto é descartado,
 * mas as fontes são preservadas e injetadas no prompt LiteLLM.
 */
export function extractWebSourcesFromGroundingResponse(groundingResponse: {
  groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
  groundingSupports?: Array<{ segment?: { endIndex?: number }; groundingChunkIndices?: number[] }>;
}): Array<{ title: string; url: string }> {
  const chunks = groundingResponse.groundingChunks ?? [];
  const sources = new Map<string, { title: string; url: string }>();

  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (uri && !sources.has(uri)) {
      sources.set(uri, { title: title || uri, url: uri });
    }
  }

  return Array.from(sources.values());
}
