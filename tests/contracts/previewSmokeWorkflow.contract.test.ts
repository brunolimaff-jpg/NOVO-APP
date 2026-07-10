import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = resolve(__dirname, '../../.github/workflows/preview-smoke.yml');
const workflow = readFileSync(WORKFLOW_PATH, 'utf-8');

describe('preview-smoke workflow contract', () => {
  it('aceita /smoke apenas de autores confiaveis em PRs', () => {
    expect(workflow).toContain("contains(fromJSON('[\"OWNER\",\"MEMBER\",\"COLLABORATOR\"]'), github.event.comment.author_association)");
  });

  it('mantem expressoes GitHub fora dos scripts executaveis', () => {
    expect(workflow).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(workflow).toContain('INPUT_PREVIEW_URL: ${{ inputs.preview_url }}');
    expect(workflow).toContain('DEPLOYMENT_PREVIEW_URL: ${{ github.event.deployment_status.environment_url || github.event.deployment_status.target_url }}');
    expect(workflow).toContain('COMMENT_BODY: ${{ github.event.comment.body }}');
    expect(workflow).toContain('PR_NUMBER: ${{ inputs.pr_number }}');
    expect(workflow).not.toContain('EVENT_NAME="${{ github.event_name }}"');
    expect(workflow).not.toContain('BODY="${{ github.event.comment.body }}"');
    expect(workflow).not.toContain("Number('${{ inputs.pr_number }}')");
  });

  it('so envia o bypass para previews Vercel deste projeto', () => {
    expect(workflow).toContain("PREVIEW_URL_RE='^https://scoutagro-");
    expect(workflow).toContain('if [[ ! "$PREVIEW_URL" =~ $PREVIEW_URL_RE ]]; then');
    expect(workflow).toContain("github.event.deployment.environment == 'Preview'");
  });

  it('alinha o runtime do smoke ao Node 24 do projeto', () => {
    expect(workflow).toContain('node-version: 24');
  });
});
