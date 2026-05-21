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

  it('renderiza uma abertura executiva antes dos módulos principais', () => {
    const message: Message = {
      id: 'bot-2',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Brief de Reunião',
        '',
        'Conta já dominada pela Senior com tese prioritária de expansão.',
        '',
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

    expect(screen.getByText(/Brief de Reunião/)).toBeInTheDocument();
    expect(screen.getByText(/Leitura do Caso/)).toBeInTheDocument();
    expect(screen.getByText('Módulo 1')).toBeInTheDocument();
    expect(screen.getByText(/Conta já dominada pela Senior/)).toBeInTheDocument();
  });

  it('destaca mapas visuais e cards de auditoria no novo contrato compacto', () => {
    const message: Message = {
      id: 'bot-3',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Brief de Reunião',
        '',
        '- **Tese da conta:** Conta com massa comercial clara.',
        '',
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
    expect(container.querySelector('[data-section-kind="brief"]')).toBeInTheDocument();
    expect(container.querySelector('[data-section-kind="maps"]')).toBeInTheDocument();
    expect(container.querySelector('[data-section-kind="cards"]')).toBeInTheDocument();
  });
});
