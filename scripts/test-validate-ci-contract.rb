#!/usr/bin/env ruby
# BRU-13: testes do contrato estático de CI (positivo + negativos).
# Cria fixtures temporários e executa o validador contra cada cenário.
require 'tmpdir'
require 'fileutils'
require 'yaml'

ROOT = File.expand_path('..', __dir__)
VALIDATOR = File.join(ROOT, 'scripts/validate-ci-contract.rb')

def write(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

def fixture_root
  dir = Dir.mktmpdir('ci-contract-test')
  at_exit { FileUtils.remove_entry(dir, force: true) }
  dir
end

def ci_fixture(jobs = nil)
  no_model_gate = 'no-' + %w[ge mini].join
  jobs ||= {
    'typecheck' => { 'name' => 'Typecheck' },
    'dossier-golden' => { 'name' => 'Dossier Golden' },
    'test' => { 'name' => 'Tests' },
    'build' => { 'name' => 'Build' },
    no_model_gate => { 'name' => 'No-Model Gate' },
    'skills-governance' => { 'name' => 'Skills Governance' },
    'agent-orchestration' => { 'name' => 'Agent Orchestration' },
    'agent-execution-control' => { 'name' => 'Agent Execution Control' },
    'agent-runtime-observation' => { 'name' => 'Agent Runtime Observation' },
    'runtime-safety-preflight' => { 'name' => 'Runtime Safety Preflight' },
    'lint' => { 'name' => 'Lint' },
  }
  { 'name' => 'CI', 'on' => { 'pull_request' => nil, 'push' => { 'branches' => ['main'] } }, 'jobs' => jobs }.to_yaml
end

def ci_hash(jobs = nil)
  { 'name' => 'CI', 'on' => { 'pull_request' => nil, 'push' => { 'branches' => ['main'] } }, 'jobs' => (jobs || {}) }
end

def manual_fixture(trigger_override = nil)
  triggers = trigger_override || { 'workflow_dispatch' => nil }
  {
    'name' => 'E2E Critical Browser Manual',
    'on' => triggers,
    'permissions' => { 'contents' => 'read' },
    'jobs' => {
      'critical-browser' => {
        'name' => 'Critical Browser Regressions',
        'runs-on' => 'ubuntu-latest',
        'timeout-minutes' => 30,
        'steps' => [
          { 'uses' => 'actions/checkout@v4' },
          { 'name' => 'Run critical browser regressions', 'run' => 'npm run test:e2e:critical-ux' },
        ],
      },
    },
  }.to_yaml
end

def run_validator(dir)
  system({ 'CI_CONTRACT_ROOT' => dir }, RbConfig.ruby, VALIDATOR, out: File::NULL, err: File::NULL)
end

def expect_fail(label)
  raise "#{label}: validador passou, mas deveria falhar" if $?.success?
  puts "PASS #{label} (rejeitou)"
end

tests = 0

# Positivo: fixture íntegra passa.
dir = fixture_root
write(File.join(dir, '.github/workflows/ci.yml'), ci_fixture)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_fixture)
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck && npm run test && npm run test:contracts"}}')
ok = run_validator(dir)
raise 'positivo: validador falhou em fixture íntegra' unless ok
puts 'PASS positivo (fixture íntegra)'
tests += 1

# Negativo 1: ci.yml com Playwright.
dir = fixture_root
ci_bad = ci_hash
ci_bad['jobs'] = ci_hash['jobs'].merge(
  'e2e-critical-browser' => { 'name' => 'E2E Critical Browser', 'run' => 'npx playwright test' },
)
write(File.join(dir, '.github/workflows/ci.yml'), ci_bad.to_yaml)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_fixture)
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck"}}')
run_validator(dir)
expect_fail('negativo-1: ci.yml com Playwright')
tests += 1

# Negativo 2: validate:ci depende de E2E.
dir = fixture_root
write(File.join(dir, '.github/workflows/ci.yml'), ci_fixture)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_fixture)
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck && npm run test:e2e:critical-ux"}}')
run_validator(dir)
expect_fail('negativo-2: validate:ci com e2e')
tests += 1

# Negativo 3: workflow manual com trigger pull_request.
dir = fixture_root
write(File.join(dir, '.github/workflows/ci.yml'), ci_fixture)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_fixture({ 'pull_request' => nil }))
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck"}}')
run_validator(dir)
expect_fail('negativo-3: workflow manual com pull_request')
tests += 1

# Negativo 4: workflow manual com secret de LLM live.
dir = fixture_root
manual_bad = YAML.safe_load(manual_fixture, aliases: false)
manual_bad['jobs']['critical-browser']['env'] = { 'LITELLM_API_KEY' => '${{ secrets.LITELLM_API_KEY }}' }
write(File.join(dir, '.github/workflows/ci.yml'), ci_fixture)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_bad.to_yaml)
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck"}}')
run_validator(dir)
expect_fail('negativo-4: workflow manual com secret LLM')
tests += 1

# Negativo 5: job determinístico removido.
dir = fixture_root
jobs_removed = YAML.safe_load(ci_fixture, aliases: false)['jobs']
jobs_removed.delete('build')
write(File.join(dir, '.github/workflows/ci.yml'), { 'name' => 'CI', 'on' => { 'pull_request' => nil }, 'jobs' => jobs_removed }.to_yaml)
write(File.join(dir, '.github/workflows/e2e-critical-manual.yml'), manual_fixture)
write(File.join(dir, 'package.json'), '{"scripts":{"validate:ci":"npm run typecheck"}}')
run_validator(dir)
expect_fail('negativo-5: job build removido')
tests += 1

puts "OK #{tests} tests (1 positivo + 5 negativos)"
