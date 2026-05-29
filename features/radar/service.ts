// features/radar/service.ts
// Cliente frontend para o Radar Competitivo & Setorial do Agronegócio.
// Chama /api/radar-scan (serverless Vercel) e parseia alertas.

import type { RadarAlert, RadarCategory, RadarConfig } from './types';

const RADAR_API_PATH = '/api/radar-scan';
const RADAR_TIMEOUT_MS = 25000;

export type RadarScanErrorCode =
  | 'RADAR_TIMEOUT'
  | 'RADAR_NETWORK'
  | 'RADAR_BAD_REQUEST'
  | 'RADAR_RATE_LIMIT'
  | 'RADAR_SERVER'
  | 'RADAR_UNKNOWN';

export class RadarScanError extends Error {
  code: RadarScanErrorCode;
  retryable: boolean;
  userMessage: string;

  constructor(code: RadarScanErrorCode, userMessage: string, retryable: boolean, technicalMessage?: string) {
    super(technicalMessage || userMessage);
    this.name = 'RadarScanError';
    this.code = code;
    this.retryable = retryable;
    this.userMessage = userMessage;
  }
}

export interface RadarPartialFailure {
  category: string;
  reason: string;
}

export interface RadarCategoryStat {
  category: string;
  sourceItems: number;
  generatedAlerts: number;
  ok: boolean;
}

export interface RadarScanResult {
  alerts: RadarAlert[];
  metaInsight: string | null;
  partialFailures: RadarPartialFailure[];
  categoryStats: RadarCategoryStat[];
}

// ===================================================================
// CATEGORIAS → PROMPTS (usados pelo serverless, exportados para reuso)
// ===================================================================

const CONCORRENTES_NOMES = [
  'SAP',
  'TOTVS',
  'Protheus',
  'Sankhya',
  'SIAGRI',
  'CHB Sistemas',
  'Benner',
  'LG Sistemas',
  'Viasoft',
  'Korp',
  'Unisystem',
  'Uniplus',
  'Senior Sistemas',
  'GAtec',
  'SimpleFarm',
  'Aegro',
  'Solinftec',
  'Aliare',
  'Agrotitan',
  'Oracle',
  'Datasul',
];

export function buildCategoryPrompt(category: RadarCategory, estados: string[]): string {
  const estadoCtx =
    estados.length > 0 ? `\nFOCO REGIONAL: Priorize notícias relevantes para os estados: ${estados.join(', ')}.` : '';

  const base = `Você é um Head de Inteligência de Mercado especializado em agronegócio brasileiro e tecnologia para o campo.
Pesquise AGORA as notícias e movimentos mais recentes (últimos 7 dias) usando busca na web.
${estadoCtx}

REGRAS:
- Retorne APENAS notícias reais com fontes verificáveis (URL pública)
- Não invente notícias. Se não encontrar, retorne array vazio.
- Priorize portais: Valor Econômico, Canal Rural, Agrolink, TI Inside, InfoMoney, Reuters, Bloomberg, Globo Rural, Nova Cana, Notícias Agrícolas, ComputerWorld, Convergência Digital
- Formato de resposta: JSON array (máximo 5 alertas por categoria)

FORMATO JSON (responda APENAS o JSON, sem texto antes/depois):
[
  {
    "title": "Título da notícia",
    "summary": "Resumo em 2-3 frases do impacto para o agronegócio",
    "sourceUrl": "https://url-completa-da-fonte.com/artigo",
    "sourceName": "Nome do Portal",
    "relevance": "alta|media|baixa",
    "publishedAt": "YYYY-MM-DD",
    "estado": "UF ou null"
  }
]`;

  switch (category) {
    case 'concorrentes':
      return `${base}

CATEGORIA: MOVIMENTOS COMPETITIVOS DE ERP/SOFTWARE AGRO
Pesquise movimentos recentes destas empresas: ${CONCORRENTES_NOMES.join(', ')}.
Foco em: lançamentos de produto, investimentos em IA, aquisições, parcerias estratégicas, expansão regional, novos módulos agro, eventos/feiras, mudanças de liderança.
Exemplos do tipo de notícia que busco: "TOTVS investe em IA para agro", "Sankhya lança módulo de originação", "SAP fecha parceria com cooperativa X".`;

    case 'agro_tech':
      return `${base}

CATEGORIA: INOVAÇÃO E AGTECH
Pesquise avanços em tecnologia para agronegócio: agricultura de precisão, drones, IoT no campo, inteligência artificial aplicada, sensoriamento remoto, automação de máquinas, conectividade rural (4G/5G), startups agtech, novos softwares de gestão rural, agricultura digital.`;

    case 'regulatorio':
      return `${base}

CATEGORIA: REGULATÓRIO & COMPLIANCE AGRO
Pesquise mudanças regulatórias no agronegócio brasileiro: novas leis ambientais, IBAMA, SEMA, rastreabilidade obrigatória, créditos de carbono, ESG no agro, certificações (GlobalGAP, Rainforest Alliance, RTRS), Código Florestal, outorgas ANA, CONAMA, regulamentação de defensivos, Lei do Agro, Plano Safra, normas MAPA.`;

    case 'mercado':
      return `${base}

CATEGORIA: MERCADO & COMMODITIES AGRO
Pesquise tendências de mercado no agronegócio: preços de commodities (soja, milho, algodão, café, açúcar), previsões de safra, balança comercial agro, novas rotas logísticas, armazéns e silos, exportação, câmbio impactando agro, fusões de tradings, movimentos de cooperativas.`;

    case 'rh_trabalho':
      return `${base}

CATEGORIA: RH & TRABALHISTA NO AGRO
Pesquise mudanças trabalhistas no agronegócio: reforma trabalhista impactando rural, NR-31 atualização, eSocial rural, sindicatos rurais, disputas trabalhistas, mão de obra no campo, digitalização de RH rural, SST no agro, gestão de terceiros/temporários no campo.`;

    case 'ma_expansao':
      return `${base}

CATEGORIA: M&A & EXPANSÃO NO AGRO
Pesquise fusões, aquisições e expansão no agronegócio brasileiro: novos grupos entrando no agro, compra de fazendas/terras, consolidação de cooperativas, investidores estrangeiros, IPOs de empresas agro, fundos de investimento em terras, expansão de grupos para novos estados.`;
  }
}

// ===================================================================
// HASH PARA DEDUP
// ===================================================================

export function generateAlertId(title: string, sourceUrl: string): string {
  const raw = `${title.toLowerCase().trim()}|${sourceUrl.toLowerCase().trim()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `radar_${Math.abs(hash).toString(36)}`;
}

// ===================================================================
// FETCH API
// ===================================================================

export async function fetchRadarAlerts(config: RadarConfig): Promise<RadarScanResult> {
  const { categories, estados } = config;
  if (categories.length === 0) return { alerts: [], metaInsight: null, partialFailures: [], categoryStats: [] };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), RADAR_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(RADAR_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, estados }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new RadarScanError(
        'RADAR_TIMEOUT',
        'O Radar demorou além do esperado. Tente novamente em instantes.',
        true,
        'Radar request timed out',
      );
    }
    throw new RadarScanError(
      'RADAR_NETWORK',
      'Falha de conexão ao consultar o Radar. Verifique sua internet e tente de novo.',
      true,
      err instanceof Error ? err.message : 'Network error',
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      const parts = [err?.error, err?.detail, err?.message].filter(Boolean);
      detail = parts.join(' | ');
      if (!detail && err?.details) detail = JSON.stringify(err.details);
    } catch {
      // ignore parse failures and keep status-only error
    }
    if (res.status === 400) {
      throw new RadarScanError(
        'RADAR_BAD_REQUEST',
        'Configuração do Radar inválida. Revise categorias e estados.',
        false,
        `Radar scan failed (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    if (res.status === 429) {
      throw new RadarScanError(
        'RADAR_RATE_LIMIT',
        'O Radar está temporariamente sobrecarregado. Tente novamente em alguns minutos.',
        true,
        `Radar scan failed (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    if (res.status >= 500) {
      throw new RadarScanError(
        'RADAR_SERVER',
        'O serviço do Radar está instável no momento. Tente novamente em instantes.',
        true,
        `Radar scan failed (${res.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    throw new RadarScanError(
      'RADAR_UNKNOWN',
      'Não foi possível concluir a varredura do Radar.',
      true,
      `Radar scan failed (${res.status})${detail ? `: ${detail}` : ''}`,
    );
  }

  const data = await res.json();
  return {
    alerts: (data.alerts || []) as RadarAlert[],
    metaInsight: data.metaInsight || null,
    partialFailures: (data.partialFailures || []) as RadarPartialFailure[],
    categoryStats: (data.categoryStats || []) as RadarCategoryStat[],
  };
}
