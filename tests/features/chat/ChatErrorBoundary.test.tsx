import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChatErrorBoundary from '../../../features/chat/ChatErrorBoundary';

function Boom(): React.ReactNode {
  throw new Error('chat exploded');
}

describe('ChatErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('captures subtree crashes and keeps sibling UI mounted', () => {
    render(
      <div>
        <span data-testid="outside-shell">outside-shell</span>
        <ChatErrorBoundary isDarkMode>
          <Boom />
        </ChatErrorBoundary>
      </div>,
    );

    expect(screen.getByTestId('chat-error-boundary')).toBeInTheDocument();
    expect(screen.getByText(/O shell do chat falhou/i)).toBeInTheDocument();
    expect(screen.getByTestId('outside-shell')).toBeInTheDocument();
  });
});
