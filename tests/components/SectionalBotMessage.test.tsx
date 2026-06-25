import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import SectionalBotMessage from '../../components/SectionalBotMessage';
import { Message, Sender } from '../../types';
import type { AuditableSource } from '../../utils/textCleaners';

vi.mock('../../components/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock('../../components/SmartOptions', () => ({
  default: () => null,
  parseSmartOptions: (text?: string) => ({ cleanText: text || '', options: [] }),
}));

vi.mock('../../features/dossier/SocietaryMap', () => ({
  default: ({
    cnpj,
    empresaAlvo,
    geminiCnpjs,
  }: {
    cnpj?: string | null;
    empresaAlvo?: string | null;
    geminiCnpjs?: Array<{ name: string }>;
  }) => (
    <div data-testid="societary-map">
      {cnpj}::{empresaAlvo}::{geminiCnpjs?.map(company => company.name).join('|') || 'sem-gemini'}
    </div>
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

    render(<SectionalBotMessage message={message} isDarkMode={false} />);

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
      text: ['## Mapas Visuais', '', '### Mapa: Teia societária', '', 'Conteúdo textual da teia.'].join('\n'),
    };

    render(
      <SectionalBotMessage message={message} isDarkMode={false} empresaAlvo="Scheffer & Cia" cnpj="04733767000180" />,
    );

    expect(screen.getByTestId('societary-map')).toHaveTextContent('04733767000180::Scheffer & Cia');
    expect(screen.getByText(/Conteúdo textual da teia/)).toBeInTheDocument();
  });

  it('passa dados da tabela de CNPJs ao mapa mesmo quando a seção do mapa está separada', () => {
    const message: Message = {
      id: 'bot-teia-full-text',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 00.111.222/0001-33 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
        '',
        '## QSA e Poder Societario',
        '',
        '**Socio 1:** Guilherme M. Scheffer',
        '- **Empresas Relacionadas:** Agropecuaria Scheffer Ltda',
        '',
        '## Mapa de poder societario',
        '',
        'Consulte a teia interativa.',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage message={message} isDarkMode={false} empresaAlvo="Scheffer & Cia" cnpj="04733767000180" />,
    );

    expect(screen.getByTestId('societary-map')).toHaveTextContent('Agropecuaria Scheffer Ltda');
  });

  it('remove seções textuais inseguras de CNPJs laterais e alertas societários', () => {
    const message: Message = {
      id: 'bot-teia-cleanup',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '# TEIA SOCIETÁRIA: VISÃO GERAL DO GRUPO',
        '',
        '## Mapa de poder societario',
        '',
        'Consulte a teia interativa.',
        '',
        '- **Outros CNPJs:** Participações em veículos patrimoniais sem confirmação.',
        '',
        '## Outros CNPJs onde o sócio aparece',
        '',
        '| Sócio | CNPJ | Razão Social | Fonte | Confiança |',
        '|-------|------|--------------|-------|-----------|',
        '| Elizeu Scheffer | 00.348.003/0001-10 | Amaggi Exportação e Importação | QSA Oficial | OFICIAL |',
        '',
        '### Alertas de validação societária',
        '',
        '⚠️ Validação CNPJ: 7 de 7 CNPJs citados nao foram confirmados.',
        '',
        '## Sinais úteis',
        '',
        'Conteúdo que deve permanecer.',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage message={message} isDarkMode={false} empresaAlvo="Scheffer & Cia" cnpj="04733767000180" />,
    );

    expect(screen.queryByText(/Amaggi Exportação/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Participações em veículos patrimoniais/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Alertas de validação societária/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Validação CNPJ/)).not.toBeInTheDocument();
    expect(screen.getByText(/Sinais úteis/)).toBeInTheDocument();
    expect(screen.getByText(/Conteúdo que deve permanecer/)).toBeInTheDocument();
  });

  it('renderiza apenas um mapa societário quando visão geral e profundidade citam teia', () => {
    const message: Message = {
      id: 'bot-teia-duplicada',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '# TEIA SOCIETÁRIA: VISÃO GERAL DO GRUPO',
        '',
        'Mapa Interativo: consulte o gráfico interativo SocietaryMap.',
        '',
        '# Teia Societária — Profundidade',
        '',
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 00.111.222/0001-33 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
        '',
        '## QSA e Poder Societario',
        '',
        '**Socio 1:** Guilherme M. Scheffer',
        '- **Empresas Relacionadas:** Agropecuaria Scheffer Ltda',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage message={message} isDarkMode={false} empresaAlvo="Scheffer & Cia" cnpj="04733767000180" />,
    );

    expect(screen.getAllByTestId('societary-map')).toHaveLength(1);
    expect(screen.getByTestId('societary-map')).toHaveTextContent('Agropecuaria Scheffer Ltda');
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

    render(<SectionalBotMessage message={message} sessionId="session-1" userId="operator-1" isDarkMode={false} />);

    expect(screen.getAllByText('Essa parte ajudou?')).toHaveLength(2);
    expect(screen.getByText(/Resumo executivo/)).toBeInTheDocument();
    expect(screen.getByText(/Mapas Visuais/)).toBeInTheDocument();
    expect(screen.getByText(/Próxima ação/)).toBeInTheDocument();
  });

  it('remove bloco mermaid e heading MAPA DE PODER SOCIETÁRIO do MarkdownRenderer na seção teia', () => {
    // O SocietaryMap já renderiza o grafo interativo.
    // O MarkdownRenderer NÃO deve receber o bloco ```mermaid``` nem o heading duplicado.
    // O mock top-level de MarkdownRenderer renderiza o content como texto no DOM,
    // portanto podemos verificar que ```mermaid NÃO aparece no DOM da seção teia.

    const message: Message = {
      id: 'bot-teia-strip',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: [
        '## Mapa de poder societario',
        '',
        'Análise da teia societária da empresa.',
        '',
        '### MAPA DE PODER SOCIETÁRIO',
        '',
        'Este diagrama representa os vínculos societários identificados.',
        '',
        '```mermaid',
        'graph LR',
        '  A["Empresa Raiz"] --> B["Filial 1"]',
        '  A --> C["Filial 2"]',
        '```',
        '',
        '### Detalhes dos sócios',
        '',
        'Guilherme M. Scheffer — participação majoritária.',
      ].join('\n'),
    };

    const { container } = render(
      <SectionalBotMessage message={message} isDarkMode={false} empresaAlvo="Scheffer & Cia" cnpj="04733767000180" />,
    );

    // SocietaryMap deve ter sido renderizado
    expect(screen.getByTestId('societary-map')).toBeInTheDocument();

    // O DOM não deve conter o bloco mermaid raw (stripped antes de chegar ao MarkdownRenderer)
    expect(container.textContent).not.toMatch(/```mermaid/i);
    // O heading duplicado também deve ter sido removido do DOM
    expect(container.textContent).not.toMatch(/MAPA DE PODER SOCIETÁRIO/);
    // Conteúdo legítimo posterior ao heading deve ser preservado
    expect(screen.getByText(/Guilherme M. Scheffer/)).toBeInTheDocument();
  });

  it('não recria referências de sectionSources entre re-renders quando message e auditableSources são estáveis (regressão freeze)', () => {
    // Garante que sectionSourcesMap usa useMemo para evitar novas refs a cada render.
    // Sem esse memoização, React.memo(MarkdownRenderer) falha e o react-markdown
    // re-parseia o markdown completo a cada re-render, congelando a UI.
    const capturedRefs: AuditableSource[][] = [];

    const CapturingMarkdownRenderer = ({
      auditableSources,
    }: {
      content: string;
      auditableSources?: AuditableSource[];
    }) => {
      capturedRefs.push(auditableSources ?? []);
      return <div />;
    };

    vi.doMock('../../components/MarkdownRenderer', () => ({
      default: CapturingMarkdownRenderer,
    }));

    const message: Message = {
      id: 'bot-freeze',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: '## Seção A\nconteudo A\n\n## Seção B\nconteudo B',
    };

    const stableSources: AuditableSource[] = [];

    // Wrapper que força re-render via mudança de estado não relacionada
    const Wrapper = () => {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button onClick={() => setTick(t => t + 1)}>tick {tick}</button>
          <SectionalBotMessage message={message} isDarkMode={false} auditableSources={stableSources} />
        </>
      );
    };

    const { getByRole } = render(<Wrapper />);

    const firstRefs = capturedRefs.slice();

    act(() => {
      getByRole('button').click();
    });

    const secondRefs = capturedRefs.slice(firstRefs.length);

    // As referências do segundo render devem ser idênticas (mesmos objetos) ao primeiro.
    // Se forem diferentes, React.memo não funcionaria e o MarkdownRenderer re-renderizaria.
    expect(secondRefs.length).toBe(firstRefs.length);
    for (let i = 0; i < firstRefs.length; i++) {
      expect(secondRefs[i]).toBe(firstRefs[i]);
    }
  });

  it('reseta isDossierExpanded quando message.id muda (evita vazamento de estado)', () => {
    const dossierWith4Sections = [
      '# Introdução',
      'Conteúdo da introdução.',
      '# Módulo 1: Identidade',
      'Conteúdo do módulo 1.',
      '# Módulo 2: Profundidade',
      'Conteúdo do módulo 2.',
      '# Módulo 3: Operação',
      'Conteúdo do módulo 3.',
    ].join('\n');

    const message1: Message = {
      id: 'bot-dossier-1',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: dossierWith4Sections,
    };

    const { rerender, getByRole, queryByRole } = render(<SectionalBotMessage message={message1} isDarkMode={false} />);

    // 4 seções > threshold 3 → botão de expansão aparece
    expect(getByRole('button', { name: /Ver relatório completo/ })).toBeInTheDocument();

    // Clica para expandir
    act(() => {
      getByRole('button', { name: /Ver relatório completo/ }).click();
    });

    // Após expandir, botão deve desaparecer (todas as seções visíveis)
    expect(queryByRole('button', { name: /Ver relatório completo/ })).not.toBeInTheDocument();

    // Simula troca de mensagem (nova empresa/sessão)
    const message2: Message = {
      id: 'bot-dossier-2',
      sender: Sender.Bot,
      timestamp: new Date(),
      text: dossierWith4Sections,
    };

    rerender(<SectionalBotMessage message={message2} isDarkMode={false} />);

    // Com novo message.id, deve resetar e truncar novamente
    expect(getByRole('button', { name: /Ver relatório completo/ })).toBeInTheDocument();
  });

  it('usa preview leve durante waterfall isThinking sem parsear secoes', () => {
    const longBody = 'Conteúdo parcial do dossiê. '.repeat(120);
    const message: Message = {
      id: 'bot-waterfall-preview',
      sender: Sender.Bot,
      timestamp: new Date(),
      isThinking: true,
      text: `# Perfil Comercial\n\n${longBody}`,
    };

    render(<SectionalBotMessage message={message} isDarkMode={false} />);

    expect(screen.getByTestId('waterfall-thinking-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('societary-map-shell')).not.toBeInTheDocument();
  });

  it('nao monta SocietaryMap enquanto isLoading ou isThinking estiver ativo', () => {
    const message: Message = {
      id: 'bot-teia-preview',
      sender: Sender.Bot,
      timestamp: new Date(),
      isThinking: true,
      text: [
        '## Mapa de poder societario',
        '',
        'Análise da teia societária da empresa com texto suficiente para preview incremental no waterfall.',
      ].join('\n'),
    };

    render(
      <SectionalBotMessage
        message={message}
        isDarkMode={false}
        empresaAlvo="Scheffer & Cia"
        cnpj="04733767000180"
        isLoading={false}
      />,
    );

    expect(screen.queryByTestId('societary-map')).not.toBeInTheDocument();
  });
});
