import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sender, type Message } from '../../types';

const scoutDiagMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));
const apiConfigMock = vi.hoisted(() => ({ backendUrl: undefined as string | undefined }));

vi.mock('../../services/apiConfig', () => ({
  get BACKEND_URL() {
    return apiConfigMock.backendUrl;
  },
}));
vi.mock('../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));

import { sendDossierEmail } from '../../services/exportService';

function makeMessage(): Message {
  return {
    id: 'message-export',
    sender: Sender.Bot,
    text: 'Relatório executivo de teste com conteúdo suficiente para atravessar a validação mínima de exportação.',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('exportService — backend ausente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiConfigMock.backendUrl = undefined;
  });

  it('não chama fetch quando sendDossierEmail não tem endpoint de sessão autorizado', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch não deveria ser chamado'));

    await expect(
      sendDossierEmail({
        emailTo: 'destino@example.com',
        subject: 'Teste',
        messages: [makeMessage()],
        sessionTitle: 'Empresa de teste',
        operatorName: 'Operador de teste',
      }),
    ).resolves.toBe(false);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('mantém o envio quando o BACKEND_URL default autorizado está configurado', async () => {
    apiConfigMock.backendUrl = 'https://authorized-backend.test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true }),
    } as Response);

    await expect(
      sendDossierEmail({
        emailTo: 'destino@example.com',
        subject: 'Teste',
        messages: [makeMessage()],
        sessionTitle: 'Empresa de teste',
        operatorName: 'Operador de teste',
      }),
    ).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://authorized-backend.test',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
