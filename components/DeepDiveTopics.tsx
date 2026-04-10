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

const withFoundation = (prompt: string) =>
  SHARED_FOUNDATION_BLOCK + '\n\n---\n\n' + prompt;

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
    ],
    [],
  );

  return (
    <div className="my-6">
      <div className="mb-4 space-y-1">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            </span>
            Deep Dives
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Investigações cirúrgicas por frente
          </h3>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          Escolha uma frente para aprofundar com máxima densidade analítica, foco comercial e rigor forense.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {topics.map(topic => {
          const hiddenPrompt = buildDeepDiveHiddenPrompt(topic.basePrompt, topic.label);

          return (
            <button
              key={topic.id}
              type="button"
              title={`${topic.subtitle}\n\nImpacto: ${topic.impact}`}
              onClick={() =>
                onSelectTopic(`Dossiê completo: ${topic.label}`, hiddenPrompt)
              }
              className="group flex w-full flex-row items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/40 dark:hover:border-emerald-700/50 dark:hover:bg-slate-800"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 text-sm shadow-inner ring-1 ring-slate-200/50 transition-all duration-300 group-hover:scale-110 group-hover:from-emerald-100 group-hover:to-emerald-50 group-hover:ring-emerald-200 dark:from-slate-800 dark:to-slate-800/80 dark:ring-slate-700 dark:group-hover:from-emerald-900/60 dark:group-hover:to-emerald-900/30 dark:group-hover:ring-emerald-800">
                {topic.icon}
              </div>
              <div className="flex flex-col justify-center overflow-hidden">
                <span className="truncate text-xs font-bold text-slate-800 transition-colors group-hover:text-emerald-700 dark:text-slate-200 dark:group-hover:text-emerald-400">
                  {topic.label}
                </span>
                <span className="truncate text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 transition-colors group-hover:text-emerald-600/70 dark:text-slate-500 dark:group-hover:text-emerald-400/70">
                  {topic.shortLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default DeepDiveTopics;
