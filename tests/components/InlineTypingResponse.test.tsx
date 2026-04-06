import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import InlineTypingResponse from '../../components/InlineTypingResponse';

describe('InlineTypingResponse', () => {
  it('renderiza com atributos de acessibilidade para status inline', () => {
    render(<InlineTypingResponse isDarkMode={false} stage="Cruzando referências de mercado..." />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('mapeia stage para microstatus discreto sem vazar payload cru', () => {
    render(<InlineTypingResponse isDarkMode stage="@PROMPT_INTERNAL_BLOCK" />);
    expect(screen.getByText('Analisando...')).toBeInTheDocument();
  });
});
