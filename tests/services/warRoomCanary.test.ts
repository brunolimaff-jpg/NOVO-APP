import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContentMock = vi.hoisted(() => vi.fn());
const buscarDocsMock = vi.hoisted(() => vi.fn());
const buscarBaseMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/llmProxy', () => ({
  proxyGenerateContent: generateContentMock,
  proxyGerarDossie: generateContentMock,
}));

vi.mock('../../services/ragService', () => ({
  buscarContextoDocsPinecone: buscarDocsMock,
  buscarContextoPinecone: buscarBaseMock,
}));

const modelResponse = {
  text: 'OK',
  candidates: [{ groundingMetadata: { groundingChunks: [] } }],
};

function noisyContextFor(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('fercus')) {
    return [
      '### Customizações: Pro_FerFgt',
      '(Fonte: https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/customizacoes/variaveis/pro_ferfgt.htm)',
      '---',
      '### Integracao Gatec: Gestão de Custos Gerenciais',
      '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/manuais_processos/agronegocio/integracao-gatec/gatec-modulo-fercus.htm)',
    ].join('\n');
  }
  if (q.includes('talhão') || q.includes('talhao') || q.includes('agr0193')) {
    return [
      '### Talhões',
      '(Fonte: https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/bs/fr194tal.htm)',
      '---',
      '### AGR0193 – Consulta do Cadastro do Talhão Analítico',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/estrutura-de-locais/consulta-analitica-de-talhao)',
    ].join('\n');
  }
  if (q.includes('gestão agrícola da gatec') || q.includes('gestao agricola da gatec')) {
    return [
      '### Conheça a GAtec',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/gatec-home)',
      '---',
      '### Integração com GAtec',
      '(Fonte: https://documentacao.senior.com.br/gestaoempresarialerp/5.10.4/manuais_processos/agronegocio/integracao-gatec/inicio-integracao-gatec.htm)',
    ].join('\n');
  }
  if (q.includes('simplefarm manual do usuário agrícola') || q.includes('simplefarm manual do usuario agricola')) {
    return [
      '### Agrícola',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/)',
      '---',
      '### Ordem de Serviço',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/ordem-de-servico)',
    ].join('\n');
  }
  if (q.includes('timesheet')) {
    return [
      '### AGR0095 - Timesheet',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/agricola/ordem-de-servico/timesheet)',
      '',
      '---',
      '',
      '### 404 - Página não encontrada',
      '(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/404)',
    ].join('\n');
  }
  return '### Documento\n(Fonte: https://documentacao.senior.com.br/simplefarm/manual-do-usuario/)';
}

describe('warRoom canary flow', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    buscarDocsMock.mockImplementation(async (query: string) => noisyContextFor(query));
    buscarBaseMock.mockImplementation(async (query: string) => noisyContextFor(query));
    generateContentMock.mockResolvedValue(modelResponse);
  });

  it('keeps critical terms and filters noisy docs in final prompt', async () => {
    const { queryWarRoom } = await import('../../services/warRoomService');

    const cases = [
      {
        query: 'não é melhor usar o fercus para custo?',
        mustHave: ['gatec-modulo-fercus', 'FOCO DE RESPOSTA (FERCUS)'],
        mustNotHave: ['/customizacoes/variaveis/pro_ferfgt.htm'],
      },
      {
        query: 'como funciona o custo por talhão? como consigo?',
        mustHave: ['consulta-analitica-de-talhao'],
        mustNotHave: ['404 - Página não encontrada'],
      },
      {
        query: 'como funciona a gestão agrícola da gatec?',
        mustHave: ['manual-do-usuario/agricola', 'FOCO DE RESPOSTA'],
        mustNotHave: [],
      },
      {
        query: 'como configurar timesheet rural?',
        mustHave: ['ordem-de-servico/timesheet'],
        mustNotHave: ['manual-do-usuario/404'],
      },
    ];

    let hits = 0;
    const failed: string[] = [];
    for (const c of cases) {
      generateContentMock.mockClear();
      await queryWarRoom('tech', c.query, [], '', undefined);
      const payload = generateContentMock.mock.calls[0][0];
      const prompt = String(payload.contents[0].parts[0].text || '');
      const okHave = c.mustHave.every(token => prompt.includes(token));
      const okNot = c.mustNotHave.every(token => !prompt.includes(token));
      if (okHave && okNot) {
        hits += 1;
      } else {
        failed.push(c.query);
      }
    }

    // Canary score for post-retrieval handling in War Room flow.
    expect(hits, `failed cases: ${failed.join(' | ')}`).toBeGreaterThanOrEqual(3);
  });
});
