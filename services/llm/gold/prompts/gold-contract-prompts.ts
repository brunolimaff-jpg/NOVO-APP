/**
 * BRU-33 — Prompts do contrato Gold (browser-safe).
 *
 * Compartilhados entre o harness Shadow (benchmark V6) e o seam de produção
 * (V7 Preview Wiring). Contêm APENAS strings — nenhuma dependência Node —
 * para poderem ser importados no bundle do browser (Vite).
 */
import type { CompactInput, ComposeInput } from '../gold-pipeline';
import type { RawFindingPack } from '../gold-contracts';

/** Extrai o JSON de uma resposta que pode vir envolta em markdown (```json ... ```). */
export function parseJsonPayload(text: string): RawFindingPack {
  const trimmed = text.trim();
  // Remove fence markdown ```json ... ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  // Se ainda houver texto antes do primeiro {, corta até o primeiro { e após o último }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Compact: JSON não encontrado na resposta (chars=${text.length})`);
  }
  return JSON.parse(candidate.slice(start, end + 1)) as RawFindingPack;
}

/** Monta o prompt do compactor com o contrato exato de saída (spelunked do schema zod). */
export function buildCompactPrompt(input: CompactInput): string {
  return [
    'Você é o COMPACTOR do Scout 360. Extraia do dossiê bruto todos os achados comerciais como JSON estrito do RawFindingPack. Nunca invente. Preserve valores com unidade/escala. Registre em discardedClaims o que descartar. Saída: APENAS o objeto JSON, sem markdown, sem texto.',
    'REGRAS SEMÂNTICAS (obrigatórias): (a) nunca promova pista/inferência para Confirmado — preserve o status do dossiê; (b) quando o dossiê se contradizer (ex.: "internacionalização não confirmada no exterior" vs "presença na Colômbia"), registre as versões conflitantes em conflicts e NÃO escolha silenciosamente uma — o fato deve manter o status mais fraco (A validar/Pista) com a fonte; (c) "uma fonte menciona X" não equivale a "X está confirmado"; (d) ausência em CRM/lista/busca não vira ausência da empresa nem gap; (e) presença de módulo não prova processo operacional; (f) hipótese sem suporte permanece Pista/A validar ou pergunta em openQuestions.',
    '',
    'CONTRATO EXATO DE SAÍDA (use exatamente estas chaves e valores):',
    JSON.stringify(
      {
        module: 'gold-compactor',
        accountIdentity: {
          inputCnpj: 'string (CNPJ com pontuação)',
          legalName: 'string',
          establishmentType: '"Matriz" | "Filial"',
          rootCnpj: 'string (8 dígitos)',
          conflicts: 'string[] (sempre presente, pode ser vazio)',
        },
        facts: [
          {
            id: 'string único',
            entity: 'string (nome/CNPJ da empresa-alvo)',
            claim: 'string (a afirmação comercial)',
            status: 'UM DESTES EXATAMENTE: "Confirmado" | "Pista forte" | "Pista inicial" | "Fonte secundária" | "Informação do usuário" | "A validar"',
            source: 'string (fonte citada no dossiê)',
            sourceDate: 'string | null',
            kind: 'UM DESTES EXATAMENTE: "identity" | "relationship" | "operation" | "technology" | "metric" | "person" | "trigger" | "financial"',
            process: 'string | null',
          },
        ],
        relationships: [
          {
            id: 'string único',
            entity: 'string',
            relatedEntity: 'string (CNPJ da empresa relacionada)',
            relationType: 'UM DESTES EXATAMENTE: "same_root" | "direct_pj_relation" | "partner_other_cnpj"',
            status: 'UM DESTES EXATAMENTE: "Confirmado" | "Pista forte" | "Pista inicial" | "Fonte secundária" | "Informação do usuário" | "A validar"',
            source: 'string',
            sourceDate: 'string | null',
            evidence: 'string | null',
          },
        ],
        technologySignals: [
          {
            technology: 'string',
            observedFact: 'string (fato observado de USO ativo)',
            status: 'UM DESTES EXATAMENTE: "Confirmado" | "Pista forte" | "Pista inicial" | "Fonte secundária" | "Informação do usuário" | "A validar"',
            whatIsNotKnown: 'string',
            validationQuestion: 'string',
          },
        ],
        people: [
          {
            id: 'string único',
            personName: 'string',
            role: 'string',
            roleBasis: 'UM DESTES EXATAMENTE: "qsa" | "official" | "report"',
            status: 'UM DESTES EXATAMENTE: "Confirmado" | "Pista forte" | "Pista inicial" | "Fonte secundária" | "Informação do usuário" | "A validar"',
            source: 'string',
          },
        ],
        metrics: [
          {
            id: 'string único',
            entity: 'string',
            metric: 'string',
            value: 'string | null',
            status: 'UM DESTES EXATAMENTE: "Confirmado" | "Pista forte" | "Pista inicial" | "Fonte secundária" | "Informação do usuário" | "A validar"',
            source: 'string',
          },
        ],
        conflicts: ['string'],
        openQuestions: ['string'],
        discardedClaims: [{ claim: 'string', reason: 'string' }],
      },
      null,
      2,
    ),
    '',
    'REGRAS: TODOS os campos obrigatórios acima DEVEM existir em todo item (nunca omita). Arrays podem ser vazios. status SEMPRE um dos valores listados.',
    '',
    'CANONICAL:',
    JSON.stringify(input.canonical),
    'DOSSIER BRUTO:',
    input.dossier,
  ].join('\n\n');
}

/** Monta o prompt do composer Gold com as regras de contrato (9 seções, 3 ações). */
export function buildComposePrompt(input: ComposeInput): string {
  return [
    'Você é o COMPOSER GOLD do Scout 360. Escreva o Gold Brief executivo (pt-BR) a partir do conteúdo seguro.',
    'FORMATO (obrigatório): exatamente 9 seções com título em markdown heading numerado (### N. NOME):',
    '1. SÍNTESE EXECUTIVA | 2. PERFIL | 3. ESTRUTURA SOCIETÁRIA | 4. TECNOLOGIA | 5. PESSOAS-CHAVE | 6. INDICADORES | 7. SINAIS | 8. RISCOS | 9. PRÓXIMOS PASSOS.',
    'Linguagem executiva. 900-1500 palavras (NUNCA abaixo de 900 — o contrato rejeita abaixo; se ficar curto, aprofunde as seções 4-8). 0-3 Mermaid. Máx 3 sinais.',
    'FRENTES: a expressão "frente principal" pode aparecer UMA única vez (na seção 9). Nos Sinais, use "Sinal 1/2/3" — nunca a palavra "frente". Máx 2 adjacências, numeradas "Adjacência 1"/"Adjacência 2".',
    'VISUAIS: MAPA DO CAOS OPERACIONAL (obrigatório quando houver evidência segura suficiente) — produza um Mermaid executivo que mostre como as partes COMPROVADAS da operação se conectam: operação principal → ramificações reais da cadeia → sistemas/processos identificados → pontos de atenção sustentados (ex.: cultivo → beneficiamento → trading, com frota/armazenagem/sistemas como ramificações apenas quando comprovados). O diagrama deve ser compreensível em poucos segundos, mesmo sem ler o restante do Gold. Posição: peça visual principal da seção 2 PERFIL (ou 4 TECNOLOGIA quando o conteúdo for majoritariamente tecnológico). TEIA SOCIETÁRIA = 2º diagrama na seção 3 ESTRUTURA SOCIETÁRIA (junto da Matriz de CNPJs). Regras: NÓ verdadeiro NÃO autoriza SETA inventada — toda aresta precisa de suporte no conteúdo seguro; ponto de atenção somente quando sustentado; ausência de tecnologia NUNCA vira gap; incerteza aparece como "não confirmado"/"a validar", nunca como fato; se um diagrama não tiver suporte, omita-o em vez de inventar; os diagramas DEVEM usar somente fatos do CANONICAL e do SAFE PACK; dentro dos diagramas valem TODAS as regras de proveniência (termos sensíveis, "gap"/"lacuna" e ausência-virada-lacuna são proibidos também dentro dos mermaid).',
    'ARESTAS SÃO AFIRMAÇÕES: uma seta implica fluxo, sequência ou relação — logo, NÃO basta o nó existir: a aresta também precisa estar sustentada pelo conteúdo seguro. Se o conteúdo seguro comprovar "campo", "beneficiamento" e "trading" mas NÃO comprovar que formam essa sequência, NÃO invente a cadeia — represente os processos como elementos identificados, sem causalidade/ordem não comprovada. TEIA SOCIETÁRIA (whitelist estrita): nós apenas com CNPJs de (a) conta alvo do CANONICAL; (b) matriz do canonical se headOfficeCnpj != null; (c) directPjPartners; (d) safePack.relationships. Mantenha a semântica da relação: same_root = mesma raiz; direct_pj_relation = relação PJ direta/participação conforme evidência; partner_other_cnpj = relação lateral — JAMAIS chame lateral de "empresa do grupo", "controlada" ou "holding". Declare cada nó em linha própria com ID e crie as arestas usando os IDs (ex.: A["Empresa X<br/>CNPJ<br/>Filial"] em uma linha; A -->|mesma raiz| B em outra).',
    'MATRIZ DE CNPJs: na seção 3 (ESTRUTURA SOCIETÁRIA), inclua uma tabela "Matriz de CNPJs" com colunas empresa | CNPJ | papel, listando APENAS os CNPJs da whitelist: (1) conta alvo do CANONICAL; (2) matriz do canonical somente se headOfficeCnpj != null; (3) directPjPartners; (4) CNPJs em safePack.relationships. Deduplique CNPJs, não invente CNPJ/nome/papel; se houver CNPJ seguro sem nome seguro, escreva "Nome não identificado no conteúdo seguro" no lugar do nome; não chame relação lateral de grupo nem de holding.',
    'REGRAS DE PROVENIÊNCIA (crítico): NUNCA use os termos "capacidade", "produção de", "ROI", "retorno sobre", "prazo de N dias", "integração nativa", "middleware" a menos que exista um fato Confirmado idêntico no conteúdo seguro — parafraseie (ex.: "conexão entre sistemas" em vez de "integração nativa"). Isso vale TAMBÉM em negação/pergunta (ex.: "capacidade de armazenagem não confirmada" ainda dispara a régua — escreva "armazenagem: sem dados públicos") e em texto de diagramas Mermaid (nunca afirme "lacuna de integração" sem fato — use apenas fatos do conteúdo seguro). A palavra "capacidade" é PROIBIDA em qualquer forma e em qualquer posição — inclusive entre parênteses, como glossário ou sinônimo (ex.: "escala de armazenagem (capacidade estática)" ainda dispara a régua) — substitua por "volume de armazenagem", "estocagem", "porte da operação" ou "escala de armazenagem", sem explicar o termo original.',
    'GAPS: nunca use as palavras "gap"/"gaps"/"lacuna"/"lacunas" seguidas de "de/em" + tecnologia (wms, tms, erp, automação, sistema, processo, operação, logística, integração, infraestrutura, etc.) — escreva "WMS/TMS não constam do portfólio contratado" em vez de "lacuna de integração" ou "gap de WMS". Isso vale em QUALQUER posição: texto, títulos, mermaid E nas ações numeradas/perguntas da seção 9 (ex.: NUNCA escreva "mapear gaps de automação" — escreva "mapear oportunidades de automação e controle" ou "verificar o nível de automação atual"). Evite também "não possui/usa/tem/adota" + tecnologia; prefira "não identificado nas fontes públicas" ou "não consta do portfólio".',
    'CONFLICTS (do Frontier) é RESTRIÇÃO, não material para escolher uma versão: assunto listado em conflicts NUNCA pode ser afirmado como Confirmado, NUNCA sustenta sozinho a Frente Principal, NUNCA sustenta produto/oferta/ROI/prazo/integração — deve aparecer como indício, risco, ponto de atenção ou pergunta de validação, quando material.',
    'INCERTEZAS: quando o conteúdo seguro não confirmar um fato (ex.: internacionalização, área, headcount), apresente como estimativa/indício com ressalva explícita — nunca como confirmado.',
    'CANONICAL OBRIGATÓRIO: o tipo de estabelecimento do alvo é EXATAMENTE o do CANONICAL (ex.: "Filial") — nunca o altere nem o chame de Matriz; o CNPJ e o nome também vêm do CANONICAL.',
    '3 ações numeradas na seção 9.',
    'CANONICAL:',
    JSON.stringify(input.canonical),
    'SAFE PACK (Frontier):',
    JSON.stringify(input.safePack),
  ].join('\n\n');
}
