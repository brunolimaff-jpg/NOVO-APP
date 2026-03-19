// services/radarService.ts
// Cliente frontend para o Radar Competitivo & Setorial do Agronegócio.
// Chama /api/radar-scan (serverless Vercel) e parseia alertas.

import type { RadarAlert, RadarCategory, RadarConfig } from '../types';

const RADAR_API_PATH = '/api/radar-scan';

// ===================================================================
// CATEGORIAS → PROMPTS (usados pelo serverless, exportados para reuso)
// ===================================================================

const CONCORRENTES_NOMES = [
  'SAP', 'TOTVS', 'Protheus', 'Sankhya', 'SIAGRI', 'CHB Sistemas',
  'Benner', 'LG Sistemas', 'Viasoft', 'Korp', 'Unisystem', 'Uniplus',
  'Senior Sistemas', 'GAtec', 'SimpleFarm', 'Aegro', 'Solinftec',
  'Aliare', 'Agrotitan', 'Oracle', 'Datasul',
];

export function buildCategoryPrompt(category: RadarCategory, estados: string[]): string {
  const estadoCtx = estados.length > 0
    ? `\nFOCO REGIONAL: Priorize notícias relevantes para os estados: ${estados.join(', ')}.`
    : '';

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
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `radar_${Math.abs(hash).toString(36)}`;
}

// ===================================================================
// FETCH API
// ===================================================================

export async function fetchRadarAlerts(config: RadarConfig): Promise<RadarAlert[]> {
  const { categories, estados } = config;
  if (categories.length === 0) return [];

  const res = await fetch(RADAR_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories, estados }),
  });

  if (!res.ok) {
    throw new Error(`Radar scan failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.alerts || []) as RadarAlert[];
}
