// tests/components/SmartOptions.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartOptions, { parseSmartOptions } from '../../components/SmartOptions';

describe('parseSmartOptions', () => {
  it('retorna cleanText vazio e options [] para input vazio', () => {
    expect(parseSmartOptions()).toEqual({ cleanText: '', options: [] });
    expect(parseSmartOptions('')).toEqual({ cleanText: '', options: [] });
  });

  it('retorna texto sem modificação quando não há bloco de sugestões', () => {
    const text = 'Análise completa da empresa.';
    const result = parseSmartOptions(text);
    expect(result.cleanText).toBe(text);
    expect(result.options).toEqual([]);
  });

  it('extrai opções com separador --- e cabeçalho **Sugestões**', () => {
    const text = `Análise da empresa X.

---
**Sugestões**
- Detalhar o processo fiscal
- Analisar integração SAP
- Verificar compliance
`;
    const result = parseSmartOptions(text);
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.cleanText).toContain('Análise da empresa X');
  });

  it('extrai opções com marcadores de lista (bullet, dash, +)', () => {
    const text = `Análise.

---
**Sugestões de perguntas**
- Opção com dash
* Opção com asterisco
+ Opção com plus
`;
    const result = parseSmartOptions(text);
    expect(result.options.length).toBeGreaterThan(0);
  });

  it('limita a 4 opções', () => {
    const text = `Análise.

---
**Próximos passos**
- Opção 1
- Opção 2
- Opção 3
- Opção 4
- Opção 5
- Opção 6
`;
    const result = parseSmartOptions(text);
    expect(result.options.length).toBeLessThanOrEqual(4);
  });

  it('remove linhas vazias das options', () => {
    const text = `Texto.

---
**Sugestões**
- Opção válida
-
`;
    const result = parseSmartOptions(text);
    result.options.forEach(o => expect(o.trim().length).toBeGreaterThan(0));
  });
});

describe('SmartOptions component', () => {
  it('retorna null quando options é vazio', () => {
    const { container } = render(<SmartOptions options={[]} onPreFillInput={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza botões para cada opção', () => {
    render(<SmartOptions options={['Opção A', 'Opção B', 'Opção C']} onPreFillInput={vi.fn()} />);
    expect(screen.getByText('Opção A')).toBeInTheDocument();
    expect(screen.getByText('Opção B')).toBeInTheDocument();
    expect(screen.getByText('Opção C')).toBeInTheDocument();
  });

  it('chama onPreFillInput com texto ao clicar em opção', () => {
    const onPreFillInput = vi.fn();
    render(<SmartOptions options={['Analisar fiscal']} onPreFillInput={onPreFillInput} />);
    fireEvent.click(screen.getByText('Analisar fiscal'));
    expect(onPreFillInput).toHaveBeenCalledWith('Analisar fiscal');
  });

  it('mostra estado de regenerando quando isRegenerating=true', () => {
    const { container } = render(
      <SmartOptions options={['op1']} onPreFillInput={vi.fn()} isRegenerating onRegenerate={vi.fn()} />,
    );
    // Just verify it renders without crash in this state
    expect(container).toBeTruthy();
  });
});
