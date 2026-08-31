/**
 * BRU-33 — Testes de ARQUITETURA do seam Gold (exigência do Planejador).
 *
 * 1. Runtime Gold NÃO pode importar shadow/* (SHADOW_ADAPTER_IN_BROWSER = PROHIBITED).
 * 2. Intents neutros scout-gold-compact/scout-gold-compose resolvem server-side
 *    para DeepSeek V3.2 (política V6) — e NENHUM ID concreto de provider vive
 *    no cliente (MODEL_IDS).
 * 3. Flag OFF → zero chamadas ao proxy LLM (ponta a ponta: seam + adapter real).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MODEL_IDS, GOLD_COMPACT_MODEL_ID, GOLD_COMPOSE_MODEL_ID } from '../../../../config/models';
import { resolveIntentModel } from '../../../../utils/llm/modelRouter';
import { createGoldSeamDeps } from '../../../../services/llm/gold/seam/gold-browser-adapter';
import { tryEnhanceDossierWithGold } from '../../../../services/llm/gold/seam/gold-dossier-seam';

const RUNTIME_FILES = [
  'services/llm/gold/seam/gold-dossier-seam.ts',
  'services/llm/gold/seam/gold-browser-adapter.ts',
  'services/llm/gold/prompts/gold-contract-prompts.ts',
  'services/llm/gold/gold-contract-validator.ts',
  'services/llm/gold/canonical/canonical-resolver.ts',
];

describe('BRU-33 — arquitetura do runtime Gold', () => {
  it('runtime Gold NÃO importa nada de shadow/ (MUST NOT IMPORT)', () => {
    for (const file of RUNTIME_FILES) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      const shadowImports = source.match(/from\s+['"].*shadow[^'"]*['"]/g) ?? [];
      expect(shadowImports, `${file} importa shadow/: ${shadowImports.join(', ')}`).toEqual([]);
    }
  });

  it('intents neutros do Gold resolvem para DeepSeek V3.2 (política V6) server-side', () => {
    expect(GOLD_COMPACT_MODEL_ID).toBe('scout-gold-compact');
    expect(GOLD_COMPOSE_MODEL_ID).toBe('scout-gold-compose');
    expect(resolveIntentModel('scout-gold-compact')).toBe('bedrock/deepseek.v3.2');
    expect(resolveIntentModel('scout-gold-compose')).toBe('bedrock/deepseek.v3.2');
  });

  it('nenhum ID concreto de provider no cliente (MODEL_IDS só intents neutros)', () => {
    for (const id of Object.values(MODEL_IDS)) {
      expect(id).not.toContain('bedrock/');
      expect(id).not.toContain('/');
      expect(id).toMatch(/^scout-/);
    }
  });

  it('flag OFF → zero chamadas ao proxy LLM (ponta a ponta, adapter real)', async () => {
    const chatSendMessage = vi.fn(async () => ({ text: 'NAO_DEVE_SER_CHAMADO' }));
    const deps = createGoldSeamDeps({ enabled: false, chatSendMessage: chatSendMessage as never });

    const out = await tryEnhanceDossierWithGold({
      cnpj: '04.733.767/0001-80',
      companyName: 'SCHEFFER & CIA LTDA',
      dossierText: '# DOSSIÊ SCOUT 360\n\ndossiê de teste',
      deps,
    });

    expect(out).toContain('DOSSIÊ SCOUT 360');
    expect(chatSendMessage).not.toHaveBeenCalled();
  });
});
