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
  // EXPERIENCE-01B/01C: nomes QSA não são necessários para composição e não
  // devem atravessar para o Composer. Mantemos pessoas com papel funcional
  // oficial ou reportado; o QSA segue apenas como contagem agregada.
  // EXPERIENCE-01C (fix Planejador): a contagem QSA vem do CANONICAL
  // (input.canonical.qsaPeople) — fonte da verdade cadastral — e NUNCA do
  // safePack.people (que pode conter apenas 1 das 5 pessoas do QSA real,
  // como a fixture Scheffer demonstra). Os nomes continuam não serializados.
  const qsaPeople = input.safePack.people ?? [];
  const qsaCount = (input.canonical.qsaPeople ?? []).length;
  const composeSafePack = {
    ...input.safePack,
    people: qsaPeople.filter(person => person.roleBasis !== 'qsa'),
  };
  // EXPERIENCE-01C: o CANONICAL também não pode vazar nomes QSA — o 01B filtrou
  // safePack.people mas `JSON.stringify(input.canonical)` ainda serializava
  // canonical.qsaPeople com nomes (leak real observado na rodada Scheffer).
  // A serialização do canonical para o Composer preserva a identidade cadastral
  // (CNPJ, tipo, matriz, sócias PJ) e substitui qsaPeople por qsaCount.
  const { qsaPeople: _qsaPeopleNames, ...composeCanonicalBase } = input.canonical;
  const composeCanonical = {
    ...composeCanonicalBase,
    qsaCount,
  };

  return [
    'Você é o COMPOSER GOLD do Scout 360. Escreva o Gold Brief executivo (pt-BR) a partir do conteúdo seguro.',
    'FORMATO (obrigatório): exatamente 9 seções com título em markdown heading numerado (### N. NOME):',
    '1. SÍNTESE EXECUTIVA | 2. PERFIL | 3. ESTRUTURA SOCIETÁRIA | 4. TECNOLOGIA | 5. PESSOAS-CHAVE | 6. INDICADORES | 7. SINAIS | 8. RISCOS | 9. PRÓXIMOS PASSOS.',
    'Linguagem executiva. 1.000-1.500 palavras de narrativa (NUNCA abaixo de 1.000 — o contrato exige 900 no texto final e markdown/citações reduzem a contagem medida; se ficar curto, aprofunde as seções 4-8). Máx 3 sinais.',
    'VISUAL (decisão do Bruno 2026-08-09 — o Gold deve ser visual, não um bloco de texto): (a) cada seção fecha com UM emoji temático no heading, SEMPRE DEPOIS do nome (### 1. SÍNTESE EXECUTIVA 🎯, ### 2. PERFIL 🏭, ### 3. ESTRUTURA SOCIETÁRIA 🏛️, ### 4. TECNOLOGIA 💻, ### 5. PESSOAS-CHAVE 👥, ### 6. INDICADORES 📊, ### 7. SINAIS 🚨, ### 8. RISCOS ⚠️, ### 9. PRÓXIMOS PASSOS 🧭) — o contrato valida "### N. NOME" e o emoji DEPOIS não quebra o match; (b) parágrafos curtos (máx 2-3 linhas) em vez de blocões; (c) use bullets, negrito nos números-chave e sub-headings para quebrar o texto; (d) emojis pontuais no corpo para destacar fatos (✅ confirmado, 📌 ponto de atenção, 🔎 a validar, 🌾 campo, 🚛 logística, 💼 financeiro) — SEM exagero e SEM usar emoji para mascarar afirmação não sustentada (a régua de proveniência vale também para o texto com emoji: "🚛 capacidade de armazenagem" ainda dispara).',
    'FRENTES: a expressão "frente principal" pode aparecer UMA única vez NO MUNDO INTEIRO do Gold — somente na seção 9 (PRÓXIMOS PASSOS). Em nenhuma outra seção (síntese, sinais, riscos, perfil, tecnologia) escreva "frente principal", "frente de atuação" nem "principal frente" — nem como referência ("sinal claro para a frente principal" na síntese DISPARA a régua de 2 frentes). Nos Sinais, use "Sinal 1/2/3" — nunca a palavra "frente". Máx 2 adjacências, numeradas "Adjacência 1"/"Adjacência 2".',
    'VISUAL-FIRST (EXPERIENCE-01D — decisão do Bruno/Planejador 2026-08-10): o Gold é uma superfície visual de investigação, com texto subordinado às evidências. Em TODA seção, a ordem é: visual → evidência → interpretação → ação. Regra de apresentação: entre superfícies visuais, use NO MÁXIMO 1 parágrafo curto (2-3 frases) ou até 2 bullets — nunca 5-8 parágrafos seguidos quando uma tabela resolve melhor. Superfícies por tipo de conteúdo: (a) fluxo/processo/relação → Mermaid (já determinístico, você só fornece o conteúdo); (b) inventário/status/comparação → TABELA markdown; (c) fatos rápidos → bullets/cards; (d) inferência → parágrafo curto; (e) algo não provado → pergunta de discovery; (f) ação comercial → próximo movimento numerado. VOCABULÁRIO SEMÂNTICO (emoji comunica o tipo, nunca a confiança sozinha — o texto/status continua explícito): ✅ Confirmado · 🟠 A validar · 🔴 Risco · 💡 Hipótese · 🔍 Discovery · 🎯 Ação · 🏢 Empresa · 🔗 Relação · 📊 Evidência. Aplique por seção: 2 PERFIL (Mapa + elos + leitura curta), 3 ESTRUTURA SOCIETÁRIA (Teia + Tabela de CNPJs + QSA agregado), 4 TECNOLOGIA (tabela: item | ✅/🟠 | evidência | validar), 5 PESSOAS-CHAVE (tabela só de papéis funcionais sustentados + QSA agregado), 6 INDICADORES (tabela: métrica | ✅/🟠 | valor | fonte), 7 SINAIS (máx 3, cada um em 1 bullet com evidência → hipótese → o que validar), 8 RISCOS (tabela: evidência | risco/hipótese | validar), 9 PRÓXIMOS PASSOS (Caminho da Venda + 3 movimentos numerados). Não use emoji para mascarar afirmação não sustentada.',
    'VISUAIS (EXPERIENCE-01C — decisão do Bruno 2026-08-10): NÃO escreva código Mermaid. Os 3 diagramas (Mapa do Caos na seção 2, Teia Societária na seção 3, Caminho da Venda na seção 9) são montados DEPOIS por um builder determinístico com a gramática visual padrão do Scout (graph LR + paleta core/satellite/danger/warning/neutral). Você fornece apenas o CONTEÚDO SEGURO que sustenta cada mapa: na seção 2, escreva SOMENTE uma leitura comercial curta (2-3 frases) sobre a operação — NÃO liste processos, elos ou fatos que o Mapa do Caos determinístico já representa; NÃO escreva "Mapa do Caos", "Elos da Cadeia" ou "Leitura Executiva" como rótulos — o builder injeta essas superfícies; na seção 3, inclua a Tabela de CNPJs (whitelist do canonical) e descreva a relação societária em LINGUAGEM HUMANA: "mesma raiz" (mesmo grupo raiz), "relação PJ direta" (sócia PJ direta na conta) ou "relação lateral" (demais CNPJs relacionados — JAMAIS chame lateral de "empresa do grupo", "controlada" ou "holding"); na seção 9, descreva o fluxo comercial conceitual: evidência segura → hipótese → discovery → decisão. Não insira nenhum bloco ```mermaid``` no texto: qualquer bloco Mermaid escrito por você será SUBSTITUÍDO pelo builder. PROIBIDO na narrativa: NÃO escreva nenhum identificador técnico interno, rótulo entre parênteses com meta-instrução (ex.: "(Conteúdo para o Builder)", "(Operações Confirmadas)") nem identificador técnico de relação em snake_case — use única e exclusivamente a linguagem humana de relação/processo; qualquer metarótulo técnico na saída reprova o Gold.',
    `SEGMENTO OPERACIONAL: ${input.segment ?? 'industrial_geral'}. Use este segmento apenas para adaptar o vocabulário e a ordem dos elos; não invente fatos, status, dor, gap, oportunidade ou produto. A tabela dinâmica será montada deterministicamente depois a partir do SAFE PACK.`,
    'TABELA DE CNPJs: na seção 3 (ESTRUTURA SOCIETÁRIA), inclua uma tabela "Tabela de CNPJs" com colunas empresa | CNPJ | papel, listando APENAS os CNPJs da whitelist: (1) conta alvo do CANONICAL; (2) matriz do canonical somente se headOfficeCnpj != null; (3) directPjPartners; (4) CNPJs em safePack.relationships. Deduplique CNPJs, não invente CNPJ/nome/papel; se houver CNPJ seguro sem nome seguro, escreva "Nome não identificado no conteúdo seguro" no lugar do nome; não chame relação lateral de grupo nem de holding. A palavra "matriz" só pode aparecer nesta instrução referindo-se à matriz do canonical (headOffice); nunca como nome da tabela.',
    `QSA (decisão do Bruno 2026-08-10 — Opção A): NUNCA liste pessoas do QSA individualmente, por extenso, em bullets, biografias ou Mermaid de atores. O QSA é cadastral, não um mapa de decisores. Na seção 3 (junto da Teia/Tabela de CNPJs) e na seção 5 PESSOAS-CHAVE, mostre APENAS o indicador agregado "👥 ${qsaCount} pessoas no QSA — papéis cadastrais, não decisores". Nomes só podem aparecer se houver papel funcional NÃO-QSA confirmado e material no conteúdo seguro — nunca liste QSA por padrão.`,
    'CAMINHO DA VENDA (3º Mermaid, obrigatório na seção 9 PRÓXIMOS PASSOS): represente o fluxo comercial conceitual: "Evidência segura → Hipótese comercial → Discovery → Problema confirmado?" — se SIM: "Definir owner/sponsor → Dimensionar impacto → Movimento comercial"; se NÃO: "Nutrir / buscar evidência / encerrar hipótese". O produto específico só pode entrar no fluxo depois que o problema e a aderência estiverem validados. Não saltar de ausência de módulo/tecnologia para dor, gap, processo manual ou oportunidade de venda automaticamente — ausência é ausência; o caminho da venda parte de evidência e hipótese, não de lacuna de portfólio.',
    'REGRAS DE PROVENIÊNCIA (crítico): NUNCA use os termos "capacidade", "produção de", "ROI", "retorno sobre", "prazo de N dias", "integração nativa", "middleware" a menos que exista um fato Confirmado idêntico no conteúdo seguro — parafraseie (ex.: "conexão entre sistemas" em vez de "integração nativa"). Isso vale TAMBÉM em negação/pergunta (ex.: "capacidade de armazenagem não confirmada" ainda dispara a régua — escreva "armazenagem: sem dados públicos") e em texto de diagramas Mermaid (nunca afirme "lacuna de integração" sem fato — use apenas fatos do conteúdo seguro). A palavra "capacidade" é PROIBIDA em qualquer forma e em qualquer posição — inclusive entre parênteses, como glossário ou sinônimo (ex.: "escala de armazenagem (capacidade estática)" ainda dispara a régua) — substitua por "volume de armazenagem", "estocagem", "porte da operação" ou "escala de armazenagem", sem explicar o termo original.',
    'GAPS: nunca use as palavras "gap"/"gaps"/"lacuna"/"lacunas" seguidas de "de/em" + tecnologia (wms, tms, erp, automação, sistema, processo, operação, logística, integração, infraestrutura, etc.) — escreva "WMS/TMS não constam do portfólio contratado" em vez de "lacuna de integração" ou "gap de WMS". Isso vale em QUALQUER posição: texto, títulos, mermaid E nas ações numeradas/perguntas da seção 9 (ex.: NUNCA escreva "mapear gaps de automação" — escreva "mapear oportunidades de automação e controle" ou "verificar o nível de automação atual"). Evite também "não possui/usa/tem/adota" + tecnologia; prefira "não identificado nas fontes públicas" ou "não consta do portfólio".',
    'CONFLICTS (do Frontier) é RESTRIÇÃO, não material para escolher uma versão: assunto listado em conflicts NUNCA pode ser afirmado como Confirmado, NUNCA sustenta sozinho a Frente Principal, NUNCA sustenta produto/oferta/ROI/prazo/integração — deve aparecer como indício, risco, ponto de atenção ou pergunta de validação, quando material.',
    'INCERTEZAS: quando o conteúdo seguro não confirmar um fato (ex.: internacionalização, área, headcount), apresente como estimativa/indício com ressalva explícita — nunca como confirmado.',
    'INTERNACIONALIZAÇÃO (BRU-48): fonte institucional/site ≠ fato Confirmado. NUNCA escreva "Operação confirmada", "internacionalização CONFIRMADA", "✅ Operação confirmada" nem use a palavra "confirmada/confirmado" para Colômbia/Cumaribo/internacional/holding/controle quando o conteúdo seguro não tiver o fato com status Confirmado — escreva "Operação em Cumaribo, Colômbia (fonte institucional)" ou "🟠 A validar". Isso vale em texto, tabelas E em qualquer diagrama.',
    'IDENTIDADE CANÔNICA — NÃO ALTERAR (identity lock): o CNPJ alvo é ' + composeCanonical.inputCnpj + ' e o tipo cadastral é "' + composeCanonical.establishmentType + '". Para este CNPJ, use SOMENTE este tipo cadastral. As palavras "Matriz", "Matriz Operacional" e "Unidade Matriz" são PROIBIDAS para este CNPJ quando o tipo canônico for "Filial". "Tabela de CNPJs" é o nome de uma tabela do dossiê, NÃO uma classificação cadastral — não confunda a tabela com o tipo do estabelecimento. O nome legal e a raiz de CNPJ também vêm do CANONICAL.',
    '3 ações numeradas na seção 9 — e o fluxo conceitual do Caminho da Venda NUNCA como lista numerada: descreva-o em 1 linha com setas (ex.: "Evidência segura → Hipótese comercial → Discovery → Decisão"). As únicas linhas numeradas de TODA a seção 9 são os 3 movimentos (1. / 2. / 3.), sem seta. Se você numerar o fluxo, o contrato conta como ação e reprova.',
    'CANONICAL:',
    JSON.stringify(composeCanonical),
    'SAFE PACK (Frontier):',
    JSON.stringify(composeSafePack),
  ].join('\n\n');
}
