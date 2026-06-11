import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuplicateDossierModal } from '../../components/DuplicateDossierModal';

const existingFixture = {
  id: 'dossier-1',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  createdAt: '2026-05-29T10:00:00Z',
  scoreOportunidade: 75,
  operatorId: 'op-creator',
};

describe('DuplicateDossierModal', () => {
  it('renderiza nome da empresa e score', () => {
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Empresa Teste/)).toBeDefined();
    expect(screen.getByText(/75\/100/)).toBeDefined();
  });

  it('renderiza "data desconhecida" quando createdAt ausente', () => {
    render(
      <DuplicateDossierModal
        existing={{ ...existingFixture, createdAt: '' }}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/data desconhecida/)).toBeDefined();
  });

  it('chama onAccessExisting ao clicar no botão principal', () => {
    const onAccess = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={onAccess}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Acessar Dossiê Existente'));
    expect(onAccess).toHaveBeenCalledOnce();
  });

  it('chama onNewResearch ao clicar em Nova Pesquisa', () => {
    const onNew = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={onNew}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Nova Pesquisa do Zero'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('chama onDismiss ao clicar em Cancelar', () => {
    const onDismiss = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('não renderiza score quando ausente', () => {
    render(
      <DuplicateDossierModal
        existing={{ ...existingFixture, scoreOportunidade: null }}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Score PORTA/)).toBeNull();
  });
});
