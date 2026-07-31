import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuplicateDossierModal } from '../../components/DuplicateDossierModal';
import type { ExistingDossier } from '../../lib/supabase/dossierDuplicate';

const existingFixture: ExistingDossier = {
  id: 'dossier-1',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  createdAt: '2026-05-29T10:00:00Z',
  scoreOportunidade: 75,
  isOwner: false,
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
    fireEvent.click(screen.getByText('Acessar cópia do dossiê existente'));
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

  it('usa texto de proprietário sem revelar identidade de origem', () => {
    render(
      <DuplicateDossierModal
        existing={{ ...existingFixture, isOwner: true }}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('Abrir meu dossiê existente')).toBeDefined();
    expect(screen.queryByText(/op-creator/)).toBeNull();
  });

  it('mostra loading, erro visível e bloqueia ações duplicadas', () => {
    const onAccess = vi.fn();
    const onNewResearch = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={onAccess}
        onNewResearch={onNewResearch}
        onDismiss={onDismiss}
        isLoading
        error="Falha ao abrir"
      />,
    );
    const button = screen.getByText('Abrindo dossiê...') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Falha ao abrir');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Nova Pesquisa do Zero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onAccess).not.toHaveBeenCalled();
    expect(onNewResearch).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('declara type=button nos três botões', () => {
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Acessar cópia do dossiê existente' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Nova Pesquisa do Zero' })).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveAttribute('type', 'button');
  });
});
