import { describe, expect, it } from 'vitest';

import { parseTeiaText } from '../../../features/dossier/teiaTextParser';

describe('teiaTextParser', () => {
  it('extrai tabela mestre e vincula empresa ao socio mesmo em secoes separadas', () => {
    const parsed = parseTeiaText([
      '## Tabela Mestre de CNPJs',
      '',
      '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
      '|------|--------------|-----------------|-------|-----------|',
      '| 00.111.222/0001-33 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
      '',
      '## QSA e Poder Societario',
      '',
      '**Socio 1:** Guilherme M. Scheffer',
      '- **Empresas do Grupo Economico:** Agropecuaria Scheffer Ltda',
    ].join('\n'));

    expect(parsed.warnings).toEqual([]);
    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'Agropecuaria Scheffer Ltda',
        cnpj: '00111222000133',
        partnerName: 'Guilherme M. Scheffer',
        confidence: 'strong',
        evidenceType: 'qsa',
      }),
    ]);
  });

  it('mantem compatibilidade com o label legado de empresas relacionadas', () => {
    const parsed = parseTeiaText([
      '## Tabela Mestre de CNPJs',
      '',
      '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
      '|------|--------------|-----------------|-------|-----------|',
      '| 00.111.222/0001-33 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
      '',
      '**Socio 1:** Guilherme M. Scheffer',
      '- **Empresas Relacionadas:** Agropecuaria Scheffer Ltda',
    ].join('\n'));

    expect(parsed.companies[0]).toMatchObject({
      name: 'Agropecuaria Scheffer Ltda',
      partnerName: 'Guilherme M. Scheffer',
    });
  });

  it('aceita tabela sem CNPJ confirmado e preserva empresa como inferencia fraca', () => {
    const parsed = parseTeiaText([
      '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
      '|------|--------------|-----------------|-------|-----------|',
      '| CNPJ NAO CONFIRMADO | Scheffer Colombia S.A.S. | Internacional | Fonte pública | INFERIDA |',
    ].join('\n'));

    expect(parsed.companies[0]).toMatchObject({
      name: 'Scheffer Colombia S.A.S.',
      cnpj: null,
      confidence: 'weak',
      evidenceType: 'web',
      rootContext: true,
    });
  });

  it('marca outros CNPJs do socio com escopo proprio', () => {
    const parsed = parseTeiaText([
      '## Outros CNPJs onde o sócio aparece',
      '',
      '**Sócio 1:** Guilherme M. Scheffer',
      '- **Outros CNPJs:** Fazenda Independente LTDA (12.345.678/0001-95)',
    ].join('\n'));

    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'Fazenda Independente LTDA',
        cnpj: '12345678000195',
        partnerName: 'Guilherme M. Scheffer',
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      }),
    ]);
  });
});
