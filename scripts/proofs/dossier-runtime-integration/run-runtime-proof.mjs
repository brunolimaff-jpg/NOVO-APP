import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(scriptDir, '../../..');
const proofFile = 'tests/proofs/dossier-runtime-integration/dossier-runtime-integration.test.ts';
const migrationFile = 'supabase/migrations/20260802111500_dossier_checkpoint_attempt_contract.sql';

const sha256 = file => createHash('sha256').update(readFileSync(join(repoRoot, file))).digest('hex');
const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', proofFile, '--reporter=dot'];

try {
  const output = execFileSync(command[0], command.slice(1), { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(JSON.stringify({
    proof: 'DOSSIER_FLOW_05E_0B_RUNTIME_INTEGRATION',
    status: 'PASS',
    sourceHead,
    migrationSha256: sha256(migrationFile),
    remoteActions: false,
    command: command.join(' '),
    outputTail: output.trim().split('\n').slice(-8),
  }, null, 2) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({
    proof: 'DOSSIER_FLOW_05E_0B_RUNTIME_INTEGRATION',
    status: 'FAIL',
    sourceHead,
    migrationSha256: sha256(migrationFile),
    remoteActions: false,
    command: command.join(' '),
    exitCode: error.status ?? 1,
    outputTail: String(error.stdout ?? error.stderr ?? error.message).trim().split('\n').slice(-20),
  }, null, 2) + '\n');
  process.exitCode = 1;
}
