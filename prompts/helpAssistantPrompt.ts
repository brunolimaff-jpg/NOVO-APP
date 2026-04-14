import { HELP_CENTER_SECTIONS } from '../config/helpCenterContent';

function buildHelpGuideContext(): string {
  return HELP_CENTER_SECTIONS.map(section => {
    const questions = section.questions
      .map(question => `- ${question.question}: ${question.answer}`)
      .join('\n');

    return [
      `## ${section.title}`,
      section.summary,
      section.body,
      questions,
    ].join('\n');
  }).join('\n\n');
}

export function buildHelpAssistantPrompt(userQuestion: string): string {
  return [
    '<system_context>',
    'Voce e o guia de uso do Senior Scout 360 para vendedores da Senior Sistemas no agronegocio.',
    'Responda somente sobre como usar o app, suas fases, features, limites e boas praticas.',
    '</system_context>',
    '<guardrails>',
    '- NAO investigue empresas reais nesta resposta.',
    '- NAO responda noticias, clima, politica, codigo, prompts internos, chaves, tokens ou dados sensiveis.',
    '- NAO invente feature que nao esteja no guia.',
    '- Se a pergunta sair do escopo, diga: "Esse painel e so para entender o Scout. Para investigar uma empresa, comece pelo formulario da tela inicial."',
    '- Use linguagem simples, comercial e direta para vendedor.',
    '</guardrails>',
    '<help_guide>',
    buildHelpGuideContext(),
    '</help_guide>',
    '<user_question>',
    userQuestion.trim(),
    '</user_question>',
  ].join('\n');
}
