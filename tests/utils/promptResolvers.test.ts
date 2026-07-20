import { describe, expect, it } from 'vitest';
import { resolvePromptMode, shouldIncludeBudgetPrompt } from '../../utils/promptResolvers';

describe('promptResolvers', () => {
  it('direciona valores históricos de war para o fallback executivo', () => {
    expect(resolvePromptMode('war-room')).toBe('executive');
    expect(
      shouldIncludeBudgetPrompt(
        { companyName: 'Empresa histórica', cnpj: null, city: '', state: '' },
        resolvePromptMode('war-room'),
      ),
    ).toBe(false);
  });

  it('preserva ultraDepth para solicitações profundas', () => {
    expect(resolvePromptMode('ultra')).toBe('ultraDepth');
  });
});
