import { describe, expect, it } from 'vitest';
import type { LookupResponse } from '../../services/clientLookupService';
import {
  appendSeniorEvidenceNote,
  buildSeniorEvidenceContext,
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
      grupo: 'Grupo Scheffer',
      totalModulos: 2,
      familias: ['ERP', 'HCM'],
      modulosPorFamilia: { ERP: ['Financeiro'], HCM: ['Folha'] },
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
});
