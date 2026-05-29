import { describe, expect, it } from 'vitest';
import { BASE_SYSTEM_PROMPT } from '../../constants';

describe('BASE_SYSTEM_PROMPT critical investigation rules', () => {
  it('enforces phase separation and includes phase 8 recommendations', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('REGRA DE SEPARAÇÃO DE FASES (CRÍTICO — NUNCA VIOLE):');
    expect(BASE_SYSTEM_PROMPT).toContain('NUNCA escreva "FASE 1 & 2"');
    expect(BASE_SYSTEM_PROMPT).toContain('### FASE -1: RISCOS OCULTOS');
    expect(BASE_SYSTEM_PROMPT).toContain('### FASE 6: SINAIS DE VENDA');
    expect(BASE_SYSTEM_PROMPT).toContain('### FASE 8: RECOMENDAÇÕES DE PRODUTOS SENIOR');
  });

  it('balances shadow reputation with remediation and temporal rules', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('Compliance e Remediação');
    expect(BASE_SYSTEM_PROMPT).toContain('🔴 **VERMELHO (Alto Risco Ativo)**');
    expect(BASE_SYSTEM_PROMPT).toContain('**REGRA TEMPORAL**');
    expect(BASE_SYSTEM_PROMPT).toContain('**REGRA DE EQUILÍBRIO**');
  });

  it('includes pecuária ecosystem partners and trading opportunity rules', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('### Parceiros de Ecossistema Senior (Integração Nativa)');
    expect(BASE_SYSTEM_PROMPT).toContain('Peccode');
    expect(BASE_SYSTEM_PROMPT).toContain('Multibovinos');
    expect(BASE_SYSTEM_PROMPT).toContain('### TRADING E ORIGINAÇÃO DE COMMODITIES');
    expect(BASE_SYSTEM_PROMPT).toContain('Trading/originação é OPORTUNIDADE de venda do CTRM da GAtec');
  });

  it('documents stricter segment inference and faturamento rules', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('### PASSO 1: INFERIR SEGMENTO');
    expect(BASE_SYSTEM_PROMPT).toContain('**COP (Cooperativa)** — Verificar PRIMEIRO:');
    expect(BASE_SYSTEM_PROMPT).toContain('**AGI (Agroindústria/Conglomerado)** — Verificar SEGUNDO:');
    expect(BASE_SYSTEM_PROMPT).toContain('### REGRA DE FATURAMENTO (CRÍTICO):');
    expect(BASE_SYSTEM_PROMPT).toContain(
      'Faturamento não divulgado publicamente. Estimativa baseada em [método]: R$ X - Y.',
    );
  });

  it('includes the new territorial, logistics and legacy-system search rules', () => {
    expect(BASE_SYSTEM_PROMPT).toContain('7. **Diversificação e Verticais de Negócio**');
    expect(BASE_SYSTEM_PROMPT).toContain('8. **Certificações e ESG**');
    expect(BASE_SYSTEM_PROMPT).toContain('5. **Frota Própria vs Terceirizada**');
    expect(BASE_SYSTEM_PROMPT).toContain('6. **Sinais de Sistema Legado**');
    expect(BASE_SYSTEM_PROMPT).toContain('SAÍDA MÍNIMA OBRIGATÓRIA DA FASE 8');
  });
});
