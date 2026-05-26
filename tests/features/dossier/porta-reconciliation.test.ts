import { describe, expect, it, vi } from 'vitest';

const generateDossierModuleMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../../services/geminiService', () => ({
  generateDossierModule: generateDossierModuleMock,
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

import {
  buildPortaReconciliationPrompt,
  ensureWaterfallScorePorta,
  reconcileWaterfallPorta,
  resolveModuleNamesForMissingDimensions,
  shouldHoldWaterfallScoreForIntegrity,
} from '../../../features/dossier/porta-reconciliation';
import { ensureContinuitySuggestions } from '../../../utils/messageHelpers';

describe('porta-reconciliation', () => {
  const legacyFallbackSuggestions = [
    'Qual gargalo em Scheffer já está consumindo margem e segue tratado como rotina?',
    'Que decisão crítica em Scheffer continua travada por falta de dados confiáveis?',
    'Onde Scheffer ainda depende de planilhas e amplia risco operacional sem reação executiva?',
    'Se nada mudar em Scheffer nos próximos 90 dias, qual ruptura tende a aparecer primeiro?',
  ];

  it('mapeia dimensões faltantes para módulos donos com deduplicação', () => {
    const result = resolveModuleNamesForMissingDimensions(['O', 'T', 'O', 'A']);
    expect(result).toEqual(['Operação / Cadeia de Valor', 'Bordas de Controle', 'Caminho de Venda']);
  });

  it('ativa guardrail de integridade quando todas as dimensões PORTA ficam ausentes', () => {
    expect(
      shouldHoldWaterfallScoreForIntegrity({
        score: null,
        source: 'none',
        missingDimensions: ['P', 'O', 'R', 'T', 'A'],
      }),
    ).toBe(true);
    expect(
      shouldHoldWaterfallScoreForIntegrity({
        score: null,
        source: 'feeds',
        missingDimensions: ['P', 'R'],
      }),
    ).toBe(false);
  });

  it('gera prompt de reconciliação apenas com templates das dimensões pendentes', () => {
    const prompt = buildPortaReconciliationPrompt(['P', 'R']);
    expect(prompt).toContain('DIMENSÕES FALTANTES: P, R');
    expect(prompt).toContain('[[PORTA_FEED_P:6:HA:0:CNPJS:0:FAT:NA]]');
    expect(prompt).toContain('[[PORTA_FEED_R:6:PRESSOES:Sem_pressao_identificada]]');
    expect(prompt).not.toContain('[[PORTA_FEED_T:6:T1:6:T2:6:T3:6:STACK:NA]]');
  });

  it('lança erro quando não consegue consolidar score PORTA após todas as tentativas', () => {
    const unresolved = `
Texto consolidado sem marcador explícito.
`;
    expect(() => ensureWaterfallScorePorta(unresolved, {
      score: null,
      source: 'none',
      missingDimensions: ['P', 'O', 'R', 'T', 'A'],
    })).toThrow('Score PORTA não pôde ser consolidado após todas as tentativas.');
  });

  it('não transforma falha parcial de PORTA em hold de integridade', async () => {
    generateDossierModuleMock.mockResolvedValue('');

    await expect(
      reconcileWaterfallPorta({
        sessionId: 'session-1',
        signal: new AbortController().signal,
        resolvedMegaCompany: 'Scheffer',
        sessionCnpjDigits: '04733767000180',
        dossierSeedContext: '',
        waterfallLookupContext: '',
        seniorEvidenceContext: '',
        staticDossierContext: '',
        accumulatedText: 'Texto com [[PORTA_FEED_P:7:HA:1:CNPJS:1:FAT:NA]] parcial.',
        modulesByName: new Map(),
        runWaterfallModule: vi.fn(),
        optionalStepFailures: new Set(),
        setFailureCount: vi.fn(),
      }),
    ).rejects.toThrow('Falha técnica ao consolidar Score PORTA');
  });

  it('preenche perguntas de acompanhamento contextuais quando a IA retorna lista vazia ou parcial', () => {
    const contextText = [
      'O dossiê aponta risco fiscal recorrente, fechamento financeiro manual e reconciliação em planilhas.',
      'A operação depende de ERP sem integração confiável, sofre perda de margem e tem decisão de diretoria travada por falta de dados.',
    ].join(' ');
    const ensuredEmpty = ensureContinuitySuggestions([], 'Scheffer', { contextText });
    expect(ensuredEmpty).toHaveLength(4);
    expect(ensuredEmpty.every(item => item.endsWith('?'))).toBe(true);
    expect(ensuredEmpty.some(item => /Scheffer/i.test(item))).toBe(true);
    expect(ensuredEmpty).not.toEqual(legacyFallbackSuggestions);
    expect(ensuredEmpty.some(item => /decis[aã]o|investimento|dinheiro|margem|custo|risco|diretoria|or[cç]amento/i.test(item))).toBe(true);

    const ensuredPartial = ensureContinuitySuggestions(['Qual risco operacional já está escalando?'], 'Scheffer', {
      contextText,
      avoidSuggestions: legacyFallbackSuggestions,
    });
    expect(ensuredPartial).toHaveLength(4);
    expect(ensuredPartial[0]).toBe('Qual risco operacional já está escalando?');
    expect(ensuredPartial).not.toEqual(legacyFallbackSuggestions);
  });

  it('preserva perguntas curtas e diretas quando elas sao validas', () => {
    const ensured = ensureContinuitySuggestions(['Onde a margem vaza?'], 'Scheffer', {
      contextText: 'A operação apresenta perda de margem e custo oculto no fechamento.',
    });

    expect(ensured).toHaveLength(4);
    expect(ensured[0]).toBe('Onde a margem vaza?');
  });

  it('descarta sugestões técnicas que não parecem pergunta de vendedor', () => {
    const ensured = ensureContinuitySuggestions(
      [
        'Pela robustez tecnológica da Scheffer, qual perda financeira estimada por não ter a logística integrada nativamente ao GATec?',
        'O CAPEX da Scheffer indica novos ativos físicos; como garantir a gestão de pátio com sistemas que já rodam redondos?',
        'Onde o ERP de Scheffer deixa integração quebrada virar custo invisível no fechamento?',
      ],
      'Scheffer',
      {
        contextText: 'A conta tem pressão de margem, crescimento da operação, logística manual e decisão de investimento em aberto.',
      },
    );

    expect(ensured).toHaveLength(4);
    expect(ensured.join(' ')).not.toMatch(/GATec|CAPEX|ERP|nativamente|arquitetura|sistemas que já rodam/i);
    expect(ensured.some(item => /margem|crescimento|investimento|diretoria|operação/i.test(item))).toBe(true);
  });

  it('usa nome comercial nas sugestões quando entrada vem de razão social ou CNPJ', () => {
    const ensured = ensureContinuitySuggestions([], 'SCHEFFER & CIA LTDA', {
      contextText: 'A conta tem pressão de margem, risco fiscal e decisão de investimento em aberto.',
    });

    expect(ensured).toHaveLength(4);
    expect(ensured.join(' ')).toContain('Scheffer');
    expect(ensured.join(' ')).not.toMatch(/\b(LTDA|CIA|ME|S\/A|S\.A)\b/i);
  });

  it('normaliza razão social também em perguntas retornadas pela IA', () => {
    const ensured = ensureContinuitySuggestions(
      [
        'Onde a margem da SCHEFFER & CIA LTDA está vazando sem virar prioridade?',
        'Quem na SCHEFFER & CIA LTDA precisa patrocinar essa mudança agora?',
      ],
      'SCHEFFER & CIA LTDA',
      {
        contextText: 'A conta tem pressão de margem, crescimento operacional e prioridade de investimento.',
      },
    );

    expect(ensured[0]).toBe('Onde a margem da Scheffer está vazando sem virar prioridade?');
    expect(ensured[1]).toBe('Quem na Scheffer precisa patrocinar essa mudança agora?');
    expect(ensured.join(' ')).not.toMatch(/\b(LTDA|CIA|ME|S\/A|S\.A)\b/i);
  });

  it('remove sufixos societários de entradas manuais comuns', () => {
    const ensured = ensureContinuitySuggestions([], 'Grupo Bom Futuro Ltda ME', {
      contextText: 'A operação cresce e tem custo recorrente sem orçamento claro.',
    });

    expect(ensured.join(' ')).toContain('Bom Futuro');
    expect(ensured.join(' ')).not.toMatch(/\b(Grupo|Ltda|ME)\b/i);
  });

  it('preserva termos comerciais que fazem parte do nome', () => {
    const ensured = ensureContinuitySuggestions([], 'Agro Comercial Ltda ME', {
      contextText: 'A conta tem custo recorrente e decisão de investimento em aberto.',
    });

    expect(ensured.join(' ')).toContain('Agro Comercial');
    expect(ensured.join(' ')).not.toMatch(/\b(Ltda|ME)\b/i);
  });
});
