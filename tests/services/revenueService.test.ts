import { describe, it, expect } from 'vitest';
import {
  normalizarFamilia,
  inferirPorte,
  buildRevenueProfile,
  formatarMoeda,
  labelTipo,
} from '../../services/revenueService';

describe('normalizarFamilia', () => {
  it('normaliza gatec para GATec', () => {
    expect(normalizarFamilia('gatec')).toBe('GATec');
    expect(normalizarFamilia('GATec')).toBe('GATec');
  });

  it('normaliza erp para ERP', () => {
    expect(normalizarFamilia('erp')).toBe('ERP');
    expect(normalizarFamilia('ERP Senior')).toBe('ERP');
  });

  it('normaliza hcm para HCM', () => {
    expect(normalizarFamilia('hcm')).toBe('HCM');
    expect(normalizarFamilia('gestão de pessoas')).toBe('HCM');
    expect(normalizarFamilia('Recursos Humanos')).toBe('HCM');
  });

  it('normaliza logistica para Logística', () => {
    expect(normalizarFamilia('logistica')).toBe('Logística');
    expect(normalizarFamilia('Logística')).toBe('Logística');
  });

  it('normaliza flow para Plataforma', () => {
    expect(normalizarFamilia('flow')).toBe('Plataforma');
  });

  it('normaliza acesso para Acesso', () => {
    expect(normalizarFamilia('acesso')).toBe('Acesso');
  });

  it('retorna o valor original para família desconhecida', () => {
    expect(normalizarFamilia('FamíliaCustom')).toBe('FamíliaCustom');
  });
});

describe('inferirPorte', () => {
  it('retorna "pequeno" para menos de 7 módulos', () => {
    expect(inferirPorte(3)).toBe('pequeno');
    expect(inferirPorte(6)).toBe('pequeno');
  });

  it('retorna "medio" para 7 a 14 módulos', () => {
    expect(inferirPorte(7)).toBe('medio');
    expect(inferirPorte(14)).toBe('medio');
  });

  it('retorna "grande" para 15 ou mais módulos', () => {
    expect(inferirPorte(15)).toBe('grande');
    expect(inferirPorte(30)).toBe('grande');
  });

  it('retorna "pequeno" para 0 módulos', () => {
    expect(inferirPorte(0)).toBe('pequeno');
  });
});

describe('buildRevenueProfile', () => {
  it('constrói perfil com streams ativos para famílias fornecidas', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-1',
      familias: ['ERP'],
      modulosPorFamilia: { ERP: ['Contabilidade', 'Fiscal', 'RH'] },
      totalModulos: 10,
    });

    expect(profile.cardId).toBe('card-1');
    expect(profile.porte).toBe('medio'); // 10 módulos → medio
    expect(profile.streamsAtivos.length).toBeGreaterThan(0);
  });

  it('calcula totalRRAnual como soma das licenças recorrentes', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-2',
      familias: ['ERP'],
      modulosPorFamilia: { ERP: [] },
      totalModulos: 5,
    });

    expect(profile.totalRRAnual).toBeGreaterThan(0);
    expect(profile.totalRRAnual).toBe(
      profile.streamsAtivos
        .filter(s => s.recorrente && s.valorAnual)
        .reduce((acc, s) => acc + (s.valorAnual ?? 0), 0),
    );
  });

  it('calcula totalNR como soma das implantações', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-3',
      familias: ['HCM'],
      modulosPorFamilia: { HCM: [] },
      totalModulos: 3,
    });

    expect(profile.totalNR).toBeGreaterThan(0);
  });

  it('gera oportunidades de expansão para famílias ausentes', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-4',
      familias: ['ERP'], // só ERP, faltam as outras
      modulosPorFamilia: { ERP: [] },
      totalModulos: 5,
    });

    expect(profile.oportunidadesExpansao.length).toBeGreaterThan(0);
    // Não deve incluir ERP (já presente)
    expect(profile.oportunidadesExpansao.every(o => o.familiasProduto !== 'ERP')).toBe(true);
  });

  it('prazoContratoPadrao é 24 meses para porte pequeno', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-5',
      familias: ['ERP'],
      modulosPorFamilia: { ERP: [] },
      totalModulos: 3, // pequeno
    });
    expect(profile.prazoContratoPadrao).toBe(24);
  });

  it('prazoContratoPadrao é 36 meses para porte medio', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-6',
      familias: ['ERP'],
      modulosPorFamilia: { ERP: [] },
      totalModulos: 10, // medio
    });
    expect(profile.prazoContratoPadrao).toBe(36);
  });

  it('prazoContratoPadrao é 48 meses para porte grande', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-7',
      familias: ['ERP'],
      modulosPorFamilia: { ERP: [] },
      totalModulos: 20, // grande
    });
    expect(profile.prazoContratoPadrao).toBe(48);
  });

  it('tcvEstimado combina NR + RR mensalizado pelo prazo', () => {
    const profile = buildRevenueProfile({
      cardId: 'card-8',
      familias: ['GATec'],
      modulosPorFamilia: { GATec: [] },
      totalModulos: 10,
    });

    const expectedTCV = profile.totalNR + (profile.totalRRAnual / 12) * profile.prazoContratoPadrao;
    expect(profile.tcvEstimado).toBeCloseTo(expectedTCV, 0);
  });
});

describe('formatarMoeda', () => {
  it('formata valores em milhões com sufixo M', () => {
    expect(formatarMoeda(1_500_000)).toBe('R$ 1,5M');
  });

  it('formata valores em milhares com sufixo k', () => {
    expect(formatarMoeda(25_000)).toBe('R$ 25k');
  });

  it('formata valores menores com locale pt-BR', () => {
    const result = formatarMoeda(500);
    expect(result).toContain('500');
  });
});

describe('labelTipo', () => {
  it('mapeia licenca para "Licença"', () => {
    expect(labelTipo('licenca')).toBe('Licença');
  });

  it('mapeia implantacao para "Implantação"', () => {
    expect(labelTipo('implantacao')).toBe('Implantação');
  });

  it('mapeia suporte para "Suporte"', () => {
    expect(labelTipo('suporte')).toBe('Suporte');
  });

  it('retorna o tipo original para tipos desconhecidos', () => {
    expect(labelTipo('outro' as never)).toBe('outro');
  });
});
