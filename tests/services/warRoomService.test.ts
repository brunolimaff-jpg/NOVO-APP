import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.hoisted(() => vi.fn());
const buscarDocsMock = vi.hoisted(() => vi.fn());
const buscarBaseMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: generateContentMock,
}));

vi.mock('../../services/ragService', () => ({
  buscarContextoDocsPinecone: buscarDocsMock,
  buscarContextoPinecone: buscarBaseMock,
}));

const emptyResponse = {
  text: 'Resposta de teste',
  candidates: [{ groundingMetadata: { groundingChunks: [] } }],
};

describe('warRoomService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    buscarDocsMock.mockResolvedValue('');
    buscarBaseMock.mockResolvedValue('');
  });

  it('propagates inferred target for competitive modes', async () => {
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    await queryWarRoom('benchmark', 'Compare Senior vs TOTVS', [], '', undefined);

    const payload = generateContentMock.mock.calls[0][0];
    expect(payload.config.systemInstruction).toContain('TOTVS');
  });

  it('limits history context and keeps recent turns only', async () => {
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    const history = Array.from({ length: 12 }).map((_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'model' as const,
      text: i === 0 ? 'OLD_MARKER should disappear' : `Mensagem ${i}`,
    }));

    await queryWarRoom('tech', 'Como funciona compras?', history, '', undefined);

    const payload = generateContentMock.mock.calls[0][0];
    const prompt = payload.contents[0].parts[0].text;
    expect(prompt).not.toContain('OLD_MARKER should disappear');
    expect(prompt).toContain('Mensagem 11');
  });

  it('skips malformed source URLs without failing whole response', async () => {
    generateContentMock.mockResolvedValue({
      text: 'OK',
      candidates: [{
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'ht!tp://invalid uri', title: 'Bad' } },
            { web: { uri: 'https://example.com/docs', title: 'Good' } },
          ]
        }
      }],
    });

    const { queryWarRoom } = await import('../../services/warRoomService');
    const result = await queryWarRoom('benchmark', 'vs SAP', [], 'SAP', undefined);

    expect(result.text).toContain('OK');
    expect(result.sources).toEqual([{ title: 'Good', url: 'https://example.com/docs' }]);
  });

  it('shows explicit degraded warning when docs RAG is unavailable', async () => {
    buscarDocsMock.mockResolvedValue('');
    generateContentMock.mockResolvedValue(emptyResponse);
    const statuses: string[] = [];
    const { queryWarRoom } = await import('../../services/warRoomService');

    const result = await queryWarRoom('tech', 'Explique integração NFe', [], '', (s) => statuses.push(s));

    expect(statuses.some((s) => s.includes('Pinecone indisponível'))).toBe(true);
    expect(result.text).toContain('Aviso: o contexto do Pinecone');
  });

  it('treats fercus as a valid technical term', async () => {
    buscarDocsMock
      .mockResolvedValueOnce(
        [
          '### Integracao Gatec: Gestão de Custos Gerenciais',
          'Detalhes do módulo Fercus.',
          '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/manuais_processos/agronegocio/integracao-gatec/gatec-modulo-fercus.htm)',
        ].join('\n'),
      )
      .mockResolvedValueOnce(
        [
          '### Customizações: Pro_FerFgt',
          'Variável HCM que não é do contexto solicitado.',
          '(Fonte: https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/customizacoes/variaveis/pro_ferfgt.htm)',
        ].join('\n'),
      );
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    await queryWarRoom('tech', 'não é melhor usar o fercus para custo?', [], '', undefined);

    expect(buscarDocsMock.mock.calls.some((call) => String(call[0]).includes('fercus gestão de custos gerenciais'))).toBe(true);
    const payload = generateContentMock.mock.calls[0][0];
    const prompt = payload.contents[0].parts[0].text as string;
    expect(prompt).toContain('FOCO DE RESPOSTA (FERCUS)');
    expect(prompt).toContain('Não assuma erro de digitação');
    expect(prompt).toContain('gatec-modulo-fercus');
    expect(prompt).not.toContain('/customizacoes/variaveis/pro_ferfgt.htm');
  });

  it('injects fercus official reference when retrieval misses it', async () => {
    buscarDocsMock.mockResolvedValue('### Customizações: Pro_FerFgt\n(Fonte: https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/customizacoes/variaveis/pro_ferfgt.htm)');
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    await queryWarRoom('tech', 'explica o fercus', [], '', undefined);

    const payload = generateContentMock.mock.calls[0][0];
    const prompt = payload.contents[0].parts[0].text as string;
    expect(prompt).toContain('gatec-modulo-fercus');
    expect(prompt).not.toContain('/customizacoes/variaveis/pro_ferfgt.htm');
  });

  it('adds strong agricultural alias for gatec process questions', async () => {
    buscarDocsMock
      .mockResolvedValueOnce(
        [
          '### Integracao Gatec: Integração com GAtec',
          '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/manuais_processos/agronegocio/integracao-gatec/inicio-integracao-gatec.htm)',
        ].join('\n'),
      )
      .mockResolvedValueOnce(
        [
          '### Agrícola: Ordem de Serviço',
          '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/ordem-de-servico)',
        ].join('\n'),
      );
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    await queryWarRoom('tech', 'como funciona a gestão agrícola da gatec?', [], '', undefined);

    expect(buscarDocsMock.mock.calls.some((call) => String(call[0]).includes('simplefarm manual do usuário agrícola'))).toBe(true);
    const payload = generateContentMock.mock.calls[0][0];
    const prompt = payload.contents[0].parts[0].text as string;
    expect(prompt).toContain('manual-do-usuario/agricola');
  });

  it('prioritizes ERP Banking references on benchmark banking questions', async () => {
    buscarDocsMock.mockResolvedValue('');
    buscarBaseMock.mockResolvedValue('');
    generateContentMock.mockResolvedValue(emptyResponse);
    const { queryWarRoom } = await import('../../services/warRoomService');

    await queryWarRoom('benchmark', 'compare senior vs totvs na integração bancária (cnab)', [], 'TOTVS', undefined);

    expect(
      buscarDocsMock.mock.calls.some((call) => String(call[0]).toLowerCase().includes('erp banking integração bancária')),
    ).toBe(true);
    const payload = generateContentMock.mock.calls[0][0];
    const prompt = payload.contents[0].parts[0].text as string;
    expect(prompt).toContain('FOCO DE RESPOSTA (ERP BANKING)');
    expect(prompt).toContain('integracao-erp-banking');
    expect(prompt).toContain('Não use a expressão "Senior compensa"');
  });

  it('retries transient model errors and succeeds', async () => {
    generateContentMock
      .mockRejectedValueOnce(new Error('503 overloaded'))
      .mockResolvedValueOnce(emptyResponse);

    const { queryWarRoom } = await import('../../services/warRoomService');
    const result = await queryWarRoom('killscript', 'contra SAP', [], 'SAP', undefined);

    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('Resposta de teste');
  });

  it('returns canceled message when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { queryWarRoom } = await import('../../services/warRoomService');

    const result = await queryWarRoom('tech', 'teste', [], '', undefined, { signal: controller.signal });
    expect(result.text).toContain('cancelada');
  });

  it('enforces explicit ERP Banking anchors on banking benchmark output', async () => {
    buscarDocsMock.mockResolvedValue('');
    buscarBaseMock.mockResolvedValue('');
    generateContentMock.mockResolvedValue({
      text: 'Vantagem totvs: API sem CNAB. Senior compensa com ecossistema.',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });
    const { queryWarRoom } = await import('../../services/warRoomService');

    const result = await queryWarRoom(
      'benchmark',
      'compare senior vs totvs na integração bancária',
      [],
      'TOTVS',
      undefined,
    );

    expect(result.text).toContain('ERP Banking');
    expect(result.text).toContain('ERP Banking da Senior');
    expect(result.text).toContain('integracao-erp-banking.htm');
    expect(result.text).not.toContain('Senior compensa');
    expect(result.text).not.toContain('Senior Bank');
    expect(result.text).toContain('pagamento eletrônico abrangente');
    expect(result.text).toContain('registro online de títulos e boletos via API');
  });

  it('normalizes legacy banking wording to ERP Banking da Senior', async () => {
    buscarDocsMock.mockResolvedValue('');
    buscarBaseMock.mockResolvedValue('');
    generateContentMock.mockResolvedValue({
      text: [
        '### Mapeamento canônico: ERP Banking vs TOTVS',
        '- Senior (ERP Banking): pagamento eletrônico abrangente (ACH, cartões e transferências), conciliação e ecossistema financeiro embarcado (Senior Bank/Fintech).',
        '- TOTVS (Protheus): excelente registro online de títulos e boletos via API.',
      ].join('\n'),
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });
    const { queryWarRoom } = await import('../../services/warRoomService');

    const result = await queryWarRoom(
      'benchmark',
      'compare senior vs totvs na integração bancária',
      [],
      'TOTVS',
      undefined,
    );

    expect(result.text).toContain('ERP Banking da Senior');
    expect(result.text).not.toContain('Senior (ERP Banking):');
    expect(result.text).not.toContain('Senior Bank/Fintech');
  });

  it('replaces plain Senior Bank mentions in banking benchmark output', async () => {
    buscarDocsMock.mockResolvedValue('');
    buscarBaseMock.mockResolvedValue('');
    generateContentMock.mockResolvedValue({
      text: 'Integração bancária: Senior Bank possui capacidades de pagamentos eletrônicos.',
      candidates: [{ groundingMetadata: { groundingChunks: [] } }],
    });
    const { queryWarRoom } = await import('../../services/warRoomService');

    const result = await queryWarRoom(
      'benchmark',
      'compare senior vs totvs na integração bancária',
      [],
      'TOTVS',
      undefined,
    );

    expect(result.text).toContain('ERP Banking da Senior');
    expect(result.text).not.toContain('Senior Bank');
  });
});
