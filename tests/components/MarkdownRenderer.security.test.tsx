import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMermaidRender = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">test</svg>' }),
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

import MarkdownRenderer from '../../components/MarkdownRenderer';

describe('MarkdownRenderer security regressions', () => {
  beforeEach(() => {
    mockMermaidRender.mockClear();
    mockMermaidInitialize.mockClear();
    mockMermaidParse.mockClear();
  });

  it('normalizes Mermaid with inline classes before rendering', async () => {
    const { container } = render(
      <MarkdownRenderer content={'```mermaid\ngraph LR\nA[Campo/Plantio] :::core ==> B[Algodoeira]\n```'} />,
    );

    await waitFor(() => expect(mockMermaidRender).toHaveBeenCalled());
    const lastCall = mockMermaidRender.mock.calls.at(-1);

    expect(lastCall?.[1]).toContain('graph LR');
    expect(lastCall?.[1]).toContain('class A core;');
    expect(lastCall?.[1]).not.toContain(':::core');
    expect(container.querySelector('pre .mermaid-chart')).toBeNull();
    expect(container.querySelector('.mermaid-chart')).not.toBeNull();
  });

  it('degrades invalid Mermaid into visual fallback without console noise', async () => {
    mockMermaidRender.mockRejectedValueOnce(new Error('Parse error on line 2'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<MarkdownRenderer content={'```mermaid\ngraph LR\nA --> B\n```'} />);

    await waitFor(() => {
      expect(
        screen.getAllByText((_content, node) => node?.textContent?.includes('renderizar o diagrama') ?? false).length,
      ).toBeGreaterThan(0);
    });

    expect(screen.getByText(/graph LR/i)).toBeInTheDocument();
    expect(container.querySelector('.mermaid-chart')).toBeNull();
    expect(container.querySelector('pre .mermaid-chart')).toBeNull();
    expect(
      screen
        .getAllByText((_content, node) => node?.textContent?.includes('renderizar o diagrama') ?? false)[0]
        ?.closest('pre'),
    ).toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('degrades Mermaid when the library returns a syntax-error svg without throwing', async () => {
    mockMermaidRender.mockResolvedValueOnce({
      svg: '<svg><text>Syntax error in text</text><text>mermaid version 10.9.5</text></svg>',
    });
    const { container } = render(<MarkdownRenderer content={'```mermaid\ngraph TD\nA --> B\n```'} />);

    await waitFor(() => {
      expect(
        screen.getAllByText((_content, node) => node?.textContent?.includes('renderizar o diagrama') ?? false).length,
      ).toBeGreaterThan(0);
    });

    expect(screen.getByText(/graph TD/i)).toBeInTheDocument();
    expect(container.querySelector('.mermaid-chart')).toBeNull();
    expect(container.querySelector('pre .mermaid-chart')).toBeNull();
    expect(
      screen
        .getAllByText((_content, node) => node?.textContent?.includes('renderizar o diagrama') ?? false)[0]
        ?.closest('pre'),
    ).toBeNull();
  });
});
