// tests/utils/conversationHistory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { saveConversation, getConversationHistory, searchHistory, clearHistory } from '../../utils/conversationHistory';

describe('conversationHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getConversationHistory', () => {
    it('retorna array vazio quando não há histórico', () => {
      expect(getConversationHistory()).toEqual([]);
    });

    it('retorna [] quando JSON é inválido', () => {
      localStorage.setItem('scout360_history', 'not-json{]');
      expect(getConversationHistory()).toEqual([]);
    });
  });

  describe('saveConversation', () => {
    it('salva entrada e recupera via getConversationHistory', () => {
      saveConversation({ query: 'Analisar Fazenda X', response: 'Análise...', type: 'chat' });
      const history = getConversationHistory();
      expect(history).toHaveLength(1);
      expect(history[0].query).toBe('Analisar Fazenda X');
      expect(history[0].type).toBe('chat');
    });

    it('gera id único baseado em timestamp', () => {
      saveConversation({ query: 'q1', response: 'r1', type: 'chat' });
      saveConversation({ query: 'q2', response: 'r2', type: 'warroom' });
      const h = getConversationHistory();
      expect(h[0].id).toBeTruthy();
      expect(h[1].id).toBeTruthy();
    });

    it('insere mais recente no início (unshift)', () => {
      saveConversation({ query: 'primeiro', response: 'r1', type: 'chat' });
      saveConversation({ query: 'segundo', response: 'r2', type: 'chat' });
      const h = getConversationHistory();
      expect(h[0].query).toBe('segundo');
      expect(h[1].query).toBe('primeiro');
    });

    it('limita a 50 entradas (MAX_ENTRIES)', () => {
      for (let i = 0; i < 55; i++) {
        saveConversation({ query: `q${i}`, response: `r${i}`, type: 'chat' });
      }
      const h = getConversationHistory();
      expect(h.length).toBeLessThanOrEqual(50);
    });

    it('salva campo mode quando fornecido', () => {
      saveConversation({ query: 'q', response: 'r', type: 'warroom', mode: 'tech' });
      const h = getConversationHistory();
      expect(h[0].mode).toBe('tech');
    });
  });

  describe('searchHistory', () => {
    it('retorna vazio quando histórico vazio', () => {
      expect(searchHistory('fazenda')).toEqual([]);
    });

    it('filtra por query (case insensitive)', () => {
      saveConversation({ query: 'Fazenda Boa Vista', response: 'Análise', type: 'chat' });
      saveConversation({ query: 'Cooperativa Sul', response: 'Relatório', type: 'chat' });
      const results = searchHistory('fazenda');
      expect(results).toHaveLength(1);
      expect(results[0].query).toBe('Fazenda Boa Vista');
    });

    it('filtra pela response também', () => {
      saveConversation({ query: 'Pesquisa', response: 'Resultado sobre TOTVS', type: 'chat' });
      saveConversation({ query: 'Outra', response: 'Dados irrelevantes', type: 'chat' });
      const results = searchHistory('TOTVS');
      expect(results).toHaveLength(1);
    });

    it('retorna múltiplos resultados quando múltiplos batem', () => {
      saveConversation({ query: 'Senior ERP', response: 'info', type: 'chat' });
      saveConversation({ query: 'Senior HCM', response: 'info', type: 'chat' });
      saveConversation({ query: 'TOTVS', response: 'info', type: 'chat' });
      expect(searchHistory('senior')).toHaveLength(2);
    });
  });

  describe('clearHistory', () => {
    it('remove todas as entradas', () => {
      saveConversation({ query: 'q', response: 'r', type: 'chat' });
      clearHistory();
      expect(getConversationHistory()).toEqual([]);
    });
  });
});
