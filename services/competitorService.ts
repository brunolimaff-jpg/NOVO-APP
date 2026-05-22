// services/competitorService.ts
// Serviço de inteligência competitiva dinâmica — sempre busca em fontes vivas via Gemini.
// NÃO usa dados fixos de mercado. Tudo é pesquisado em tempo real.

import { scoutDiag } from '../utils/diagnosticLog';
import { CONCORRENTES, getConcorrente, getRevendasPorEstado, Concorrente } from './competitors';

/**
 * Sanitiza e limita o nome da empresa para uso seguro em prompts Gemini.
 * Evita prompt injection via nomes de empresa maliciosos.
 */
function safeCompanyName(name: string): string {
  return name.trim().slice(0, 200).replace(/"/g, "'");
}

function findFirstCompleteJsonChunk(raw: string): string | null {
  if (!raw) return null;

  const isOpening = (char: string) => char === '{' || char === '[';
  const isClosing = (char: string) => char === '}' || char === ']';
  const isMatchingPair = (open: string, close: string) =>
    (open === '{' && close === '}') || (open === '[' && close === ']');

  for (let start = 0; start < raw.length; start += 1) {
    const initial = raw[start];
    if (!isOpening(initial)) continue;

    const stack: string[] = [initial];
    let inString = false;
    let escaping = false;

    for (let i = start + 1; i < raw.length; i += 1) {
      const ch = raw[i];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (ch === '\\') {
          escaping = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (isOpening(ch)) {
        stack.push(ch);
        continue;
      }

      if (isClosing(ch)) {
        const lastOpen = stack[stack.length - 1];
        if (!lastOpen || !isMatchingPair(lastOpen, ch)) {
          break;
        }

        stack.pop();
        if (stack.length === 0) {
          return raw.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

function parseFirstJsonObject(raw: string): Record<string, unknown> | null {
  const jsonChunk = findFirstCompleteJsonChunk(raw);
  if (!jsonChunk) return null;

  try {
    const parsed: unknown = JSON.parse(jsonChunk);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      const firstItem = parsed[0];
      if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
        return firstItem as Record<string, unknown>;
      }
    }
    return null;
  } catch (err) {
    scoutDiag.warn('CompetitorService', 'Falha na detecção de concorrente', {
      error: err instanceof Error ? err.message : String(err),
      preview: jsonChunk?.slice(0, 100),
    });
    return null;
  }
}

// ===================================================================
// TIPOS
// ===================================================================

export interface CompetitorDetection {
  encontrado: boolean;
  competitorId?: string;
  nomeERP?: string;
  nivelAmeaca?: 'alto' | 'medio' | 'baixo';
  revendaLocal?: string;
  confianca?: 'alta' | 'media' | 'baixa';
  fontes?: string[];
  raw?: string;          // texto bruto retornado pelo Gemini
  detected?: boolean;
  names?: string[];
}

export interface CompetitorProfile {
  competitorId: string;
  nomeERP: string;
  // Dados dinâmicos buscados pelo Gemini
  playStoreRating?: number;
  playStoreReviews?: number;
  playStoreUltimaAtualizacao?: string;
  appStoreRating?: number;
  reclamacoesTop?: string[];
  novidadesRecentes?: string[];        // lançamentos dos últimos 90 dias
  revendaRegional?: string;
  estimativaPreco?: string;
  pontosFracos?: string[];
  pontosFortes?: string[];
  raw?: string;
}

export interface PricingIntel {
  competitorId: string;
  nomeERP: string;
  faixaPrecoUsuario?: string;          // ex: "R$ 800-1.500/usr/mês"
  modeloLicenca?: string;              // SaaS | Licença Perpétua | Híbrido
  custoImplantacaoEstimado?: string;
  prazoImplantacaoMedio?: string;
  fontes: string[];
  confianca: 'alta' | 'media' | 'baixa';
  raw?: string;
}

// ===================================================================
// PROMPTS INTERNOS (usados para chamar o Gemini Deep Research)
// ===================================================================

function buildDetectPrompt(nomeEmpresa: string, estado?: string): string {
  const safeName = safeCompanyName(nomeEmpresa);
  const revendasEstado = estado ? getRevendasPorEstado(estado) : [];
  const revendasCtx = revendasEstado.length > 0
    ? `\n\nREVENDAS ATIVAS EM ${estado}:\n` + revendasEstado.map(r =>
        `- ${r.concorrente}: ${r.revenda.nome} (${r.revenda.cidades_chave.join(', ')})`
      ).join('\n')
    : '';

  return `
Você é um analista de inteligência competitiva. Pesquise AGORA, usando busca na web, qual sistema ERP ou software de gestão a empresa <company_name>${safeName}</company_name> utiliza atualmente.

USE ESTAS ESTRATÉGIAS DE BUSCA (em ordem de prioridade):

1. LinkedIn da empresa → vagas abertas mencionando ERP, ferramenta ou sistema (ex: "analista SAP", "consultor TOTVS", "implantação Protheus")
2. Site oficial da empresa → press releases, notícias, seção "sobre", "tecnologia", "parceiros"
3. Google: "${safeName}" implementação ERP OR SAP OR TOTVS OR Sankhya OR Senior OR SIAGRI OR Protheus
4. Reclame Aqui: reclamações que mencionem o nome do sistema
5. YouTube: buscar vídeos de treinamento ou evento da empresa
6. Case studies de fornecedores: buscar "${safeName}" nos sites da SAP, TOTVS, Sankhya, Senior, SIAGRI
7. JusBrasil: processos trabalhistas que mencionem consultores ou implantação de sistema
${revendasCtx}

RESPONDA no formato abaixo (use EXATAMENTE este formato):
SISTEMA_DETECTADO: [nome do sistema ou DESCONHECIDO]
FABRICANTE: [nome do fabricante]
REVENDA_LOCAL: [nome da revenda + cidade, ou Direto, ou Não identificado]
NIVEL_AMEACA: [alto | medio | baixo | nao_aplicavel]
CONFIANCA: [alta | media | baixa]
FONTES: [liste as URLs ou descrições das fontes encontradas]
EVIDENCIA: [cite a evidência textual que levou à conclusão]

Se não encontrar evidências concretas, responda SISTEMA_DETECTADO: DESCONHECIDO e CONFIANCA: baixa.
`;
}

function buildProfilePrompt(concorrente: Concorrente): string {
  const { nome, fabricante, sites } = concorrente;

  return `
Você é um analista de inteligência de mercado. Pesquise AGORA as informações mais atualizadas sobre o sistema ERP "${nome}" da empresa "${fabricante}".

FONTES OBRIGATÓRIAS — verifique TODAS:

📱 PLAY STORE:
  → Buscar: "${sites.playStoreBusca || nome}"
  → Coletar: nota atual (1-5 estrelas), total de avaliações, data da última atualização, versão atual
  → Ler as 5 avaliações negativas mais recentes e resumir as reclamações principais

📱 APP STORE (iOS):
  → Buscar: "${sites.appStoreBusca || nome}"
  → Coletar: mesmos dados acima

🔴 RECLAME AQUI:
  → URL: ${sites.reclameAqui || `https://www.reclameaqui.com.br/empresa/${nome.toLowerCase().replace(/\s+/g, '-')}/`}
  → Coletar: nota geral, índice de resolução, top 3 reclamações recorrentes

📰 NOTÍCIAS (últimos 90 dias):
  → Google News: "${nome} ${fabricante} 2025 2026"
  → Coletar: lançamentos, aquisições, novos módulos, casos de sucesso, problemas divulgados

📚 DOCUMENTAÇÃO / CHANGELOG:
  → URL: ${sites.changelog || sites.documentacao || sites.oficial}
  → Coletar: últimas versões lançadas, novas funcionalidades, descontinuações

💼 LINKEDIN:
  → URL: ${concorrente.linkedin || `https://www.linkedin.com/company/${nome.toLowerCase().replace(/\s+/g, '-')}/`}
  → Coletar: vagas abertas (indicam onde estão investindo), posts recentes (indicam roadmap)

⭐ CAPTERRA / G2:
  → URL Capterra: ${sites.capterra || 'https://www.capterra.com.br'}
  → URL G2: ${sites.g2 || 'https://www.g2.com'}
  → Coletar: nota geral, top prós e contras mencionados por usuários

RESPONDA no formato JSON abaixo:
{
  "playStoreRating": 0.0,
  "playStoreReviews": 0,
  "playStoreUltimaAtualizacao": "dd/mm/aaaa",
  "appStoreRating": 0.0,
  "reclamacoesTop": ["reclamação 1", "reclamação 2", "reclamação 3"],
  "novidadesRecentes": ["novidade 1", "novidade 2"],
  "estimativaPreco": "faixa estimada",
  "pontosFracos": ["fraqueza 1", "fraqueza 2"],
  "pontosFortes": ["força 1", "força 2"],
  "fontes": ["url1", "url2"]
}
`;
}

function buildPricingPrompt(concorrente: Concorrente, porteEmpresa: 'pequeno' | 'medio' | 'grande' | 'enterprise'): string {
  const { nome, fabricante } = concorrente;

  return `
Você é um analista de precificação de software ERP. Pesquise AGORA estimativas de custo/preço do sistema "${nome}" da "${fabricante}" para uma empresa de porte "${porteEmpresa}" no agronegócio brasileiro.

USE ESTAS ESTRATÉGIAS DE BUSCA (pesquise todas):

1. 📊 CAPTERRA / G2 / GETAPP:
   → Buscar: "${nome} pricing cost per user 2024 2025 2026"
   → Avaliações frequentemente mencionam faixas de preço em comentários

2. 💼 LINKEDIN:
   → Buscar posts de consultores/implementadores: "${nome} implementação R$ OR investimento OR custo"
   → Perfis de consultores ${nome} frequentemente revelam tamanho médio de projetos

3. 🎥 YOUTUBE:
   → Buscar: "${nome} ROI OR payback OR custo OR investimento"
   → Webinars e demos frequentemente mencionam faixas de investimento

4. 💬 FÓRUNS E GRUPOS:
   → Buscar: "${nome} quanto custa OR valor OR orçamento site:reddit.com OR site:groups.google.com"
   → Grupos de WhatsApp/Telegram de ERP frequentemente têm comparativos

5. 📋 LICITAÇÕES E PREGÕES PÚBLICOS:
   → Comprasnet: buscar contratos com "${fabricante}" ou "${nome}"
   → Portal da Transparência estadual de MT, GO, MS
   → Dá referência de custo por módulo/usuário em contratos públicos

6. 📀 GLASSDOOR / VAGAS:
   → Salário médio de consultores ${nome} = proxy para custo de implementação
   → Buscar: "${nome} consultor salário OR remuneração"

7. 🔍 IMPRENSA ESPECIALIZADA:
   → TI Inside, ComputerWorld, INFO Exame: "${nome} preço OR investimento OR contrato"

RESPONDA no formato JSON abaixo:
{
  "faixaPrecoUsuario": "R$ X - Y/usuário/mês (estimativa)",
  "modeloLicenca": "SaaS | Licença Perpétua | Híbrido",
  "custoImplantacaoEstimado": "R$ X - Y (estimativa para porte ${porteEmpresa})",
  "prazoImplantacaoMedio": "X a Y meses",
  "confianca": "alta | media | baixa",
  "fontes": ["fonte1", "fonte2"],
  "observacoes": "contexto adicional relevante"
}

Se não encontrar dados confiáveis, retorne os campos como null e confianca como "baixa".
`;
}

// ===================================================================
// FUNÇÕES PRINCIPAIS
// ===================================================================

/**
 * detectCompetitorFromContext
 * Tenta descobrir qual ERP a empresa usa via busca dinâmica.
 */
export async function detectCompetitorFromContext(
  nomeEmpresa: string,
  estado?: string,
  callGeminiDeepSearch?: (prompt: string) => Promise<string>
): Promise<CompetitorDetection> {
  if (!callGeminiDeepSearch) {
    return { encontrado: false };
  }

  try {
    const prompt = buildDetectPrompt(nomeEmpresa, estado);
    const raw = await callGeminiDeepSearch(prompt);

    const lines = raw.split('\n');
    const get = (key: string) => {
      const line = lines.find(l => l.startsWith(key + ':'));
      return line ? line.replace(key + ':', '').trim() : '';
    };

    const sistema = get('SISTEMA_DETECTADO');
    const confianca = get('CONFIANCA') as 'alta' | 'media' | 'baixa';
    const revenda = get('REVENDA_LOCAL');
    const ameaca = get('NIVEL_AMEACA') as 'alto' | 'medio' | 'baixo';
    const fontes = get('FONTES').split(',').map(f => f.trim()).filter(Boolean);

    if (!sistema || sistema === 'DESCONHECIDO') {
      return { encontrado: false, raw };
    }

    const match = CONCORRENTES.find(c =>
      sistema.toLowerCase().includes(c.nome.toLowerCase()) ||
      c.nome.toLowerCase().includes(sistema.toLowerCase())
    );

    return {
      encontrado: true,
      competitorId: match?.id,
      nomeERP: sistema,
      nivelAmeaca: ameaca || 'medio',
      revendaLocal: revenda,
      confianca,
      fontes,
      raw,
    };
  } catch (err) {
    console.error('[COMPETITOR] Erro na detecção:', err);
    return { encontrado: false };
  }
}

/**
 * pullCompetitorProfile
 * Busca perfil completo e atualizado do concorrente em todas as fontes.
 */
export async function pullCompetitorProfile(
  competitorId: string,
  callGeminiDeepSearch?: (prompt: string) => Promise<string>
): Promise<CompetitorProfile | null> {
  const concorrente = getConcorrente(competitorId);
  if (!concorrente || !callGeminiDeepSearch) return null;

  try {
    const prompt = buildProfilePrompt(concorrente);
    const raw = await callGeminiDeepSearch(prompt);

    const data = parseFirstJsonObject(raw);
    if (data) {
      return { competitorId, nomeERP: concorrente.nome, ...data, raw };
    }

    return { competitorId, nomeERP: concorrente.nome, raw };
  } catch (err) {
    console.error('[COMPETITOR] Erro no profile:', err);
    return null;
  }
}

/**
 * generatePricingIntel
 * Minera estimativa de preço/custo do concorrente via deep research.
 */
export async function generatePricingIntel(
  competitorId: string,
  porteEmpresa: 'pequeno' | 'medio' | 'grande' | 'enterprise',
  callGeminiDeepSearch?: (prompt: string) => Promise<string>
): Promise<PricingIntel | null> {
  const concorrente = getConcorrente(competitorId);
  if (!concorrente || !callGeminiDeepSearch) return null;

  try {
    const prompt = buildPricingPrompt(concorrente, porteEmpresa);
    const raw = await callGeminiDeepSearch(prompt);

    const data = parseFirstJsonObject(raw);
    if (data) {
      return {
        competitorId,
        nomeERP: concorrente.nome,
        faixaPrecoUsuario: typeof data.faixaPrecoUsuario === 'string' ? data.faixaPrecoUsuario : undefined,
        modeloLicenca: typeof data.modeloLicenca === 'string' ? data.modeloLicenca : undefined,
        custoImplantacaoEstimado:
          typeof data.custoImplantacaoEstimado === 'string' ? data.custoImplantacaoEstimado : undefined,
        prazoImplantacaoMedio:
          typeof data.prazoImplantacaoMedio === 'string' ? data.prazoImplantacaoMedio : undefined,
        fontes: Array.isArray(data.fontes)
          ? data.fontes.filter((value): value is string => typeof value === 'string')
          : [],
        confianca:
          data.confianca === 'alta' || data.confianca === 'media' || data.confianca === 'baixa'
            ? data.confianca
            : 'baixa',
        raw,
      };
    }

    return { competitorId, nomeERP: concorrente.nome, fontes: [], confianca: 'baixa', raw };
  } catch (err) {
    console.error('[COMPETITOR] Erro no pricing:', err);
    return null;
  }
}

// ===================================================================
// FORMATADORES PARA INJEÇÃO NO PROMPT
// ===================================================================

export function formatarDeteccaoParaPrompt(detection: CompetitorDetection): string {
  if (!detection.encontrado) return '';

  return `

---
## 🥊 CONCORRENTE DETECTADO

**Sistema atual:** ${detection.nomeERP}
**Nível de ameaça:** ${detection.nivelAmeaca?.toUpperCase() || 'NÃO AVALIADO'}
**Revenda local:** ${detection.revendaLocal || 'Não identificada'}
**Confiança da detecção:** ${detection.confianca}
**Fontes:** ${detection.fontes?.join(', ') || 'Não especificadas'}

> Esta empresa provavelmente usa **${detection.nomeERP}** como ERP principal.
> Ao elaborar o dossiê, inclua argumentos de migração/substituição e use o
> marcador [[COMPETITOR:${detection.nomeERP}:${detection.nivelAmeaca || 'medio'}:${detection.revendaLocal || 'Direto'}:${detection.confianca || 'media'}]]
> na FASE 5 do dossiê.
---
`;
}

export function formatarProfileParaUI(profile: CompetitorProfile): string {
  if (!profile) return '';

  const linhas: string[] = [
    `**${profile.nomeERP}** — Perfil atualizado`,
  ];

  if (profile.playStoreRating) {
    linhas.push(`📱 Play Store: ★ ${profile.playStoreRating} (${profile.playStoreReviews || '?'} avaliações) — ${profile.playStoreUltimaAtualizacao || 'data não encontrada'}`);
  }
  if (profile.appStoreRating) {
    linhas.push(`🍎 App Store: ★ ${profile.appStoreRating}`);
  }
  if (profile.reclamacoesTop?.length) {
    linhas.push(`🔴 Top reclamações: ${profile.reclamacoesTop.slice(0, 3).join(' | ')}`);
  }
  if (profile.novidadesRecentes?.length) {
    linhas.push(`🆕 Novidades recentes: ${profile.novidadesRecentes.slice(0, 2).join(' | ')}`);
  }
  if (profile.estimativaPreco) {
    linhas.push(`💰 Preço estimado: ${profile.estimativaPreco}`);
  }

  return linhas.join('\n');
}

export function getContextoConcorrentesRegionais(uf: string): string {
  const revendas = getRevendasPorEstado(uf);
  if (!revendas.length) return '';

  const linhas = revendas.map(r =>
    `- ${r.concorrente}: ${r.revenda.nome} (${r.revenda.cidades_chave.join(', ')}) — ${r.revenda.especialidade.join(', ')}`
  );

  return `
## 🗺️ CONCORRENTES COM PRESENÇA EM ${uf}

${linhas.join('\n')}

> Considere estes atores ao analisar tech stack e abordagem comercial.
`;
}
