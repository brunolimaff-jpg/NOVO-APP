import { describe, expect, it } from 'vitest';

import {
  buildSocietaryGraph,
  buildSocietaryMermaid,
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
    expect(mermaid).toContain('CLASSIFICAÇÃO ESTIMADA');
  });
});
