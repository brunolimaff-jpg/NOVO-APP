// tests/utils/constants.test.ts
import { describe, it, expect } from 'vitest';
import { APP_NAME, APP_VERSION, DEFAULT_MODE, MODE_LABELS, NOME_VENDEDOR_PLACEHOLDER } from '../../constants';
import { OPERACAO_PROMPT } from '../../prompts/systemPrompts';
import type { ChatMode } from '../../constants';

describe('constants', () => {
  describe('APP_NAME / APP_VERSION', () => {
    it('APP_NAME contem Senior Scout', () => {
      expect(APP_NAME).toContain('Senior Scout');
    });

    it('APP_VERSION e uma string nao-vazia', () => {
      expect(typeof APP_VERSION).toBe('string');
      expect(APP_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_MODE', () => {
    it('e investigacao', () => {
      expect(DEFAULT_MODE).toBe('investigacao');
    });
  });

  describe('MODE_LABELS', () => {
    it('tem entrada para investigacao', () => {
      expect(MODE_LABELS['investigacao']).toBeDefined();
    });

    it('modo investigacao tem label, icon e description', () => {
      const mode: ChatMode = 'investigacao';
      expect(MODE_LABELS[mode].label).toBeTruthy();
      expect(MODE_LABELS[mode].icon).toBeTruthy();
      expect(MODE_LABELS[mode].description).toBeTruthy();
    });
  });

  describe('OPERACAO_PROMPT', () => {
    it('e string nao-vazia com conteudo relevante', () => {
      expect(typeof OPERACAO_PROMPT).toBe('string');
      expect(OPERACAO_PROMPT.length).toBeGreaterThan(100);
    });
  });

  describe('NOME_VENDEDOR_PLACEHOLDER', () => {
    it('e um placeholder template correto', () => {
      expect(NOME_VENDEDOR_PLACEHOLDER).toBe('{{NOME_VENDEDOR}}');
    });
  });
});
