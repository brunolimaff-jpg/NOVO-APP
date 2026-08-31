/**
 * V6 — Shadow CxB: braços de modelo (desenho 2×2 + braço E).
 *
 * Cada braço define os modelos de compactor e composer. Os 5 braços
 * recebem o MESMO input (canonical + dossiê congelados por CNPJ).
 *
 * A: DeepSeek → DeepSeek (baseline de custo)
 * B: DeepSeek → Opus 4.5
 * C: Opus 4.5 → DeepSeek
 * D: Opus 4.5 → Opus 4.5
 * E: Opus 4.6 → Opus 4.6 (mesmo preço do 4.5; compara geração nova)
 */
export const DEEPSEEK_V3_2 = 'bedrock/deepseek.v3.2';
export const OPUS_4_5 = 'bedrock/us.anthropic.claude-opus-4-5-20251101-v1:0';
export const OPUS_4_6 = 'bedrock/us.anthropic.claude-opus-4-6-v1';

export interface CxBArm {
  id: 'A' | 'B' | 'C' | 'D' | 'E';
  label: string;
  compactorModel: string;
  composerModel: string;
  /** Preço de referência US$/1M tokens (entrada, saída) — confirmar no preflight. */
  refPricePerM: { input: number; output: number };
}

export const CXB_ARMS: CxBArm[] = [
  { id: 'A', label: 'DeepSeek → DeepSeek', compactorModel: DEEPSEEK_V3_2, composerModel: DEEPSEEK_V3_2, refPricePerM: { input: 0.74, output: 2.22 } },
  { id: 'B', label: 'DeepSeek → Opus 4.5', compactorModel: DEEPSEEK_V3_2, composerModel: OPUS_4_5, refPricePerM: { input: 0.74, output: 25 } },
  { id: 'C', label: 'Opus 4.5 → DeepSeek', compactorModel: OPUS_4_5, composerModel: DEEPSEEK_V3_2, refPricePerM: { input: 5, output: 2.22 } },
  { id: 'D', label: 'Opus 4.5 → Opus 4.5', compactorModel: OPUS_4_5, composerModel: OPUS_4_5, refPricePerM: { input: 5, output: 25 } },
  { id: 'E', label: 'Opus 4.6 → Opus 4.6', compactorModel: OPUS_4_6, composerModel: OPUS_4_6, refPricePerM: { input: 5, output: 25 } },
];

export function armById(id: CxBArm['id']): CxBArm {
  const arm = CXB_ARMS.find((a) => a.id === id);
  if (!arm) throw new Error(`Braço desconhecido: ${id}`);
  return arm;
}
