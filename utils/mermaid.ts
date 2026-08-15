const MERMAID_START_PATTERN =
  /(graph\s+(?:TB|TD|LR|RL|BT)?|flowchart\s+(?:TB|TD|LR|RL|BT)?|sequenceDiagram|gantt|classDiagram|stateDiagram-v2?|erDiagram|journey|pie|quadrantChart|gitGraph)/i;
const MERMAID_EDGE_PATTERN = /(?:-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~)/;
const MERMAID_RENDER_ERROR_PATTERN = /syntax error in text|parse error|error parsing|lexical error/i;

// Mermaid v10 does not support rx/ry (or other CSS geometry props) inside classDef.
// stroke-dasharray with space-separated values (e.g. "5 5") also causes a SPACE token
// parse error in Mermaid's jison grammar — the space is tokenized as SPACE token between
// two NODE_STRING tokens, producing an unexpected token error. We normalize to comma-separated.
function removeUnsupportedClassDefProps(input: string): string {
  return input.replace(/^(\s*classDef\s+\w+\s+)([^\n;]+)/gm, (_full, prefix: string, props: string) => {
    const cleaned = props
      // Remove rx/ry (unsupported geometry attributes)
      .replace(/,\s*(?:rx|ry)\s*:[^,;]*/gi, '')
      // Normalize stroke-dasharray: N N -> stroke-dasharray:N,N (space between
      // number values is a SPACE token in the jison grammar and causes parse errors)
      .replace(/(stroke-dasharray:\s*)(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi, '$1$2,$3');
    return prefix + cleaned;
  });
}

function normalizeLegacyInlineClassSyntax(input: string): string {
  if (!input) return '';
  // Legacy output sometimes emits `::className` instead of `:::className`.
  // Mermaid parser fails on this (`got 'COLON'`), so we normalize defensively.
  return input.replace(
    /(\b[A-Za-z][\w-]*\s*(?:\[[^\]\n]+\]|\([^)\n]+\)|\{[^}\n]+\}|>"[^"\n]+"|>"[^"\n]*"|"(?:[^"\n]+)"))\s*::(?!:)\s*([A-Za-z][\w-]*)/g,
    '$1:::$2',
  );
}

export function normalizeInlineMermaidClasses(chart: string): string {
  const classLines: string[] = [];
  const seenClassAssignments = new Set<string>();
  const normalizedLegacyInlineClass = normalizeLegacyInlineClassSyntax(chart);
  const normalized = normalizedLegacyInlineClass.replace(
    /([A-Za-z][\w-]*)(\s*(?:\[[^\]\n]+\]|\([^)\n]+\)|\{[^}\n]+\}|>"[^"\n]+"|>"[^"\n]*"|"(?:[^"\n]+)"))\s*:::\s*([A-Za-z][\w-]*)/g,
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

function collapseMultilineNodeLabels(input: string): string {
  // Mermaid v10 não aceita newline literal dentro de labels sem aspas
  // (ex.: A[Produção\nSoja\n10 Unidades]). O Composer pode emitir esse
  // formato mesmo quando o prompt pede <br/>. Varremos delimitadores para
  // lidar também com parênteses dentro de labels quadrados.
  const opens = new Map([['[', ']'], ['{', '}'], ['(', ')']]);
  let output = '';
  let index = 0;
  while (index < input.length) {
    const open = input[index];
    const close = opens.get(open);
    if (!close) {
      output += open;
      index += 1;
      continue;
    }

    let cursor = index + 1;
    let quoted = false;
    while (cursor < input.length) {
      const char = input[cursor];
      if (char === '"') quoted = !quoted;
      if (!quoted && char === close) break;
      cursor += 1;
    }
    if (cursor >= input.length) {
      output += open;
      index += 1;
      continue;
    }

    const label = input.slice(index + 1, cursor);
    output += `${open}${label.includes('\n') ? label.replace(/\s+/g, ' ').trim() : label}${close}`;
    index = cursor + 1;
  }
  return output;
}

function normalizeMermaidText(input: string): string {
  return collapseMultilineNodeLabels(input)
    .replace(/<br\s*\/?>(\s*)/gi, '\n')
    .replace(/&lt;br\s*\/?&gt;\s*/gi, '\n')
    // CodeQL #75 (js/incomplete-multi-character-sanitization): cobre também
    // abertura de comentário HTML SEM fechamento — remove até `-->` ou, na
    // ausência dele, até o fim do input (nunca deixa `<!--` residual passar
    // para a gramática do Mermaid).
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/gu, '')
    .replace(/[\u2013\u2014]/g, '-')
    .trim();
}

function splitCollapsedStatements(input: string): string {
  // Split ; before Mermaid control keywords (safe: only when keyword follows)
  let result = input.replace(/;(?!\n)\s*(?=classDef|class|style|click|subgraph)/gi, ';\n');

  // Split when 2+ spaces precede an edge statement (existing rule)
  result = result.replace(/([^\n])\s{2,}(?=[A-Za-z][\w-]*\s*(?:-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~))/g, '$1\n');

  // Split after ] (end of a node label) when a new edge-producing statement follows
  // with 0-1 spaces and NO preceding newline. This handles collapsed AI output like:
  //   A[label]B ==> C    or   A["label"]B-->C   or   A["label"]B ==> C
  // The ] closes a node definition, so anything after it with 0-1 spaces is a new statement.
  result = result.replace(
    /(\])[^\S\n]*(?=[A-Za-z][\w-]*\s*(?:-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~|\[))/g,
    '$1\n',
  );

  // Also split when two node definitions are immediately adjacent (NodeId[...]  NodeId[)
  // regardless of how many spaces separate them on the same line
  result = result.replace(/(\])[^\S\n]*(?=[A-Za-z][\w-]*\[)/g, '$1\n');

  return result;
}

function fixColonEdgeLabels(input: string): string {
  return input.replace(
    /([A-Za-z][\w-]*)\s*(-\.->|-->|==>)\s*([A-Za-z][\w-]*):\s*([^;\n]+)/g,
    (full, source, edge, target, label) => {
      const trimmedLabel = label.trim();
      if (edge === '-.->') return `${source} -. ${trimmedLabel} .-> ${target}`;
      if (edge === '==>') return `${source} == ${trimmedLabel} ==> ${target}`;
      return `${source} -- ${trimmedLabel} --> ${target}`;
    },
  );
}

function closeUnclosedQuotedLabelsBeforeEdges(input: string): string {
  return input.replace(
    /\b([A-Za-z][\w-]*\["[^"\n]+")(?=\s+(?:-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~))/g,
    (match: string) => {
      if (match.endsWith('"]')) return match;
      return `${match}]`;
    },
  );
}

// Mermaid v10 jison grammar cannot parse bare (unquoted) text after edge arrows.
// E.g. `B -.-> Consolidação Manual / Integração` triggers "got 'NODE_STRING'" because
// the parser expects a node identifier but receives loose text with spaces/slashes.
// Fix: detect bare text targets (not starting with " [ ( { |) and wrap them in a
// synthetic node with a quoted label, similar to materializeQuotedEdgeTargets.
function materializeBareEdgeTargets(input: string): string {
  const EDGE_OPS = '-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~';
  const EDGE_RE = new RegExp(
    `^(\\s*[A-Za-z][\\w-]*\\s*(?:${EDGE_OPS})\\s+)` + // prefix: "  NodeId -.-> "
      `([^"\\[({|\\n][^\\n;]*)` + // bare text (not starting with " [ ( { |)
      `(\\s*)$`, // trailing whitespace
    'gm',
  );

  let idx = 0;
  return input.replace(EDGE_RE, (_full, prefix: string, bareText: string, suffix: string) => {
    const trimmed = bareText.trim();
    // Already a valid node ID (single alphanumeric word) — leave as-is
    if (/^[A-Za-z][\w-]*$/.test(trimmed)) return _full;
    // Already has a shape suffix: NodeId[...] or NodeId(...) etc
    if (/^[A-Za-z][\w-]*\s*(?:\[|\(|\{)/.test(trimmed)) return _full;

    idx += 1;
    const safeLabel = trimmed.replace(/"/g, "'");
    return `${prefix}mermaid_bare_${idx}["${safeLabel}"]${suffix}`;
  });
}

function materializeQuotedEdgeTargets(input: string): string {
  let syntheticNodeIndex = 0;
  return input.replace(
    /^(\s*[A-Za-z][\w-]*\s*(?:-->|==>|-.->|---|===|==|--o|o--|x--|--x|~~~)\s*)"([^"\n]+)"(\s*)$/gm,
    (_full, prefix: string, label: string, suffix: string) => {
      syntheticNodeIndex += 1;
      const safeLabel = label.trim().replace(/"/g, "'");
      return `${prefix}mermaid_note_${syntheticNodeIndex}["${safeLabel}"]${suffix}`;
    },
  );
}

function quoteLooseSubgraphLabels(input: string): string {
  return input.replace(/^(\s*subgraph\s+)([^"'\n[\]{]+?)(\s*)$/gm, (full, prefix, label, suffix) => {
    const trimmed = label.trim();
    if (!trimmed) return full;
    // If label contains special chars that require quoting, wrap in double-quotes
    // Special chars: spaces, parentheses, brackets, slashes, backslashes, percent, colon
    if (/[\s()[\]/\\%:]/.test(trimmed)) {
      return `${prefix}"${trimmed.replace(/"/g, "'")}"${suffix}`;
    }
    return full;
  });
}

// Mermaid v10 jison grammar treats (, ), {, }, /, | as separate tokens (PS, PE, BRKT,
// SUBROUTINEEND, PIPE) even inside unquoted square-bracket node labels.
// When a node label contains these chars without enclosing double-quotes, the parser
// raises a "got 'PS'" / "got 'BRKT'" unexpected-token error.
// Fix: wrap such labels in double-quotes, which puts the lexer into a string context.
function quoteNodeLabels(input: string): string {
  // Matches: NodeId[label text] where label is NOT already double-quoted
  // Special chars that must trigger quoting: ( ) { } / | \
  // Already-quoted labels (NodeId["text"]) are skipped by the negative lookahead.
  return input.replace(/\b([A-Za-z][\w-]*)\[(?!")([^\]\n]+)\]/g, (_full, nodeId: string, label: string) => {
    if (/[(){}|/\\]/.test(label)) {
      const safeLabel = label.trim().replace(/"/g, "'");
      return `${nodeId}["${safeLabel}"]`;
    }
    return _full;
  });
}

// Same as quoteNodeLabels but for round-bracket () and curly-bracket {} node shapes.
// E.g. `D(Integração / Manual)` — the `/` inside round brackets triggers a tokenizer error.
function quoteRoundAndCurlyLabels(input: string): string {
  // Round brackets: NodeId(label with special)
  let result = input.replace(/\b([A-Za-z][\w-]*)\((?!")([^)\n]+)\)/g, (_full, nodeId: string, label: string) => {
    if (/[/\\|{}]/.test(label)) {
      const safeLabel = label.trim().replace(/"/g, "'");
      return `${nodeId}("${safeLabel}")`;
    }
    return _full;
  });

  // Curly brackets: NodeId{label with special}
  result = result.replace(/\b([A-Za-z][\w-]*)\{(?!")([^}\n]+)\}/g, (_full, nodeId: string, label: string) => {
    if (/[/\\|()]/.test(label)) {
      const safeLabel = label.trim().replace(/"/g, "'");
      return `${nodeId}{"${safeLabel}"}`;
    }
    return _full;
  });

  return result;
}

// Pipe-style edge labels |label| that contain () are also problematic:
// the ( inside a |...| context can still trigger PS token depending on lex state.
// Fix: wrap the label in double-quotes: |"label with (parens)"|
function quotePipeEdgeLabelSpecialChars(input: string): string {
  // BRU-108 (1a): pipes dentro de labels JÁ citados com aspas duplas
  // (ex.: C1["... | GATec (Gestão Agrícola, ...) | ..."]) são separadores do
  // builder determinístico, NÃO rótulos de aresta. Aplicar a regra de
  // citação nesses pipes fecha a string no meio e expõe `(` ao parser
  // (parse error "got 'PS'"). Preserva os labels citados, transforma apenas
  // os pares `|...|` fora deles (rótulos de aresta reais).
  const quoted = new Map<string, string>();
  const withoutQuoted = input.replace(/"([^"\n]+)"/g, (_full, label: string) => {
    const key = `\uE000Q${quoted.size}\uE000`;
    quoted.set(key, `"${label}"`);
    return key;
  });

  const transformed = withoutQuoted.replace(/\|([^|\n\uE000]+)\|/g, (_full, label: string) => {
    if (/[(){}]/.test(label)) {
      const safeLabel = label.trim().replace(/"/g, "'");
      return `|"${safeLabel}"|`;
    }
    return _full;
  });

  return transformed.replace(/\uE000Q(\d+)\uE000/g, (_full, index: string) => quoted.get(`\uE000Q${index}\uE000`) ?? _full);
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

function fixClassStatements(input: string): string {
  // Fix class statements with invalid node IDs (starting with numbers or special chars)
  // E.g., "class 1A danger;" -> "class _1A danger;"
  return input.replace(/^(\s*class\s+)([^;\s]+)((?:\s+[^;]+)?;?\s*)$/gm, (full, prefix, nodeId, suffix) => {
    // If nodeId starts with a digit or has invalid chars, prefix with underscore
    if (/^[0-9]/.test(nodeId)) {
      return `${prefix}_${nodeId}${suffix}`;
    }
    return full;
  });
}

export function sanitizeMermaidCode(input: string): string {
  if (!input) return '';

  let code = removeUnsupportedClassDefProps(normalizeInlineMermaidClasses(normalizeMermaidText(input)))
    .replace(/[\t ]+$/gm, '')
    .replace(/^[^a-zA-Z]+/, '')
    .trim();

  code = splitCollapsedStatements(code);
  code = closeUnclosedQuotedLabelsBeforeEdges(code);
  code = fixColonEdgeLabels(code);
  code = quoteNodeLabels(code);
  code = quoteRoundAndCurlyLabels(code);
  code = quotePipeEdgeLabelSpecialChars(code);
  code = materializeBareEdgeTargets(code);
  code = materializeQuotedEdgeTargets(code);
  code = quoteLooseSubgraphLabels(code);
  code = fixClassStatements(code);

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

export function isMermaidRenderErrorOutput(rendered: string): boolean {
  if (!rendered) return false;
  if (!MERMAID_RENDER_ERROR_PATTERN.test(rendered)) return false;
  return !MERMAID_EDGE_PATTERN.test(rendered);
}
