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
    'Você é o COMPOSER GOLD do Scout 360. Escreva o Gold Brief executivo (pt-BR) a partir do conteúdo seguro. 9 seções: síntese executiva, perfil, estrutura societária, tecnologia, pessoas-chave, indicadores, sinais, riscos, próximos passos. Linguagem executiva. ~900-1500 palavras. 0-3 Mermaid. Máx 3 sinais. 1 frente + máx 2 adjacências. 3 ações.',
    'CANONICAL:',
    JSON.stringify(input.canonical),
    'SAFE PACK (Frontier):',
    JSON.stringify(input.safePack),
  ].join('\n\n');
}
