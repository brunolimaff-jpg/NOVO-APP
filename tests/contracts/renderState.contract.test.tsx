// tests/contracts/renderState.contract.test.tsx
import { describe, it, expect } from 'vitest';
import {
  classifyPanelState,
  VALID_PANEL_STATES,
  type PanelState,
  type PanelStateParams,
} from '../../utils/renderStateClassifier';

function state(params: Partial<PanelStateParams>): PanelStateParams {
  return {
    messages: [],
    hasDossierContent: false,
    isLoading: false,
    hasError: false,
    ...params,
  };
}

describe('renderState contract — classifyPanelState', () => {
  describe('VALID_PANEL_STATES', () => {
    it('contém exatamente 4 estados', () => {
      expect(VALID_PANEL_STATES).toHaveLength(4);
    });

    it('contém empty, loading, content, error', () => {
      expect(VALID_PANEL_STATES).toContain('empty');
      expect(VALID_PANEL_STATES).toContain('loading');
      expect(VALID_PANEL_STATES).toContain('content');
      expect(VALID_PANEL_STATES).toContain('error');
    });
  });

  describe('priority: error > loading > content > empty', () => {
    it('hasError vence isLoading', () => {
      expect(classifyPanelState(state({ hasError: true, isLoading: true }))).toBe('error');
    });

    it('hasError vence content (messages)', () => {
      expect(classifyPanelState(state({ hasError: true, messages: ['msg'] }))).toBe('error');
    });

    it('isLoading vence content (messages)', () => {
      expect(classifyPanelState(state({ isLoading: true, messages: ['msg'] }))).toBe('loading');
    });

    it('isLoading vence content (dossier)', () => {
      expect(classifyPanelState(state({ isLoading: true, hasDossierContent: true }))).toBe('loading');
    });

    it('content vence empty', () => {
      expect(classifyPanelState(state({ messages: ['msg'] }))).toBe('content');
    });

    it('dossier content é suficiente para estado content', () => {
      expect(classifyPanelState(state({ hasDossierContent: true }))).toBe('content');
    });
  });

  describe('empty state', () => {
    it('retorna empty quando nada está presente', () => {
      expect(classifyPanelState(state({}))).toBe('empty');
    });

    it('retorna empty sem mensagens, dossier, loading ou erro', () => {
      expect(classifyPanelState(state({}))).toBe('empty');
    });
  });

  describe('nunca retorna null ou undefined', () => {
    it('sempre retorna um valor string definido', () => {
      const combos: PanelStateParams[] = [
        state({}),
        state({ hasError: true }),
        state({ isLoading: true }),
        state({ messages: ['a'] }),
        state({ hasDossierContent: true }),
        state({ hasError: true, isLoading: true, messages: ['a'], hasDossierContent: true }),
      ];

      for (const combo of combos) {
        const result = classifyPanelState(combo);
        expect(typeof result).toBe('string');
        expect(result).toBeTruthy();
        expect(VALID_PANEL_STATES).toContain(result);
      }
    });
  });

  describe('tipos de retorno', () => {
    it('retorno é assignable a PanelState', () => {
      const result: PanelState = classifyPanelState(state({ messages: ['test'] }));
      expect(result).toBe('content');
    });
  });
});
