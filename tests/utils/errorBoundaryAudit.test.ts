import { describe, it, expect, beforeEach } from 'vitest';
import { generateUiErrorId, buildUiErrorReport, persistUiErrorAudit } from '../../utils/errorBoundaryAudit';

const UI_ERROR_AUDIT_KEY = 'scout360_ui_errors_v1';

describe('errorBoundaryAudit', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generateUiErrorId', () => {
    it('gera um ID com prefixo ERR e a mensagem abreviada', () => {
      const id = generateUiErrorId('Erro ao carregar dados');
      expect(id).toMatch(/^ERR-ERROAO-[A-Z0-9]+$/);
    });

    it('remove caracteres especiais mas mantém cifrao e underscore', () => {
      const id = generateUiErrorId('$_abc');
      expect(id).toContain('$_ABC');
      expect(id).toMatch(/^ERR-/);
    });

    it('produz IDs diferentes para timestamps diferentes (formato geral)', () => {
      const id = generateUiErrorId('TypeError');
      expect(id).toMatch(/^ERR-[A-Z_]+-[A-Z0-9]+$/);
    });
  });

  describe('buildUiErrorReport', () => {
    it('monta relatório com ID, timestamp, mensagem, stack JS e stack React', () => {
      const error = new Error('Falha na requisicao');
      const report = buildUiErrorReport('ERR-ABCD-001', error, 'at Component (file.tsx:10)');

      expect(report).toContain('[ERR-ABCD-001]');
      expect(report).toContain('Mensagem: Falha na requisicao');
      expect(report).toContain('Stack JS:');
      expect(report).toContain('Stack React:');
      expect(report).toContain('at Component (file.tsx:10)');
    });

    it('usa placeholder quando componentStack está vazio', () => {
      const error = new Error('teste');
      const report = buildUiErrorReport('ERR-X', error);

      expect(report).toContain('Stack React:');
      expect(report).toContain('indisponivel');
    });

    it('usa placeholder quando error.stack é undefined', () => {
      const error = { message: 'teste', name: 'Error', stack: undefined } as unknown as Error;
      const report = buildUiErrorReport('ERR-X', error);

      expect(report).toContain('Stack JS:');
      expect(report).toContain('indisponivel');
    });
  });

  describe('persistUiErrorAudit', () => {
    it('grava entrada no localStorage com todos os campos', () => {
      const error = new Error('conexao falhou');
      persistUiErrorAudit('ERR-001', error, 'at App (app.tsx:5)');

      const raw = localStorage.getItem(UI_ERROR_AUDIT_KEY);
      expect(raw).not.toBeNull();

      const entries = JSON.parse(raw!);
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ERR-001');
      expect(entries[0].reason).toBe('conexao falhou');
      expect(entries[0].level).toBe('error');
      expect(entries[0].componentStack).toBe('at App (app.tsx:5)');
      expect(entries[0]).toHaveProperty('ts');
      expect(entries[0]).toHaveProperty('stack');
    });

    it('recupera multiplos erros gravados', () => {
      persistUiErrorAudit('ERR-001', new Error('erro 1'));
      persistUiErrorAudit('ERR-002', new Error('erro 2'));

      const raw = localStorage.getItem(UI_ERROR_AUDIT_KEY);
      const entries = JSON.parse(raw!);
      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('ERR-001');
      expect(entries[1].id).toBe('ERR-002');
    });

    it('limpa os erros ao remover a chave do localStorage', () => {
      persistUiErrorAudit('ERR-001', new Error('temp'));
      localStorage.removeItem(UI_ERROR_AUDIT_KEY);
      expect(localStorage.getItem(UI_ERROR_AUDIT_KEY)).toBeNull();
    });

    it('respeita o limite maximo de 50 entradas (slice(-50))', () => {
      for (let i = 0; i < 55; i++) {
        persistUiErrorAudit(`ERR-${i}`, new Error(`error ${i}`));
      }

      const raw = localStorage.getItem(UI_ERROR_AUDIT_KEY);
      const entries = JSON.parse(raw!);
      expect(entries).toHaveLength(50);
      // As 5 primeiras (ERR-0 a ERR-4) foram descartadas
      expect(entries[0].id).toBe('ERR-5');
      expect(entries[49].id).toBe('ERR-54');
    });
  });
});
