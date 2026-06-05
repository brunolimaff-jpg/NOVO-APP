import { describe, expect, it } from 'vitest';
import { getLoadingBackoffMessage, resolveActiveLoadingStageLabel } from '../../utils/loadingBackoff';

describe('loadingBackoff', () => {
  it('retorna mensagem conforme failureCount', () => {
    expect(getLoadingBackoffMessage(0)).toBeNull();
    expect(getLoadingBackoffMessage(1)).toContain('Refinando sinais');
    expect(getLoadingBackoffMessage(3)).toContain('orquestração');
  });

  it('prioriza backoff sobre processing.stage', () => {
    expect(resolveActiveLoadingStageLabel('Finalizando cards de auditoria...', 1)).toBe(
      'Refinando sinais para alta precisão...',
    );
    expect(resolveActiveLoadingStageLabel('Finalizando cards de auditoria...', 0)).toBe(
      'Finalizando cards de auditoria...',
    );
  });
});
