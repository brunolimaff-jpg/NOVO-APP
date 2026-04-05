// prompts/systemPrompts.ts
//
// FIX TDZ: Este arquivo isola os prompts de sistema em modulo dedicado.
// Mover OPERACAO_PROMPT para ca (de constants.ts) quebra a cadeia de
// dependencia circular que causava "Cannot access 'Sn' before initialization"
// no bundle minificado de producao.
//
// PASSO MANUAL NECESSARIO:
// 1. Copie o conteudo de BASE_SYSTEM_PROMPT de constants.ts para ca
// 2. Copie OPERACAO_PROMPT de constants.ts para ca
// 3. Remova OPERACAO_PROMPT e DIRETORIA_PROMPT de constants.ts
// 4. Atualize vite.config.ts (manualChunks app-core) conforme README

export { OPERACAO_PROMPT } from '../constants';
// TODO: apos mover os prompts, substituir a linha acima por:
// import { BASE_SYSTEM_PROMPT } from '../constants';
// export const OPERACAO_PROMPT = BASE_SYSTEM_PROMPT + `... texto do modo operacao ...`;
