import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MessageRow from '../../components/MessageRow';
import { Sender, type Message } from '../../types';
import { applyDossierLinkIntegrity } from '../../utils/dossierLinkIntegrity';
import { buildAuditableSources } from '../../utils/textCleaners';

vi.mock('../../utils/linkValidation', () => ({
  fetchLinkStatuses: vi.fn(async () => ({})),
}));

vi.mock('../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue(true),
    render: vi.fn().mockResolvedValue({ svg: '<svg>m</svg>' }),
  },
}));

function makeData(messages: Message[]) {
  return {
    messages,
    isLoading: false,
    isDarkMode: false,
    mode: 'investigacao' as const,
    onFeedback: vi.fn(),
    onSendFeedback: vi.fn(),
    onToggleMessageSources: vi.fn(),
    handleDeleteWithUndo: vi.fn(),
    pendingDeleteId: null,
    hideSuggestionsForMessageId: null,
    setInput: vi.fn(),
    onRegenerateSuggestions: vi.fn(),
    firstBotIndex: 0,
  };
}

describe('MessageRow dossier link integrity', () => {
  it('renderiza dossiê grande com rodapé ## 📚 Fontes sem tela vazia', async () => {
    const body =
      '# DOSSIÊ SCHEFFER\n\n' +
      '[Relatório](https://example.com/a)\n\n'.repeat(400) +
      '\n## 📚 Fontes\n1. Relatório — https://example.com/a\n';

    const pool = [{ title: 'Relatório', url: 'https://example.com/a', verification: 'grounding' as const }];
    const cleaned = applyDossierLinkIntegrity(body, { allowedPool: pool });
    const sources = buildAuditableSources(cleaned, pool);

    const msg: Message = {
      id: 'bot-1',
      sender: Sender.Bot,
      timestamp: new Date('2026-05-26T12:00:00.000Z'),
      text: body,
      groundingSources: pool,
    };

    const { container } = render(<MessageRow index={0} data={makeData([msg])} />);

    await waitFor(
      () => {
        expect(container.textContent).toMatch(/DOSSIÊ SCHEFFER/i);
      },
      { timeout: 5_000 },
    );
    expect(sources.length).toBeGreaterThan(0);
  });

  it('não quebra quando groundingSources não é array (dados legados)', () => {
    const msg = {
      id: 'bot-2',
      sender: Sender.Bot,
      timestamp: new Date('2026-05-26T12:00:00.000Z'),
      text: '## Análise\nConteúdo mínimo',
      groundingSources: { title: 'x', url: 'https://example.com' },
    } as unknown as Message;

    expect(() => render(<MessageRow index={0} data={makeData([msg])} />)).not.toThrow();
    expect(screen.getByText(/Conteúdo mínimo/i)).toBeInTheDocument();
  });
});
