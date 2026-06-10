import { describe, it, expect } from 'vitest';
import { ALLOWED_ORIGINS, isVercelPreview } from '../../api/_allowed-origins.js';

describe('ALLOWED_ORIGINS', () => {
  it('contem origens de desenvolvimento local', () => {
    expect(ALLOWED_ORIGINS.has('http://localhost:5173')).toBe(true);
    expect(ALLOWED_ORIGINS.has('http://localhost:3000')).toBe(true);
  });

  it('contem producao scoutagro.vercel.app', () => {
    expect(ALLOWED_ORIGINS.has('https://scoutagro.vercel.app')).toBe(true);
  });

  it('nao contem origens arbitrarias', () => {
    expect(ALLOWED_ORIGINS.has('https://evil.example.com')).toBe(false);
  });

  it('nao contem null, undefined ou strings vazias', () => {
    expect(ALLOWED_ORIGINS.has('')).toBe(false);
    for (const origin of ALLOWED_ORIGINS) {
      expect(origin).toBeTruthy();
      expect(typeof origin).toBe('string');
    }
  });
});

describe('isVercelPreview', () => {
  it('aceita preview do projeto', () => {
    expect(isVercelPreview('https://scoutagro-git-feat-test-brunolimaff-3629s-projects.vercel.app')).toBe(true);
  });

  it('rejeita preview de outro projeto Vercel', () => {
    // Sem o sufixo do projeto
    expect(isVercelPreview('https://other-app-git-test.vercel.app')).toBe(false);
    expect(isVercelPreview('https://scoutagro-clone.vercel.app')).toBe(false);
  });

  it('aceita alias principal do projeto (sem segmento de branch)', () => {
    expect(isVercelPreview('https://scoutagro-brunolimaff-3629s-projects.vercel.app')).toBe(true);
  });

  it('rejeita origens nao-Vercel', () => {
    expect(isVercelPreview('https://evil.example.com')).toBe(false);
    expect(isVercelPreview('http://localhost:5173')).toBe(false);
  });
});
