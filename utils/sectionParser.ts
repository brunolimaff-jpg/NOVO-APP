export interface ParsedSection {
  key: string;        // identificador único (slug)
  title: string;      // título original com emoji
  content: string;    // conteúdo da seção até o próximo header
  level: number;      // nível do header (## = 2, ### = 3)
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove emojis e caracteres especiais
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 50); // limite de tamanho
}

export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  
  // Regex para headers markdown (## ou ###) no início da linha
  // Captura o nível (##) e o título
  const headerRegex = /^(#{2,3})\s+(.+)$/gm;
  
  let match;
  let _lastIndex = 0;
  
  // Se não começa com header, cria seção genérica "intro"
  // Procura onde começa o primeiro header para definir o fim da intro
  const firstHeaderMatch = markdown.match(/^#{2,3}\s+/m);
  
  if (!firstHeaderMatch || (firstHeaderMatch.index !== undefined && firstHeaderMatch.index > 0)) {
    const introEnd = firstHeaderMatch && firstHeaderMatch.index !== undefined 
      ? firstHeaderMatch.index 
      : markdown.length;
      
    const introContent = markdown.substring(0, introEnd).trim();
    
    if (introContent) {
      sections.push({
        key: "intro",
        title: "Introdução / Resumo",
        content: introContent,
        level: 2
      });
    }
    _lastIndex = introEnd;
  }
  
  // Extrai cada seção subsequente
  while ((match = headerRegex.exec(markdown)) !== null) {
    const [_fullMatch, _hashes, _title] = match;
    const _level = _hashes.length;
    const _startIndex = match.index;
    
    // Se já processou uma seção anterior (que não seja a intro), define o conteúdo dela agora
    // O conteúdo vai do final do header anterior até o início deste header
    if (sections.length > 0) {
      const prevSection = sections[sections.length - 1];
      
      // Se for a intro, já foi tratada. Se for uma seção capturada pelo regex anterior:
      if (prevSection.key !== "intro") {
         // O conteúdo da seção anterior termina onde esta começa
         // Precisamos pegar o texto entre o fim do match anterior e o inicio deste match
         // Mas como estamos num loop regex, é mais fácil pegar substring global
      }
    }

    // A lógica acima fica complexa com loop regex. Vamos simplificar:
    // Vamos coletar todos os índices de headers primeiro.
  }
  
  // ABORDAGEM SIMPLIFICADA DE PARSER
  const lines = markdown.split('\n');
  let currentSection: ParsedSection | null = null;
  
  // Reinicia array para usar abordagem linha a linha
  const resultSections: ParsedSection[] = [];
  
  // Verifica se tem conteúdo antes do primeiro header
  if (!lines[0]?.startsWith('##')) {
     currentSection = {
         key: 'intro',
         title: 'Introdução',
         content: '',
         level: 2
     };
     resultSections.push(currentSection);
  }

  for (const line of lines) {
      const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);
      
      if (headerMatch) {
          const level = headerMatch[1].length;
          const title = headerMatch[2].trim();
          
          currentSection = {
              key: slugify(title),
              title: title,
              content: '',
              level: level
          };
          resultSections.push(currentSection);
      } else {
          if (currentSection) {
              currentSection.content += line + '\n';
          } else {
              // Caso de borda raríssimo onde começa vazio ou primeira linha é vazia antes de header
              // Ignora ou cria intro se tiver texto relevante
              if (line.trim()) {
                  currentSection = { key: 'intro', title: 'Introdução', content: line + '\n', level: 2 };
                  resultSections.push(currentSection);
              }
          }
      }
  }

  // Limpeza final e filtros
  return resultSections
    .map(s => ({...s, content: s.content.trim()}))
    .filter(s => s.content.length > 0);
}