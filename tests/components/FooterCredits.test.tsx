import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FooterCredits from '../../components/FooterCredits';
import { SUPPORT_CONTACT_URL, SUPPORT_CONTACT_LABEL } from '../../constants/support';

describe('FooterCredits', () => {
  it('renderiza o micro rodapé com link e ano atual', () => {
    render(<FooterCredits />);

    expect(screen.getByText(/Ajuda e Suporte:/i)).toBeInTheDocument();
    expect(screen.getByText(/Senior Scout 360 © \d{4}/i)).toBeInTheDocument();

    const authorLink = screen.getByRole('link', { name: /bruno\.ferreira/i });
    expect(authorLink).toBeInTheDocument();
    expect(authorLink).toHaveAttribute('href', SUPPORT_CONTACT_URL);
    expect(authorLink).toHaveAttribute('target', '_blank');
    expect(authorLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Verifica que o texto do link corresponde à constante compartilhada
    expect(authorLink.textContent).toBe(SUPPORT_CONTACT_LABEL);
  });
});
