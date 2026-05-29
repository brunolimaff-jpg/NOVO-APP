import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'docs/obsidian/_meta/manifest.json');

function fail(message) {
  console.error(`[obsidian-check] ${message}`);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return null;
  }

  const keys = [];
  for (const line of match[1].split(/\r?\n/)) {
    const keyMatch = line.match(/^([a-z_]+):/);
    if (keyMatch) {
      keys.push(keyMatch[1]);
    }
  }

  return { raw: match[1], keys: new Set(keys) };
}

function main() {
  if (!existsSync(manifestPath)) {
    fail(`manifesto ausente: ${manifestPath}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const errors = [];

  if (!Array.isArray(manifest.required_frontmatter) || manifest.required_frontmatter.length === 0) {
    errors.push('manifesto sem required_frontmatter');
  }

  if (!Array.isArray(manifest.required_notes) || manifest.required_notes.length === 0) {
    errors.push('manifesto sem required_notes');
  }

  for (const note of manifest.required_notes || []) {
    const notePath = path.join(repoRoot, note.path);

    if (!existsSync(notePath)) {
      errors.push(`nota obrigatoria ausente: ${note.path}`);
      continue;
    }

    const content = readFileSync(notePath, 'utf8');
    const frontmatter = parseFrontmatter(content);

    if (!frontmatter) {
      errors.push(`frontmatter ausente: ${note.path}`);
      continue;
    }

    for (const key of manifest.required_frontmatter) {
      if (!frontmatter.keys.has(key)) {
        errors.push(`frontmatter obrigatorio ausente em ${note.path}: ${key}`);
      }
    }

    if (note.path !== manifest.master_note && !content.includes('[[00-MASTER]]')) {
      errors.push(`backlink para [[00-MASTER]] ausente em ${note.path}`);
    }

    for (const requiredLink of note.required_links || []) {
      if (!content.includes(requiredLink)) {
        errors.push(`wikilink obrigatorio ausente em ${note.path}: ${requiredLink}`);
      }
    }
  }

  const masterPath = path.join(repoRoot, manifest.master_note);
  if (!existsSync(masterPath)) {
    errors.push(`master note ausente: ${manifest.master_note}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      fail(error);
    }
    fail(`falhou com ${errors.length} problema(s)`);
    process.exit(1);
  }

  console.log(`[obsidian-check] OK - ${manifest.required_notes.length} notas validadas`);
}

main();
