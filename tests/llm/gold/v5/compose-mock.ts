/**
 * V5 — Golden Set: compose mock COMUM.
 *
 * Consome o FrontierPack e produz o Gold Brief de forma DETERMINÍSTICA
 * para qualquer conta (mesmo helper para as 13 fixtures). Prova que o Gold
 * depende exclusivamente do conteúdo seguro que atravessou o firewall —
 * se um trap sobreviver, ele aparece no Gold e o contrato falha.
 *
 * Contrato: 9/9 blocos · 900–1500 palavras · 0–3 mermaid (máx 1 por tipo) ·
 * ≤3 sinais · 1 frente principal · ≤2 adjacências · exatamente 3 ações.
 */
import type { ComposeInput } from '../../../../services/llm/gold/gold-pipeline';
import type { FrontierPack } from '../../../../services/llm/gold/gold-contracts';

const REQUIRED_SECTION_HEADINGS = [
  'Conta em 30 segundos',
  'Estrutura do grupo',
  'Mapa operacional',
  'Sinais que mudam a abordagem',
  'Bordas e gaps',
  'Estratégia de entrada',
  'Quem abordar',
  'Primeiro toque',
  'Próximas 3 ações',
] as const;

function safeSentence(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function composeGoldFromFrontier(input: ComposeInput): string {
  const pack: FrontierPack = input.safePack;
  const identity = pack.accountIdentity;

  const facts = pack.facts.map((f) => `- ${safeSentence(f.claim)} (fonte: ${f.source}).`).join('\n');
  const signals = pack.technologySignals
    .slice(0, 3)
    .map((s) => `- ${safeSentence(s.technology)}: ${safeSentence(s.observedFact)}.`)
    .join('\n');
  const people = pack.people
    .map((p) => `- ${p.personName}: ${p.role} (base: ${p.roleBasis}).`)
    .join('\n');
  const relations = pack.relationships
    .slice(0, 3)
    .map((r) => `- ${r.relatedEntity}: relação ${r.relationType.replace(/_/g, ' ')}.`)
    .join('\n');

  const mermaidBlocks: string[] = [];
  if (pack.relationships.length > 0) {
    mermaidBlocks.push(
      [
        '```mermaid',
        'flowchart LR',
        `    A["${identity.legalName}"] --> B["Relações canônicas"]`,
        '```',
      ].join('\n'),
    );
  }
  if (pack.facts.some((f) => f.kind === 'operation')) {
    mermaidBlocks.push(
      ['```mermaid', 'flowchart LR', '    A["Operação"] --> B["Processos"] --> C["Resultados"]', '```'].join('\n'),
    );
  }
  const mermaidSection = mermaidBlocks.length > 0 ? `\n\n${mermaidBlocks.join('\n\n')}` : '';

  const sections: string[] = [];
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[0]}`);
  sections.push(
    `${identity.legalName} (${identity.inputCnpj}) é ${identity.establishmentType.toLowerCase()} da raiz ${identity.rootCnpj}. ` +
      `A conta opera em sua localidade principal com estrutura identificada em fontes cadastrais e informações do recorte interno. ` +
      `O perfil combina características operacionais e societárias que posicionam a conta como alvo relevante para abordagem comercial. ` +
      `A base de informações confirma os pontos centrais da operação e delimita o que permanece como pergunta de validação. ` +
      `O recorte disponível permite uma leitura inicial consistente, sem que isso substitua a confirmação direta com a empresa. ` +
      `A abordagem comercial deve partir dos pontos confirmados e tratar o restante como agenda de validação, ` +
      `evitando afirmações que a base de informações ainda não sustenta. ` +
      `A leitura inicial combina dados cadastrais, registros operacionais e informações de mercado disponíveis no recorte, ` +
      `de forma que a narrativa comercial reflita apenas o que pode ser sustentado por fonte. ` +
      `As próximas seções detalham estrutura, operação, sinais e a estratégia de entrada recomendada para a conta.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[1]}`);
  sections.push(
    `A identidade cadastral da conta é determinística: ${identity.establishmentType.toLowerCase()} com raiz ${identity.rootCnpj}. ` +
      `As relações societárias diretas estão registradas no QSA oficial e as demais relações foram classificadas pela precedência canônica, ` +
      `que prioriza a mesma raiz, depois a participação direta e por último as relações laterais encontradas via sócio. ` +
      `Compartilhamento de sócio não configura grupo econômico sem evidência adicional, e nenhuma relação lateral foi promovida sem comprovação. ` +
      `A estrutura de participações, quando existe, está registrada a partir do QSA e de fontes cadastrais determinísticas. ` +
      `A leitura societária serve de roteiro para entender governança e possíveis pontos de decisão, sem antecipar conclusões.` +
      (relations ? `\n\nRelações registradas:\n${relations}` : ''),
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[2]}`);
  sections.push(
    `Os fatos confirmados do recorte são:\n${facts || '- Nenhum fato adicional confirmado no recorte.'}` +
      `\n\nA presença de módulos contratados comprova contratação, mas não comprova isoladamente uso ou cobertura de cada processo. ` +
      `A descrição operacional deve ser validada com a conta antes de qualquer afirmação de processo ou de fluxo de trabalho. ` +
      `A leitura operacional aqui apresentada consolida exclusivamente o que tem origem confirmada e sinaliza o restante como validação pendente. ` +
      `A confirmação direta com a operação é o passo que transforma observações do recorte em entendimento consolidado do negócio.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[3]}`);
  sections.push(
    `Sinais que mudam a abordagem:\n${signals || '- Nenhum sinal tecnológico adicional identificado.'}` +
      `\n\nOs sinais listados são observações do recorte e permanecem sujeitos a validação na visita. ` +
      `Cada sinal representa uma direção de investigação, não uma conclusão sobre a operação da empresa. ` +
      `A priorização dos sinais na abordagem depende da confirmação direta com a conta.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[4]}`);
  sections.push(
    `Tecnologias e processos não identificados no recorte interno não implicam ausência na empresa. ` +
      `Nenhuma lacuna foi confirmada e nenhuma conclusão de ausência deve ser extraída da falta de menção em fontes. ` +
      `As observações de não identificação se convertem em perguntas de validação neutras para a primeira conversa. ` +
      `A formulação dessas perguntas não pressupõe ausência nem falha: apenas abre a confirmação de qual solução suporta cada processo. ` +
      `Esse cuidado evita que a ausência de informação seja interpretada como evidência de inexistência. ` +
      `A mesma disciplina se aplica a todos os elos da operação: o que não está no recorte continua sendo uma pergunta em aberto, ` +
      `e o que está confirmado sustenta a narrativa comercial sem exageros. ` +
      `O veredito final da leitura é direcional: indica onde concentrar o esforço comercial e o que validar primeiro, ` +
      `sem transformar ausência de informação em afirmação sobre a empresa. ` +
      `A disciplina de evidência aplicada aqui é o mesmo padrão usado em todas as contas analisadas pelo pipeline.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[5]}`);
  sections.push(
    `A frente principal de abordagem é a operação central da conta, onde há maior densidade de informação confirmada. ` +
      `As adjacências são a estrutura societária e a expansão de processos correlatos, ambas sujeitas a validação. ` +
      `O primeiro movimento comercial deve demonstrar domínio do recorte e abrir perguntas de validação, sem afirmar lacunas. ` +
      `A entrada recomendada prioriza o processo com maior confirmação de informação, construindo credibilidade antes de explorar os demais temas. ` +
      `A sequência de conversas deve avançar das confirmações para as validações, de modo que cada etapa agregue entendimento ` +
      `e mantenha a proposta de valor ancorada em fatos já estabelecidos com a conta.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[6]}`);
  sections.push(
    `As pessoas listadas no QSA são o mapa inicial de acesso; o papel funcional de cada uma não está confirmado por fonte oficial. ` +
      `A validação dos papéis funcionais é pré-requisito para direcionar a abordagem ao interlocutor correto. ` +
      `Cargos e responsabilidades informados por outras fontes estão registrados com sua base de origem.` +
      (people ? `\n\nPessoas:\n${people}` : ''),
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[7]}`);
  sections.push(
    `O primeiro toque deve ser consultivo: demonstrar entendimento da operação, validar papéis funcionais e perguntar, de forma neutra, ` +
      `qual solução suporta hoje os processos não identificados no recorte. A pergunta não pressupõe ausência nem lacuna. ` +
      `A agenda da primeira conversa deve combinar a confirmação dos dados cadastrais com a abertura dos temas de validação, ` +
      `mantendo o tom de parceria e o foco no entendimento do negócio antes de qualquer proposta. ` +
      `O objetivo do primeiro contato é estabelecer credibilidade e mapear prioridades, ` +
      `deixando claro o que já é conhecido e o que precisa ser confirmado com a operação.`,
  );
  sections.push(`# ${REQUIRED_SECTION_HEADINGS[8]}`);
  sections.push(
    '1. Validar com o contato o papel funcional de cada pessoa do QSA.\n' +
      '2. Confirmar quais soluções suportam hoje os processos centrais da operação.\n' +
      '3. Confirmar a estrutura de relações societárias e eventuais expansões planejadas.\n' +
      'As três ações são sequenciais e dependem da validação da primeira conversa.',
  );

  return `# Gold Brief — ${identity.legalName}\n\n${sections.join('\n\n')}${mermaidSection}`;
}

export { REQUIRED_SECTION_HEADINGS };
