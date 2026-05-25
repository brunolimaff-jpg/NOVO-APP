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
          cnpj: '00111222000181',
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
          cnpj: '00.111.222/0001-81',
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

  it('mostra outro CNPJ do socio sem conectar como empresa do grupo', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Fazenda Independente LTDA',
          cnpj: '12.345.678/0001-95',
          partnerName: 'Guilherme M. Scheffer',
          role: 'Cultivo de soja',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          sourceTitle: 'Consulta Sócio',
          snippet: 'Guilherme M. Scheffer consta como sócio administrador.',
          confidence: 'strong',
          evidenceType: 'qsa',
          rootContext: false,
          relationshipScope: 'partner_other_cnpj',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0]).toMatchObject({
      cnpj: '12345678000195',
      relationshipScope: 'partner_other_cnpj',
      rootLinked: false,
      partnerIds: ['guilherme'],
    });
    expect(graph.companies[0].badges).toContain('outro CNPJ do sócio');
    expect(graph.companies[0].badges).toContain('validar grupo');
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Outro CNPJ do sócio');

    const mermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });
    expect(mermaid).toContain('Fazenda Independente LTDA');
    expect(mermaid).toContain('guilherme -- Outro CNPJ do sócio --> company_12345678000195');
    expect(mermaid).not.toContain('Root -- CNPJ relacionado --> company_12345678000195');
  });

  it('rejeita outro CNPJ do socio quando nao ha socio confirmado para conectar', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Fazenda Independente LTDA',
          cnpj: '10.000.000/0001-45',
          partnerName: '',
          sourceTitle: 'Consulta Sócio',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          snippet: 'Bloco sem nome do socio confirmado.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/sem socio confirmado/i);

    const mermaid = buildSocietaryMermaid(graph);
    expect(mermaid).not.toContain('Root -- Empresa no QSA --> company_10000000000145');
    expect(mermaid).not.toContain('Root -- CNPJ relacionado --> company_10000000000145');
  });

  it('renderiza CNPJ hipotetico com borda tracejada e sem aresta da raiz', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Condomínio Rural X*',
          cnpj: null,
          rawCnpjLabel: '11.222.333/0001-44*',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Inferida',
          snippet: 'CNPJ citado sem confirmacao oficial.',
          confidence: 'weak',
          evidenceType: 'web',
          relationshipScope: 'unconfirmed',
          validationStatus: 'pending',
          rootContext: false,
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0]).toMatchObject({
      rawCnpjLabel: '11.222.333/0001-44*',
      relationshipScope: 'unconfirmed',
      validationStatus: 'pending',
      rootLinked: false,
    });
    expect(graph.companies[0].badges).toContain('validar');
    expect(graph.companies[0].badges).not.toContain('oficial');

    const mermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });
    expect(mermaid).toContain('CNPJ 11.222.333/0001-44*');
    expect(mermaid).toContain('Validação pendente');
    expect(mermaid).toContain('class company_condominio_rural_x_br evidence;');
    expect(mermaid).not.toContain('Root -- CNPJ relacionado --> company_condominio_rural_x_br');
    expect(mermaid).not.toContain('Root -- Vínculo ao grupo --> company_condominio_rural_x_br');
  });

  it('rejeita CNPJ com digito verificador invalido antes de renderizar', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Empresa Inventada LTDA',
          cnpj: '11.111.111/0001-11',
          partnerName: 'Guilherme M. Scheffer',
          sourceUrl: 'https://example.com/inventada',
          sourceTitle: 'Fonte pública',
          snippet: 'Guilherme M. Scheffer aparece em texto sem CNPJ valido.',
          confidence: 'strong',
          evidenceType: 'registry',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/CNPJ invalido/i);

    const mermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });
    expect(mermaid).not.toContain('Empresa Inventada LTDA');
    expect(mermaid).not.toContain('11111111000111');
  });

  it('mantem CNPJs distintos do socio quando compartilham radical mas nao sao grupo raiz', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Agropecuaria Scheffer LTDA',
          cnpj: '09.567.366/0001-11',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Consulta Sócio',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          snippet: 'Guilherme M. Scheffer consta como sócio.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
        {
          name: 'Agropecuaria Scheffer Filial LTDA',
          cnpj: '09.567.366/0002-00',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Consulta Sócio',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          snippet: 'Guilherme M. Scheffer consta como sócio.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
      ],
    });

    expect(graph.companies).toHaveLength(2);
    expect(graph.companies.map(company => company.cnpj)).toEqual(['09567366000111', '09567366000200']);
  });

  it('promove CNPJ duplicado para grupo quando evidencia posterior comprova vinculo forte', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Fazenda Independente LTDA',
          cnpj: '12.345.678/0001-95',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Consulta Sócio',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          snippet: 'Guilherme M. Scheffer consta como sócio administrador.',
          confidence: 'medium',
          evidenceType: 'registry',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
        {
          name: 'Fazenda Independente LTDA',
          cnpj: '12.345.678/0001-95',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Fonte oficial do grupo',
          sourceUrl: 'https://example.com/grupo',
          snippet: 'Scheffer & Cia Ltda comprova a Fazenda Independente LTDA como empresa do grupo.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'group_link',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04.733.767/0001-80',
        },
        {
          name: 'Fazenda Independente Filial LTDA',
          cnpj: '12.345.678/0002-76',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Fonte oficial do grupo',
          sourceUrl: 'https://example.com/grupo-filial',
          snippet: 'Scheffer & Cia Ltda comprova filial da Fazenda Independente LTDA como empresa do grupo.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'group_link',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04.733.767/0001-80',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0]).toMatchObject({
      relationshipScope: 'group_link',
      rootContext: true,
      rootLinked: true,
      confidence: 'strong',
      evidenceType: 'qsa',
      branchCount: 2,
      branchCnpjs: ['12345678000195', '12345678000276'],
    });
    expect(graph.companies[0].badges).not.toContain('outro CNPJ do sócio');
  });

  it('rejeita nome de empresa truncado sem identidade real', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Cia Ltda',
          cnpj: '12.345.678/0001-95',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'Consulta Sócio',
          sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
          snippet: 'Texto truncado em Scheffer & Cia Ltda.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'partner_other_cnpj',
          rootContext: false,
        },
      ],
    });

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies[0].reason).toMatch(/nome/i);
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
          evidenceType: 'institutional',
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
        cnpj: '00.111.222/0001-81',
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
    expect(mermaid).toContain('Agropecuária Scheffer LTDA');
    expect(mermaid).toContain('guilherme -- Administra CNPJ --> company_00111222000181');
  });

  it('preserva escopo e confianca de outros CNPJs vindos do Gemini', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [],
    }, [
      {
        name: 'Fazenda Independente LTDA',
        cnpj: '12.345.678/0001-95',
        partnerName: 'Guilherme M. Scheffer',
        sourceTitle: 'Gemini — Outros CNPJs do sócio',
        confidence: 'medium',
        evidenceType: 'registry',
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      },
    ]);

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0]).toMatchObject({
      confidence: 'medium',
      evidenceType: 'registry',
      relationshipScope: 'partner_other_cnpj',
      rootContext: false,
      rootLinked: false,
      partnerIds: ['guilherme'],
    });
    expect(graph.companies[0].badges).not.toContain('oficial');
  });

  it('nao deixa Gemini rebaixar evidencia oficial ja confirmada pela API', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Agropecuaria Scheffer Ltda',
          cnpj: '00.111.222/0001-81',
          partnerName: 'Guilherme M. Scheffer',
          sourceTitle: 'BrasilAPI QSA',
          sourceUrl: 'https://brasilapi.com.br/api/cnpj/v1/00111222000181',
          snippet: 'QSA oficial confirma Guilherme M. Scheffer.',
          confidence: 'strong',
          evidenceType: 'qsa',
          relationshipScope: 'group_link',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    }, [
      {
        name: 'Agropecuaria Scheffer Ltda',
        cnpj: '00.111.222/0001-81',
        partnerName: 'Guilherme M. Scheffer',
        sourceTitle: 'Gemini — Outros CNPJs do sócio',
        confidence: 'medium',
        evidenceType: 'registry',
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      },
    ]);

    expect(graph.companies).toHaveLength(1);
    expect(graph.companies[0]).toMatchObject({
      confidence: 'strong',
      evidenceType: 'qsa',
      relationshipScope: 'group_link',
      rootContext: true,
    });
    expect(graph.companies[0].badges).toContain('oficial');
    expect(graph.companies[0].badges).not.toContain('outro CNPJ do sócio');
  });

  it('rejeita empresas Gemini sem CNPJ valido para nao criar no visual por inferencia textual', () => {
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
        confidence: 'strong',
        evidenceType: 'web',
        rootContext: true,
      },
    ]);

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/CNPJ valido/i);

    const mermaid = buildSocietaryMermaid(graph);
    expect(mermaid).not.toContain('Scheffer Colombia S.A.S.');
  });

  it('mostra tipo Trading por nome ou papel sem depender de flag trade', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Trading LTDA',
          cnpj: '33.003.540/0001-88',
          partnerName: '',
          role: 'Trading e exportacao de commodities',
          sourceUrl: 'https://example.com/scheffer-trading',
          sourceTitle: 'Fonte institucional',
          snippet: 'Scheffer Trading LTDA aparece como empresa do grupo Scheffer.',
          confidence: 'strong',
          evidenceType: 'institutional',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    expect(graph.companies).toHaveLength(1);
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Trading');

    const mermaid = buildSocietaryMermaid(graph);

    expect(mermaid).toContain('Scheffer Trading LTDA');
    expect(mermaid).toContain('CNPJ 33.003.540/0001-88');
    expect(mermaid).toContain('Trading');
    expect(mermaid).toContain('Root -- CNPJ relacionado --> company_33003540000188');
    expect(mermaid).not.toContain('Empresa relacionada');
    expect(mermaid).not.toContain('Comercio exterior');
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
    expect(mermaid).toContain('Administrador Guilherme');
    expect(mermaid).toContain('Empresa internacional');
    expect(mermaid).not.toContain('estimado');
    expect(mermaid).not.toContain('oficial');
    expect(mermaid).toContain('linkStyle 0 stroke:#7c3aed');
    expect(mermaid).toContain('Root -- QSA da matriz --> guilherme');
    expect(mermaid).toContain('guilherme -- Administra CNPJ --> company_scheffer_colombia_s_a_s');
  });

  it('colore arestas por socio para separar conexoes em comum', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Agropecuária Scheffer',
          cnpj: '00111222000181',
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
          cnpj: '00111222000181',
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
    expect(mermaid).toContain('Root -- Empresa no QSA --> company_00111222000181');
    expect(mermaid).toContain('linkStyle 2 stroke:#64748b');
    expect(mermaid).toContain('linkStyle 3 stroke:#7c3aed');
    expect(mermaid).toContain('linkStyle 4 stroke:#0891b2');
  });

  it('filtra a visao de um socio para empresas dele sem misturar raiz ou outros socios', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Trading LTDA',
          cnpj: '33.003.540/0001-88',
          partnerName: 'Guilherme M. Scheffer',
          role: 'Trading',
          sourceUrl: 'https://example.com/trading',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'Scheffer Logística e Administração LTDA',
          cnpj: '10.536.467/0001-04',
          partnerName: 'Carolina M. Scheffer',
          role: 'Holding',
          sourceUrl: 'https://example.com/logistica',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'Empresa Raiz Sem Socio LTDA',
          cnpj: '22.222.222/0001-91',
          partnerName: '',
          role: 'Produção agrícola',
          sourceUrl: 'https://example.com/raiz',
          sourceTitle: 'Fonte societária',
          confidence: 'strong',
          evidenceType: 'registry',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
      ],
    });

    const selectedMermaid = buildSocietaryMermaid(graph, { selectedPartnerId: 'guilherme' });
    expect(selectedMermaid).toContain('Scheffer Trading LTDA');
    expect(selectedMermaid).not.toContain('Scheffer Logística e Administração LTDA');
    expect(selectedMermaid).not.toContain('Empresa Raiz Sem Socio LTDA');

    const allMermaid = buildSocietaryMermaid(graph);
    expect(allMermaid).toContain('Scheffer Trading LTDA');
    expect(allMermaid).toContain('Scheffer Logística e Administração LTDA');
    expect(allMermaid).toContain('Empresa Raiz Sem Socio LTDA');
  });

  it('nao renderiza matriz ou filiais da propria raiz como empresas relacionadas', () => {
    const adminPartners = [
      {
        id: 'gilliard',
        name: 'GILLIARD ANTONIO SCHEFFER',
        role: 'Sócio-Administrador',
        sourceTitle: 'BrasilAPI',
        confidence: 'official' as const,
      },
      {
        id: 'elizeu',
        name: 'ELIZEU ZULMAR MAGGI SCHEFFER',
        role: 'Sócio-Administrador',
        sourceTitle: 'BrasilAPI',
        confidence: 'official' as const,
      },
    ];
    const graph = buildSocietaryGraph({
      root,
      partners: adminPartners,
      companies: [
        {
          name: 'AGROPECUARIA SCHEFFER LTDA',
          cnpj: '04.733.767/0023-96',
          partnerName: 'GILLIARD ANTONIO SCHEFFER',
          sourceUrl: 'https://example.com/filial-sapezal',
          sourceTitle: 'Fonte filial Sapezal',
          confidence: 'strong',
          evidenceType: 'qsa',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'AGROPECUARIA SCHEFFER LTDA',
          cnpj: '04.733.767/0014-03',
          partnerName: 'ELIZEU ZULMAR MAGGI SCHEFFER',
          sourceUrl: 'https://example.com/filial-cuiaba',
          sourceTitle: 'Fonte filial Cuiaba',
          confidence: 'strong',
          evidenceType: 'qsa',
          rootContext: true,
          rootCompanyName: 'Scheffer & Cia Ltda',
          rootCnpj: '04733767000180',
        },
        {
          name: 'AGROPECUARIA SCHEFFER LTDA',
          cnpj: '04.733.767/0001-80',
          partnerName: 'GILLIARD ANTONIO SCHEFFER',
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

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(3);
    expect(graph.rejectedCompanies.every(item => /propria matriz|filial da raiz/i.test(item.reason))).toBe(true);

    const mermaid = buildSocietaryMermaid(graph);

    expect(mermaid).toContain('Root["<b>Scheffer &amp; Cia Ltda</b>');
    expect(mermaid).not.toContain('company_04733767000180');
    expect(mermaid).not.toContain('company_04733767002396');
    expect(mermaid).not.toContain('company_04733767001403');
    expect(mermaid).not.toContain('Agropecuária Scheffer LTDA');
    expect(mermaid).not.toContain('Sapezal');
    expect(mermaid).not.toContain('Cuiabá');
    expect(mermaid).not.toContain('CNPJs do mesmo radical');
    expect(mermaid).not.toContain('Matriz + 2 filiais');
    expect(mermaid).not.toContain('Empresa vinculada no QSA');
    expect(mermaid).not.toContain('AGROPECUARIA SCHEFFER');
    expect(mermaid).not.toContain('04.733.767/0023-96');
    expect(mermaid).not.toContain('04.733.767/0014-03');
  });

  it('rejeita Gemini que tenta recriar a propria raiz como outro CNPJ do socio', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [],
    }, [
      {
        name: 'Scheffer & Cia LTDA',
        cnpj: '04.733.767/0001-80',
        partnerName: 'Guilherme M. Scheffer',
        sourceTitle: 'Gemini — Outros CNPJs do sócio',
        confidence: 'medium',
        evidenceType: 'registry',
        relationshipScope: 'partner_other_cnpj',
        rootContext: false,
      },
    ]);

    expect(graph.companies).toHaveLength(0);
    expect(graph.rejectedCompanies).toHaveLength(1);
    expect(graph.rejectedCompanies[0].reason).toMatch(/propria matriz|filial da raiz/i);
  });

  it('formata CNPJ e descreve tipo de empresa para exibicao', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [
        {
          name: 'Scheffer Participações S/A',
          cnpj: '00111222000181',
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

    expect(formatSocietaryCnpj('00111222000181')).toBe('00.111.222/0001-81');
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Holding');
  });

  it('usa CNAE ou papel principal para classificar empresa raiz sem socios no rótulo', () => {
    const graph = buildSocietaryGraph({
      root,
      partners,
      companies: [],
    }, [
      {
        name: 'Scheffer Logística e Administração LTDA',
        cnpj: '10.536.467/0001-04',
        partnerName: '',
        role: '64.62-0-00 Holdings de instituições não-financeiras',
        sourceTitle: 'Receita Federal',
        confidence: 'strong',
        evidenceType: 'qsa',
        rootContext: true,
      },
    ]);

    expect(graph.companies).toHaveLength(1);
    expect(describeSocietaryCompanyType(graph.companies[0])).toBe('Holding');

    const mermaid = buildSocietaryMermaid(graph);

    expect(mermaid).toContain('Scheffer Logística e Administração LTDA');
    expect(mermaid).toContain('CNPJ 10.536.467/0001-04');
    expect(mermaid).toContain('Holding');
    expect(mermaid).not.toContain('Ligada ao grupo raiz');
    expect(mermaid).not.toContain('Holding / participacoes');
  });
});
