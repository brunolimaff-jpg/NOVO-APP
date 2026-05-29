import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WarRoom from '../../components/WarRoom';
import type { WarRoomMode, WarRoomResult } from '../../services/warRoomService';

const { fetchLinkStatusesMock, queryWarRoomMock } = vi.hoisted(() => ({
  fetchLinkStatusesMock: vi.fn(),
  queryWarRoomMock: vi.fn(),
}));

vi.mock('../../services/warRoomService', async () => {
  const actual = await vi.importActual<typeof import('../../services/warRoomService')>('../../services/warRoomService');
  return {
    ...actual,
    queryWarRoom: queryWarRoomMock,
  };
});

vi.mock('../../utils/linkValidation', async () => {
  const actual = await vi.importActual<typeof import('../../utils/linkValidation')>('../../utils/linkValidation');
  return {
    ...actual,
    fetchLinkStatuses: fetchLinkStatusesMock,
  };
});

vi.mock('../../components/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div data-testid="markdown-output">{content}</div>,
}));

function buildResult(overrides: Partial<WarRoomResult> = {}): WarRoomResult {
  return {
    text: 'Resposta técnica com evidência da documentação Senior.',
    sources: [],
    ...overrides,
  };
}

function renderWarRoom(overrides: Partial<React.ComponentProps<typeof WarRoom>> = {}) {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    isDarkMode: false,
    defaultCompetitorTarget: 'TOTVS',
    ...overrides,
  };

  render(<WarRoom {...props} />);

  return props;
}

async function submitQuestion(text: string) {
  const input = screen.getByPlaceholderText(/Pergunte sobre produto/i);
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });
}

describe('WarRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    queryWarRoomMock.mockResolvedValue(buildResult());
    fetchLinkStatusesMock.mockResolvedValue({});
  });

  it('does not render when closed and renders the command shell when open', () => {
    const { rerender } = render(<WarRoom isOpen={false} onClose={vi.fn()} isDarkMode={false} />);

    expect(screen.queryByText(/The War Room/i)).not.toBeInTheDocument();

    rerender(<WarRoom isOpen onClose={vi.fn()} isDarkMode={false} />);

    expect(screen.getAllByText(/The War Room/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Faça perguntas técnicas ou comparativas/i)).toBeInTheDocument();
  });

  it('submits a technical question and sends history, status callback and abort options to the orchestrator', async () => {
    renderWarRoom();

    await submitQuestion('Como funciona o processo de compras no ERP Senior?');

    await waitFor(() => {
      expect(queryWarRoomMock).toHaveBeenCalledWith(
        'tech',
        'Como funciona o processo de compras no ERP Senior?',
        [],
        '',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 90000 }),
      );
    });
    expect(await screen.findByTestId('markdown-output')).toHaveTextContent(/Resposta técnica/i);
    expect(screen.getByText(/1 consulta/i)).toBeInTheDocument();
  });

  it('cancels an in-flight query through the stop button', async () => {
    let capturedSignal: AbortSignal | undefined;
    queryWarRoomMock.mockImplementation(
      (
        _mode: WarRoomMode,
        _message: string,
        _history: unknown[],
        _target: string,
        _onStatus: unknown,
        options: { signal: AbortSignal },
      ) => {
        capturedSignal = options.signal;
        return new Promise(() => undefined);
      },
    );

    renderWarRoom();
    await submitQuestion('Explique integração bancária.');

    await waitFor(() => expect(capturedSignal).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Parar/i }));

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('displays grounding sources returned by the War Room service', async () => {
    fetchLinkStatusesMock.mockResolvedValue({
      'https://docs.senior.com.br/erp': { status: 'valid' },
    });
    queryWarRoomMock.mockResolvedValue(
      buildResult({
        text: 'Use o fluxo oficial de compras. [1]',
        sources: [{ title: 'Documentação ERP Senior', url: 'https://docs.senior.com.br/erp' }],
      }),
    );

    renderWarRoom();
    await submitQuestion('Qual o fluxo de compras?');

    expect(await screen.findByText('Documentação ERP Senior')).toBeInTheDocument();
    expect(screen.getByText(/Fontes/i)).toBeInTheDocument();
  });

  it('routes comparison prompts to benchmark mode with the default competitor target', async () => {
    renderWarRoom({ defaultCompetitorTarget: 'SAP' });

    await submitQuestion('Compare Senior x SAP para folha no agronegócio.');

    await waitFor(() => {
      expect(queryWarRoomMock).toHaveBeenCalledWith(
        'benchmark',
        'Compare Senior x SAP para folha no agronegócio.',
        [],
        'SAP',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 120000 }),
      );
    });
    expect(screen.getByText(/Rota atual: Benchmark Tático/i)).toBeInTheDocument();
  });

  it('shows retry affordance and technical details when the orchestrator returns an error result', async () => {
    queryWarRoomMock.mockResolvedValue(
      buildResult({
        text: 'O serviço do War Room está instável.',
        sources: [],
        isError: true,
        retryable: true,
        technicalDetails: 'HTTP 503 from upstream',
      }),
    );

    renderWarRoom();
    await submitQuestion('Como funciona fiscal?');

    fireEvent.click(await screen.findByRole('button', { name: /Ver detalhes/i }));

    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
    expect(screen.getByText(/HTTP 503 from upstream/i)).toBeInTheDocument();
  });
});
