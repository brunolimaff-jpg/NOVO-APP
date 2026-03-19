import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

// ===================================================================
// CONFIGURAÇÃO
// ===================================================================

export const config = { runtime: 'nodejs' };
export const maxDuration = 120;

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const SCAN_TIMEOUT_MS = 25_000; // 25s por categoria (execução paralela)

const VALID_CATEGORIES = [
  'concorrentes', 'agro_tech', 'regulatorio', 'mercado', 'rh_trabalho', 'ma_expansao',
] as const;

const RequestSchema = z.object({
  categories: z.array(z.enum(VALID_CATEGORIES)).min(1).max(6),
  estados: z.array(z.string().length(2)).max(27).default([]),
});

// ===================================================================
// NOMES DE CONCORRENTES (inline para serverless — sem import do frontend)
// ===================================================================

const CONCORRENTES_NOMES = [
  'SAP', 'TOTVS', 'Protheus', 'Sankhya', 'SIAGRI', 'CHB Sistemas',
  'Benner', 'LG Sistemas', 'Viasoft', 'Korp', 'Unisystem',
  'Senior Sistemas', 'GAtec', 'SimpleFarm', 'Aegro', 'Solinftec',
  'Aliare', 'Agrotitan', 'Oracle', 'Datasul',
];

// ===================================================================
// PROMPTS POR CATEGORIA
// ===================================================================

function buildPrompt(category: string, estados: string[]): string {
  const estadoCtx = estados.length > 0
    ? `\nFOCO REGIONAL: Priorize notícias para: ${estados.join(', ')}.`
    : '';

  const base = `Você é um Head de Inteligência de Mercado de agronegócio brasileiro.
USE A FERRAMENTA DE BUSCA NA WEB para pesquisar notícias reais dos últimos 7 dias. Não responda de memória.
${estadoCtx}

REGRAS:
- APENAS notícias reais com fontes verificáveis (URL pública).
- Não invente. Se não encontrar, retorne [].
- Portais prioritários: Valor Econômico, Canal Rural, Agrolink, TI Inside, InfoMoney, Reuters, Bloomberg, Globo Rural, Nova Cana, Notícias Agrícolas, ComputerWorld, Convergência Digital.
- Máximo 5 alertas.

FORMATO: Responda APENAS um JSON array, sem texto antes/depois:
[{"title":"...","summary":"...","sourceUrl":"https://...","sourceName":"...","relevance":"alta|media|baixa","publishedAt":"YYYY-MM-DD","estado":"UF ou null"}]`;

  const topics: Record<string, string> = {
    concorrentes: `\nCATEGORIA: MOVIMENTOS COMPETITIVOS ERP/SOFTWARE AGRO\nEmpresas: ${CONCORRENTES_NOMES.join(', ')}.\nFoco: lançamentos, investimentos IA, aquisições, parcerias, novos módulos agro, expansão regional, mudanças de liderança.`,
    agro_tech: `\nCATEGORIA: INOVAÇÃO AGTECH\nFoco: agricultura de precisão, drones, IoT campo, IA aplicada, sensoriamento remoto, automação, conectividade rural, startups agtech.`,
    regulatorio: `\nCATEGORIA: REGULATÓRIO & COMPLIANCE AGRO\nFoco: leis ambientais, IBAMA, SEMA, rastreabilidade, créditos carbono, ESG agro, certificações, Código Florestal, outorgas ANA, normas MAPA, Plano Safra.`,
    mercado: `\nCATEGORIA: MERCADO & COMMODITIES\nFoco: preços commodities (soja, milho, algodão, café), previsão safra, balança comercial, rotas logísticas, câmbio, cooperativas.`,
    rh_trabalho: `\nCATEGORIA: RH & TRABALHISTA AGRO\nFoco: reforma trabalhista rural, NR-31, eSocial rural, sindicatos, mão de obra, SST agro, gestão de terceiros.`,
    ma_expansao: `\nCATEGORIA: M&A & EXPANSÃO AGRO\nFoco: fusões, aquisições, compra de terras, consolidação cooperativas, investidores estrangeiros, IPOs agro, expansão grupos.`,
  };

  return base + (topics[category] || '');
}

// ===================================================================
// PARSE RESPOSTA DO GEMINI
// ===================================================================

interface RawAlert {
  title?: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
  relevance?: string;
  publishedAt?: string;
  estado?: string;
}

function hashId(title: string, url: string): string {
  const raw = `${(title || '').toLowerCase().trim()}|${(url || '').toLowerCase().trim()}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h) + raw.charCodeAt(i);
    h |= 0;
  }
  return `radar_${Math.abs(h).toString(36)}`;
}

function parseAlerts(text: string, category: string, scannedAt: string): RawAlert[] {
  // Strip markdown code blocks if present
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
  const jsonMatch = cleaned.match(/\[[\s\S]*?\]/); // non-greedy
  if (!jsonMatch) {
    console.warn(`[RADAR] No JSON array found for ${category}. Raw (200 chars): ${text.slice(0, 200)}`);
    return [];
  }
  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a: RawAlert) => a.title)
      .slice(0, 5)
      .map((a: RawAlert) => ({
        id: hashId(a.title || '', a.sourceUrl || ''),
        title: (a.title || '').slice(0, 300),
        summary: (a.summary || '').slice(0, 500),
        sourceUrl: (a.sourceUrl || '').slice(0, 1000),
        sourceName: (a.sourceName || 'Fonte desconhecida').slice(0, 100),
        category,
        relevance: ['alta', 'media', 'baixa'].includes(a.relevance || '') ? a.relevance : 'media',
        publishedAt: a.publishedAt || scannedAt.split('T')[0],
        scannedAt,
        estado: typeof a.estado === 'string' && a.estado.length === 2 ? a.estado : undefined,
        read: false,
      }));
  } catch (e) {
    console.warn(`[RADAR] JSON parse failed for ${category}:`, e, `Raw (200 chars): ${text.slice(0, 200)}`);
    return [];
  }
}

// ===================================================================
// TIMEOUT HELPER
// ===================================================================

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

// ===================================================================
// HANDLER
// ===================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Suporta GET (cron) e POST (frontend)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });
    }

    // Para GET (cron), usa todas as categorias
    const body = req.method === 'GET'
      ? { categories: [...VALID_CATEGORIES], estados: [] }
      : req.body;

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { categories, estados } = parsed.data;
    const ai = new GoogleGenAI({ apiKey });
    const scannedAt = new Date().toISOString();

    // Processa categorias em PARALELO para caber no maxDuration de 120s
    const results = await Promise.allSettled(
      categories.map(async (category) => {
        const prompt = buildPrompt(category, estados);
        const chat = ai.chats.create({
          model: DEFAULT_MODEL,
          config: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            tools: [{ googleSearch: {} }],
          },
        });

        const response = await withTimeout(
          chat.sendMessage({ message: prompt }),
          SCAN_TIMEOUT_MS,
          `radar-${category}`,
        );

        const text = response.text || '';
        console.log(`[RADAR] ${category} response (200 chars): ${text.slice(0, 200)}`);
        return parseAlerts(text, category, scannedAt);
      }),
    );

    const allAlerts: unknown[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allAlerts.push(...result.value);
      } else {
        console.error(`[RADAR] Erro na categoria ${categories[i]}:`, result.reason);
      }
    });

    return res.status(200).json({ alerts: allAlerts, scannedAt });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RADAR] Error:', message);
    return res.status(500).json({ error: 'Radar scan failed', detail: message });
  }
}
