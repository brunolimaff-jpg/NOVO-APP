import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const isSupabaseAvailableMock = vi.hoisted(() => vi.fn(() => true));

vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseAvailable: isSupabaseAvailableMock,
}));

import { SyncIndicator } from '../../components/SyncIndicator';

describe('SyncIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isSupabaseAvailableMock.mockReturnValue(true);
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mostra "Conectado" quando online e Supabase disponível', () => {
    render(<SyncIndicator isDarkMode={false} />);
    expect(screen.getByText('Conectado')).toBeInTheDocument();
  });

  it('mostra "Nuvem indisponível" quando Supabase fora do ar', () => {
    isSupabaseAvailableMock.mockReturnValue(false);

    render(<SyncIndicator isDarkMode={false} />);
    expect(screen.getByText('Nuvem indisponível')).toBeInTheDocument();
  });

  it('exibe label a11y com status', () => {
    render(<SyncIndicator isDarkMode={false} />);
    expect(screen.getByLabelText('Nuvem · Conectado')).toBeInTheDocument();
  });
});
