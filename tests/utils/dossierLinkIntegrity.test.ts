import { describe, expect, it } from 'vitest';
import { applyDossierLinkIntegrity, normalizeDoubleBracketCitations } from '../../utils/dossierLinkIntegrity';

describe('dossierLinkIntegrity', () => {
  it('normaliza citacoes [[n]](url) para [n](url)', () => {
    const input = 'Texto [[1]](https://example.com/page) fim.';
    expect(normalizeDoubleBracketCitations(input)).toBe('Texto [1](https://example.com/page) fim.');
  });

  it('remove link fake e mantem texto', () => {
    const input = 'Ver [busca](https://www.google.com/search?q=x) aqui.';
    const out = applyDossierLinkIntegrity(input, { allowedPool: [] });
    expect(out).not.toContain('google.com/search');
    expect(out).toContain('sem fonte URL verificável');
  });

  it('permite apenas URLs do pool quando informado', () => {
    const pool = [{ title: 'Oficial', url: 'https://scheffer.agr.br/quem-somos/' }];
    const input = 'Dado [errado](https://fake.example.com/x) e [[1]](https://scheffer.agr.br/quem-somos/).';
    const out = applyDossierLinkIntegrity(input, { allowedPool: pool });
    expect(out).toContain('[1](https://scheffer.agr.br/quem-somos/)');
    expect(out).not.toContain('fake.example.com');
  });

  it('renumera links na secao Sinais de Urgencia', () => {
    const input = ['## ⏰ Sinais de Urgência', '- Item [a](https://a.com/1) e [b](https://b.com/2)', '## Outra'].join(
      '\n',
    );
    const out = applyDossierLinkIntegrity(input, { allowedPool: [] });
    expect(out).toContain('[1](https://a.com/1)');
    expect(out).toContain('[2](https://b.com/2)');
  });
});
