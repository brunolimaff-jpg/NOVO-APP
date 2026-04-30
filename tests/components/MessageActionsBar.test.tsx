import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageActionsBar from '../../components/MessageActionsBar';

function renderBar(props: Partial<React.ComponentProps<typeof MessageActionsBar>> = {}) {
  return render(
    <MessageActionsBar
      content="Conteúdo"
      verifiedSourcesCount={0}
      citedLinksCount={0}
      onFeedback={vi.fn()}
      onSubmitFeedback={vi.fn()}
      onToggleSources={vi.fn()}
      isSourcesVisible={false}
      isDarkMode={false}
      {...props}
    />,
  );
}

describe('MessageActionsBar', () => {
  it('mostra fontes verificadas separadas de links citados', () => {
    renderBar({ verifiedSourcesCount: 2, citedLinksCount: 3 });
    expect(screen.getByText('Fontes (2)')).toBeInTheDocument();
    expect(screen.queryByText('Links (3)')).not.toBeInTheDocument();
  });

  it('mostra links citados quando nao ha fontes verificadas', () => {
    renderBar({ verifiedSourcesCount: 0, citedLinksCount: 3 });
    expect(screen.getByText('Links (3)')).toBeInTheDocument();
  });
});
