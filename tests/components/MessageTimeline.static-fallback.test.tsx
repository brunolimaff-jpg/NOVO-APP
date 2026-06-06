import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MessageTimeline from '../../components/chat/MessageTimeline';
import type { Message } from '../../types';
import { Sender } from '../../types';

const FIXTURE = readFileSync(resolve(__dirname, '../fixtures/scheffer-healthy-markdown.md'), 'utf-8');

vi.mock('../../components/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div>{content.slice(0, 100)}</div>,
}));
vi.mock('../../components/SmartOptions', () => ({
  default: () => null,
  parseSmartOptions: () => ({ cleanText: '', options: [] }),
}));
vi.mock('../../features/dossier/SocietaryMap', () => ({ default: () => null }));
vi.mock('../../components/FeedbackSection', () => ({ default: () => null }));
vi.mock('../../components/GreetingWelcomeScreen', () => ({ default: () => null }));
vi.mock('../../components/EmptyStateHome', () => ({ default: () => null }));
vi.mock('../../components/HelpCenterFloating', () => ({ default: () => null }));
vi.mock('../../components/chat/MessageRow', () => ({
  default: ({ data }: any) => (
    <div data-testid="message-row">
      {data.message?.sender}: {String(data.message?.text).slice(0, 60)}
    </div>
  ),
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: () => <div>Virtuoso</div>,
}));

function messages(): Message[] {
  return [
    { id: 'u1', sender: Sender.User, text: 'Dossiê Scheffer', timestamp: new Date() },
    { id: 'b1', sender: Sender.Bot, text: FIXTURE, timestamp: new Date() },
  ];
}

const baseProps = {
  messages: messages(),
  isLoading: false,
  hasMore: false,
  isDarkMode: false,
  mode: 'standard' as any,
  showOperatorGate: false,
  showInitialHome: false,
  shouldSuspendVirtualizedList: false,
  onConfirmOperatorName: vi.fn(),
  onStartInvestigation: vi.fn(),
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
  onDeleteMessage: vi.fn(),
  onReportError: vi.fn(),
  onFeedback: vi.fn(),
  onSendFeedback: vi.fn(),
  onToggleMessageSources: vi.fn(),
  onDeepDive: vi.fn(),
  onRegenerateSuggestions: vi.fn(),
  onPrefillComposer: vi.fn(),
  onOpenRadarPanel: vi.fn(),
  onSendMessage: vi.fn(),
  canDeepDive: false,
  theme: {} as any,
};

describe('Static Fallback — flex-1 min-h-0 w-full', () => {
  it('container NÃO tem absolute nem inset-0', () => {
    const { container } = render(
      <MessageTimeline currentSession={null} {...baseProps} forceStaticTimelineFallback={true} />,
    );
    const el = container.querySelector('[data-testid="messages-static-fallback"]');
    expect(el).not.toBeNull();
    expect(el!.className).not.toContain('absolute');
    expect(el!.className).not.toContain('inset-0');
  });

  it('container TEM flex-1 min-h-0 w-full', () => {
    const { container } = render(
      <MessageTimeline currentSession={null} {...baseProps} forceStaticTimelineFallback={true} />,
    );
    const el = container.querySelector('[data-testid="messages-static-fallback"]');
    expect(el!.className).toContain('flex-1');
    expect(el!.className).toContain('min-h-0');
    expect(el!.className).toContain('w-full');
    expect(el!.className).toContain('overflow-y-auto');
  });

  it('5 execuções consecutivas sem falha', () => {
    for (let i = 0; i < 5; i++) {
      const { container } = render(
        <MessageTimeline currentSession={null} {...baseProps} forceStaticTimelineFallback={true} />,
      );
      const el = container.querySelector('[data-testid="messages-static-fallback"]');
      expect(el).not.toBeNull();
      expect(el!.className).toContain('flex-1');
    }
  });

  it('Virtuoso tem mesmo contrato de classes', () => {
    const { container } = render(
      <MessageTimeline currentSession={null} {...baseProps} forceStaticTimelineFallback={false} />,
    );
    const el = container.querySelector('[data-scout-virtuoso="timeline"]');
    expect(el).not.toBeNull();
    expect(el!.className).toContain('flex-1');
    expect(el!.className).toContain('min-h-0');
    expect(el!.className).toContain('w-full');
  });

  it('alternância Virtuoso ↔ static fallback não quebra (10 ciclos)', () => {
    for (let i = 0; i < 10; i++) {
      const useStatic = i % 2 === 0;
      const { container, unmount } = render(
        <MessageTimeline currentSession={null} {...baseProps} forceStaticTimelineFallback={useStatic} />,
      );
      if (useStatic) {
        const el = container.querySelector('[data-testid="messages-static-fallback"]');
        expect(el).not.toBeNull();
        expect(el!.className).toContain('flex-1');
      } else {
        const el = container.querySelector('[data-scout-virtuoso="timeline"]');
        expect(el).not.toBeNull();
        expect(el!.className).toContain('flex-1');
      }
      unmount();
    }
  });
});
