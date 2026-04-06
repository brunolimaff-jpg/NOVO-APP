const MERMAID_START_PATTERN =
  /(graph\s+(?:TB|TD|LR|RL|BT)?|flowchart\s+(?:TB|TD|LR|RL|BT)?|sequenceDiagram|gantt|classDiagram|stateDiagram-v2?|erDiagram|journey|pie|quadrantChart|gitGraph)/i;

export function normalizeInlineMermaidClasses(chart: string): string {
  const classLines: string[] = [];
  const seenClassAssignments = new Set<string>();
  const normalized = chart.replace(
    /([A-Za-z][\w-]*)(\s*(?:\[[^\]\n]+\]|\([^\)\n]+\)|\{[^\}\n]+\}|>"[^"\n]+"|>"[^"\n]*"|"(?:[^"\n]+)"))\s*:::\s*([A-Za-z][\w-]*)/g,
    (_full, nodeId: string, nodeShape: string, className: string) => {
      const classLine = `class ${nodeId} ${className};`;
      if (!seenClassAssignments.has(classLine)) {
        seenClassAssignments.add(classLine);
        classLines.push(classLine);
      }
      return `${nodeId}${nodeShape}`;
    },
  );

  if (classLines.length === 0) return normalized;
  return `${normalized}\n${classLines.join('\n')}`;
}

function normalizeMermaidText(input: string): string {
  return input
    .replace(/<br\s*\/?>\s*/gi, '\n')
    .replace(/&lt;br\s*\/?&gt;\s*/gi, '\n')
    .replace(/<\!--[\s\S]*?-->/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .trim();
}

function quoteLooseSubgraphLabels(input: string): string {
  return input.replace(
    /^(\s*subgraph\s+)([^"'\n\[\]{]+?)(\s*)$/gm,
    (full, prefix, label, suffix) => {
      const trimmed = label.trim();
      if (!trimmed || /[\s()\[\]\/\\%:]/.test(trimmed)) return full;
      return `${prefix}"${trimmed.replace(/"/g, "'")}"${suffix}`;
    },
  );
}

export function normalizeMermaidBlocks(markdown: string): string {
  if (!markdown) return '';

  const fence = '`'.repeat(3);
  return markdown
    .replace(/\{"mermaid":"([\s\S]*?)"\}/g, (_match, raw: string) => {
      const unescaped = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      return `\n${fence}mermaid\n${normalizeInlineMermaidClasses(unescaped)}\n${fence}\n`;
    })
    .replace(/```mermaid\s*([\s\S]*?)```/gi, (_match, raw: string) => {
      return `${fence}mermaid\n${normalizeInlineMermaidClasses(raw.trim())}\n${fence}`;
    });
}

export function sanitizeMermaidCode(input: string): string {
  if (!input) return '';

  let code = normalizeInlineMermaidClasses(normalizeMermaidText(input))
    .replace(/^[^a-zA-Z]+/, '')
    .trim();

  code = quoteLooseSubgraphLabels(code);

  const match = code.match(MERMAID_START_PATTERN);
  if (!match) return '';

  code = code.slice(match.index ?? 0).trim();

  const firstWord = code.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (
    !/^(graph|flowchart|sequencediagram|gantt|classdiagram|statediagram-v2?|erdiagram|journey|pie|quadrantchart|gitgraph)$/.test(
      firstWord,
    )
  ) {
    return '';
  }

  return code;
}

export function getDisplayableMermaidCode(input: string): string {
  const sanitized = sanitizeMermaidCode(input);
  if (sanitized) return sanitized;
  return normalizeInlineMermaidClasses(normalizeMermaidText(input));
}
