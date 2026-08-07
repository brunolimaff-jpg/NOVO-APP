/**
 * V5 — Golden Set: contrato de fixture.
 *
 * Fixture congela ENTRADA (canonical + RawFindingPack) + EXPECTATIVAS
 * (fatos que sobrevivem, claims que desaparecem, eventos esperados,
 * hard fails proibidos, traps do frontier). NÃO congela Gold enlatado —
 * o Gold é produzido deterministicamente pelo compose mock comum.
 */
import { z } from 'zod';
import { canonicalAccountSchema, rawFindingPackSchema, sanitizerEventCodeSchema } from '../../../../services/llm/gold/gold-contracts';

export const GOLDEN_PROFILES = [
  'agro-simples',
  'agro-holding',
  'agro-muitas-filiais',
  'empresas-laterais',
  'industria',
  'logistica',
  'construcao',
  'servicos-hcm',
  'muito-stack',
  'pouco-stack',
  'sem-stack',
  'input-matriz',
  'input-filial-outra-uf',
] as const;
export type GoldenProfile = (typeof GOLDEN_PROFILES)[number];

export const goldenFixtureSchema = z
  .object({
    profile: z.enum(GOLDEN_PROFILES),
    /** Controle limpo (sem armadilhas artificiais) ou near-miss semântico. */
    kind: z.enum(['standard', 'clean-control', 'near-miss']).default('standard'),
    canonicalAccount: canonicalAccountSchema,
    rawFindingPack: rawFindingPackSchema,
    expectations: z
      .object({
        /** Substrings de claims que DEVEM sobreviver no FrontierPack. */
        factsThatMustSurvive: z.array(z.string()),
        /** Substrings de claims que DEVEM desaparecer do FrontierPack. */
        claimsThatMustDisappear: z.array(z.string()),
        /** Códigos de sanitizerEvents obrigatórios. */
        expectedSanitizerEvents: z.array(sanitizerEventCodeSchema),
        /** Frases proibidas no conteúdo do FrontierPack (golden traps semânticas). */
        goldenTraps: z.array(z.string()),
        /** Códigos de hard fail proibidos no veredito. */
        forbiddenHardFails: z.array(z.string()),
        /** Nota do que este perfil tenta quebrar (rastreabilidade). */
        note: z.string(),
      })
      .strict(),
  })
  .strict();

export type GoldenFixture = z.infer<typeof goldenFixtureSchema>;
