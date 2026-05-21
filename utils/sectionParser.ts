export interface ParsedSection {
  key: string;
  title: string;
  content: string;
  level: number;
  kind?: 'intro' | 'module' | 'section';
}

export type SellerSectionKind = 'brief' | 'maps' | 'cards' | 'default';

function normalizeSectionTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getSellerSectionKind(title: string): SellerSectionKind {
  const normalized = normalizeSectionTitle(title);
  if (normalized.includes('brief de reuniao')) return 'brief';
  if (normalized.includes('mapas visuais')) return 'maps';
  if (normalized.includes('cards de auditoria')) return 'cards';
  return 'default';
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 44);
}

function buildKey(title: string, index: number): string {
  const base = slugify(title) || `secao_${index + 1}`;
  return `${base}_${index + 1}`;
}

function shouldSplitAtLevel(level: number, hasPrimaryModules: boolean): boolean {
  if (hasPrimaryModules) return level === 1;
  return level === 2 || level === 3;
}

function isSellerContainerSection(title: string): boolean {
  return getSellerSectionKind(title) !== 'default';
}

export function parseMarkdownSections(markdown: string): ParsedSection[] {
  const source = markdown.replace(/\r\n/g, '\n').trim();
  if (!source) return [];

  const lines = source.split('\n');
  const hasPrimaryModules = lines.some(line => /^#\s+/.test(line.trim()));
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let introLines: string[] = [];

  const pushCurrentSection = () => {
    if (!currentSection) return;
    const content = currentSection.content.trim();
    if (!content) {
      currentSection = null;
      return;
    }
    sections.push({ ...currentSection, content });
    currentSection = null;
  };

  const pushIntro = () => {
    const content = introLines.join('\n').trim();
    if (!content) {
      introLines = [];
      return;
    }
    sections.push({
      key: 'intro',
      title: 'Introdução',
      content,
      level: hasPrimaryModules ? 1 : 2,
      kind: 'intro',
    });
    introLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, '');
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);

    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      if (currentSection && isSellerContainerSection(currentSection.title) && level > currentSection.level) {
        currentSection.content += `${line}\n`;
        continue;
      }

      if (shouldSplitAtLevel(level, hasPrimaryModules)) {
        if (!currentSection && introLines.length > 0) {
          pushIntro();
        } else {
          pushCurrentSection();
        }

        currentSection = {
          key: buildKey(title, sections.length),
          title,
          content: '',
          level,
          kind: level === 1 ? 'module' : 'section',
        };
        continue;
      }
    }

    if (currentSection) {
      currentSection.content += `${line}\n`;
    } else {
      introLines.push(line);
    }
  }

  if (currentSection) {
    pushCurrentSection();
  } else if (introLines.length > 0) {
    pushIntro();
  }

  return sections.filter(section => section.content.trim().length > 0);
}
