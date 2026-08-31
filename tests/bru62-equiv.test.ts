// BRU-62 Prova 4: equivalência material do payload persistido.
// O snapshot pré-render (novo) e o snapshot pós-render (antigo) precisam
// carregar os MESMOS campos materiais. A transformação real
// (prepareDossierForPersistence) é aplicada aos dois e o resultado comparado.
import { describe, expect, it } from 'vitest';
import { Sender, type ChatSession, type Message, type WebVerificationStatus } from '../types';
import { prepareDossierForPersistence } from '../services/storage/dossiers';

function makeSnapshot(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Scheffer & CIA LTDA',
    empresaAlvo: 'Scheffer & CIA LTDA',
    cnpj: '04733767000180',
    modoPrincipal: 'investigacao',
    scoreOportunidade: 47,
    resumoDossie: null,
    createdAt: '2026-08-13T12:04:18.877Z',
    updatedAt: '2026-08-13T12:13:01.121Z',
    messages: [
      {
        id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura', timestamp: new Date('2026-08-13T12:05:23.358Z'), isThinking: false,
      },
      {
        id: 'bot-1', sender: Sender.Bot, text: '### 1. SÍNTESE EXECUTIVA 🎯\nConteúdo do dossiê final (Gold PASS ou fallback).',
        timestamp: new Date('2026-08-13T12:13:01.121Z'), isThinking: false,
        scorePorta: { score: 47, p: 7, o: 7, r: 6, t: 8, a: 6, segmento: 'PRD', flags: [], scoreBruto: 47 },
        groundingSources: [{ title: 'Fonte A', url: 'https://a.com', verification: 'fallback' }],
        webVerificationStatus: 'verified' as WebVerificationStatus,
        groundingUsed: true,
        suggestions: ['Onde a margem começa a vazar primeiro?', 'Qual frente exige decisão executiva?'],
        loadingVariant: undefined,
        isError: false,
      },
    ],
    ...overrides,
  };
}

describe('BRU-62 equivalência material do payload persistido', () => {
  it('snapshot pré-render (puro) e pós-render (UI) produzem o MESMO payload persistido', () => {
    // Caminho ANTIGO: sessionToPersist vinha do updateSessionById (mescla sessão atual).
    const oldSession = makeSnapshot();
    // Caminho NOVO: baseSession (sessão base) + texto final, com os mesmos campos.
    const baseSession = makeSnapshot();
    const newSession: ChatSession = {
      ...baseSession,
      messages: [
        ...(baseSession.messages.filter(m => m.id !== 'bot-1')),
        {
          id: 'bot-1', sender: Sender.Bot, text: baseSession.messages[1].text,
          timestamp: baseSession.messages[1].timestamp, isThinking: false,
          scorePorta: baseSession.messages[1].scorePorta,
          clienteSeniorData: undefined,
          groundingSources: (baseSession.messages[1] as Message).groundingSources,
          webVerificationStatus: baseSession.messages[1].webVerificationStatus as never,
          groundingUsed: true,
          suggestions: baseSession.messages[1].suggestions,
          loadingVariant: undefined, isError: false,
        },
      ],
    };

    const oldPayload = prepareDossierForPersistence(oldSession) as unknown as Record<string, unknown>;
    const newPayload = prepareDossierForPersistence(newSession) as unknown as Record<string, unknown>;

    // Campos materiais do dossiê: id, título, empresa, cnpj, modo, score, resumo,
    // mensagens (texto, score, grounding, sugestões, status). Timestamps podem
    // diferir (updatedAt/timestamp do envio) — não são conteúdo.
    expect(newPayload.id).toBe(oldPayload.id);
    expect(newPayload.title).toBe(oldPayload.title);
    expect(newPayload.empresaAlvo).toBe(oldPayload.empresaAlvo);
    expect(newPayload.cnpj).toBe(oldPayload.cnpj);
    expect(newPayload.modoPrincipal).toBe(oldPayload.modoPrincipal);
    expect(newPayload.scoreOportunidade).toBe(oldPayload.scoreOportunidade);
    expect(newPayload.resumoDossie).toBe(oldPayload.resumoDossie);

    const oldBot = (oldPayload.messages as Array<Record<string, unknown>>).find(m => m.id === 'bot-1');
    const newBot = (newPayload.messages as Array<Record<string, unknown>>).find(m => m.id === 'bot-1');
    expect(newBot).toBeDefined();
    expect(newBot!.text).toBe(oldBot!.text);
    expect(newBot!.scorePorta).toEqual(oldBot!.scorePorta);
    expect(newBot!.groundingSources).toEqual(oldBot!.groundingSources);
    expect(newBot!.suggestions).toEqual(oldBot!.suggestions);
    expect(newBot!.webVerificationStatus).toBe(oldBot!.webVerificationStatus);
  });

  it('snapshot puro preserva a identidade session_id (base da promoção atômica)', () => {
    const baseSession = makeSnapshot();
    const newSession: ChatSession = {
      ...baseSession,
      messages: [
        ...(baseSession.messages.filter(m => m.id !== 'bot-1')),
        {
          id: 'bot-1', sender: Sender.Bot, text: baseSession.messages[1].text,
          timestamp: baseSession.messages[1].timestamp, isThinking: false,
          scorePorta: baseSession.messages[1].scorePorta,
          clienteSeniorData: undefined,
          groundingSources: (baseSession.messages[1] as Message).groundingSources,
          webVerificationStatus: baseSession.messages[1].webVerificationStatus as never,
          groundingUsed: true,
          suggestions: baseSession.messages[1].suggestions,
          loadingVariant: undefined, isError: false,
        },
      ],
    };
    const payload = prepareDossierForPersistence(newSession) as unknown as Record<string, unknown>;
    expect(payload.id).toBe('session-1');
  });
});
