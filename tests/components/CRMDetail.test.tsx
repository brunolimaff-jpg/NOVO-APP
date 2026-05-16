import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRMDetail } from '../../components/CRMDetail';
import { Sender, type ChatSession, type CRMCard } from '../../types';

const { deleteCardMock, updateCardMock, sendMessageToGeminiMock } = vi.hoisted(() => ({
  deleteCardMock: vi.fn(),
  updateCardMock: vi.fn(),
  sendMessageToGeminiMock: vi.fn(),
}));

vi.mock('../../contexts/CRMContext', () => ({
  useCRM: () => ({
    updateCard: updateCardMock,
    deleteCard: deleteCardMock,
  }),
}));

vi.mock('../../services/geminiService', () => ({
  sendMessageToGemini: sendMessageToGeminiMock,
}));

vi.mock('../../components/ConfirmPopover', () => ({
  default: ({ children, onConfirm }: { children: (args: { onClick: () => void }) => React.ReactNode; onConfirm: () => void }) => (
    <>{children({ onClick: onConfirm })}</>
  ),
}));

vi.mock('../../components/RevenueIntelligence', () => ({
  default: ({ profile }: { profile: { totalRRAnual?: number } }) => (
    <section aria-label="Revenue Intelligence">RR anual: {profile.totalRRAnual ?? 0}</section>
  ),
}));

function buildCard(overrides: Partial<CRMCard> = {}): CRMCard {
  const now = '2026-05-16T12:00:00.000Z';

  return {
    id: 'crm-1',
    companyName: 'Scheffer Agro',
    cnpj: '04733767000180',
    cnpjs: ['04733767000180'],
    website: 'https://scheffer.agr.br',
    briefDescription: 'Grupo agroindustrial com operação relevante em MT.',
    exactLink: 'https://app.exactspotter.com/public/scheffer',
    linkedSessionIds: ['session-1'],
    stage: 'prospeccao',
    createdAt: now,
    updatedAt: now,
    movedToStageAt: { prospeccao: now },
    stages: {
      prospeccao: {
        transcriptions: [],
        executiveNotes: '',
        technicalNotes: 'Ficha Spotter inicial',
        crmNotes: 'Priorizar abordagem consultiva',
      },
    },
    latestScorePorta: 84,
    health: 'green',
    newsRadarEnabled: false,
    attachments: [
      {
        id: 'att-1',
        fileName: 'diagnostico.pdf',
        url: 'https://example.com/diagnostico.pdf',
        mimeType: 'application/pdf',
        stage: 'prospeccao',
        uploadedAt: now,
      },
    ],
    revenueProfile: {
      cardId: 'crm-1',
      porte: 'grande',
      totalRRAnual: 120000,
      totalNR: 35000,
      streamsAtivos: [],
      oportunidadesExpansao: [],
      prazoContratoPadrao: 24,
      atualizadoEm: now,
    },
    ...overrides,
  } as CRMCard;
}

function buildSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Dossiê Scheffer',
    empresaAlvo: 'Scheffer Agro',
    cnpj: '04733767000180',
    modoPrincipal: 'investigacao',
    scoreOportunidade: 84,
    resumoDossie: 'Resumo executivo',
    createdAt: '2026-05-16T10:00:00.000Z',
    updatedAt: '2026-05-16T11:00:00.000Z',
    messages: [
      {
        id: 'msg-1',
        sender: Sender.Bot,
        text: 'Cliente Senior confirmado.',
        timestamp: new Date('2026-05-16T11:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

function renderCRMDetail(overrides: Partial<CRMCard> = {}) {
  const props = {
    card: buildCard(overrides),
    sessions: [buildSession()],
    onClose: vi.fn(),
    onSelectSession: vi.fn(),
    onMoveStage: vi.fn(),
    onCreateSessionFromCard: vi.fn(),
    isDarkMode: false,
  };

  const view = render(<CRMDetail {...props} />);

  return { ...props, ...view };
}

describe('CRMDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendMessageToGeminiMock.mockResolvedValue({ text: 'Resumo gerado pela IA.' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns null when there is no selected card', () => {
    const { container } = render(
      <CRMDetail
        card={null}
        sessions={[]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        isDarkMode={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders client header, cadastro fields, score and linked session for a populated card', () => {
    renderCRMDetail();

    expect(screen.getByRole('heading', { name: /Scheffer Agro/i })).toBeInTheDocument();
    expect(screen.getAllByText(/PORTA 84\/100/i).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Scheffer Agro')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://scheffer.agr.br')).toBeInTheDocument();
    expect(screen.getByText('04733767000180')).toBeInTheDocument();
    expect(screen.getByText('diagnostico.pdf')).toBeInTheDocument();
    expect(screen.getByText('Dossiê Scheffer')).toBeInTheDocument();
    expect(screen.getByLabelText(/Revenue Intelligence/i)).toHaveTextContent('120000');
  });

  it('calls the stage handler when the funnel stage changes', () => {
    const props = renderCRMDetail();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'defesa_tecnica' } });

    expect(props.onMoveStage).toHaveBeenCalledWith('defesa_tecnica');
  });

  it('opens a linked investigation and can start a new investigation from the card', () => {
    const props = renderCRMDetail();

    fireEvent.click(screen.getByRole('button', { name: /Dossiê Scheffer/i }));
    fireEvent.click(screen.getByRole('button', { name: /\+ Nova investigação/i }));

    expect(props.onSelectSession).toHaveBeenCalledWith('session-1');
    expect(props.onCreateSessionFromCard).toHaveBeenCalledTimes(1);
  });

  it('handles missing CNPJ and linked sessions with the empty-state controls', () => {
    render(
      <CRMDetail
        card={buildCard({ cnpj: null, cnpjs: undefined, linkedSessionIds: [], exactLink: undefined, attachments: [] } as Partial<CRMCard>)}
        sessions={[]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        onCreateSessionFromCard={vi.fn()}
        isDarkMode={false}
      />,
    );

    expect(screen.getByText(/Nao encontramos CNPJ automaticamente/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Validar CNPJ/i })).toBeInTheDocument();
    expect(screen.getByText(/Nenhum documento anexado nesta etapa ainda/i)).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma sessao vinculada/i)).toBeInTheDocument();
  });

  it('validates manual CNPJ input and persists the returned company name', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ razao_social: 'SCHEFFER & CIA LTDA', nome_fantasia: 'SCHEFFER' }),
    } as Response);

    render(
      <CRMDetail
        card={buildCard({ cnpj: null, cnpjs: undefined } as Partial<CRMCard>)}
        sessions={[]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        onCreateSessionFromCard={vi.fn()}
        isDarkMode={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('00.000.000/0000-00'), {
      target: { value: '04.733.767/0001-80' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Validar CNPJ/i }));

    expect(await screen.findByText(/CNPJ valido/i)).toBeInTheDocument();
    expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({
      cnpj: '04733767000180',
      cnpjs: ['04733767000180'],
      companyName: 'SCHEFFER & CIA LTDA',
    }));
  });

  it('shows validation feedback for invalid manual CNPJ and invalid ExactSpotter link', () => {
    render(
      <CRMDetail
        card={buildCard({ cnpj: null, cnpjs: undefined, exactLink: undefined } as Partial<CRMCard>)}
        sessions={[]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        onCreateSessionFromCard={vi.fn()}
        isDarkMode={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('00.000.000/0000-00'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Validar CNPJ/i }));
    fireEvent.change(screen.getByPlaceholderText('https://app.exactspotter.com/public/...'), {
      target: { value: 'https://example.com/public/form' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar link/i }));

    expect(screen.getByText(/Informe um CNPJ com 14 digitos/i)).toBeInTheDocument();
    expect(screen.getByText(/Nao parece ser um link valido do ExactSpotter/i)).toBeInTheDocument();
  });

  it('verifies and persists a valid ExactSpotter link', async () => {
    vi.useFakeTimers();
    render(
      <CRMDetail
        card={buildCard({ exactLink: undefined } as Partial<CRMCard>)}
        sessions={[]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        onCreateSessionFromCard={vi.fn()}
        isDarkMode={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('https://app.exactspotter.com/public/...'), {
      target: { value: 'https://app.exactspotter.com/public/scheffer,' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Verificar link/i }));

    await act(async () => {
      vi.advanceTimersByTime(700);
      await Promise.resolve();
    });

    expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({
      exactLink: 'https://app.exactspotter.com/public/scheffer',
    }));
    expect(screen.getByText(/Link verificado/i)).toBeInTheDocument();
  });

  it('persists notes, website, brief text and opens external links', async () => {
    const props = renderCRMDetail();

    fireEvent.change(screen.getByDisplayValue('https://scheffer.agr.br'), { target: { value: 'scheffer.agr.br' } });
    fireEvent.blur(screen.getByDisplayValue('scheffer.agr.br'));
    fireEvent.click(screen.getByRole('button', { name: /Abrir/i }));
    fireEvent.click(screen.getByRole('button', { name: /diagnostico.pdf/i }));
    fireEvent.change(screen.getByDisplayValue('Grupo agroindustrial com operação relevante em MT.'), {
      target: { value: 'Resumo editado.' },
    });
    fireEvent.blur(screen.getByDisplayValue('Resumo editado.'));
    fireEvent.change(screen.getByDisplayValue('Priorizar abordagem consultiva'), {
      target: { value: 'Ligar para decisor financeiro.' },
    });
    fireEvent.blur(screen.getByDisplayValue('Ligar para decisor financeiro.'));
    fireEvent.change(screen.getByDisplayValue('Ficha Spotter inicial'), {
      target: { value: 'Ficha Spotter atualizada.' },
    });
    fireEvent.blur(screen.getByDisplayValue('Ficha Spotter atualizada.'));

    await waitFor(() => {
      expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({ website: 'scheffer.agr.br' }));
      expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({ briefDescription: 'Resumo editado.' }));
      expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({
        stages: expect.objectContaining({
          prospeccao: expect.objectContaining({ crmNotes: 'Ligar para decisor financeiro.' }),
        }),
      }));
      expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({
        stages: expect.objectContaining({
          prospeccao: expect.objectContaining({ technicalNotes: 'Ficha Spotter atualizada.' }),
        }),
      }));
    });
    expect(open).toHaveBeenCalledWith('https://scheffer.agr.br', '_blank');
    expect(open).toHaveBeenCalledWith('https://example.com/diagnostico.pdf', '_blank');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('generates a brief with AI and shows upload errors without breaking the modal', async () => {
    const { container } = renderCRMDetail();

    fireEvent.click(screen.getByRole('button', { name: /Gerar com IA/i }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['conteudo'], 'proposta.pdf', { type: 'application/pdf' })],
      },
    });

    expect(await screen.findByDisplayValue('Resumo gerado pela IA.')).toBeInTheDocument();
    expect(await screen.findByText(/Upload indisponível no momento/i)).toBeInTheDocument();
    expect(sendMessageToGeminiMock).toHaveBeenCalledWith(
      expect.stringContaining('FICHA SPOTTER'),
      [],
      expect.stringContaining('SDR'),
    );
    expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({ briefDescription: 'Resumo gerado pela IA.' }));
  });

  it('derives revenue profile from linked Senior client data when the card has no saved profile', () => {
    render(
      <CRMDetail
        card={buildCard({ revenueProfile: undefined } as Partial<CRMCard>)}
        sessions={[
          buildSession({
            messages: [
              {
                id: 'senior-msg',
                sender: Sender.Bot,
                text: 'Cliente Senior confirmado',
                timestamp: new Date('2026-05-16T11:00:00.000Z'),
                clienteSeniorData: {
                  encontrado: true,
                  familias: ['ERP', 'HCM'],
                  modulosPorFamilia: { ERP: ['Financeiro'], HCM: ['Folha'] },
                  totalModulos: 2,
                },
              },
            ],
          }),
        ]}
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onMoveStage={vi.fn()}
        onCreateSessionFromCard={vi.fn()}
        isDarkMode={false}
      />,
    );

    expect(screen.getByLabelText(/Revenue Intelligence/i)).toBeInTheDocument();
  });

  it('persists field edits and deletes the card through the confirmation action', async () => {
    const props = renderCRMDetail();

    fireEvent.change(screen.getByDisplayValue('Scheffer Agro'), { target: { value: 'Scheffer & Cia' } });
    fireEvent.blur(screen.getByDisplayValue('Scheffer & Cia'));
    fireEvent.click(screen.getByRole('button', { name: /Excluir empresa do CRM/i }));

    await waitFor(() => {
      expect(updateCardMock).toHaveBeenCalledWith(expect.objectContaining({ companyName: 'Scheffer & Cia' }));
      expect(deleteCardMock).toHaveBeenCalledWith('crm-1');
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
