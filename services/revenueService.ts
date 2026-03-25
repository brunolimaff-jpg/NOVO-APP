/**
 * Revenue Intelligence Service
 *
 * Estimativa de RR (Receita Recorrente) e NR (Receita Não-Recorrente)
 * com base nas famílias de produto do cliente e porte detectado.
 */

import type {
  RevenueStream,
  CustomerRevenueProfile,
  PorteCliente,
  RevenueStreamType,
} from '../types';

// ===================================================================
// TABELAS DE PREÇO POR FAMÍLIA E PORTE
// ===================================================================

interface FaixaPreco {
  implantacaoMin: number;
  implantacaoMax: number;
  mensalidadeMin: number;
  mensalidadeMax: number;
  label: string;
}

type TabelaFamilia = Record<PorteCliente, FaixaPreco>;

const TABELAS_PRECO: Record<string, TabelaFamilia> = {
  ERP: {
    pequeno: {
      implantacaoMin: 200_000,
      implantacaoMax: 400_000,
      mensalidadeMin: 5_000,
      mensalidadeMax: 15_000,
      label: 'ERP Senior (Sapiens) — Pequeno',
    },
    medio: {
      implantacaoMin: 400_000,
      implantacaoMax: 700_000,
      mensalidadeMin: 15_000,
      mensalidadeMax: 40_000,
      label: 'ERP Senior (Sapiens) — Médio',
    },
    grande: {
      implantacaoMin: 700_000,
      implantacaoMax: 1_200_000,
      mensalidadeMin: 40_000,
      mensalidadeMax: 70_000,
      label: 'ERP Senior (Sapiens) — Grande',
    },
  },
  GATec: {
    pequeno: {
      implantacaoMin: 100_000,
      implantacaoMax: 250_000,
      mensalidadeMin: 5_000,
      mensalidadeMax: 15_000,
      label: 'GATec (Gestão Agrícola) — Pequeno',
    },
    medio: {
      implantacaoMin: 250_000,
      implantacaoMax: 450_000,
      mensalidadeMin: 15_000,
      mensalidadeMax: 35_000,
      label: 'GATec (Gestão Agrícola) — Médio',
    },
    grande: {
      implantacaoMin: 450_000,
      implantacaoMax: 700_000,
      mensalidadeMin: 35_000,
      mensalidadeMax: 60_000,
      label: 'GATec (Gestão Agrícola) — Grande',
    },
  },
  HCM: {
    pequeno: {
      implantacaoMin: 100_000,
      implantacaoMax: 200_000,
      mensalidadeMin: 5_000,
      mensalidadeMax: 15_000,
      label: 'HCM Senior (Gestão de Pessoas) — Pequeno',
    },
    medio: {
      implantacaoMin: 200_000,
      implantacaoMax: 300_000,
      mensalidadeMin: 15_000,
      mensalidadeMax: 30_000,
      label: 'HCM Senior (Gestão de Pessoas) — Médio',
    },
    grande: {
      implantacaoMin: 300_000,
      implantacaoMax: 400_000,
      mensalidadeMin: 30_000,
      mensalidadeMax: 50_000,
      label: 'HCM Senior (Gestão de Pessoas) — Grande',
    },
  },
  Logística: {
    pequeno: {
      implantacaoMin: 80_000,
      implantacaoMax: 180_000,
      mensalidadeMin: 4_000,
      mensalidadeMax: 12_000,
      label: 'Senior Logística — Pequeno',
    },
    medio: {
      implantacaoMin: 180_000,
      implantacaoMax: 350_000,
      mensalidadeMin: 12_000,
      mensalidadeMax: 25_000,
      label: 'Senior Logística — Médio',
    },
    grande: {
      implantacaoMin: 350_000,
      implantacaoMax: 600_000,
      mensalidadeMin: 25_000,
      mensalidadeMax: 45_000,
      label: 'Senior Logística — Grande',
    },
  },
  Plataforma: {
    pequeno: {
      implantacaoMin: 50_000,
      implantacaoMax: 120_000,
      mensalidadeMin: 3_000,
      mensalidadeMax: 8_000,
      label: 'Senior Plataforma / Flow — Pequeno',
    },
    medio: {
      implantacaoMin: 120_000,
      implantacaoMax: 250_000,
      mensalidadeMin: 8_000,
      mensalidadeMax: 18_000,
      label: 'Senior Plataforma / Flow — Médio',
    },
    grande: {
      implantacaoMin: 250_000,
      implantacaoMax: 500_000,
      mensalidadeMin: 18_000,
      mensalidadeMax: 35_000,
      label: 'Senior Plataforma / Flow — Grande',
    },
  },
  Acesso: {
    pequeno: {
      implantacaoMin: 30_000,
      implantacaoMax: 80_000,
      mensalidadeMin: 2_000,
      mensalidadeMax: 6_000,
      label: 'Senior Acesso — Pequeno',
    },
    medio: {
      implantacaoMin: 80_000,
      implantacaoMax: 150_000,
      mensalidadeMin: 6_000,
      mensalidadeMax: 12_000,
      label: 'Senior Acesso — Médio',
    },
    grande: {
      implantacaoMin: 150_000,
      implantacaoMax: 300_000,
      mensalidadeMin: 12_000,
      mensalidadeMax: 25_000,
      label: 'Senior Acesso — Grande',
    },
  },
};

// Prazo padrão de contrato por porte (meses)
const PRAZO_PADRAO: Record<PorteCliente, number> = {
  pequeno: 24,
  medio: 36,
  grande: 48,
};

// ===================================================================
// FUNÇÕES AUXILIARES
// ===================================================================

function midpoint(min: number, max: number): number {
  return Math.round((min + max) / 2);
}

function gerarId(): string {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normaliza o nome da família de produto para corresponder à tabela de preços.
 * Ex: "Acesso" → "Acesso", "GAtec" → "GATec"
 */
export function normalizarFamilia(familia: string): string {
  const mapa: Record<string, string> = {
    gatec: 'GATec',
    'gestão agrícola': 'GATec',
    erp: 'ERP',
    'erp senior': 'ERP',
    sapiens: 'ERP',
    hcm: 'HCM',
    'gestão de pessoas': 'HCM',
    'recursos humanos': 'HCM',
    logística: 'Logística',
    logistica: 'Logística',
    plataforma: 'Plataforma',
    flow: 'Plataforma',
    acesso: 'Acesso',
    hypnobox: 'Hypnobox',
  };
  return mapa[familia.toLowerCase()] ?? familia;
}

// ===================================================================
// FUNÇÕES PRINCIPAIS
// ===================================================================

/**
 * Infere o porte do cliente com base no número de módulos ativos.
 * Pode ser substituído por lógica mais sofisticada (ex: faturamento).
 */
export function inferirPorte(totalModulos: number): PorteCliente {
  if (totalModulos >= 15) return 'grande';
  if (totalModulos >= 7) return 'medio';
  return 'pequeno';
}

/**
 * Cria um RevenueStream de licença/suporte (RR) para uma família.
 */
function criarStreamRR(
  familia: string,
  porte: PorteCliente,
  modulos: string[],
): RevenueStream {
  const familiaNorm = normalizarFamilia(familia);
  const tabela = TABELAS_PRECO[familiaNorm];
  const faixa = tabela?.[porte];

  const mensalidade = faixa ? midpoint(faixa.mensalidadeMin, faixa.mensalidadeMax) : 0;

  return {
    id: gerarId(),
    tipo: 'licenca' as RevenueStreamType,
    familiasProduto: familiaNorm,
    modulo: modulos.length > 0 ? modulos.slice(0, 3).join(', ') : undefined,
    descricao: faixa?.label ?? `${familiaNorm} — licença`,
    valorMensal: mensalidade,
    valorAnual: mensalidade * 12,
    recorrente: true,
    confianca: 'confirmado',
    fonte: 'lookup_senior',
    criadoEm: new Date().toISOString(),
  };
}

/**
 * Cria um RevenueStream de implantação (NR) para uma família.
 */
function criarStreamNR(
  familia: string,
  porte: PorteCliente,
): RevenueStream {
  const familiaNorm = normalizarFamilia(familia);
  const tabela = TABELAS_PRECO[familiaNorm];
  const faixa = tabela?.[porte];

  const implantacao = faixa ? midpoint(faixa.implantacaoMin, faixa.implantacaoMax) : 0;

  return {
    id: gerarId(),
    tipo: 'implantacao' as RevenueStreamType,
    familiasProduto: familiaNorm,
    descricao: `Implantação ${familiaNorm}`,
    custoImplantacao: implantacao,
    recorrente: false,
    confianca: 'estimado',
    fonte: 'lookup_senior',
    criadoEm: new Date().toISOString(),
  };
}

/**
 * Gera streams de oportunidade de expansão (cross-sell) para famílias ausentes.
 */
function criarOportunidadesExpansao(
  familiasPresentes: string[],
  porte: PorteCliente,
): RevenueStream[] {
  const todasFamilias = Object.keys(TABELAS_PRECO);
  const presentesNorm = familiasPresentes.map(normalizarFamilia);

  return todasFamilias
    .filter(f => !presentesNorm.includes(f))
    .map(familia => {
      const faixa = TABELAS_PRECO[familia]?.[porte];
      const mensalidade = faixa ? midpoint(faixa.mensalidadeMin, faixa.mensalidadeMax) : 0;

      return {
        id: gerarId(),
        tipo: 'licenca' as RevenueStreamType,
        familiasProduto: familia,
        descricao: faixa?.label ?? `${familia} — potencial`,
        valorMensal: mensalidade,
        valorAnual: mensalidade * 12,
        custoImplantacao: faixa
          ? midpoint(faixa.implantacaoMin, faixa.implantacaoMax)
          : 0,
        recorrente: true,
        confianca: 'potencial',
        fonte: 'gap_analysis',
        criadoEm: new Date().toISOString(),
      };
    });
}

/**
 * Constrói o CustomerRevenueProfile a partir dos dados do lookup Senior.
 */
export function buildRevenueProfile(params: {
  cardId: string;
  familias: string[];
  modulosPorFamilia: Record<string, string[]>;
  totalModulos: number;
}): CustomerRevenueProfile {
  const { cardId, familias, modulosPorFamilia, totalModulos } = params;

  const porte = inferirPorte(totalModulos);
  const prazo = PRAZO_PADRAO[porte];

  const streamsAtivos: RevenueStream[] = [];

  for (const familia of familias) {
    const modulos = modulosPorFamilia[familia] ?? [];
    streamsAtivos.push(criarStreamRR(familia, porte, modulos));
    streamsAtivos.push(criarStreamNR(familia, porte));
  }

  const oportunidadesExpansao = criarOportunidadesExpansao(familias, porte);

  const totalRRAnual = streamsAtivos
    .filter(s => s.recorrente && s.valorAnual)
    .reduce((acc, s) => acc + (s.valorAnual ?? 0), 0);

  const totalNR = streamsAtivos
    .filter(s => !s.recorrente && s.custoImplantacao)
    .reduce((acc, s) => acc + (s.custoImplantacao ?? 0), 0);

  const tcvEstimado = totalNR + (totalRRAnual / 12) * prazo;

  return {
    cardId,
    porte,
    totalRRAnual,
    totalNR,
    streamsAtivos,
    oportunidadesExpansao,
    tcvEstimado,
    prazoContratoPadrao: prazo,
    atualizadoEm: new Date().toISOString(),
  };
}

// ===================================================================
// FORMATAÇÃO
// ===================================================================

export function formatarMoeda(valor: number): string {
  if (valor >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toFixed(1).replace('.', ',')}M`;
  }
  if (valor >= 1_000) {
    return `R$ ${(valor / 1_000).toFixed(0)}k`;
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function labelTipo(tipo: RevenueStreamType): string {
  const mapa: Record<RevenueStreamType, string> = {
    licenca: 'Licença',
    suporte: 'Suporte',
    subscricao: 'Assinatura',
    implantacao: 'Implantação',
    treinamento: 'Treinamento',
    customizacao: 'Customização',
  };
  return mapa[tipo] ?? tipo;
}
