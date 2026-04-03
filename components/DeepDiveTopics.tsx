import React, { useMemo } from 'react';
import {
  SHARED_FOUNDATION_BLOCK,
  PROMPT_VERSION,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
} from '../prompts/megaPrompts';

interface DeepDiveTopicsProps {
  onSelectTopic: (displayMessage: string, hiddenPrompt: string) => void;
}

type DeepDiveTopic = {
  id: string;
  label: string;
  shortLabel: string;
  tooltip: string;
  subtitle: string;
  impact: string;
  icon: string;
  basePrompt: string;
};

const DEEP_DIVE_RUNTIME_BLOCK = `
<deep_dive_runtime>

<mode>
Você está executando um DEEP DIVE CIRÚRGICO e ISOLADO dentro do Scout 360.
Isso significa:
- aprofundamento extremo em UMA frente específica
- zero preenchimento decorativo
- zero repetição inútil do dossiê geral
- máxima densidade de insight
</mode>

<objective>
Seu objetivo é entregar munição comercial acionável sobre o tema escolhido:
1. fatos auditáveis
2. dor econômica ou política
3. discrepâncias úteis
4. urgência de decisão
5. gatilhos de abordagem
</objective>

<scope_rules>
NÃO:
- reescreva o dossiê completo
- recapitule todas as outras frentes
- invente sumário executivo genérico
- produza contexto inflado só para parecer profundo

FAÇA:
- vá 10x mais fundo na área específica
- privilegie fatos novos e implicações novas
- use linguagem executiva e vendável
- exponha custo da demora quando fizer sentido
- procure discrepâncias entre discurso e realidade
- conecte o achado à tese comercial da Senior
</scope_rules>

<commercial_aggression_rules>
Se houver espaço para gerar valor, procure:
- contradição entre discurso público e realidade operacional
- sinal de legado ou remendo escondido
- dor que o prospect provavelmente normalizou
- ponto político de resistência
- ângulo de entrada sem confronto burro
- custo de permanecer como está
</commercial_aggression_rules>

<output_rules>
- preserve o título do dossiê do módulo
- preserve tabelas e markers PORTA
- preserve o contrato do parser
- notas sempre inteiras
- se faltar dado, seja conservador
</output_rules>

</deep_dive_runtime>
`;

const buildDeepDiveHiddenPrompt = (basePrompt: string, topicLabel: string) =>
  [
    `DEEP_DIVE_SINGLE_MODULE_EXECUTION (PromptVersion=${PROMPT_VERSION})`,
    `Tópico selecionado: ${topicLabel}`,
    'Executar investigação profunda APENAS do módulo abaixo.',
    'Usar o contexto já existente da conversa como pano de fundo, sem recontar o dossiê completo.',
    SHARED_FOUNDATION_BLOCK,
    DEEP_DIVE_RUNTIME_BLOCK,
    basePrompt,
  ].join('\n\n');

export const DeepDiveTopics: React.FC<DeepDiveTopicsProps> = ({ onSelectTopic }) => {
  const topics = useMemo<DeepDiveTopic[]>(
    () => [
      {
        id: 'raio-x',
        label: 'Raio-X Operacional',
        shortLabel: 'Operacional',
        tooltip:
          'Reconstrói a topologia da operação: elos da cadeia, ativos físicos, gargalos de pátio, rastreabilidade, infraestrutura crítica e onde a operação sangra caixa por falta de sistema.',
        subtitle: 'Cadeia de valor, ativos, gargalos e perda de caixa operacional',
        impact: 'Impacto alto em O + R',
        icon: '🚜',
        basePrompt: PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
      },
      {
        id: 'tech-stack',
        label: 'Tech Stack & ERP',
        shortLabel: 'Tech Stack',
        tooltip:
          'Descobre o ERP core, satélites, sistemas paralelos, shadow IT, linguagens legadas, custo oculto de sustentação e vulnerabilidade do incumbente.',
        subtitle: 'ERP, legado, integração, shadow IT e wedge contra incumbente',
        impact: 'Impacto brutal em T',
        icon: '💻',
        basePrompt: PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
      },
      {
        id: 'compliance',
        label: 'Riscos & Compliance',
        shortLabel: 'Compliance',
        tooltip:
          'Mapeia passivo fiscal, PGFN, MPT, risco ambiental, reforma tributária, contrapesos de governança e separa risco ativo de histórico resolvido.',
        subtitle: 'Passivo fiscal, regulatório, trabalhista e pressão externa real',
        impact: 'Impacto alto em R + TRAD',
        icon: '🚨',
        basePrompt: PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
      },
      {
        id: 'radar',
        label: 'Teia Societária (M&A)',
        shortLabel: 'Teia Societária',
        tooltip:
          'Vasculha grupo econômico real, holdings, filiais, SPEs, fazendas, massa operacional escondida, capacidade estática e faturamento consolidado estimado.',
        subtitle: 'Grupo real, massa escondida e tese enterprise',
        impact: 'Impacto brutal em P + SEG',
        icon: '🕸️',
        basePrompt: PROMPT_RADAR_EXPANSAO_GOD_MODE,
      },
      {
        id: 'rh-sindicatos',
        label: 'RH, SST & Cultura Operacional',
        shortLabel: 'RH & SST',
        tooltip:
          'Revela headcount real, CAEPF, safristas, terceiros, stack RH, SST, FAP/RAT, risco trabalhista e capacidade da operação de absorver projeto.',
        subtitle: 'Força de trabalho real, SST e timing operacional',
        impact: 'Impacto em P proxy + R + A2',
        icon: '👥',
        basePrompt: PROMPT_RH_SINDICATOS_GOD_MODE,
      },
      {
        id: 'mapeamento-decisores',
        label: 'Mapa de Decisores',
        shortLabel: 'Decisores',
        tooltip:
          'Identifica sponsor, dono do orçamento, veto, sabotador, shadow board, sucessão, trigger político e a narrativa certa para cada ator.',
        subtitle: 'Sponsor, veto, sabotador e janela política',
        impact: 'Impacto brutal em A + LOCK',
        icon: '🎭',
        basePrompt: PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
      },
      {
        id: 'orcamento-janela',
        label: 'Orçamento & Janela',
        shortLabel: 'Orçamento',
        tooltip:
          'Decodifica budget plausível, owner financeiro, captação, crédito rural, ciclo orçamentário, custo da demora e momento real de compra.',
        subtitle: 'Comprabilidade, budget, owner financeiro e timing',
        impact: 'Impacto em R + A2',
        icon: '💵',
        basePrompt: PROMPT_ORCAMENTO_JANELA_GOD_MODE,
      },
    ],
    [],
  );

  return (
    <div className="my-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
            Deep Dives
          </p>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Investigações cirúrgicas por frente
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Escolha uma frente para aprofundar com máxima densidade analítica, foco comercial e rigor forense.
          </p>
        </div>

        <div className="hidden rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 md:block">
          {PROMPT_VERSION}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {topics.map(topic => {
          const hiddenPrompt = buildDeepDiveHiddenPrompt(topic.basePrompt, topic.label);

          return (
            <button
              key={topic.id}
              type="button"
              title={topic.tooltip}
              onClick={() =>
                onSelectTopic(`Dossiê completo: ${topic.label}`, hiddenPrompt)
              }
              className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-700 dark:hover:bg-slate-800"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl transition-colors group-hover:bg-emerald-100 dark:bg-slate-800 dark:group-hover:bg-emerald-900/40">
                  {topic.icon}
                </div>

                <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {topic.shortLabel}
                </span>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-bold leading-tight text-slate-900 dark:text-white">
                  {topic.label}
                </h4>

                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {topic.subtitle}
                </p>

                <div className="pt-1">
                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {topic.impact}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DeepDiveTopics;
