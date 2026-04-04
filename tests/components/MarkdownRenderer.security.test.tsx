import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockMermaidRender = vi.hoisted(() => vi.fn().mockResolvedValue({ svg: '<svg data-testid="mermaid-svg">test</svg>' }));
const mockMermaidInitialize = vi.hoisted(() => vi.fn());

vi.mock('mermaid', () => ({
  default: {
    initialize: mockMermaidInitialize,
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
  });

  it('normaliza Mermaid com classes inline ::: antes de renderizar', async () => {
    render(<MarkdownRenderer content={'```mermaid\ngraph LR\nA[Campo/Plantio] :::core ==> B[Algodoeira]\n```'} />);

    await waitFor(() => expect(mockMermaidRender).toHaveBeenCalled());
    const lastCall = mockMermaidRender.mock.calls.at(-1);

    expect(lastCall?.[1]).toContain('graph LR');
    expect(lastCall?.[1]).toContain('class A core;');
    expect(lastCall?.[1]).not.toContain(':::core');
  });
});
