import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionalBotMessage from '../../components/SectionalBotMessage';
import { Message, Sender } from '../../types';

vi.mock('../../components/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../../components/SmartOptions', () => ({
  default: () => null,
  parseSmartOptions: (text?: string) => ({ cleanText: text || '', options: [] }),
}));

vi.mock('../../features/dossier/SocietaryMap', () => ({
  default: ({ cnpj, empresaAlvo }: { cnpj?: string | null; empresaAlvo?: string | null }) => (
    <div data-testid="societary-map">{cnpj}::{empresaAlvo}</div>
  ),
}));

describe('SectionalBotMessage', () => {
  it('destaca módulos principais quando o dossiê tem múltiplos headers H1', () => {
    const message: Message = {
      id: 'bot-1',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL',
        '',
        '## 🎯 RADAR DE ESTRUTURA',
        'Resumo operacional',
        '',
        '# 🦅 DOSSIÊ SCOUT 360: ARQUITETURA DE TI',
        '',
        '## 🗺️ MAPA DA TORRE DE BABEL',
        'Resumo técnico',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage
        message={message}
        isDarkMode={false}
      />
    );

    expect(screen.getByText('Módulo 1')).toBeInTheDocument();
    expect(screen.getByText('Módulo 2')).toBeInTheDocument();
    expect(screen.getByText(/INTELIGÊNCIA OPERACIONAL/)).toBeInTheDocument();
    expect(screen.getByText(/ARQUITETURA DE TI/)).toBeInTheDocument();
  });

  it('renderiza uma introdução simples antes dos módulos principais', () => {
    const message: Message = {
      id: 'bot-2',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## 🔭 Leitura do Caso',
        '',
        '- **Operação:** Existe gargalo logístico na ponta.',
        '',
        '# 🦅 DOSSIÊ SCOUT 360: INTELIGÊNCIA OPERACIONAL',
        '',
        '## 🎯 RADAR DE ESTRUTURA',
        'Resumo operacional',
      ].join('\n'),
    };

    render(<SectionalBotMessage message={message} isDarkMode={false} />);

    expect(screen.getByText(/Leitura do Caso/)).toBeInTheDocument();
    expect(screen.getByText('Módulo 1')).toBeInTheDocument();
    expect(screen.getByText(/Existe gargalo logístico/)).toBeInTheDocument();
  });

  it('destaca mapas visuais e cards de auditoria no novo contrato compacto', () => {
    const message: Message = {
      id: 'bot-3',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Mapas Visuais',
        '',
        '### Mapa: Teia societária',
        '',
        '```mermaid',
        'graph LR',
        'A["Matriz"] --> B["Filial"]',
        '```',
        '',
        '## Cards de Auditoria',
        '',
        '### Card: Borda logística',
        '- **Fato:** expedição com ponto a validar.',
        '- **Evidência:** CRM interno.',
        '- **Implicação comercial:** abre conversa com Operações.',
        '- **Pergunta de reunião:** Como enxergam pátio hoje?',
        '- **Confiança:** Média.',
      ].join('\n'),
    };

    const { container } = render(<SectionalBotMessage message={message} isDarkMode={false} />);

    expect(screen.getByText(/Mapas Visuais/)).toBeInTheDocument();
    expect(screen.getByText(/Cards de Auditoria/)).toBeInTheDocument();
    expect(screen.getByText(/Borda logística/)).toBeInTheDocument();
    expect(container.querySelector('[data-section-kind="maps"]')).toBeInTheDocument();
    expect(container.querySelector('[data-section-kind="cards"]')).toBeInTheDocument();
  });

  it('renderiza mapa societário Tipo 5 dentro da seção de teia quando há CNPJ', () => {
    const message: Message = {
      id: 'bot-teia',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Mapas Visuais',
        '',
        '### Mapa: Teia societária',
        '',
        'Conteúdo textual da teia.',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage
        message={message}
        isDarkMode={false}
        empresaAlvo="Scheffer & Cia"
        cnpj="04733767000180"
      />,
    );

    expect(screen.getByTestId('societary-map')).toHaveTextContent('04733767000180::Scheffer & Cia');
    expect(screen.getByText(/Conteúdo textual da teia/)).toBeInTheDocument();
  });

  it('mostra feedback apenas em seções relevantes', () => {
    const message: Message = {
      id: 'bot-feedback',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Resumo executivo',
        'Síntese comercial.',
        '',
        '## Mapas Visuais',
        'Mapa sem feedback contextual.',
        '',
        '## Próxima ação',
        'Ligar para operação.',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage
        message={message}
        sessionId="session-1"
        userId="operator-1"
        isDarkMode={false}
      />,
    );

    expect(screen.getAllByText('Essa parte ajudou?')).toHaveLength(2);
    expect(screen.getByText(/Resumo executivo/)).toBeInTheDocument();
    expect(screen.getByText(/Mapas Visuais/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima ação/)).toBeInTheDocument();
  });
});
