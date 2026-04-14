// services/warRoomService.ts
// Motor standalone para o War Room com retry, timeout e controle de contexto

import { normalizeAppError } from '../utils/errorHelpers';
import { withAutoRetry } from '../utils/retry';
import { buscarContextoDocsPinecone, buscarContextoPinecone } from './ragService';
import { proxyGerarDossie } from './geminiProxy';

// ─── TIPOS ───────────────────────────────────────────
export type WarRoomMode = 'tech' | 'killscript' | 'benchmark' | 'objections';

export interface WarRoomMessage {
    role: 'user' | 'model';
    text: string;
}

export interface WarRoomResult {
    text: string;
    sources: Array<{ title: string; url: string }>;
    outOfScope?: boolean; // true se a pergunta é fora do escopo do War Room
    isError?: boolean;
    retryable?: boolean;
    technicalDetails?: string;
}

export interface WarRoomQueryOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

// ─── CONFIG ───────────────────────────────────────
import { STABLE_RESEARCH_MODEL_ID } from '../config/models';
const MODEL_ID = STABLE_RESEARCH_MODEL_ID;
const DEFAULT_COMPETITOR_TARGET = 'concorrente principal';
const MODEL_TIMEOUT_MS = 90000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_CHARS = 4000;
const MAX_USER_QUESTION_CHARS = 1600;
const MAX_DOCS_CHARS = 6000;
const DOCS_CACHE_TTL_MS = 120000;
const DEFAULT_DOCS_NAMESPACE = 'senior-erp-docs';
const COMPETITOR_DOCS_NAMESPACE = 'competitor-pdfs';
const FERCUS_REFERENCE_BLOCK = [
    '### Integracao Gatec: Gestão de Custos Gerenciais (Fercus)',
    'Módulo focado em custos gerenciais dentro do contexto GAtec/ERP.',
    '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/manuais_processos/agronegocio/integracao-gatec/gatec-modulo-fercus.htm)',
].join('\n');
const TALHAO_REFERENCE_BLOCK = [
    '### Agrícola: Consulta Analítica de Talhão',
    'Referências para apuração de custo por talhão e configuração da visão analítica.',
    '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/estrutura-de-locais/consulta-analitica-de-talhao)',
    '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/estrutura-de-locais/configuracoes-da-consulta-analitica-de-talhao)',
].join('\n');
const GATEC_AGRICOLA_REFERENCE_BLOCK = [
    '### SimpleFarm: Manual do Usuário (Agrícola)',
    'Referência primária para processos agrícolas operacionais no ecossistema GAtec/SimpleFarm.',
    '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/)',
    '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/)',
].join('\n');
const ERP_BANKING_REFERENCE_BLOCK = [
    '### ERP Banking: Integração Bancária',
    'Referências oficiais para integração de pagamentos eletrônicos, conciliação e fluxo ERP Banking.',
    '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/processos-automaticos/166-integracao-erp-banking.htm)',
    '(Fonte: https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm)',
].join('\n');
const ERP_BANKING_CANONICAL_BLOCK = [
    '### Mapeamento canônico: ERP Banking vs TOTVS',
    '- ERP Banking da Senior: pagamento eletrônico abrangente (ACH, cartões e transferências), conciliação e ecossistema financeiro embarcado.',
    '- TOTVS (Protheus): excelente registro online de títulos e boletos via API, reduzindo dependência de CNAB em cenários específicos.',
    '- Leitura correta no comparativo: quando houver menção a Banking, contraste explícito entre API de boletos/títulos e governança de pagamentos/conciliação do ERP Banking.',
    '',
    '### Referência explícita: ERP Banking',
    '- Integração ERP x ERP Banking: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/processos-automaticos/166-integracao-erp-banking.htm',
    '- Módulo ERP Banking (Senior X Platform): https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm',
].join('\n');

type DocsCacheEntry = {
    value: string;
    expiresAt: number;
};

const _docsCache = new Map<string, DocsCacheEntry>();
const _docsInflight = new Map<string, Promise<string>>();
const _globalCache = new Map<string, DocsCacheEntry>();
const _globalInflight = new Map<string, Promise<string>>();

const PROCESSO_AGRICOLA_PATTERNS = [
    /gest[aã]o\s+agr[ií]cola/i,
    /processo\s+agr[ií]cola/i,
    /\b(ordem\s+de\s+servi[cç]o|o\.s\.)\b/i,
    /\b(safra|talh[aã]o|cultura|monitoramento|irrig[aã]c[aã]o)\b/i,
    /\bsimplefarm\b/i,
];

const INTEGRACAO_PATTERNS = [
    /integra[cç][aã]o/i,
    /integrado\s+ao?\s+erp/i,
    /arquitetura/i,
    /\bbackoffice\b/i,
];

const FERCUS_PATTERNS = [/\bfercus\b/i, /custos?\s+gerenciais/i];
const TALHAO_PATTERNS = [/\btalh[aã]o\b/i, /agr0193/i, /consulta\s+anal[ií]tica/i];
const GATEC_AGRICOLA_PATTERNS = [
    /gest[aã]o\s+agr[ií]cola.*gatec/i,
    /gatec.*gest[aã]o\s+agr[ií]cola/i,
    /processo.*agr[ií]cola.*gatec/i,
];
const BANKING_PATTERNS = [
    /\bbanking\b/i,
    /integra[cç][aã]o\s+banc[aá]ria/i,
    /\bcnab\b/i,
    /\bted\b/i,
    /\bach\b/i,
    /pagamento\s+eletr[oô]nico/i,
];

// ─── DETECTOR DE ESCOPO ──────────────────────────────────
const OUT_OF_SCOPE_PATTERNS = [
    /investigar?\s+(a\s+)?empresa/i,
    /dossi[eê]/i,
    /cnpj/i,
    /score\s+porta/i,
    /prospec[cç][aã]o/i,
    /varredura/i,
    /capivara/i,
    /quero\s+saber\s+tudo\s+sobre/i,
    /quadro\s+societ[aá]rio/i,
    /s[oó]cios?\s+d[aoe]/i,
    /receita\s+federal/i,
];

function isOutOfScope(message: string): boolean {
    return OUT_OF_SCOPE_PATTERNS.some(p => p.test(message));
}

function isProcessoAgricolaIntent(message: string): boolean {
    return PROCESSO_AGRICOLA_PATTERNS.some((p) => p.test(message));
}

function isIntegracaoIntent(message: string): boolean {
    return INTEGRACAO_PATTERNS.some((p) => p.test(message));
}

function hasFercusIntent(message: string): boolean {
    return FERCUS_PATTERNS.some((p) => p.test(message));
}

function hasTalhaoIntent(message: string): boolean {
    return TALHAO_PATTERNS.some((p) => p.test(message));
}

function hasGatecAgricolaIntent(message: string): boolean {
    return GATEC_AGRICOLA_PATTERNS.some((p) => p.test(message));
}

function hasBankingIntent(message: string): boolean {
    return BANKING_PATTERNS.some((p) => p.test(message));
}

function makeAbortError(): Error {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    return err;
}

function runWithTimeoutAndSignal<T>(
    task: () => Promise<T>,
    timeoutMs: number,
    signal?: AbortSignal
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
            reject(makeAbortError());
            return;
        }

        const timer = setTimeout(() => {
            reject(new Error(`Timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        const onAbort = () => {
            clearTimeout(timer);
            reject(makeAbortError());
        };

        signal?.addEventListener('abort', onAbort, { once: true });

        task()
            .then((value) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                reject(error);
            });
    });
}

function normalizeTarget(target: string, message: string): string {
    const cleanTarget = (target || '').trim();
    if (cleanTarget) return cleanTarget;

    const inferred =
        message.match(/(?:vs|contra)\s+([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ\s._/-]{1,60})/i)?.[1]
            ?.trim()
            .replace(/[.,;:!?]+$/, '') || '';

    return inferred || DEFAULT_COMPETITOR_TARGET;
}

function trimText(input: string, maxChars: number): string {
    if (!input) return '';
    const value = input.trim();
    if (value.length <= maxChars) return value;
    return value.slice(0, maxChars) + '...';
}

function buildHistorySnippet(history: WarRoomMessage[]): string {
    if (!history.length) return '';

    const recent = history.slice(-MAX_HISTORY_TURNS);
    let budget = MAX_HISTORY_CHARS;
    const chunks: string[] = [];

    for (let i = recent.length - 1; i >= 0; i -= 1) {
        const msg = recent[i];
        const prefix = msg.role === 'user' ? '**Usuário:** ' : '**Assistente:** ';
        const text = trimText(msg.text, 1200);
        const block = `${prefix}${text}\n\n`;
        if (block.length > budget) continue;
        chunks.unshift(block);
        budget -= block.length;
    }

    if (!chunks.length) return '';
    return `## CONVERSA ANTERIOR\n${chunks.join('')}---\n\n`;
}

// ─── FIX: extrai .context do RagResult (era tratado como string → "[object Object]")
async function getDocsContextCached(query: string, namespace: string = DEFAULT_DOCS_NAMESPACE): Promise<string> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return '';
    const key = `${namespace}::${normalizedQuery}`;

    const now = Date.now();
    const cached = _docsCache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    const inflight = _docsInflight.get(key);
    if (inflight) return inflight;

    const fetchPromise = (async () => {
        try {
            const result = await buscarContextoDocsPinecone(query, namespace);
            if (result.failed) {
                console.warn(`[WarRoom][Pinecone Docs] RAG falhou — namespace="${namespace}", query="${query.slice(0, 80)}"`);
            }
            const clean = trimText(result.context || '', MAX_DOCS_CHARS);
            _docsCache.set(key, { value: clean, expiresAt: Date.now() + DOCS_CACHE_TTL_MS });
            return clean;
        } catch (err) {
            _docsCache.delete(key);
            throw err; // propaga ao catch externo para docsUnavailable ser ativado
        } finally {
            _docsInflight.delete(key);
        }
    })();

    _docsInflight.set(key, fetchPromise);
    return fetchPromise;
}

// ─── FIX: extrai .context do RagResult (era tratado como string → "[object Object]")
async function getGlobalContextCached(query: string): Promise<string> {
    const key = query.trim().toLowerCase();
    if (!key) return '';

    const now = Date.now();
    const cached = _globalCache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    const inflight = _globalInflight.get(key);
    if (inflight) return inflight;

    const fetchPromise = (async () => {
        try {
            const result = await buscarContextoPinecone(query);
            if (result.failed) {
                console.warn(`[WarRoom][Pinecone Global] RAG falhou — query="${query.slice(0, 80)}"`);
            }
            const clean = trimText(result.context || '', MAX_DOCS_CHARS);
            _globalCache.set(key, { value: clean, expiresAt: Date.now() + DOCS_CACHE_TTL_MS });
            return clean;
        } catch (err) {
            _globalCache.delete(key);
            throw err; // propaga ao catch externo para docsUnavailable ser ativado
        } finally {
            _globalInflight.delete(key);
        }
    })();

    _globalInflight.set(key, fetchPromise);
    return fetchPromise;
}

function mergeDocContexts(contexts: string[]): string {
    const blocks = contexts
        .flatMap((ctx) => ctx.split(/\n\n---\n\n/g))
        .map((b) => b.trim())
        .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const block of blocks) {
        if (seen.has(block)) continue;
        seen.add(block);
        unique.push(block);
    }
    return trimText(unique.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

function filterDocsForProcessoAgricola(context: string): string {
    if (!context.trim()) return context;
    const blocks = context.split(/\n\n---\n\n/g);
    const kept = blocks.filter((b) => {
        const lower = b.toLowerCase();
        const isIntegracaoBlock =
            lower.includes('integracao gatec') ||
            lower.includes('integração gatec') ||
            lower.includes('processos-integracao-gatec') ||
            lower.includes('hcm-integracao-gatec');
        const isAgricolaBlock =
            lower.includes('simplefarm') ||
            lower.includes('agricola') ||
            lower.includes('agrícola') ||
            lower.includes('ordem de serviço') ||
            lower.includes('safra') ||
            lower.includes('cultura') ||
            lower.includes('talhão') ||
            lower.includes('irrigação') ||
            lower.includes('monitoramento');

        if (isAgricolaBlock) return true;
        return !isIntegracaoBlock;
    });
    return trimText(kept.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

function filterNoisyDocsContext(
    context: string,
    options: { processoAgricola: boolean; fercus: boolean },
): string {
    if (!context.trim()) return context;
    const blocks = context.split(/\n\n---\n\n/g);
    const kept = blocks.filter((block) => {
        const lower = block.toLowerCase();

        if (lower.includes('404 - página não encontrada') || lower.includes('404 - pagina nao encontrada')) {
            return false;
        }

        if (
            options.fercus &&
            (lower.includes('/gestao-de-pessoas-hcm/6.10.4/customizacoes/') ||
                lower.includes('categoria: customizações') ||
                lower.includes('categoria: customizacoes'))
        ) {
            return false;
        }

        if (
            options.processoAgricola &&
            !options.fercus &&
            (lower.includes('/seniorxplatform/manual-do-usuario/') ||
                lower.includes('categoria: customizações') ||
                lower.includes('categoria: customizacoes'))
        ) {
            return false;
        }

        return true;
    });
    return trimText(kept.join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

function prioritizeBlocksByKeywords(context: string, keywords: string[]): string {
    if (!context.trim() || keywords.length === 0) return context;
    const blocks = context.split(/\n\n---\n\n/g).filter(Boolean);
    const scored = blocks.map((block) => {
        const lower = block.toLowerCase();
        const score = keywords.reduce((acc, keyword) => (lower.includes(keyword.toLowerCase()) ? acc + 1 : acc), 0);
        return { block, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return trimText(scored.map((s) => s.block).join('\n\n---\n\n'), MAX_DOCS_CHARS);
}

function extractGroundingSources(response: any): Array<{ title: string; url: string }> {
    const groundingChunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const dedupe = new Set<string>();
    const sources: Array<{ title: string; url: string }> = [];

    for (const chunk of groundingChunks) {
        const uri = chunk?.web?.uri;
        if (!uri || dedupe.has(uri)) continue;

        try {
            const parsed = new URL(uri);
            const title = chunk?.web?.title || parsed.hostname;
            dedupe.add(uri);
            sources.push({ title, url: uri });
        } catch {
            // ignora URI inválida sem quebrar a resposta inteira
        }
    }

    return sources;
}

function enforceBankingAnchors(text: string): string {
    let out = text || '';
    if (!out) return out;
    out = out
        .replace(/senior compensa/gi, 'ERP Banking da Senior comprova')
        .replace(/senior\s*\(erp banking\)\s*comprova/gi, 'ERP Banking da Senior comprova')
        .replace(/senior\s*bank\s*\/\s*fintech/gi, 'ERP Banking da Senior')
        .replace(/\bsenior\s*bank\b/gi, 'ERP Banking da Senior')
        .replace(/senior\s*\(erp banking\)\s*:/gi, 'ERP Banking da Senior:');

    const hasBankingMention = /\berp banking\b/i.test(out);
    const hasBankingLinks =
        /integracao-erp-banking|#banking\/banking\.htm/i.test(out);
    const hasCanonicalMapping =
        /erp banking da senior|pagamento eletr[oô]nico abrangente|registro online de t[ií]tulos e boletos via api/i.test(out);
    const hasCanonicalSection = /###\s*mapeamento can[oô]nico:\s*erp banking vs totvs/i.test(out);

    if (!hasCanonicalSection || !hasBankingMention || !hasBankingLinks || !hasCanonicalMapping) {
        out += `\n\n${ERP_BANKING_CANONICAL_BLOCK}`;
    }
    return out.trim();
}

// ─── PROMPTS POR MODO ───────────────────────────────────
const SYSTEM_PROMPTS: Record<WarRoomMode, (target: string) => string> = {
    tech: (_target) => `Você é o Especialista Técnico Sênior da Senior Sistemas.

MISSÃO ÚNICA: Responder dúvidas técnicas sobre ERP Senior, módulos, processos, integrações e arquitetura.

REGRAS ABSOLUTAS:
1. RESPONDA DIRETAMENTE à pergunta técnica do usuário.
2. Use a documentação RAG fornecida abaixo para embasar — inclua hiperlinks Markdown: [Texto](URL).
2.1. OBRIGATÓRIO: cite de 2 a 4 links de documentação no corpo da resposta quando houver contexto documental.
3. NUNCA peça CNPJ, nome de empresa ou alvo de prospecção.
4. NUNCA inicie investigação corporativa, dossiê ou Score PORTA.
5. NUNCA diga que a mensagem está vazia ou que não foi informado um tópico.
6. Se não encontrar na documentação, use seu conhecimento e sinalize: "[Informação complementar]".
7. Escreva em português brasileiro, tom técnico e consultivo.
8. Use markdown com headers, listas e tabelas para organizar o conteúdo.`,

    killscript: (target) => `Você é Estrategista Comercial da Senior Sistemas.

MISSÃO: Gerar scripts de venda táticos DEFENDENDO A SENIOR contra ${target}.

ATENÇÃO: VOCÊ TRABALHA PARA A SENIOR! Sempre defenda a Senior e ataque ${target}.

ESTRUTURA OBRIGATÓRIA:
### ⚔️ O Cenário
(Contexto da objeção/situação do vendedor)
### 🛡️ A Visão da ${target}
(O que ${target} diz/faz — pontos fortes e fracos)
### 🚀 O Contra-Ataque Senior
(Argumentos técnicos e comerciais — features, diferenciais, ROI da SENIOR)
### 🔪 Script de Vendas
(Frases prontas para usar na reunião defendendo a SENIOR)

REGRAS: Tom agressivo mas profissional. Dados concretos. Português BR. SEMPRE DEFENDA A SENIOR!`,

    benchmark: (target) => `Você é Analista Comparativo de ERPs trabalhando para a Senior Sistemas.

MISSÃO: Comparativo técnico detalhado mostrando VANTAGENS DA SENIOR sobre ${target}.

FORMATO OBRIGATÓRIO:
### 📊 Comparativo: Senior vs ${target}
| Critério | Senior | ${target} | Vantagem |
|----------|--------|-----------|----------|
(8-12 critérios: módulos, cloud, tecnologia, UX, preço, suporte, etc.)

### 💡 Resumo Executivo
(3-4 frases de conclusão destacando por que Senior é superior)

REGRAS: Dados reais. Honesto quando ${target} tiver vantagem, MAS sempre mostre o contraponto técnico da Senior com linguagem objetiva. Português BR.`,

    objections: (target) => `Você é Consultor de Vendas da Senior Sistemas especialista em rebater objeções.

MISSÃO: Rebater objeções DO CLIENTE que favorecem ${target}, DEFENDENDO A SENIOR.

ATENÇÃO: O cliente está comparando Senior vs ${target}. Sua missão é DEFENDER A SENIOR e mostrar por que ela é superior!

ESTRUTURA OBRIGATÓRIA:
### 🛡️ A Objeção
(Resuma o que o cliente disse a favor de ${target})
### ⚡ Por que é MITO ou meia-verdade
(Desmonte o argumento com dados e lógica, mostrando vantagens da SENIOR)
### 💬 O que responder na hora
(2-3 frases prontas DEFENDENDO A SENIOR)
### 🎯 Pergunta de Contra-Ataque
(Pergunta inteligente para virar o jogo a favor da SENIOR)

REGRAS: Confiante mas não arrogante. Reconheça objeções válidas MAS sempre mostre como Senior é melhor. Português BR. SEMPRE DEFENDA A SENIOR!`,
};

// ─── FUNÇÃO PRINCIPAL ───────────────────────────────────
export async function queryWarRoom(
    mode: WarRoomMode,
    message: string,
    history: WarRoomMessage[],
    target: string,
    onStatus?: (status: string) => void,
    options: WarRoomQueryOptions = {}
): Promise<WarRoomResult> {
    const { signal, timeoutMs = MODEL_TIMEOUT_MS } = options;

    if (signal?.aborted) {
        return {
            text: '⚠️ **Erro**\n\nSolicitação cancelada pelo usuário.',
            sources: [],
            isError: true,
            retryable: false,
            technicalDetails: 'ABORTED: solicitação cancelada antes da execução.',
        };
    }

    // 1. Detecta escopo
    if (mode === 'tech' && isOutOfScope(message)) {
        return {
            text: `⚠️ **Essa pesquisa é melhor no Chat Principal!**\n\nO War Room é focado em **dúvidas técnicas** sobre o ERP Senior (módulos, processos, integrações).\n\nPara investigar empresas, gerar dossiês ou consultar CNPJs, use o **Chat Principal** do 🦅 Senior Scout 360. Feche o War Room clicando no ✕ e faça sua pesquisa direto no chat.\n\n---\n\n💡 **Exemplos do que o War Room responde:**\n- "Como funciona o módulo de compras no ERP Senior?"\n- "Qual a diferença entre Sapiens e Gestão Empresarial?"\n- "Como configurar integração com NFe?"`,
            sources: [],
            outOfScope: true,
        };
    }

    const resolvedTarget = mode === 'tech' ? '' : normalizeTarget(target, message);
    const systemPrompt = SYSTEM_PROMPTS[mode](resolvedTarget);
    const wantsProcessoAgricola = mode === 'tech' && isProcessoAgricolaIntent(message);
    const wantsIntegracao = mode === 'tech' && isIntegracaoIntent(message);
    const wantsFercus = mode === 'tech' && hasFercusIntent(message);
    const wantsTalhao = mode === 'tech' && hasTalhaoIntent(message);
    const wantsGatecAgricola = mode === 'tech' && hasGatecAgricolaIntent(message);
    const wantsBanking = mode === 'benchmark' && hasBankingIntent(message);

    // 2. Busca RAG docs para o modo unificado (tech + benchmark)
    let docsContext = '';
    let docsUnavailable = false;
    if (mode === 'tech' || mode === 'benchmark') {
        onStatus?.('📚 Consultando Pinecone (docs + base interna)...');
        try {
            const queries: string[] = [message];
            if (wantsProcessoAgricola && !wantsIntegracao) {
                queries.unshift(
                    `${message} simplefarm manual do usuário agrícola ordem de serviço safra culturas monitoramento irrigação`,
                );
            }
            if (wantsFercus) {
                queries.unshift(`${message} fercus gestão de custos gerenciais gatec módulo fercus`);
            }
            if (wantsTalhao) {
                queries.unshift(
                    `${message} agr0193 consulta analítica de talhão agr0192 configuração da consulta analítica de talhão`,
                );
            }
            if (wantsGatecAgricola && !wantsIntegracao) {
                queries.unshift(
                    `${message} simplefarm manual do usuário agrícola ordem de serviço culturas safra monitoramento irrigação`,
                );
            }
            if (wantsBanking) {
                queries.unshift(
                    `${message} ERP Banking integração bancária pagamentos eletrônicos CNAB TED ACH contas a pagar`,
                );
            }
            const docsNamespaces =
                mode === 'benchmark'
                    ? [DEFAULT_DOCS_NAMESPACE, COMPETITOR_DOCS_NAMESPACE]
                    : [DEFAULT_DOCS_NAMESPACE];
            const [docsContexts, globalContexts] = await Promise.all([
                Promise.all(
                    queries.flatMap((q) => docsNamespaces.map((ns) => getDocsContextCached(q, ns))),
                ),
                Promise.all(queries.map((q) => getGlobalContextCached(q))),
            ]);
            docsContext = mergeDocContexts([...docsContexts, ...globalContexts]);
            if (wantsProcessoAgricola && !wantsIntegracao) {
                docsContext = filterDocsForProcessoAgricola(docsContext);
            }
            docsContext = filterNoisyDocsContext(docsContext, {
                processoAgricola: wantsProcessoAgricola,
                fercus: wantsFercus,
            });
            if (wantsFercus && !/gatec-modulo-fercus/i.test(docsContext)) {
                docsContext = mergeDocContexts([FERCUS_REFERENCE_BLOCK, docsContext]);
            }
            if (wantsTalhao && !/consulta-analitica-de-talhao/i.test(docsContext)) {
                docsContext = mergeDocContexts([TALHAO_REFERENCE_BLOCK, docsContext]);
            }
            if (wantsGatecAgricola && !/simplefarm\/manual-do-usuario\/agricola/i.test(docsContext)) {
                docsContext = mergeDocContexts([GATEC_AGRICOLA_REFERENCE_BLOCK, docsContext]);
            }
            if (wantsBanking) {
                docsContext = mergeDocContexts([ERP_BANKING_REFERENCE_BLOCK, docsContext]);
            }
            if (wantsFercus) {
                docsContext = prioritizeBlocksByKeywords(docsContext, ['gatec-modulo-fercus', 'custos gerenciais']);
            }
            if (wantsGatecAgricola && !wantsIntegracao) {
                docsContext = prioritizeBlocksByKeywords(docsContext, [
                    '/simplefarm/manual-do-usuario/agricola/',
                    'ordem de serviço',
                    'safra',
                    'culturas',
                    'consulta analítica de talhão',
                ]);
            }
            if (wantsBanking) {
                docsContext = prioritizeBlocksByKeywords(docsContext, [
                    'integracao-erp-banking',
                    '#banking/banking.htm',
                    'integração bancária',
                    'cnab',
                    'pagamento eletrônico',
                ]);
            }
            if (!docsContext) {
                docsUnavailable = true;
                onStatus?.('⚠️ Pinecone indisponível — usando conhecimento complementar.');
            }
        } catch (ragError: unknown) {
            docsUnavailable = true;
            const ragDetails = ragError instanceof Error ? ragError.message : String(ragError);
            console.error('[WarRoom][Pinecone] Falha crítica no bloco RAG:', ragDetails);
            onStatus?.('⚠️ Falha ao consultar Pinecone — continuando sem RAG.');
        }
    }

    // 3. Monta o payload completo como um único prompt (stateless, sem chat session)
    let fullPrompt = '';

    fullPrompt += buildHistorySnippet(history);

    if ((mode === 'tech' || mode === 'benchmark') && docsContext) {
        onStatus?.('🔍 Analisando documentação...');
        fullPrompt += `## DOCUMENTAÇÃO OFICIAL (USE PARA EMBASAR)\n\n${docsContext}\n\n---\n\n`;
    }

    fullPrompt += `## PERGUNTA DO USUÁRIO\n"${trimText(message, MAX_USER_QUESTION_CHARS)}"\n\nResponda agora.`;
    if (wantsProcessoAgricola && !wantsIntegracao) {
        fullPrompt +=
            '\n\n## FOCO DE RESPOSTA\nExplique fluxo operacional agrícola (planejamento, ordens de serviço, execução em campo, apontamentos, monitoramento, safra e fechamento). Evite desviar para arquitetura de integração com ERP, exceto se o usuário pedir explicitamente.';
    }
    if (wantsFercus) {
        fullPrompt +=
            '\n\n## FOCO DE RESPOSTA (FERCUS)\nTrate "Fercus" como termo técnico válido (módulo de custos gerenciais). Não assuma erro de digitação, não autocorrija para outro termo e explique objetivamente quando usar Fercus versus custo por talhão.';
    }
    if (wantsBanking) {
        fullPrompt +=
            '\n\n## FOCO DE RESPOSTA (ERP BANKING)\nQuando houver contexto de integração bancária, priorize explicitamente o fluxo de ERP Banking (pagamentos eletrônicos, CNAB e conciliação). Evite responder de forma genérica sem citar ERP Banking.\nRegra obrigatória: inclua pelo menos 1 referência explícita a ERP Banking com um destes links: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/processos-automaticos/166-integracao-erp-banking.htm ou https://documentacao.senior.com.br/seniorxplatform/manual-do-usuario/erp/?utm_source=portal-documentacao&utm_medium=referral&utm_campaign=link-home-portal#Banking/banking.htm.\nNão use a expressão "Senior compensa" sem ancorar a argumentação em ERP Banking.';
    }

    // 4. Chama o Gemini via generateContent (stateless, confiável)
    onStatus?.(mode === 'tech' ? '🧠 Gerando resposta técnica...' : `⚔️ Forjando argumentos contra ${resolvedTarget}...`);

    try {
        const useGrounding = mode !== 'tech'; // Google Search só para modos competitivos
        const response = await withAutoRetry(
            'war-room-generate',
            () =>
                runWithTimeoutAndSignal(
                    () =>
                        proxyGerarDossie(
                            {
                                model: MODEL_ID,
                                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                                config: {
                                    systemInstruction: systemPrompt,
                                    temperature: mode === 'tech' ? 0.15 : 0.3,
                                    maxOutputTokens: 8192,
                                    tools: useGrounding ? [{ googleSearch: {} }] : undefined,
                                }
                            },
                            signal
                        ),
                    timeoutMs,
                    signal
                ),
            { maxRetries: 2, baseDelayMs: 700, maxDelayMs: 3000 }
        );

        let text = response.text || '';

        // 5. Coleta grounding sources
        const sources = extractGroundingSources(response);

        if (!text.trim()) {
            throw new Error('Resposta vazia do modelo');
        }
        if (wantsBanking) {
            text = enforceBankingAnchors(text);
        }

        const disclaimer = docsUnavailable && (mode === 'tech' || mode === 'benchmark')
            ? '\n\n_[Aviso: o contexto do Pinecone não respondeu nesta tentativa; resposta baseada em conhecimento complementar.]_'
            : '';

        return { text: (text.trim() + disclaimer).trim(), sources };
    } catch (error: any) {
        console.error('[WarRoom] Erro:', error);
        const appError = normalizeAppError(error, 'GEMINI', 'Falha ao consultar War Room.');
        const errorMsg = appError.friendlyMessage || `Erro de comunicação: ${appError.message || 'Falha na conexão'}. Tente novamente.`;

        return {
            text: `⚠️ **Erro**\n\n${errorMsg}`,
            sources: [],
            isError: true,
            retryable: appError.retryable,
            technicalDetails: `source=${appError.source}; code=${appError.code}; status=${appError.httpStatus ?? 'n/a'}; message=${appError.message}`,
        };
    }
}
