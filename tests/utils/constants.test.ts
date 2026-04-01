// tests/utils/constants.test.ts
import { describe, it, expect } from 'vitest';
import {
  APP_NAME,
  APP_VERSION,
  DEFAULT_MODE,
  MODE_LABELS,
  OPERACAO_PROMPT,
  DIRETORIA_PROMPT,
  NOME_VENDEDOR_PLACEHOLDER,
} from '../../constants';
import type { ChatMode } from '../../constants';

describe('constants', () => {
  describe('APP_NAME / APP_VERSION', () => {
    it('APP_NAME contém Senior Scout', () => {
      expect(APP_NAME).toContain('Senior Scout');
    });

    it('APP_VERSION é uma string não-vazia', () => {
      expect(typeof APP_VERSION).toBe('string');
      expect(APP_VERSION.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_MODE', () => {
    it('é operacao ou diretoria', () => {
      expect(['operacao', 'diretoria']).toContain(DEFAULT_MODE);
    });
  });

  describe('MODE_LABELS', () => {
    it('tem entradas para operacao e diretoria', () => {
      expect(MODE_LABELS['operacao']).toBeDefined();
      expect(MODE_LABELS['diretoria']).toBeDefined();
    });

    it('cada modo tem label, icon e description', () => {
      const modes: ChatMode[] = ['operacao', 'diretoria'];
      modes.forEach(mode => {
        expect(MODE_LABELS[mode].label).toBeTruthy();
        expect(MODE_LABELS[mode].icon).toBeTruthy();
        expect(MODE_LABELS[mode].description).toBeTruthy();
      });
    });
  });

  describe('OPERACAO_PROMPT / DIRETORIA_PROMPT', () => {
    it('OPERACAO_PROMPT é string não-vazia com conteúdo relevante', () => {
      expect(typeof OPERACAO_PROMPT).toBe('string');
      expect(OPERACAO_PROMPT.length).toBeGreaterThan(100);
    });

    it('DIRETORIA_PROMPT é string não-vazia', () => {
      expect(typeof DIRETORIA_PROMPT).toBe('string');
      expect(DIRETORIA_PROMPT.length).toBeGreaterThan(100);
    });

    it('prompts são diferentes entre si', () => {
      expect(OPERACAO_PROMPT).not.toBe(DIRETORIA_PROMPT);
    });
  });

  describe('NOME_VENDEDOR_PLACEHOLDER', () => {
    it('é um placeholder template correto', () => {
      expect(NOME_VENDEDOR_PLACEHOLDER).toBe('{{NOME_VENDEDOR}}');
    });
  });
});
