import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionalBotMessage from '../../components/SectionalBotMessage';
import { Sender, type Message } from '../../types';

const mockMermaidRender = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">ok</svg>' }),
);
const mockMermaidInitialize = vi.hoisted(() => vi.fn());
const mockMermaidParse = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('mermaid', () => ({
  default: {
    initialize: mockMermaidInitialize,
    parse: mockMermaidParse,
    render: mockMermaidRender,
  },
}));

vi.mock('../../components/SmartOptions', () => ({
  default: () => null,
  parseSmartOptions: (text?: string) => ({ cleanText: text || '', options: [] }),
}));

vi.mock('../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('../../utils/textCleaners', async () => {
  const actual = await vi.importActual<typeof import('../../utils/textCleaners')>('../../utils/textCleaners');
  return {
    ...actual,
    buildAuditableSources: vi.fn(() => []),
    normalizeSourceUrl: vi.fn((url: string) => url),
  };
});

vi.mock('../../utils/linkFixer', () => ({
  fixFakeLinks: vi.fn((t: string) => t),
  rewriteMarkdownLinksToGoogle: vi.fn((t: string) => t),
  autoLinkSeniorTerms: vi.fn((t: string) => t),
  cleanFakeSourcesBlock: vi.fn((t: string) => t),
}));

describe('SectionalBotMessage Mermaid integration', () => {
  it('renders dossier content and Mermaid output without blanking the message body', async () => {
    const message: Message = {
      id: 'bot-mermaid',
      sender: Sender.Bot,
      timestamp: new Date('2026-04-06T18:00:00.000Z'),
      text: [
        '# DOSSIE SCOUT 360: TECH STACK',
        '',
        '## Mapa visual',
        '',
        '```mermaid',
        'graph LR',
        'A[Origem] --> B[ERP]',
        '```',
        '',
        'Conclusao final do modulo.',
      ].join('\n'),
    };

    const { container } = render(<SectionalBotMessage message={message} isDarkMode={false} />);

    await waitFor(() => expect(mockMermaidRender).toHaveBeenCalled());

    expect(container.textContent).toContain('Conclusao final do modulo.');
    expect(screen.getByText(/TECH STACK/i)).toBeInTheDocument();
    expect(screen.getByText(/M.dulo 1/i)).toBeInTheDocument();
    expect(container.querySelector('.mermaid-chart')).not.toBeNull();
    expect(container.querySelector('pre .mermaid-chart')).toBeNull();
  });
});
