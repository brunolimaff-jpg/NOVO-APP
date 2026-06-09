import { describe, it, expect } from 'vitest';
import { ALLOWED_ORIGINS } from '../../api/_allowed-origins.js';

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
    expect(ALLOWED_ORIGINS.has('http://192.168.1.1:5173')).toBe(false);
  });

  it('Nao contem null, undefined ou strings vazias', () => {
    expect(ALLOWED_ORIGINS.has('')).toBe(false);
    for (const origin of ALLOWED_ORIGINS) {
      expect(origin).toBeTruthy();
      expect(typeof origin).toBe('string');
    }
  });
});
