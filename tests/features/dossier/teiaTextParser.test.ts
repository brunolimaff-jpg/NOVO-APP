import { describe, expect, it } from 'vitest';

import { parseNarrativeCnpjTotal, parseTeiaText } from '../../../features/dossier/teiaTextParser';

describe('teiaTextParser', () => {
  it('extrai tabela mestre e vincula empresa ao socio mesmo em secoes separadas', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 00.111.222/0001-81 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
        '',
        '## QSA e Poder Societario',
        '',
        '**Socio 1:** Guilherme M. Scheffer',
        '- **Empresas do Grupo Economico:** Agropecuaria Scheffer Ltda',
      ].join('\n'),
    );

    expect(parsed.warnings).toEqual([]);
    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'Agropecuaria Scheffer Ltda',
        cnpj: '00111222000181',
        partnerName: 'Guilherme M. Scheffer',
        confidence: 'strong',
        evidenceType: 'qsa',
      }),
    ]);
  });

  it('mantem compatibilidade com o label legado de empresas relacionadas', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ | Razao Social | Relacao na Teia | Fonte | Confianca |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 00.111.222/0001-81 | Agropecuaria Scheffer Ltda | Operacional | BrasilAPI | OFICIAL |',
        '',
        '**Socio 1:** Guilherme M. Scheffer',
        '- **Empresas Relacionadas:** Agropecuaria Scheffer Ltda',
      ].join('\n'),
    );

    expect(parsed.companies[0]).toMatchObject({
      name: 'Agropecuaria Scheffer Ltda',
      partnerName: 'Guilherme M. Scheffer',
    });
  });

  it('aceita tabela sem CNPJ confirmado e preserva empresa como inferencia fraca', () => {
    const parsed = parseTeiaText(
      [
        '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
        '|------|--------------|-----------------|-------|-----------|',
        '| CNPJ NAO CONFIRMADO | Scheffer Colombia S.A.S. | Internacional | Fonte pública | INFERIDA |',
      ].join('\n'),
    );

    expect(parsed.companies[0]).toMatchObject({
      name: 'Scheffer Colombia S.A.S.',
      cnpj: null,
      confidence: 'weak',
      evidenceType: 'web',
      rootContext: true,
    });
  });

  it('rejeita CNPJ com digito verificador invalido vindo do texto', () => {
    const parsed = parseTeiaText(
      [
        '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 11.111.111/0001-11 | Empresa Inventada LTDA | Operacional | Fonte pública | PÚBLICA |',
      ].join('\n'),
    );

    expect(parsed.companies).toHaveLength(0);
    expect(parsed.warnings).toEqual(['CNPJ invalido ignorado para "Empresa Inventada LTDA": 11.111.111/0001-11']);
  });

  it('ignora linha textual de outros CNPJs do socio', () => {
    const parsed = parseTeiaText(
      [
        '## Outros CNPJs onde o sócio aparece',
        '',
        '**Sócio 1:** Guilherme M. Scheffer',
        '- **Outros CNPJs:** Fazenda Independente LTDA (12.345.678/0001-95)',
      ].join('\n'),
    );

    expect(parsed.companies).toHaveLength(0);
    expect(parsed.warnings).toContain(
      'Linha textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.',
    );
  });

  it('ignora tabela textual de outros CNPJs por socio', () => {
    const parsed = parseTeiaText(
      [
        '## Outros CNPJs onde o sócio aparece',
        '',
        '| Sócio | CNPJ | Razão Social | Fonte | Confiança |',
        '|-------|------|--------------|-------|-----------|',
        '| Guilherme M. Scheffer | 09.567.366/0001-11 | Agropecuaria Scheffer LTDA | Consulta Sócio | OFICIAL |',
        '| Gislayne Rafaela Scheffer | 21.333.444/0001-19 | Associacao Scheffer de Lazer | Consulta Sócio | PÚBLICA |',
      ].join('\n'),
    );

    expect(parsed.companies).toHaveLength(0);
    expect(parsed.warnings).toContain(
      'Tabela textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.',
    );
  });

  it('nao usa QSA Oficial textual em Outros CNPJs como dado estruturado', () => {
    const parsed = parseTeiaText(
      [
        '## Outros CNPJs onde o sócio aparece',
        '',
        '| Sócio | CNPJ | Razão Social | Fonte | Confiança | Escopo | Uso Comercial |',
        '|-------|------|--------------|-------|-----------|--------|---------------|',
        '| Carolina Scheffer | 09.567.366/0001-11 | Scheffer Bio Insumos Ltda | QSA Oficial | OFICIAL | CNPJ_LATERAL_SOCIO | Validar em reunião; não usar como tese operacional |',
      ].join('\n'),
    );

    expect(parsed.companies).toHaveLength(0);
    expect(parsed.warnings).toContain(
      'Tabela textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.',
    );
  });

  it('nao rebaixa Tabela Mestre confirmada so por ter coluna de socio', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| Sócio | CNPJ | Razão Social | Relação na Teia | Fonte | Confiança | Escopo |',
        '|-------|------|--------------|-----------------|-------|-----------|--------|',
        '| Guilherme M. Scheffer | 00.111.222/0001-81 | Agropecuaria Scheffer Ltda | Empresa do Grupo Econômico | BrasilAPI | OFICIAL | GRUPO_CONFIRMADO |',
      ].join('\n'),
    );

    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'Agropecuaria Scheffer Ltda',
        cnpj: '00111222000181',
        partnerName: 'Guilherme M. Scheffer',
        relationshipScope: 'group_link',
        rootContext: true,
      }),
    ]);
  });

  it('rebaixa linha fora de Outros CNPJs quando a relacao diz que e lateral do socio', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| Sócio | CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
        '|-------|------|--------------|-----------------|-------|-----------|',
        '| Elizeu Scheffer | 09.567.366/0001-11 | E.Z.M.S. Participações Ltda | Outro CNPJ do sócio; grupo não confirmado | QSA Oficial | OFICIAL |',
      ].join('\n'),
    );

    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'E.Z.M.S. Participações Ltda',
        cnpj: '09567366000111',
        partnerName: 'Elizeu Scheffer',
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      }),
    ]);
  });

  it('preserva CNPJ inferido com asterisco como validacao pendente', () => {
    const parsed = parseTeiaText(
      [
        '## Outros CNPJs onde o sócio aparece',
        '',
        '| Sócio | CNPJ | Razão Social | Fonte | Confiança |',
        '|-------|------|--------------|-------|-----------|',
        '| Guilherme Scheffer | 11.222.333/0001-44* | Condomínio Rural X* | Inferida | INFERIDA |',
      ].join('\n'),
    );

    expect(parsed.companies).toHaveLength(0);
    expect(parsed.warnings).toContain(
      'Tabela textual de Outros CNPJs ignorada; CNPJs laterais devem vir da busca estruturada.',
    );
  });

  it('nao para na primeira tabela quando a secao de outros CNPJs vem depois da tabela mestre', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ | Razão Social | Relação na Teia | Fonte | Confiança |',
        '|------|--------------|-----------------|-------|-----------|',
        '| 04.733.767/0001-80 | Scheffer & Cia LTDA | Matriz | BrasilAPI | OFICIAL |',
        '',
        '## Outros CNPJs onde o sócio aparece',
        '',
        '| Sócio | CNPJ | Razão Social | Fonte | Confiança |',
        '|-------|------|--------------|-------|-----------|',
        '| Guilherme M. Scheffer | 09.567.366/0001-11 | Agropecuaria Scheffer LTDA | Consulta Sócio | PÚBLICA |',
      ].join('\n'),
    );

    expect(parsed.companies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cnpj: '04733767000180',
          relationshipScope: 'group_link',
          rootContext: true,
        }),
      ]),
    );
    expect(parsed.companies).toHaveLength(1);
  });

  it('mantem compatibilidade com a coluna legada CNPJ / Tipo', () => {
    const parsed = parseTeiaText(
      [
        '## Tabela Mestre de CNPJs',
        '',
        '| CNPJ / Tipo | Razão Social | Relação na Teia | CNAE Principal | Faturamento Est. |',
        '|-------------|--------------|-----------------|----------------|------------------|',
        '| 04.733.767/0001-80 / Matriz | Scheffer & Cia LTDA | Cabeça do grupo | Cultivo de soja | R$ 1 bi+ |',
      ].join('\n'),
    );

    expect(parsed.warnings).toEqual([]);
    expect(parsed.companies).toEqual([
      expect.objectContaining({
        name: 'Scheffer & Cia LTDA',
        cnpj: '04733767000180',
        relationshipScope: 'group_link',
        rootContext: true,
      }),
    ]);
  });
});

describe('parseNarrativeCnpjTotal', () => {
  it('extrai total da visao geral com fonte documental', () => {
    const text = [
      '**Visao Geral do Grupo Economico Real**',
      '- **Total de CNPJs identificados com fonte:** 38 (incluindo filiais)',
    ].join('\n');
    expect(parseNarrativeCnpjTotal(text)).toBe(38);
  });

  it('extrai total legado "mapeados"', () => {
    expect(parseNarrativeCnpjTotal('* **Total de CNPJs mapeados:** 12')).toBe(12);
  });

  it('retorna null quando nao ha total narrativo', () => {
    expect(parseNarrativeCnpjTotal('## Tabela Mestre de CNPJs')).toBeNull();
  });
});
