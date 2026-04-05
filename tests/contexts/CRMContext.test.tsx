import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { CRMProvider, useCRM } from '../../contexts/CRMContext';
import { ChatSession, Sender } from '../../types';

// Mock idb-keyval para evitar dependência de IndexedDB
vi.mock('idb-keyval', () => ({
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(undefined),
}));

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Fazenda Boa Vista',
    empresaAlvo: 'Fazenda Boa Vista',
    cnpj: '12345678000195',
    modoPrincipal: null,
    scoreOportunidade: 78,
    resumoDossie: 'Empresa de grande porte no agronegócio.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  };
}

// Componente probe para capturar o contexto
let capturedCRM: ReturnType<typeof useCRM> | null = null;
function Probe() {
  capturedCRM = useCRM();
  return null;
}

function renderWithCRM() {
  return render(
    <CRMProvider>
      <Probe />
    </CRMProvider>,
  );
}

describe('CRMContext', () => {
  beforeEach(() => {
    capturedCRM = null;
    window.localStorage.clear();
  });

  it('inicializa com lista de cards vazia', () => {
    renderWithCRM();
    expect(capturedCRM!.cards).toEqual([]);
  });

  it('createCardFromSession cria card com dados da sessão', async () => {
    renderWithCRM();
    const session = makeSession();

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    expect(capturedCRM!.cards).toHaveLength(1);
    const card = capturedCRM!.cards[0];
    expect(card.companyName).toBe('Fazenda Boa Vista');
    expect(card.stage).toBe('prospeccao');
    expect(card.latestScorePorta).toBe(78);
  });

  it('createCardFromSession extrai CNPJ da sessão', async () => {
    renderWithCRM();
    const session = makeSession({ cnpj: '12.345.678/0001-95' });

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    const card = capturedCRM!.cards[0];
    expect(card.cnpj).toBe('12345678000195');
  });

  it('createManualCard cria card sem sessão vinculada', async () => {
    renderWithCRM();

    await act(async () => {
      await capturedCRM!.createManualCard({
        companyName: 'Cooperativa Central',
        cnpj: '98765432000112',
        stage: 'prospeccao',
      });
    });

    expect(capturedCRM!.cards).toHaveLength(1);
    const card = capturedCRM!.cards[0];
    expect(card.companyName).toBe('Cooperativa Central');
    expect(card.stage).toBe('prospeccao');
    expect(card.linkedSessionIds).toEqual([]);
  });

  it('updateCard atualiza dados e recalcula health', async () => {
    renderWithCRM();
    const session = makeSession({ scoreOportunidade: 30 });

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    const card = capturedCRM!.cards[0];
    await act(async () => {
      await capturedCRM!.updateCard({ ...card, latestScorePorta: 30 });
    });

    // Score < 40 → health deve ser 'red'
    expect(capturedCRM!.cards[0].health).toBe('red');
  });

  it('updateCard mantém health green para score alto', async () => {
    renderWithCRM();
    const session = makeSession({ scoreOportunidade: 80 });

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    const card = capturedCRM!.cards[0];
    await act(async () => {
      await capturedCRM!.updateCard({ ...card, latestScorePorta: 80 });
    });

    expect(capturedCRM!.cards[0].health).toBe('green');
  });

  it('deleteCard remove o card da lista', async () => {
    renderWithCRM();
    const session = makeSession();

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    const cardId = capturedCRM!.cards[0].id;

    await act(async () => {
      await capturedCRM!.deleteCard(cardId);
    });

    expect(capturedCRM!.cards).toHaveLength(0);
  });

  it('moveCardToStage muda o stage do card', async () => {
    renderWithCRM();
    const session = makeSession();

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    const cardId = capturedCRM!.cards[0].id;

    await act(async () => {
      await capturedCRM!.moveCardToStage(cardId, 'defesa_tecnica');
    });

    expect(capturedCRM!.cards[0].stage).toBe('defesa_tecnica');
    expect(capturedCRM!.cards[0].movedToStageAt['defesa_tecnica']).toBeDefined();
  });

  it('useCRM fora de CRMProvider lança erro', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(
        <React.Suspense fallback={null}>
          <Probe />
        </React.Suspense>,
      );
    }).toThrow('useCRM must be used within CRMProvider');
    consoleError.mockRestore();
  });

  it('persiste cards no localStorage após criação', async () => {
    renderWithCRM();
    const session = makeSession();

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    await waitFor(() => {
      const raw = window.localStorage.getItem('scout360_crm_cards_v1');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].companyName).toBe('Fazenda Boa Vista');
    });
  });

  it('carrega cards persistidos do localStorage na inicialização', async () => {
    const existingCard = {
      id: 'crm_existing',
      companyName: 'Granja São João',
      stage: 'prospeccao',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      movedToStageAt: {},
      stages: {},
      health: 'green',
      linkedSessionIds: [],
      newsRadarEnabled: false,
    };
    window.localStorage.setItem('scout360_crm_cards_v1', JSON.stringify([existingCard]));

    renderWithCRM();

    await waitFor(() => {
      expect(capturedCRM!.cards).toHaveLength(1);
      expect(capturedCRM!.cards[0].companyName).toBe('Granja São João');
    });
  });

  it('createCardFromSession usa título da sessão quando empresaAlvo é nulo', async () => {
    renderWithCRM();
    const session = makeSession({ empresaAlvo: null, title: 'Agroindústria XYZ' });

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    expect(capturedCRM!.cards[0].companyName).toBe('Agroindústria XYZ');
  });

  it('createCardFromSession extrai website das mensagens do bot', async () => {
    renderWithCRM();
    const session = makeSession({
      messages: [
        {
          id: 'm1',
          sender: Sender.Bot,
          text: 'A empresa tem site em https://fazendaboavista.com.br e mais info.',
          timestamp: new Date(),
        },
      ],
    });

    await act(async () => {
      await capturedCRM!.createCardFromSession(session);
    });

    expect(capturedCRM!.cards[0].website).toBe('https://fazendaboavista.com.br');
  });
});
