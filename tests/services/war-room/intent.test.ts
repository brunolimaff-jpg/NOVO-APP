// tests/services/war-room/intent.test.ts
// Unit tests for intent detection functions in services/war-room/intent.ts

import { describe, it, expect } from 'vitest';
import {
  isOutOfScope,
  isProcessoAgricolaIntent,
  isIntegracaoIntent,
  hasFercusIntent,
  hasTalhaoIntent,
  hasGatecAgricolaIntent,
  hasBankingIntent,
  isBlockedIntent,
  resolveWarRoomIntent,
  normalizeCompetitorTarget,
  isSeniorAlias,
  extractCompetitorFromMessage,
  normalizeTarget,
  collectWarRoomIntentFlags,
} from '../../../services/war-room/intent';

describe('isOutOfScope', () => {
  it('detects CNPJ queries as out of scope', () => {
    expect(isOutOfScope('CNPJ 04.733.767/0001-80')).toBe(true);
  });

  it('detects dossie queries as out of scope', () => {
    expect(isOutOfScope('o que é dossiê?')).toBe(true);
    expect(isOutOfScope('quero um dossie completo')).toBe(true);
  });

  it('detects investigar empresa as out of scope', () => {
    expect(isOutOfScope('investigar empresa XPTO')).toBe(true);
  });

  it('allows generic technical questions', () => {
    expect(isOutOfScope('bom dia')).toBe(false);
    expect(isOutOfScope('como funciona o modulo de compras?')).toBe(false);
  });

  it('detects quadro societario as out of scope', () => {
    expect(isOutOfScope('quadro societário da empresa')).toBe(true);
  });

  it('detects score porta as out of scope', () => {
    expect(isOutOfScope('qual o score porta?')).toBe(true);
  });
});

describe('isProcessoAgricolaIntent', () => {
  it('detects gestao agricola intent', () => {
    expect(isProcessoAgricolaIntent('como funciona a gestão agrícola?')).toBe(true);
  });

  it('detects ordem de servico intent', () => {
    expect(isProcessoAgricolaIntent('como funciona a ordem de serviço agrícola?')).toBe(true);
  });

  it('detects safra and talhao patterns', () => {
    expect(isProcessoAgricolaIntent('como funciona o custo por talhão?')).toBe(true);
    expect(isProcessoAgricolaIntent('monitoramento de safra')).toBe(true);
  });

  it('detects simplefarm reference', () => {
    expect(isProcessoAgricolaIntent('simplefarm integracao')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(isProcessoAgricolaIntent('bom dia')).toBe(false);
    expect(isProcessoAgricolaIntent('como configurar o financeiro?')).toBe(false);
  });
});

describe('isIntegracaoIntent', () => {
  it('detects integracao keyword', () => {
    expect(isIntegracaoIntent('integracao gatec modulo fercus')).toBe(true);
    expect(isIntegracaoIntent('qual o fluxo de integração?')).toBe(true);
  });

  it('detects arquitetura references', () => {
    expect(isIntegracaoIntent('qual a arquitetura do sistema?')).toBe(true);
  });

  it('detects backoffice references', () => {
    expect(isIntegracaoIntent('como funciona o backoffice?')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(isIntegracaoIntent('bom dia')).toBe(false);
  });
});

describe('hasFercusIntent', () => {
  it('detects fercus module reference', () => {
    expect(hasFercusIntent('como configurar o fercus?')).toBe(true);
    expect(hasFercusIntent('integracao gatec modulo fercus')).toBe(true);
  });

  it('detects custos gerenciais reference', () => {
    expect(hasFercusIntent('o que sao custos gerenciais?')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(hasFercusIntent('bom dia')).toBe(false);
  });
});

describe('hasTalhaoIntent', () => {
  it('detects talhao reference', () => {
    expect(hasTalhaoIntent('como funciona o custo por talhão?')).toBe(true);
    expect(hasTalhaoIntent('consulta analitica de talhao')).toBe(true);
  });

  it('detects agr0193 reference', () => {
    expect(hasTalhaoIntent('o que e agr0193?')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(hasTalhaoIntent('bom dia')).toBe(false);
  });
});

describe('hasGatecAgricolaIntent', () => {
  it('detects gestao agricola with gatec', () => {
    expect(hasGatecAgricolaIntent('gestão agrícola no gatec')).toBe(true);
    expect(hasGatecAgricolaIntent('gatec gestão agrícola')).toBe(true);
  });

  it('detects processo agricola with gatec', () => {
    expect(hasGatecAgricolaIntent('processo agrícola da gatec')).toBe(true);
  });

  it('returns false when gatec is missing from agricola context', () => {
    expect(hasGatecAgricolaIntent('como funciona a ordem de serviço agrícola?')).toBe(false);
  });

  it('returns false for unrelated messages', () => {
    expect(hasGatecAgricolaIntent('bom dia')).toBe(false);
  });
});

describe('hasBankingIntent', () => {
  it('detects banking keyword', () => {
    expect(hasBankingIntent('explique o ERP Banking')).toBe(true);
  });

  it('detects integracao bancaria', () => {
    expect(hasBankingIntent('qual o fluxo de integração bancária?')).toBe(true);
  });

  it('detects cnab and ted references', () => {
    expect(hasBankingIntent('como configurar o CNAB?')).toBe(true);
    expect(hasBankingIntent('qual o fluxo de TED?')).toBe(true);
  });

  it('detects pagamento eletronico', () => {
    expect(hasBankingIntent('pagamento eletrônico senior')).toBe(true);
  });

  it('returns false for unrelated messages', () => {
    expect(hasBankingIntent('bom dia')).toBe(false);
  });
});

describe('isBlockedIntent', () => {
  it('detects kill-script reference', () => {
    expect(isBlockedIntent('kill script')).toBe(true);
    expect(isBlockedIntent('kill-script senior')).toBe(true);
  });

  it('detects analise de objeções reference', () => {
    expect(isBlockedIntent('análise de objeções')).toBe(true);
    expect(isBlockedIntent('quebrar objecao')).toBe(true);
  });

  it('returns false for normal queries', () => {
    expect(isBlockedIntent('bom dia')).toBe(false);
    expect(isBlockedIntent('como funciona o modulo de compras?')).toBe(false);
  });
});

describe('resolveWarRoomIntent', () => {
  it('detects benchmark intent from compare keywords', () => {
    expect(resolveWarRoomIntent('compare Senior com TOTVS')).toBe('benchmark');
  });

  it('detects benchmark from benchmark keyword', () => {
    expect(resolveWarRoomIntent('benchmark entre erps')).toBe('benchmark');
  });

  it('detects benchmark from versus patterns', () => {
    expect(resolveWarRoomIntent('Senior vs TOTVS')).toBe('benchmark');
    expect(resolveWarRoomIntent('Senior versus SAP')).toBe('benchmark');
  });

  it('detects benchmark from concorrencia', () => {
    expect(resolveWarRoomIntent('diferenca entre Senior e concorrente')).toBe('benchmark');
  });

  it('defaults to tech for generic questions', () => {
    expect(resolveWarRoomIntent('como funciona o modulo de compras?')).toBe('tech');
    expect(resolveWarRoomIntent('bom dia')).toBe('tech');
  });
});

describe('normalizeCompetitorTarget', () => {
  it('removes leading articles', () => {
    expect(normalizeCompetitorTarget('a TOTVS')).toBe('TOTVS');
    expect(normalizeCompetitorTarget('o SAP')).toBe('SAP');
  });

  it('removes trailing punctuation', () => {
    expect(normalizeCompetitorTarget('TOTVS.')).toBe('TOTVS');
    expect(normalizeCompetitorTarget('TOTVS,')).toBe('TOTVS');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeCompetitorTarget('TOTVS   Protheus')).toBe('TOTVS Protheus');
  });

  it('trims whitespace', () => {
    expect(normalizeCompetitorTarget('  TOTVS  ')).toBe('TOTVS');
  });
});

describe('isSeniorAlias', () => {
  it('matches senior', () => {
    expect(isSeniorAlias('senior')).toBe(true);
    expect(isSeniorAlias('Senior')).toBe(true);
  });

  it('matches senior sistemas', () => {
    expect(isSeniorAlias('senior sistemas')).toBe(true);
  });

  it('rejects other names', () => {
    expect(isSeniorAlias('TOTVS')).toBe(false);
    expect(isSeniorAlias('SAP')).toBe(false);
  });
});

describe('extractCompetitorFromMessage', () => {
  it('extracts target from "Senior vs X" pattern', () => {
    expect(extractCompetitorFromMessage('Senior vs TOTVS')).toBe('TOTVS');
  });

  it('extracts target from "Senior versus X" pattern', () => {
    expect(extractCompetitorFromMessage('Senior versus SAP')).toBe('SAP');
  });

  it('extracts target from "X vs Senior" pattern', () => {
    expect(extractCompetitorFromMessage('TOTVS vs Senior')).toBe('TOTVS');
  });

  it('extracts target from "compare X com Y" pattern', () => {
    expect(extractCompetitorFromMessage('compare Senior com TOTVS')).toBe('TOTVS');
  });

  it('handles compare where target is on the left', () => {
    expect(extractCompetitorFromMessage('compare TOTVS com Senior')).toBe('TOTVS');
  });

  it('handles generic versus pattern', () => {
    expect(extractCompetitorFromMessage('benchmark contra Protheus')).toBe('Protheus');
  });

  it('returns empty string when no target found', () => {
    expect(extractCompetitorFromMessage('bom dia')).toBe('');
    expect(extractCompetitorFromMessage('como funciona o modulo?')).toBe('');
  });
});

describe('normalizeTarget', () => {
  it('uses clean target when provided', () => {
    expect(normalizeTarget('TOTVS', '')).toBe('TOTVS');
  });

  it('infers target from message when target is empty', () => {
    expect(normalizeTarget('', 'compare Senior com TOTVS')).toBe('TOTVS');
  });

  it('falls back to default when nothing is available', () => {
    const result = normalizeTarget('', 'bom dia');
    expect(result).toBe('concorrente principal');
  });
});

describe('collectWarRoomIntentFlags', () => {
  it('detects talhao and processo agricola in tech mode', () => {
    const flags = collectWarRoomIntentFlags('tech', 'como funciona o custo por talhão?');
    expect(flags.wantsTalhao).toBe(true);
    expect(flags.wantsProcessoAgricola).toBe(true);
    expect(flags.wantsIntegracao).toBe(false);
    expect(flags.wantsFercus).toBe(false);
    expect(flags.wantsGatecAgricola).toBe(false);
    expect(flags.wantsBanking).toBe(false);
  });

  it('detects fercus in tech mode', () => {
    const flags = collectWarRoomIntentFlags('tech', 'como configurar o fercus?');
    expect(flags.wantsFercus).toBe(true);
    expect(flags.wantsTalhao).toBe(false);
  });

  it('detects banking in benchmark mode', () => {
    const flags = collectWarRoomIntentFlags('benchmark', 'qual o fluxo de integração bancária?');
    expect(flags.wantsBanking).toBe(true);
  });

  it('detects banking in benchmark mode with ERP Banking mention', () => {
    const flags = collectWarRoomIntentFlags('benchmark', 'explique o ERP Banking');
    expect(flags.wantsBanking).toBe(true);
  });

  it('detects integracao and fercus in tech mode', () => {
    const flags = collectWarRoomIntentFlags('tech', 'integracao gatec modulo fercus');
    expect(flags.wantsIntegracao).toBe(true);
    expect(flags.wantsFercus).toBe(true);
  });

  it('detects processo agricola in tech mode for ordem de servico', () => {
    const flags = collectWarRoomIntentFlags('tech', 'como funciona a ordem de serviço agrícola?');
    expect(flags.wantsProcessoAgricola).toBe(true);
    expect(flags.wantsGatecAgricola).toBe(false);
  });

  it('returns no specific flags for generic greeting in tech mode', () => {
    const flags = collectWarRoomIntentFlags('tech', 'bom dia');
    expect(flags.wantsProcessoAgricola).toBe(false);
    expect(flags.wantsIntegracao).toBe(false);
    expect(flags.wantsFercus).toBe(false);
    expect(flags.wantsTalhao).toBe(false);
    expect(flags.wantsGatecAgricola).toBe(false);
    expect(flags.wantsBanking).toBe(false);
  });

  it('does not set banking in tech mode even when message mentions banking', () => {
    const flags = collectWarRoomIntentFlags('tech', 'qual o fluxo de integração bancária?');
    expect(flags.wantsBanking).toBe(false);
  });

  it('returns all false for non-tech non-benchmark modes', () => {
    const flags = collectWarRoomIntentFlags('killscript', 'qual o fluxo de integração bancária?');
    expect(flags.wantsBanking).toBe(false);
    expect(flags.wantsProcessoAgricola).toBe(false);
  });
});
