import { describe, expect, it } from 'vitest';
import { resolveGeminiApiEndpoint } from '../../services/geminiProxy';

describe('resolveGeminiApiEndpoint', () => {
  it('uses same-origin /api endpoint for localhost in dev', () => {
    expect(resolveGeminiApiEndpoint('localhost', true)).toBe('/api/gemini');
  });

  it('uses same-origin /api endpoint for 127.0.0.1 in dev', () => {
    expect(resolveGeminiApiEndpoint('127.0.0.1', true)).toBe('/api/gemini');
  });

  it('keeps relative endpoint outside local dev', () => {
    expect(resolveGeminiApiEndpoint('scoutagro.vercel.app', false)).toBe('/api/gemini');
  });
});
