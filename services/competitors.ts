// data/competitors.ts
// Registro estruturado de concorrentes — NÃO guarda dados de mercado fixos.
// Guarda os PONTEIROS (URLs, queries) para o competitorService buscar dinamicamente.

export type NivelAmeaca = 'alto' | 'medio' | 'baixo';
export type TierERP = 1 | 2 | 3;

export interface Revendedora {
  nome: string;
  regioes: string[]; // ex: ['MT', 'GO', 'MS']
  cidades_chave: string[]; // ex: ['Cuiabá', 'Campo Grande']
  especialidade: string[]; // ex: ['agro', 'sucroenergetico', 'cooperativas']
  site?: string;
  linkedin?: string;
  observacoes?: string;
}

export interface Concorrente {
  id: string;
  nome: string; // 'TOTVS Protheus'
  fabricante: string; // 'TOTVS S.A.'
  tier: TierERP; // 1=enterprise, 2=mid, 3=regional
  segmentos: string[]; // ['agro', 'industria', 'servicos']
  sites: {
    oficial: string;
    documentacao?: string;
    changelog?: string;
    parceiros?: string;
    precos?: string;
    blog?: string;
    reclameAqui?: string;
    capterra?: string;
    g2?: string;
    appStoreBusca?: string; // termo de busca na App Store
    playStoreBusca?: string; // termo de busca na Play Store
  };
  linkedin?: string;
  revendas: Revendedora[];
  notas_internas?: string; // contexto estratégico para os prompts
}

// ===================================================================
// REGISTRO COMPLETO DE CONCORRENTES
// ===================================================================
export const CONCORRENTES: Concorrente[] = [
  // ---------------------------------------------------------------
  // TIER 1 — ENTERPRISE
  // ---------------------------------------------------------------
  {
    id: 'sap_s4',
    nome: 'SAP S/4HANA',
    fabricante: 'SAP SE',
    tier: 1,
    segmentos: ['agro', 'industria', 'energia', 'grandes-corporacoes'],
    sites: {
      oficial: 'https://www.sap.com/brazil/products/erp/s4hana-erp.html',
      documentacao: 'https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE',
      changelog: 'https://help.sap.com/whats-new/cf0cb2cb149647329b5d02aa96303f56',
      parceiros: 'https://partnerfinder.sap.com/',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/sap/',
      capterra: 'https://www.capterra.com.br/software/1013/sap-s-4hana',
      g2: 'https://www.g2.com/products/sap-s-4hana/reviews',
      playStoreBusca: 'SAP S/4HANA',
      appStoreBusca: 'SAP S4HANA',
    },
    linkedin: 'https://www.linkedin.com/company/sap/',
    revendas: [
      {
        nome: 'FH',
        regioes: ['SP', 'RJ', 'MG', 'PR'],
        cidades_chave: ['São Paulo', 'Curitiba'],
        especialidade: ['enterprise', 'manufatura', 's4hana'],
        site: 'https://www.fhgroup.com.br',
        linkedin: 'https://www.linkedin.com/company/fh-group/',
      },
      {
        nome: 'Liberali',
        regioes: ['MT', 'GO', 'MS', 'PA', 'MA'],
        cidades_chave: ['Cuiabá', 'Goiânia'],
        especialidade: ['agro', 'produtor-rural', 'sap-b1'],
        site: 'https://www.liberali.com.br',
        linkedin: 'https://www.linkedin.com/company/liberali/',
        observacoes: 'CONCORRENTE DIRETO DA GATEC. Produto Farm4all sobre SAP B1. Sede em Cuiabá-MT.',
      },
      {
        nome: 'Agrotis',
        regioes: ['PR', 'SC', 'RS', 'MT', 'GO'],
        cidades_chave: ['Curitiba', 'Londrina'],
        especialidade: ['agro', 'cooperativas', 'sementes', 'receituario'],
        site: 'https://www.agrotis.com',
        linkedin: 'https://www.linkedin.com/company/agrotis/',
        observacoes: 'Forte no Sul. 2.000+ clientes agro. Concorrente do GAtec SimpleFarm.',
      },
      {
        nome: 'NTT Data',
        regioes: ['SP', 'RJ', 'MG'],
        cidades_chave: ['São Paulo'],
        especialidade: ['manufatura', 'enterprise', 'sap'],
        site: 'https://br.nttdata.com',
        linkedin: 'https://www.linkedin.com/company/ntt-data/',
      },
      {
        nome: 'SEIDOR',
        regioes: ['SP', 'RJ', 'SC'],
        cidades_chave: ['São Paulo', 'Florianópolis'],
        especialidade: ['sap-b1', 'mid-market', 'agro'],
        site: 'https://www.seidor.com/pt-br',
        linkedin: 'https://www.linkedin.com/company/seidor/',
      },
    ],
    notas_internas:
      'Tier enterprise. Custo muito alto (R$1M-10M+). Implementação 1-3 anos. Estouro de orçamento comum. Senior vence em custo, velocidade e suporte local.',
  },

  {
    id: 'sap_b1',
    nome: 'SAP Business One',
    fabricante: 'SAP SE',
    tier: 1,
    segmentos: ['agro', 'mid-market', 'pme-grande'],
    sites: {
      oficial: 'https://www.sap.com/brazil/products/erp/business-one.html',
      documentacao: 'https://help.sap.com/docs/SAP_BUSINESS_ONE',
      changelog: 'https://help.sap.com/docs/SAP_BUSINESS_ONE/68a2e87fb29941b5bf959a184d9c6727/b1_release_notes.html',
      parceiros: 'https://partnerfinder.sap.com/',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/sap/',
      capterra: 'https://www.capterra.com.br/software/6020/sap-business-one',
      g2: 'https://www.g2.com/products/sap-business-one/reviews',
      playStoreBusca: 'SAP Business One',
      appStoreBusca: 'SAP Business One',
    },
    linkedin: 'https://www.linkedin.com/company/sap/',
    revendas: [
      {
        nome: 'Liberali',
        regioes: ['MT', 'GO', 'MS', 'PA', 'MA'],
        cidades_chave: ['Cuiabá', 'Goiânia'],
        especialidade: ['agro', 'produtor-rural', 'farm4all'],
        site: 'https://www.liberali.com.br',
        observacoes: 'Principal revenda SAP B1 no Centro-Oeste agro. Produto Farm4all. CONCORRENTE DIRETO.',
      },
      {
        nome: 'Agrotis',
        regioes: ['PR', 'SC', 'RS', 'SP'],
        cidades_chave: ['Curitiba'],
        especialidade: ['agro', 'cooperativas', 'sementes'],
        site: 'https://www.agrotis.com',
      },
      {
        nome: 'Ramo Soluções',
        regioes: ['SP', 'GO', 'MT', 'MS'],
        cidades_chave: ['São Paulo', 'Goiânia'],
        especialidade: ['mid-market', 'agro', 'industria'],
        site: 'https://www.ramosistemas.com.br',
        linkedin: 'https://www.linkedin.com/company/ramo-solucoes/',
      },
    ],
    notas_internas:
      'Mid-market. R$9.900+/mês para 15 usuários. Muito dependente do parceiro — a qualidade varia muito por revenda. Senior vence em módulos incluídos e suporte direto.',
  },

  {
    id: 'totvs_protheus',
    nome: 'TOTVS Protheus',
    fabricante: 'TOTVS S.A.',
    tier: 1,
    segmentos: ['agro', 'industria', 'servicos', 'varejo', 'todos'],
    sites: {
      oficial: 'https://www.totvs.com/erp/protheus/',
      documentacao: 'https://centraldeatendimento.totvs.com/',
      changelog: 'https://tdn.totvs.com/display/PROT/TOTVS+Protheus+%7C+Release+Notes',
      parceiros: 'https://ecossistema.totvs.com/',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/totvs/',
      capterra: 'https://www.capterra.com.br/software/71965/totvs-protheus',
      g2: 'https://www.g2.com/products/totvs-protheus/reviews',
      playStoreBusca: 'TOTVS',
      appStoreBusca: 'TOTVS',
    },
    linkedin: 'https://www.linkedin.com/company/totvs/',
    revendas: [
      {
        nome: 'TOTVS Oeste',
        regioes: ['MT', 'MS', 'GO', 'TO'],
        cidades_chave: ['Cuiabá', 'Campo Grande', 'Goiânia'],
        especialidade: ['agro', 'industria', 'servicos'],
        site: 'https://www.totvs.com/unidades/',
        observacoes: 'Maior unidade regional TOTVS. PRINCIPAL CONCORRENTE em MT/MS/GO. R$7M+ investidos em nova sede.',
      },
      {
        nome: 'TOTVS Centro Norte',
        regioes: ['DF', 'GO', 'MG'],
        cidades_chave: ['Brasília', 'Goiânia', 'Belo Horizonte'],
        especialidade: ['servicos', 'governo', 'agro'],
        site: 'https://www.totvs.com/unidades/',
      },
      {
        nome: 'TOTVS Agro',
        regioes: ['SP', 'MT', 'GO', 'MS', 'PR'],
        cidades_chave: ['Piracicaba', 'Ribeirão Preto'],
        especialidade: ['agro', 'cana', 'graos', 'cooperativas', 'usinas'],
        site: 'https://www.totvs.com/segmento/agronegocio/',
        observacoes:
          'Unidade especializada agro da TOTVS. Soluções específicas: TOTVS Agro Colheita, TOTVS Agro Pecuária.',
      },
      {
        nome: 'TOTVS Leste',
        regioes: ['ES', 'BA', 'SE', 'MG'],
        cidades_chave: ['Salvador', 'Vitória', 'Belo Horizonte'],
        especialidade: ['agro', 'industria', 'servicos'],
        site: 'https://www.totvs.com/unidades/',
      },
      {
        nome: 'Máxima Sistemas',
        regioes: ['MT', 'GO', 'MS'],
        cidades_chave: ['Cuiabá', 'Rondonópolis'],
        especialidade: ['distribuicao', 'atacado', 'agro'],
        site: 'https://www.maximasistemas.com.br',
        observacoes: 'Parceiro TOTVS com foco em distribuição/atacado no Centro-Oeste.',
      },
    ],
    notas_internas:
      'Líder de mercado. 60.000+ clientes. 47 das 100 maiores de agro. Fraquezas: lentidão, interface datada, customizações pesadas em AdvPL, atualizações travosas.',
  },

  // ---------------------------------------------------------------
  // TIER 2 — MID-MARKET
  // ---------------------------------------------------------------
  {
    id: 'sankhya',
    nome: 'Sankhya',
    fabricante: 'Sankhya Gestão de Negócios',
    tier: 2,
    segmentos: ['pme', 'industria', 'servicos', 'agro'],
    sites: {
      oficial: 'https://www.sankhya.com.br',
      documentacao: 'https://ajuda.sankhya.com.br/',
      changelog: 'https://ajuda.sankhya.com.br/hc/pt-br/categories/360000180033-Release-Notes',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/sankhya-gestao-de-negocios/',
      capterra: 'https://www.capterra.com.br/software/73975/sankhya',
      g2: 'https://www.g2.com/products/sankhya/reviews',
      playStoreBusca: 'Sankhya ERP',
      appStoreBusca: 'Sankhya',
    },
    linkedin: 'https://www.linkedin.com/company/sankhya/',
    revendas: [
      {
        nome: 'Sankhya MT (Parceiros Locais)',
        regioes: ['MT'],
        cidades_chave: ['Cuiabá', 'Rondonópolis'],
        especialidade: ['pme', 'servicos', 'comercio'],
        observacoes: 'Verificar parceiros Sankhya ativos em MT via site oficial.',
      },
    ],
    notas_internas:
      'SaaS moderno, crescendo no agro. Interface boa. Menos robusto para operações complexas. Senior vence em portfólio completo, GAtec e presença nacional.',
  },

  {
    id: 'chb',
    nome: 'CHB Sistemas',
    fabricante: 'CHB Sistemas',
    tier: 2,
    segmentos: ['agro', 'usinas', 'cana', 'biodiesel', 'sucroenergetico'],
    sites: {
      oficial: 'https://www.chbsistemas.com.br',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/chb-sistemas/',
      playStoreBusca: 'CHB Sistemas',
      appStoreBusca: 'CHB Agro',
    },
    linkedin: 'https://www.linkedin.com/company/chb-sistemas/',
    revendas: [
      {
        nome: 'Direto (SP/MT/GO/MS)',
        regioes: ['SP', 'MT', 'GO', 'MS', 'PR'],
        cidades_chave: ['São Paulo', 'Cuiabá', 'Goiânia'],
        especialidade: ['usinas', 'cana', 'sucroenergetico'],
      },
    ],
    notas_internas:
      '600+ fazendas, 4.500 usuários, 78M ton/ano geridas. BI com 350 indicadores. Só faz agro — não atende gestão corporativa. Senior vence: ERP+GAtec+HCM integrados.',
  },

  {
    id: 'siagri',
    nome: 'SIAGRI',
    fabricante: 'Grupo SIAGRI',
    tier: 2,
    segmentos: ['agro', 'cooperativas', 'tradings', 'cerealistas', 'graos'],
    sites: {
      oficial: 'https://www.siagri.com.br',
      documentacao: 'https://www.siagri.com.br/suporte/',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/siagri/',
      capterra: 'https://www.capterra.com.br/software/siagri',
      playStoreBusca: 'SIAGRI',
      appStoreBusca: 'SIAGRI',
    },
    linkedin: 'https://www.linkedin.com/company/siagri/',
    revendas: [
      {
        nome: 'Direto (GO/MT/MS/MG)',
        regioes: ['GO', 'MT', 'MS', 'MG', 'PR'],
        cidades_chave: ['Goiânia', 'Cuiabá', 'Uberlândia'],
        especialidade: ['cooperativas', 'tradings', 'cerealistas', 'graos'],
        site: 'https://www.siagri.com.br',
        observacoes: 'Forte no Centro-Oeste. Venda predominantemente direta. Verificar parceiros via site.',
      },
    ],
    notas_internas:
      'ERP + agro integrado. Forte em GO/MT. Tecnologia menos atualizada. Sem plataforma de hiperautomação. HCM limitado. Senior vence: modernidade, Flow, HCM, suporte nacional.',
  },

  {
    id: 'benner',
    nome: 'Benner Sistemas',
    fabricante: 'Benner Sistemas',
    tier: 2,
    segmentos: ['servicos', 'construcao', 'industria', 'hcm'],
    sites: {
      oficial: 'https://www.benner.com.br',
      documentacao: 'https://help.benner.com.br',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/benner-sistemas/',
      capterra: 'https://www.capterra.com.br/software/benner',
      g2: 'https://www.g2.com/products/benner/reviews',
      playStoreBusca: 'Benner ERP',
      appStoreBusca: 'Benner',
    },
    linkedin: 'https://www.linkedin.com/company/benner-sistemas/',
    revendas: [
      {
        nome: 'Direto (SC/PR/RS/SP)',
        regioes: ['SC', 'PR', 'RS', 'SP'],
        cidades_chave: ['Blumenau', 'Curitiba', 'São Paulo'],
        especialidade: ['servicos', 'construcao', 'hcm'],
      },
    ],
    notas_internas:
      'PMEs regionais. ERP+HCM. Interface menos moderna. Menor presença em agro. Senior vence: plataforma mais moderna, Senior Flow, GAtec, maior inovação.',
  },

  {
    id: 'lg_sistemas',
    nome: 'LG Sistemas (Lugar de Gente)',
    fabricante: 'LG lugar de gente',
    tier: 2,
    segmentos: ['hcm', 'rh', 'folha', 'ponto'],
    sites: {
      oficial: 'https://www.lugardeGente.com.br',
      documentacao: 'https://suporte.lugardeGente.com.br',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/lg-lugar-de-gente/',
      capterra: 'https://www.capterra.com.br/software/lg-sistemas',
      g2: 'https://www.g2.com/products/lg-lugar-de-gente/reviews',
      playStoreBusca: 'LG Lugar de Gente HCM',
      appStoreBusca: 'LG lugar de gente',
    },
    linkedin: 'https://www.linkedin.com/company/lg-lugar-de-gente/',
    revendas: [
      {
        nome: 'Direto (Nacional)',
        regioes: ['SP', 'RJ', 'MG', 'PR', 'MT'],
        cidades_chave: ['São Paulo', 'Belo Horizonte', 'Curitiba'],
        especialidade: ['hcm', 'folha', 'ponto', 'esocial'],
      },
    ],
    notas_internas:
      'Especialista HCM 100% cloud. Forte em folha e ponto. SÓ faz RH — sem ERP. Senior vence: ERP+HCM integrados, uma plataforma vs duas, dados unificados, custo total menor.',
  },

  // ---------------------------------------------------------------
  // TIER 3 — REGIONAL / NICHO
  // ---------------------------------------------------------------
  {
    id: 'viasoft',
    nome: 'Viasoft (Korp)',
    fabricante: 'Viasoft Informática',
    tier: 3,
    segmentos: ['industria', 'distribuicao', 'cooperativas'],
    sites: {
      oficial: 'https://www.viasoft.com.br',
      documentacao: 'https://suporte.viasoft.com.br',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/viasoft/',
      playStoreBusca: 'Viasoft Korp',
      appStoreBusca: 'Viasoft',
    },
    linkedin: 'https://www.linkedin.com/company/viasoft/',
    revendas: [
      {
        nome: 'Viasoft Sul',
        regioes: ['PR', 'SC', 'RS'],
        cidades_chave: ['Curitiba', 'Florianópolis', 'Porto Alegre'],
        especialidade: ['industria', 'distribuicao', 'cooperativas'],
        site: 'https://www.viasoft.com.br',
      },
    ],
    notas_internas:
      'Forte no Sul. Cooperativas e indústria. Menor presença no Centro-Oeste. Senior vence: mais setores, maior presença nacional, GAtec.',
  },

  {
    id: 'unisystem',
    nome: 'Unisystem / Uniplus',
    fabricante: 'Unisystem',
    tier: 3,
    segmentos: ['agro', 'pme', 'produtor-rural'],
    sites: {
      oficial: 'https://www.unisystem.com.br',
      reclameAqui: 'https://www.reclameaqui.com.br/empresa/unisystem/',
      playStoreBusca: 'Uniplus ERP',
      appStoreBusca: 'Uniplus',
    },
    linkedin: 'https://www.linkedin.com/company/unisystem/',
    revendas: [
      {
        nome: 'Direto (MT/GO)',
        regioes: ['MT', 'GO'],
        cidades_chave: ['Cuiabá', 'Goiânia'],
        especialidade: ['agro', 'pme', 'produtor-pequeno'],
      },
    ],
    notas_internas:
      'Regional. Pequeno produtor rural MT/GO. Menor complexidade. Senior normalmente não compete diretamente — prospect provavelmente fora do ICP ideal.',
  },
];

// ===================================================================
// HELPERS DE ACESSO
// ===================================================================

/** Busca concorrente pelo ID */
export function getConcorrente(id: string): Concorrente | undefined {
  return CONCORRENTES.find(c => c.id === id);
}

/** Lista concorrentes que atuam em determinada região */
export function getConcorrentesPorRegiao(uf: string): Concorrente[] {
  return CONCORRENTES.filter(c => c.revendas.some(r => r.regioes.includes(uf)));
}

/** Lista todas as revendas ativas em um estado */
export function getRevendasPorEstado(uf: string): Array<{ concorrente: string; revenda: Revendedora }> {
  const resultado: Array<{ concorrente: string; revenda: Revendedora }> = [];
  for (const c of CONCORRENTES) {
    for (const r of c.revendas) {
      if (r.regioes.includes(uf)) {
        resultado.push({ concorrente: c.nome, revenda: r });
      }
    }
  }
  return resultado;
}

/** Retorna concorrentes de um segmento específico */
export function getConcorrentesPorSegmento(segmento: string): Concorrente[] {
  return CONCORRENTES.filter(c => c.segmentos.includes(segmento));
}

/** Retorna IDs e nomes para uso em prompts */
export function listarConcorrentesParaPrompt(): string {
  return CONCORRENTES.map(c => `- ${c.nome} (${c.fabricante}) — Tier ${c.tier} — ${c.segmentos.join(', ')}`).join('\n');
}
