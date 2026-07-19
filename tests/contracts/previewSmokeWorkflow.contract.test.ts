import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const WORKFLOW_PATH = resolve(import.meta.dirname, '../../.github/workflows/preview-smoke.yml');
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

function executableBlocks(source: string) {
  const lines = source.split('\n');
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(?:run|script):\s*[>|][+-]?\s*$/);
    if (!match) continue;

    const indent = match[1].length;
    const block: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].trim() && lines[cursor].match(/^\s*/)?.[0].length <= indent) break;
      block.push(lines[cursor]);
    }
    blocks.push(block.join('\n'));
  }

  return blocks;
}

function stepBody(name: string) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, end === -1 ? undefined : end);
}

function resolverScript() {
  const match = stepBody('Resolver preview URL').match(/node <<'NODE'\n([\s\S]*?)\n\s*NODE/);
  expect(match?.[1]).toBeTruthy();
  return match?.[1] ?? '';
}

function resolvePreview(env: Record<string, string>) {
  const directory = mkdtempSync(resolve(tmpdir(), 'preview-smoke-contract-'));
  const output = resolve(directory, 'github-output');
  const result = spawnSync(process.execPath, ['-e', resolverScript()], {
    encoding: 'utf8',
    env: { ...process.env, ...env, GITHUB_OUTPUT: output },
  });
  const value = result.status === 0 ? readFileSync(output, 'utf8') : '';
  rmSync(directory, { recursive: true, force: true });
  return { result, value };
}

async function validateManualPrNumber(rawPrNumber: string) {
  const match = stepBody('Comentar falha no PR (manual)').match(/script: \|\n([\s\S]*)$/);
  expect(match?.[1]).toBeTruthy();
  const script = (match?.[1] ?? '')
    .split('\n')
    .map(line => line.replace(/^ {12}/, ''))
    .join('\n');

  const original = process.env.PR_NUMBER;
  process.env.PR_NUMBER = rawPrNumber;
  const createComment = vi.fn(async () => undefined);
  try {
    await new Function('context', 'github', `return (async () => {${script}})();`)(
      { serverUrl: 'https://github.example', repo: { owner: 'owner', repo: 'repo' }, runId: 1 },
      { rest: { issues: { createComment } } },
    );
    return createComment;
  } finally {
    if (original === undefined) delete process.env.PR_NUMBER;
    else process.env.PR_NUMBER = original;
  }
}

describe('preview-smoke workflow contract', () => {
  it('autoriza /smoke somente no início, em PR e para associações confiáveis', () => {
    expect(workflow).toContain("startsWith(github.event.comment.body, '/smoke ')");
    expect(workflow).toContain('github.event.issue.pull_request');
    expect(workflow).toContain('fromJSON(\'["OWNER","MEMBER","COLLABORATOR"]\')');
    expect(workflow).not.toContain("contains(github.event.comment.body, '/smoke')");
  });

  it('não interpola expressões GitHub em blocos executáveis', () => {
    expect(executableBlocks(workflow).every(block => !block.includes('${{'))).toBe(true);
  });

  it('passa todos os inputs controláveis por env', () => {
    expect(workflow).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(workflow).toContain('INPUT_PREVIEW_URL: ${{ inputs.preview_url }}');
    expect(workflow).toContain('DEPLOYMENT_ENVIRONMENT_URL: ${{ github.event.deployment_status.environment_url }}');
    expect(workflow).toContain('DEPLOYMENT_TARGET_URL: ${{ github.event.deployment_status.target_url }}');
    expect(workflow).toContain('COMMENT_BODY: ${{ github.event.comment.body }}');
    expect(workflow).toContain('PR_NUMBER: ${{ inputs.pr_number }}');
  });

  it('usa Node 24 e valida pr_number no ambiente antes de comentar', () => {
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('process.env.PR_NUMBER');
    expect(workflow).toContain('/^[1-9]\\d*$/');
    expect(workflow).toContain('Number.isSafeInteger(prNumber)');
  });

  it('mantém o secret fora da resolução e somente no passo de smoke', () => {
    expect(stepBody('Resolver preview URL')).not.toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(stepBody('Executar smoke')).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
  });

  it('aceita somente o preview HTTPS permitido e normaliza a origem', () => {
    const { result, value } = resolvePreview({
      EVENT_NAME: 'workflow_dispatch',
      INPUT_PREVIEW_URL: 'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app/',
      DEPLOYMENT_ENVIRONMENT_URL: '',
      DEPLOYMENT_TARGET_URL: '',
      COMMENT_BODY: '',
    });
    expect(result.status).toBe(0);
    expect(value).toBe('preview_url=https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app\n');
  });

  it.each([
    'http://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app',
    'https://evil.example',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app.evil.example',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app@evil.example',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app:8443',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app/caminho',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app?token=1',
    'https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app#fragmento',
  ])('rejeita URL não permitida: %s', input => {
    const { result } = resolvePreview({
      EVENT_NAME: 'workflow_dispatch',
      INPUT_PREVIEW_URL: input,
      DEPLOYMENT_ENVIRONMENT_URL: '',
      DEPLOYMENT_TARGET_URL: '',
      COMMENT_BODY: '',
    });
    expect(result.status).not.toBe(0);
  });

  it.each([
    '/smoke $(echo https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app)',
    '/smoke https://scoutagro-mpc5evjf7-brunolimaff-3629s-projects.vercel.app\necho pwned',
  ])('rejeita comentário não literal: %s', comment => {
    const { result } = resolvePreview({
      EVENT_NAME: 'issue_comment',
      INPUT_PREVIEW_URL: '',
      DEPLOYMENT_ENVIRONMENT_URL: '',
      DEPLOYMENT_TARGET_URL: '',
      COMMENT_BODY: comment,
    });
    expect(result.status).not.toBe(0);
  });

  it.each(['-1', '1.5', '1; process.exit(0)', '9007199254740992'])('rejeita pr_number inválido: %s', async input => {
    await expect(validateManualPrNumber(input)).rejects.toThrow();
  });

  it('aceita pr_number decimal positivo e seguro', async () => {
    const createComment = await validateManualPrNumber('414');
    expect(createComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 414 }));
  });
});
