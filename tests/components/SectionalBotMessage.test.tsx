import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SectionalBotMessage from '../../components/SectionalBotMessage';
import { Message, Sender } from '../../types';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

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
});
