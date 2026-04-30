import { describe, expect, it } from 'vitest';
import type { LookupResponse } from '../../services/clientLookupService';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
  enforceSeniorEvidenceConstraints,
  extractClienteSeniorData,
} from '../../utils/seniorEvidence';

describe('seniorEvidence', () => {
  it('extrai ClienteSeniorData do lookup confirmado', () => {
    const lookup: LookupResponse = {
      ok: true,
      query: 'Scheffer',
      encontrado: true,
      total: 1,
      results: [
        {
          grupo: 'Grupo Scheffer',
          razoes_sociais: ['Scheffer Agro Ltda'],
          linhas_produto: ['ERP'],
          familias_presentes: ['ERP', 'HCM'],
          modulos_por_familia: { ERP: ['Financeiro'], HCM: ['Folha'] },
          gaps_crosssell: ['Logística'],
          total_modulos: 2,
          eh_cliente_senior: true,
          tem_gatec: false,
          tem_erp: true,
          tem_hcm: true,
          tem_logistica: false,
        },
      ],
    };

    expect(extractClienteSeniorData(lookup)).toEqual({
      encontrado: true,
      matchType: 'exact',
      grupo: 'Grupo Scheffer',
      totalModulos: 2,
      familias: ['ERP', 'HCM'],
      familiasAusentes: ['GATec', 'Logística'],
      modulosPorFamilia: { ERP: ['Financeiro'], HCM: ['Folha'] },
      temErp: true,
      temHcm: true,
      temGatec: false,
      temLogistica: false,
    });
  });

  it('não confirma cliente quando o lookup é apenas parcial', () => {
    const lookup: LookupResponse = {
      ok: true,
      query: 'Bom Futuro Agricola',
      encontrado: true,
      total: 83,
      results: [
        {
          grupo: 'Bom Futuro Agricola Holding',
          razoes_sociais: ['Bom Futuro Agricola Participações Ltda'],
          linhas_produto: ['GRS'],
          familias_presentes: ['Acesso'],
          modulos_por_familia: { Acesso: ['Ronda'] },
          gaps_crosssell: ['ERP'],
          total_modulos: 1,
          eh_cliente_senior: true,
          tem_gatec: false,
          tem_erp: false,
          tem_hcm: false,
          tem_logistica: false,
          matchType: 'partial',
        },
      ],
    };

    expect(extractClienteSeniorData(lookup)).toEqual({
      encontrado: false,
      matchType: 'partial',
      grupo: 'Bom Futuro Agricola Holding',
      totalModulos: 1,
      familias: ['Acesso'],
      familiasAusentes: ['ERP', 'HCM', 'GATec', 'Logística'],
      modulosPorFamilia: { Acesso: ['Ronda'] },
      temErp: false,
      temHcm: false,
      temGatec: false,
      temLogistica: false,
    });
  });

  it('cria contexto de precedencia quando cliente senior for confirmado', () => {
    const context = buildSeniorEvidenceContext('Grupo Scheffer', {
      encontrado: true,
      grupo: 'Grupo Scheffer',
      totalModulos: 5,
      familias: ['ERP', 'HCM'],
      modulosPorFamilia: {},
    });

    expect(context).toContain('Grupo Scheffer é cliente Senior confirmado');
    expect(context).toContain('Não trate TOTVS ou SAP como ERP core principal');
  });

  it('bloqueia ERP como core quando o CRM confirma apenas HCM', () => {
    const context = buildSeniorEvidenceContext('Grupo Piccini', {
      encontrado: true,
      grupo: 'Grupo Piccini',
      totalModulos: 31,
      familias: ['HCM', 'Acesso'],
      familiasAusentes: ['ERP', 'GATec', 'Logística'],
      modulosPorFamilia: { HCM: ['Folha', 'Ponto'], Acesso: ['Ronda'] },
      temErp: false,
      temHcm: true,
      temGatec: false,
      temLogistica: false,
    });

    expect(context).toContain('ERP Senior NÃO confirmado');
    expect(context).toContain('É proibido afirmar ERP Senior como core');
    expect(context).toContain('HCM Senior confirmado');
  });

  it('anexa nota de consistencia quando texto cita TOTVS ou SAP', () => {
    const result = appendSeniorEvidenceNote(
      'Há sinais de TOTVS Protheus em vagas abertas.',
      'Grupo Scheffer',
      {
        encontrado: true,
        grupo: 'Grupo Scheffer',
        totalModulos: 4,
        familias: ['ERP'],
        modulosPorFamilia: {},
      },
    );

    expect(result).toContain('## 🔒 Nota de consistência comercial');
    expect(result).toContain('cliente Senior');
    expect(result).toContain('TOTVS');
  });

  it('não altera texto sem conflito explicito de ERP', () => {
    const text = 'A operação ganhou escala com novas plantas e maior pressão fiscal.';
    expect(
      appendSeniorEvidenceNote(text, 'Grupo Scheffer', {
        encontrado: true,
        grupo: 'Grupo Scheffer',
        totalModulos: 3,
        familias: ['ERP'],
        modulosPorFamilia: {},
      }),
    ).toBe(text);
  });

  it('corrige afirmações de ERP Senior core quando a base confirma apenas HCM', () => {
    const result = enforceSeniorEvidenceConstraints(
      'ERP Senior (Backoffice): confirmado como core atual.\nHCM/ERP já implantado.',
      'Grupo Piccini',
      {
        encontrado: true,
        grupo: 'Grupo Piccini',
        totalModulos: 31,
        familias: ['HCM'],
        familiasAusentes: ['ERP'],
        modulosPorFamilia: { HCM: ['Folha'] },
        temErp: false,
        temHcm: true,
      },
    );

    expect(result).not.toContain('ERP Senior (Backoffice)');
    expect(result).not.toContain('HCM/ERP');
    expect(result).toContain('ERP Senior não confirmado no CRM interno');
    expect(result).toContain('confirma Grupo Piccini como cliente Senior em HCM');
  });

  it('detecta ERP Senior em qualquer ordem e preserva outras evidências da linha', () => {
    const result = enforceSeniorEvidenceConstraints(
      'O cliente possui ERP Senior e utiliza SAP para logística.\nConfirmado ERP Senior na matriz.',
      'Grupo Piccini',
      {
        encontrado: true,
        grupo: 'Grupo Piccini',
        totalModulos: 31,
        familias: ['HCM'],
        familiasAusentes: ['ERP'],
        modulosPorFamilia: { HCM: ['Folha'] },
        temErp: false,
        temHcm: true,
      },
    );

    expect(result).not.toContain('possui ERP Senior');
    expect(result).not.toContain('Confirmado ERP Senior');
    expect(result).toContain('ERP Senior não confirmado no CRM interno e utiliza SAP para logística');
    expect(result).toContain('ERP Senior não confirmado no CRM interno na matriz');
  });
});
