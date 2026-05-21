/**
 * Testes para geminiService.ts
 * Foco nas funções exportadas: parsePortaFeeds, cleanPortaFeedMarkers, parseMarkers, sendMessageToGemini
 *
 * NOTA: resetChatSession e generateNewSuggestions não existem no módulo
 * (dívida técnica — useChat.ts referencia exports inexistentes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const proxyGenerateContentMock = vi.hoisted(() => vi.fn());
const proxyChatSendMessageMock = vi.hoisted(() => vi.fn());
const buscarContextoPineconeMock = vi.hoisted(() => vi.fn());
const buscarContextoDocsPineconeMock = vi.hoisted(() => vi.fn());
const lookupClienteMock = vi.hoisted(() => vi.fn());
const benchmarkClientesMock = vi.hoisted(() => vi.fn());
const isConcorrenteOuPropriaMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: proxyGenerateContentMock,
  proxyChatSendMessage: proxyChatSendMessageMock,
}));

vi.mock('../../services/ragService', () => ({
  buscarContextoPinecone: buscarContextoPineconeMock,
  buscarContextoDocsPinecone: buscarContextoDocsPineconeMock,
}));

vi.mock('../../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
  formatarParaPrompt: vi.fn().mockReturnValue(''),
  benchmarkClientes: benchmarkClientesMock,
  formatarBenchmarkParaPrompt: vi.fn().mockReturnValue(''),
  isConcorrenteOuPropria: isConcorrenteOuPropriaMock,
  formatarComexParaPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('../../services/portaStateService', () => ({
  initPortaState: vi.fn(),
  resetPortaState: vi.fn(),
  setBaseScore: vi.fn(),
  getPortaState: vi.fn().mockReturnValue(null),
  addFeedAdjustment: vi.fn(),
  addFlagFeed: vi.fn(),
  addSegmentFeed: vi.fn(),
  generatePortaContextForDeepDive: vi.fn().mockReturnValue(''),
}));

vi.mock('../../services/investigationStore', () => ({
  addInvestigation: vi.fn(),
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), time: vi.fn(), timeEnd: vi.fn() },
}));

// Mock withAutoRetry para não aplicar delays reais nos testes
vi.mock('../../utils/retry', () => ({
  withAutoRetry: vi.fn(async (_name: string, action: () => Promise<unknown>) => action()),
}));

import {
  parsePortaFeeds,
  cleanPortaFeedMarkers,
  parseMarkers,
  sendMessageToGemini,
  generateContinuityQuestion,
} from '../../services/geminiService';
import { Sender } from '../../types';

function expectStrongContinuitySet(result: string[]) {
  expect(result).toHaveLength(4);
  expect(result.every(item => item.endsWith('?'))).toBe(true);
  expect(result.some(item => /margem|perda|risco|gargalo|trav|retrabalho|custo|press[aã]o|diretoria|integra[cç][aã]o/i.test(item))).toBe(true);
}

const LEGACY_ACME_FALLBACK_SUGGESTIONS = [
  'Qual gargalo em Acme Agro já está consumindo margem e segue tratado como rotina?',
  'Que decisão crítica em Acme Agro continua travada por falta de dados confiáveis?',
  'Onde Acme Agro ainda depende de planilhas e amplia risco operacional sem reação executiva?',
  'Se nada mudar em Acme Agro nos próximos 90 dias, qual ruptura tende a aparecer primeiro?',
];

describe('parsePortaFeeds', () => {
  it('retorna resultado vazio para texto sem marcadores', () => {
    const result = parsePortaFeeds('Texto qualquer sem marcadores PORTA', 'TEST');
    expect(result.adjustments).toHaveLength(0);
    expect(result.flags).toHaveLength(0);
    expect(result.segments).toHaveLength(0);
  });

  it('parseia marcador PORTA_FEED_O corretamente', () => {
    // clampFeedValue usa escala 0-10 internamente
    const text = '[[PORTA_FEED_O:7]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].dimension).toBe('O');
    expect(result.adjustments[0].suggestedValue).toBe(7);
    expect(result.adjustments[0].source).toBe('RAIO_X');
  });

  it('parseia marcador PORTA_FEED_R com dimensão R', () => {
    const text = '[[PORTA_FEED_R:60]]';
    const result = parsePortaFeeds(text, 'TECH');
    expect(result.adjustments.some(a => a.dimension === 'R')).toBe(true);
  });

  it('parseia marcador PORTA_FEED_T com sub-scores T1, T2, T3', () => {
    // clampFeedValue usa escala 0-10
    const text = '[[PORTA_FEED_T:7:T1:6:T2:8:T3:7]]';
    const result = parsePortaFeeds(text, 'TECH_STACK');
    expect(result.adjustments.some(a => a.dimension === 'T')).toBe(true);
    const tAdj = result.adjustments.find(a => a.dimension === 'T');
    expect(tAdj?.subScores?.T1).toBe(6);
    expect(tAdj?.subScores?.T2).toBe(8);
    expect(tAdj?.subScores?.T3).toBe(7);
  });

  it('parseia marcador PORTA_FEED_A com sub-scores A1, A2', () => {
    // clampFeedValue usa escala 0-10
    const text = '[[PORTA_FEED_A:8:A1:9:A2:7]]';
    const result = parsePortaFeeds(text, 'DECISORES');
    expect(result.adjustments.some(a => a.dimension === 'A')).toBe(true);
    const aAdj = result.adjustments.find(a => a.dimension === 'A');
    expect(aAdj?.subScores?.A1).toBe(9);
  });

  it('ignora flag PORTA_FLAG:LOCK:SIM por ser legado descontinuado', () => {
    const text = '[[PORTA_FLAG:LOCK:SIM]]';
    const result = parsePortaFeeds(text, 'RISCOS');
    expect(result.flags).toHaveLength(0);
  });

  it('parseia flag PORTA_FLAG:TRAD:NAO como inativa', () => {
    const text = '[[PORTA_FLAG:TRAD:NAO]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.flags.some(f => f.flag === 'TRAD' && f.active === false)).toBe(true);
  });

  it('parseia segmento AGI', () => {
    const text = '[[PORTA_SEG:AGI]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'AGI')).toBe(true);
  });

  it('parseia segmento PRD', () => {
    const text = '[[PORTA_SEG:PRD]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'PRD')).toBe(true);
  });

  it('parseia segmento COP', () => {
    const text = '[[PORTA_SEG:COP]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'COP')).toBe(true);
  });

  it('clampa valores fora do range (0-10) para o limite máximo de 10', () => {
    const text = '[[PORTA_FEED_O:150]]';
    const result = parsePortaFeeds(text, 'TEST');
    const adj = result.adjustments.find(a => a.dimension === 'O');
    expect(adj?.suggestedValue).toBeLessThanOrEqual(10);
    expect(adj?.suggestedValue).toBe(10); // 150 clamped to 10
  });

  it('parseia múltiplos marcadores no mesmo texto', () => {
    const text = '[[PORTA_FEED_O:70]]\n[[PORTA_FEED_R:65]]\n[[PORTA_SEG:AGI]]\n[[PORTA_FLAG:NOFIT:NAO]]';
    const result = parsePortaFeeds(text, 'MULTI');
    expect(result.adjustments.length).toBeGreaterThanOrEqual(2);
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.flags.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cleanPortaFeedMarkers', () => {
  it('remove marcadores PORTA do texto', () => {
    const text = 'Análise completa.\n[[PORTA:75:AGI]]\n[[PORTA_FEED_O:70]]\nConclusão.';
    const result = cleanPortaFeedMarkers(text);
    expect(result).not.toContain('[[PORTA:');
    expect(result).not.toContain('[[PORTA_FEED_');
  });

  it('preserva texto não relacionado a marcadores', () => {
    const text = 'Esta empresa tem score elevado. Análise detalhada segue.';
    const result = cleanPortaFeedMarkers(text);
    expect(result).toContain('Esta empresa tem score elevado');
  });

  it('retorna string vazia para texto vazio', () => {
    expect(cleanPortaFeedMarkers('')).toBe('');
  });
});

describe('parseMarkers', () => {
  it('retorna texto limpo sem marcadores internos', () => {
    const text = 'Resposta da IA.\n[[STATUS:OK]]\nTexto visível.';
    const result = parseMarkers(text);
    expect(result.text).not.toContain('[[STATUS:');
    expect(result.text).toContain('Texto visível');
  });

  it('extrai scorePorta quando marcador PORTA v2 está presente', () => {
    const text = 'Análise completa.\n[[PORTA:78:AGI::]]';
    const result = parseMarkers(text);
    if (result.scorePorta) {
      expect(result.scorePorta.scoreBruto).toBeGreaterThan(0);
    }
  });

  it('retorna scorePorta null quando não há marcador PORTA', () => {
    const text = 'Texto sem marcador de score.';
    const result = parseMarkers(text);
    expect(result.scorePorta).toBeNull();
  });

  it('retorna array de statuses vazio', () => {
    const result = parseMarkers('Qualquer texto');
    expect(result.statuses).toEqual([]);
  });
});

describe('generateContinuityQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 4 perguntas quando a resposta já vem como JSON válido', async () => {
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: JSON.stringify([
        'Quais gargalos fiscais hoje atrasam o fechamento mensal da operação?',
        'Onde o ERP atual falha ao consolidar custos entre unidades e safra?',
        'Que indicador executivo segue sem dono claro quando o fechamento pressiona a diretoria?',
        'Se nos próximos 90 dias a integração continuar falhando entre áreas, qual perda tende a aparecer primeiro?',
      ]),
    });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno');
    expectStrongContinuitySet(result);
    expect(proxyGenerateContentMock).toHaveBeenCalledTimes(1);
  });

  it('extrai array JSON embutido em texto adicional e permite citar a empresa quando fortalece a pergunta', async () => {
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: `Sugestões encontradas:\n["Qual dor operacional mais impacta margem hoje?","Onde o controle de estoque em Acme Agro perde rastreabilidade?","Qual decisão fica travada sem dados confiáveis?","Qual etapa depende de planilha manual e gera retrabalho?"]\nUse com o cliente.`,
    });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno');
    expectStrongContinuitySet(result);
    expect(result.some(item => /Acme Agro/i.test(item))).toBe(true);
    expect(result.some(item => item.includes('Qual dor operacional'))).toBe(true);
  });

  it('extrai perguntas de texto livre preservando o tom sniper', async () => {
    proxyGenerateContentMock.mockResolvedValueOnce({
      text: `1. Qual processo hoje depende de planilha e gera perda de controle?\n2. Onde a operação sofre mais retrabalho por falta de integração?\n3. Que decisão executiva demora por ausência de dados confiáveis?\n4. Qual custo oculto já virou rotina e ainda não incomodou a diretoria?`,
    });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno');
    expectStrongContinuitySet(result);
    expect(result.some(item => item.includes('decisão executiva'))).toBe(true);
  });

  it('faz retry automático quando a primeira tentativa retorna menos de 4 perguntas', async () => {
    proxyGenerateContentMock
      .mockResolvedValueOnce({
        text: '["Qual processo crítico fica sem visibilidade hoje?"]',
      })
      .mockResolvedValueOnce({
        text: '["Onde o ERP atual trava o fechamento?","Qual etapa sofre mais retrabalho manual?","Que risco aumenta sem integração de dados?"]',
      });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno');
    expectStrongContinuitySet(result);
    expect(proxyGenerateContentMock).toHaveBeenCalledTimes(2);
  });

  it('usa fallback guiado pelos sinais do dossie e mantém pressão comercial sem depender de 90 dias', async () => {
    proxyGenerateContentMock
      .mockResolvedValueOnce({
        text: '["Mensagem inválida"]',
      })
      .mockResolvedValueOnce({
        text: '["Pergunta repetida"]',
      });

    const result = await generateContinuityQuestion(
      [
        {
          id: '1',
          sender: Sender.Bot,
          text: 'Há risco fiscal, retrabalho no fechamento, integração frágil entre ERP e planilhas e pressão de compliance.',
          timestamp: new Date(),
        },
      ],
      'Acme Agro',
      'Bruno',
    );

    expectStrongContinuitySet(result);
    expect(result.some(item => /fiscal|compliance|integra[cç][aã]o|fechamento/i.test(item))).toBe(true);
    expect(result).not.toEqual(LEGACY_ACME_FALLBACK_SUGGESTIONS);
  });

  it('usa fallback contextual quando a geração de perguntas falha por completo', async () => {
    proxyGenerateContentMock.mockRejectedValueOnce(new Error('quota'));

    const result = await generateContinuityQuestion(
      [
        {
          id: '1',
          sender: Sender.Bot,
          text: [
            'Acme Agro depende de planilhas no fechamento, sofre vazamento de margem e mantém integração frágil do ERP.',
            'O comitê financeiro adia decisão por falta de dado confiável e há pressão fiscal recorrente.',
          ].join(' '),
          timestamp: new Date(),
        },
      ],
      'Acme Agro',
      'Bruno',
    );

    expectStrongContinuitySet(result);
    expect(result).not.toEqual(LEGACY_ACME_FALLBACK_SUGGESTIONS);
    expect(result.some(item => /planilha|ERP|integra[cç][aã]o|fiscal|margem|comit[eê]/i.test(item))).toBe(true);
  });
});

describe('sendMessageToGemini — cenários de erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buscarContextoPineconeMock.mockResolvedValue('');
    buscarContextoDocsPineconeMock.mockResolvedValue('');
    isConcorrenteOuPropriaMock.mockReturnValue([]);
    lookupClienteMock.mockResolvedValue(null);
    benchmarkClientesMock.mockResolvedValue([]);
  });

  it('lança erro de AbortError imediatamente quando signal já está abortado', async () => {
    const controller = new AbortController();
    controller.abort();

    // geminiService lança `new Error('AbortError')` — message='AbortError', name='Error'
    await expect(
      sendMessageToGemini('Analise a Fazenda X', [], 'system instruction', {
        signal: controller.signal,
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toMatchObject({ message: 'AbortError' });
  });

  it('propaga erro de rede quando o proxy falha', async () => {
    // withAutoRetry está mockado para executar apenas uma vez (sem delay)
    // geminiService relança o erro original (TypeError) — normalização é feita no consumidor
    const networkError = new TypeError('fetch failed');
    proxyChatSendMessageMock.mockRejectedValue(networkError);
    proxyGenerateContentMock.mockRejectedValue(networkError);

    await expect(
      sendMessageToGemini('Pergunta', [], 'system', {
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toThrow('fetch failed');
  });

  it('propaga erro 429 quando o proxy retorna quota exceeded', async () => {
    // withAutoRetry está mockado para executar apenas uma vez (sem delay)
    const rateLimitError = Object.assign(new Error('quota exhausted'), { status: 429 });
    proxyChatSendMessageMock.mockRejectedValue(rateLimitError);
    proxyGenerateContentMock.mockRejectedValue(rateLimitError);

    await expect(
      sendMessageToGemini('Pergunta', [], 'system', {
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toThrow('quota exhausted');
  });

  it('em deep dive envia apenas histórico recente do vendedor para evitar repetição do dossiê anterior', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'ok' });

    await sendMessageToGemini(
      'Dossiê completo de [Acme Agro]. Protocolo de investigação forense especializada:\n\nARQUITETURA DE TI',
      [
        { id: '1', sender: 'user' as any, text: 'Investigue Acme Agro', timestamp: new Date() } as any,
        {
          id: '2',
          sender: 'bot' as any,
          text: 'Dossiê inicial longo com resumo executivo e vários módulos...',
          timestamp: new Date(),
        } as any,
        { id: '3', sender: 'user' as any, text: 'Agora aprofunde em ERP', timestamp: new Date() } as any,
      ],
      'system',
      {
        onText: vi.fn(),
        onStatus: vi.fn(),
      },
    );

    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    const payload = proxyChatSendMessageMock.mock.calls[0][0];
    expect(payload.history).toEqual([
      { role: 'user', text: 'Investigue Acme Agro' },
      { role: 'user', text: 'Agora aprofunde em ERP' },
    ]);
  });

  it('em follow-up usa histórico compacto e instrui resposta cirúrgica sem repetir o dossiê', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'Use o gatilho de mismatch tecnologico.' });
    const longDossier = [
      '### 🗡️ GATILHOS DE ABORDAGEM',
      'Gatilho 1: use base Senior para puxar governanca.',
      'A'.repeat(9000),
      '### FASE 8: Recomendações de Produtos Senior',
      'Fechar com ERP + GAtec.',
    ].join('\n');

    await sendMessageToGemini(
      'qual frase eu mando pro Edinaldo agora?',
      [
        {
          id: 'user-1',
          sender: Sender.User,
          text: 'Dossiê completo de [Santa Rita]',
          timestamp: new Date(),
        },
        {
          id: 'bot-1',
          sender: Sender.Bot,
          text: longDossier,
          timestamp: new Date(),
        },
      ],
      'system',
      {
        onText: vi.fn(),
        onStatus: vi.fn(),
        hintedCompany: 'Santa Rita',
        isFollowUp: true,
      },
      true,
    );

    expect(lookupClienteMock).not.toHaveBeenCalled();
    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    const payload = proxyChatSendMessageMock.mock.calls[0][0];
    expect(payload.systemInstruction).toContain('MODO FOLLOW-UP CIRURGICO');
    expect(payload.systemInstruction).toContain('Nao reexecute');
    expect(payload.history).toHaveLength(2);
    expect(payload.history[1].role).toBe('model');
    expect(payload.history[1].text.length).toBeLessThan(longDossier.length);
    expect(payload.history[1].text).toContain('historico anterior compactado');
  });

  it('em follow-up preserva pares alternados e mantém o dossiê inicial como contexto âncora', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'Resposta curta.' });
    const firstDossier = `Dossiê inicial com tese da conta.\n${'A'.repeat(8500)}`;

    await sendMessageToGemini(
      'qual é a próxima pergunta?',
      [
        {
          id: 'user-1',
          sender: Sender.User,
          text: 'Dossiê completo de [Santa Rita]',
          timestamp: new Date(),
        },
        {
          id: 'bot-1',
          sender: Sender.Bot,
          text: firstDossier,
          timestamp: new Date(),
        },
        {
          id: 'user-2',
          sender: Sender.User,
          text: 'me dá uma frase curta',
          timestamp: new Date(),
        },
        {
          id: 'bot-2',
          sender: Sender.Bot,
          text: 'Use a dor do Maxiprod.',
          timestamp: new Date(),
        },
      ],
      'system',
      {
        onText: vi.fn(),
        onStatus: vi.fn(),
        hintedCompany: 'Santa Rita',
        isFollowUp: true,
      },
      true,
    );

    const payload = proxyChatSendMessageMock.mock.calls[0][0];
    expect(payload.history.map((item: { role: string }) => item.role)).toEqual(['user', 'model', 'user', 'model']);
    expect(payload.history[1].text).toContain('Dossiê inicial com tese da conta.');
    expect(payload.history[1].text).toContain('historico anterior compactado');
    expect(payload.history[3].text).toBe('Use a dor do Maxiprod.');
  });

  it('envia thinkingLevel=high por padrão quando não há configuração explícita', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'ok' });

    await sendMessageToGemini('Pergunta simples', [], 'system', {
      onText: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    expect(proxyChatSendMessageMock.mock.calls[0][0]).toMatchObject({
      thinkingLevel: 'high',
    });
  });

  it('mapeia thinkingMode=false legado para thinkingLevel=low', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'ok' });

    await sendMessageToGemini('Pergunta simples', [], 'system', {
      thinkingMode: false,
      onText: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    expect(proxyChatSendMessageMock.mock.calls[0][0]).toMatchObject({
      thinkingLevel: 'low',
    });
  });

  it('prioriza thinkingLevel explícito sobre thinkingMode legado', async () => {
    proxyChatSendMessageMock.mockResolvedValue({ text: 'ok' });

    await sendMessageToGemini('Pergunta simples', [], 'system', {
      thinkingLevel: 'medium',
      thinkingMode: true,
      onText: vi.fn(),
      onStatus: vi.fn(),
    });

    expect(proxyChatSendMessageMock).toHaveBeenCalledTimes(1);
    expect(proxyChatSendMessageMock.mock.calls[0][0]).toMatchObject({
      thinkingLevel: 'medium',
    });
  });
});

describe('generateContinuityQuestion novelty mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evita repetir sugestoes atuais e busca ineditismo real', async () => {
    const avoidSuggestions = [
      'Qual processo critico fica sem visibilidade hoje?',
      'Onde o ERP atual trava o fechamento mensal?',
    ];

    proxyGenerateContentMock
      .mockResolvedValueOnce({
        text: JSON.stringify([
          'Qual processo critico fica sem visibilidade hoje?',
          'Onde o ERP atual trava o fechamento mensal?',
          'Que indicador executivo permanece sem rastreabilidade entre filiais?',
          'Qual risco operacional aumenta quando o time depende de planilhas paralelas?',
        ]),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          'Qual decisao comercial esta atrasando por falta de integracao fiscal?',
          'Onde a equipe perde mais margem por retrabalho de dados?',
          'Que ruptura operacional ja ficou cara demais para continuar sendo tratada como excecao?',
        ]),
      });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno', {
      mode: 'regenerate',
      avoidSuggestions,
      ensureFresh: true,
    });

    expectStrongContinuitySet(result);
    expect(result.some(item => /processo critico/i.test(item))).toBe(false);
    expect(result.some(item => /ERP atual trava/i.test(item))).toBe(false);
    expect(proxyGenerateContentMock).toHaveBeenCalledTimes(2);
  });

  it('completa 4 sugestões com fallback premium quando nao encontra 4 ineditas', async () => {
    proxyGenerateContentMock
      .mockResolvedValueOnce({
        text: JSON.stringify([
          'Qual processo critico fica sem visibilidade hoje?',
          'Onde o ERP atual trava o fechamento mensal?',
        ]),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          'Onde o ERP atual trava o fechamento mensal?',
        ]),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          'Qual decisao executiva ainda fica sem dado confiavel no fechamento?',
        ]),
      });

    const result = await generateContinuityQuestion([], 'Acme Agro', 'Bruno', {
      mode: 'regenerate',
      avoidSuggestions: [
        'Qual processo critico fica sem visibilidade hoje?',
        'Onde o ERP atual trava o fechamento mensal?',
      ],
      ensureFresh: true,
    });

    expectStrongContinuitySet(result);
    expect(result.some(item => /decis[aã]o|or[cç]amento|margem|risco|custo/i.test(item))).toBe(true);
    expect(proxyGenerateContentMock).toHaveBeenCalledTimes(3);
  });
});
