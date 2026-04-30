import { describe, expect, it } from 'vitest';
import {
  buildSocioRuralInstructionContext,
  buildSocioRuralSearchQueries,
  classifySocioRuralEvidence,
  extractPotentialSocioNames,
} from '../../utils/socioRuralResearch';

describe('socioRuralResearch', () => {
  it('extrai nomes de socios e monta matriz de busca rural', () => {
    const context = 'QSA: Sócio administrador João Piccini. Diretora Maria Silva.';
    const names = extractPotentialSocioNames(context);
    const queries = buildSocioRuralSearchQueries('Grupo Piccini', context);

    expect(names).toContain('João Piccini');
    expect(queries.some(query => query.includes('João Piccini'))).toBe(true);
    expect(queries.some(query => query.includes('CAEPF'))).toBe(true);
  });

  it('classifica evidencia forte como socio produtor rural confirmado', () => {
    const result = classifySocioRuralEvidence(
      'João Piccini',
      'Grupo Piccini',
      'João Piccini do Grupo Piccini consta como produtor rural em fazenda e CAEPF.',
    );

    expect(result.status).toBe('confirmado');
  });

  it('rejeita homonimo sem conexao rural e societaria', () => {
    const result = classifySocioRuralEvidence(
      'João Piccini',
      'Grupo Piccini',
      'João Piccini aparece em resultado esportivo sem relação com fazenda.',
    );

    expect(result.status).toBe('possivel');

    const rejected = classifySocioRuralEvidence('João Piccini', 'Grupo Piccini', 'Resultado sem esse nome.');
    expect(rejected.status).toBe('homonimo_rejeitado');
  });

  it('nao inclui CPF completo no contexto de instrucao', () => {
    const context = buildSocioRuralInstructionContext(
      'Grupo Piccini',
      'Sócio administrador João Piccini CPF 123.456.789-10',
    );

    expect(context).not.toContain('123.456.789-10');
    expect(context).toContain('CPF xxx.xxx.123-xx');
  });
});
