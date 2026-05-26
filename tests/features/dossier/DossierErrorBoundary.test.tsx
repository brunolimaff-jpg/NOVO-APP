import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DossierErrorBoundary from '../../../features/dossier/DossierErrorBoundary';

function Boom(): React.ReactNode {
  throw new Error('dossier exploded');
}

describe('DossierErrorBoundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('captures dossier crashes and keeps the surrounding shell interactive', () => {
    render(
      <div>
        <button type="button">chat-still-open</button>
        <DossierErrorBoundary isDarkMode={false}>
          <Boom />
        </DossierErrorBoundary>
      </div>,
    );

    expect(screen.getByTestId('dossier-error-boundary')).toBeInTheDocument();
    expect(screen.getByText(/Nao foi possivel renderizar este bloco do dossier/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chat-still-open' })).toBeInTheDocument();
  });

  it('mostra mensagem de nova versão quando o lazy chunk falha após deploy', () => {
    function ChunkBoom(): React.ReactNode {
      throw new Error('Failed to fetch dynamically imported module: https://example.com/assets/LoadingSmart.js');
    }

    render(
      <DossierErrorBoundary isDarkMode={false}>
        <ChunkBoom />
      </DossierErrorBoundary>,
    );

    expect(screen.getByText(/Nova versão publicada/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recarregar app/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentar novamente/i })).not.toBeInTheDocument();
  });
});
