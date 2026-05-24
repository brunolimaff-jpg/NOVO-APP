import { describe, expect, it } from 'vitest';

import {
  buildSocietaryGraph,
  buildSocietaryMermaid,
  describeSocietaryCompanyType,
  formatSocietaryCnpj,
} from '../../../features/dossier/societaryGraph';

describe('societaryGraph', () => {
  const root = {
    cnpj: '04733767000180',
    name: 'Scheffer & Cia Ltda',
  };

  const partners = [
    {
      id: 'guilherme',
      name: 'Guilherme M. Scheffer',
      role: 'Administrador',
      sourceTitle: 'BrasilAPI',
      confidence: 'official' as const,
    },
    {
      id: 'carolina',
      name: 'Carolina M. Scheffer',
      role: 'Sócia',
      sourceTitle: 'BrasilAPI',
      confidence: 'official' as const,
    },
  ];

  it('deduplica empresas por CNPJ e marca empresas em comum', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Agropecuária Scheffer',
          cnpj: '00111222000133',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/agro',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'AGROPECUARIA SCHEFFER LTDA',
          cnpj: '00.111.222/0001-33',
          partnerName: 'Carolina M. Scheffer',
          sourceUrl: 'https://example.com/agro',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0].partnerIds.sort()).toEqual(['carolina', 'guilherme']);
    expect(graph.companies[0].badges).toContain('empresa em comum');
  });

  it('rejeita homonimo fraco sem fonte suficiente', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Serviços Genéricos',
          partnerName: 'Guilherme M. Scheffer',
          confidence: 'weak',
          evidenceType: 'web',
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/homon/i);
  });

  it('rejeita empresa forte sem prova explicita de contexto do grupo', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Serviços Genéricos',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          sourceTitle: 'Fonte societária',
          snippet: 'Guilherme M. Scheffer aparece em cadastro societario sem CNPJ ou empresa raiz.',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/contexto/i);
  });

  it('rejeita metadata de raiz sem rootContext confirmado', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Serviços Genéricos',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/generic',
          sourceTitle: 'Fonte generica',
          snippet: 'Scheffer & Cia Ltda aparece no texto, mas o parser nao confirmou contexto do grupo.',
          confidence: 'strong',
          evidenceType: 'registry',
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/contexto/i);
  });

  it('preserva Scheffer Colombia quando existe evidencia internacional forte', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Colombia S.A.S.',
          country: 'CO',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://www.veritradecorp.com/es/COLOMBIA/importaciones-y-exportaciones-scheffer-colombia-sas/NIT-901352572',
          sourceTitle: 'Veritrade',
          snippet: 'SCHEFFER & CIA LTDA exportou para SCHEFFER COLOMBIA S.A.S.',
          confidence: 'strong',
          evidenceType: 'trade',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0].name).toBe('Scheffer Colombia S.A.S.');
    expect(graph.companies[0].badges).toContain('internacional');
  });

  it('conecta empresas vindas apenas do Gemini ao sócio correspondente', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [],
    }, [
      {
        name: 'Agropecuaria Scheffer Ltda',
        cnpj: '00.111.222/0001-33',
        partnerName: 'Guilherme M. Scheffer',
        sourceTitle: 'Gemini — Tabela Mestre',
        confidence: 'strong',
        evidenceType: 'qsa',
        rootContext: true,
      },
    ]);

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0].partnerIds).toEqual(['guilherme']);

    const mermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });
    expect(mermaid).toContain('Agropecuaria Scheffer Ltda');
    expect(mermaid).toContain('guilherme --> company_00111222000133');
  });

  it('mostra empresas Gemini sem sócio como ligadas à raiz', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [],
    }, [
      {
        name: 'Scheffer Colombia S.A.S.',
        country: 'CO',
        partnerName: '',
        sourceTitle: 'Gemini — Internacional',
        confidence: 'weak',
        evidenceType: 'web',
        rootContext: true,
      },
    ]);

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0].partnerIds).toEqual([]);

    const mermaid = buildSocietaryMermaid(graph);
    expect(mermaid).toContain('Scheffer Colombia S.A.S.');
    expect(mermaid).toContain('Root --> company_scheffer_colombia_s_a_s');
  });

  it('gera Mermaid sempre em LR para o socio selecionado', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Colombia S.A.S.',
          country: 'CO',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/colombia',
          sourceTitle: 'Fonte internacional',
          snippet: 'Operação internacional conectada ao grupo Scheffer.',
          confidence: 'strong',
          evidenceType: 'institutional',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    const mermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });

    expect(mermaid).toMatch(/^graph LR/);
    expect(mermaid).not.toMatch(/graph\s+(TD|TB)/);
    expect(mermaid).toContain('Scheffer Colombia S.A.S.');
    expect(mermaid).toContain('CNPJ 04.733.767/0001-80');
    expect(mermaid).toContain('Guilherme M. Scheffer · Administrador');
    expect(mermaid).toContain('Empresa internacional');
    expect(mermaid).not.toContain('estimado');
    expect(mermaid).not.toContain('oficial');
    expect(mermaid).toContain('linkStyle 0 stroke:#7c3aed');
  });

  it('colore arestas por socio para separar conexoes em comum', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Agropecuária Scheffer',
          cnpj: '00111222000133',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/agro',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'Agropecuária Scheffer',
          cnpj: '00111222000133',
          partnerName: 'Carolina M. Scheffer',
          sourceUrl: 'https://example.com/agro',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    const mermaid = buildSocietaryMermaid(graph);

    expect(mermaid).toContain('linkStyle 0 stroke:#7c3aed');
    expect(mermaid).toContain('linkStyle 1 stroke:#0891b2');
    expect(mermaid).toContain('linkStyle 2 stroke:#7c3aed');
    expect(mermaid).toContain('linkStyle 3 stroke:#0891b2');
  });

  it('consolida filiais no bloco da matriz com contagem de CNPJs', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer & Cia Ltda em Sapezal',
          cnpj: '04.733.767/0023-96',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/filial-sapezal',
          sourceTitle: 'Fonte filial Sapezal',
          confidence: 'strong',
          evidenceType: 'qsa',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'Scheffer & Cia Ltda em Cuiabá',
          cnpj: '04.733.767/0014-03',
          partnerName: 'Carolina M. Scheffer',
          sourceUrl: 'https://example.com/filial-cuiaba',
          sourceTitle: 'Fonte filial Cuiaba',
          confidence: 'strong',
          evidenceType: 'qsa',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'Scheffer & Cia Ltda',
          cnpj: '04.733.767/0001-80',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/matriz',
          sourceTitle: 'Fonte matriz',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0].cnpj).toBe('04733767000180');
    expect(graph.companies[0].branchCount).toBe(3);
    expect(graph.companies[0].partnerIds.sort()).toEqual(['carolina', 'guilherme']);
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Matriz + 2 filiais');

    const mermaid = buildSocietaryMermaid(graph);

    expect(mermaid).toContain('company_04733767000180');
    expect(mermaid).not.toContain('company_04733767002396');
    expect(mermaid).not.toContain('company_04733767001403');
    expect(mermaid).not.toContain('Sapezal');
    expect(mermaid).not.toContain('Cuiabá');
    expect(mermaid).toContain('CNPJs do mesmo radical: 3');
    expect(mermaid).toContain('Matriz + 2 filiais');
    expect(mermaid).not.toContain('Empresa vinculada no QSA');
    expect(mermaid).not.toContain('04.733.767/0023-96');
    expect(mermaid).not.toContain('04.733.767/0014-03');
  });

  it('formata CNPJ e descreve tipo de empresa para exibicao', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Participações S/A',
          cnpj: '00111222000133',
          partnerName: 'Guilherme M. Scheffer',
          role: 'holding',
          sourceUrl: 'https://example.com/holding',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(formatSocietaryCnpj('00111222000133')).toBe('00.111.222/0001-33');
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Holding / participacoes');
  });
});
