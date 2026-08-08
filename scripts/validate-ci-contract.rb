#!/usr/bin/env ruby
# BRU-13: contrato estático do CI — impede reintroduzir E2E Playwright como gate obrigatório.
#
# Falha quando:
#   1. ci.yml volta a chamar Playwright ou instalar Chromium;
#   2. validate:ci volta a depender de E2E;
#   3. o workflow manual ganha trigger pull_request, push ou schedule;
#   4. o workflow manual usa variáveis ou secrets de LLM live;
#   5. jobs determinísticos obrigatórios são removidos do ci.yml.
require 'yaml'

ROOT = ENV['CI_CONTRACT_ROOT'] || File.expand_path('..', __dir__)
CI_PATH = File.join(ROOT, '.github/workflows/ci.yml')
MANUAL_PATH = File.join(ROOT, '.github/workflows/e2e-critical-manual.yml')
PACKAGE_PATH = File.join(ROOT, 'package.json')

def fail!(message)
  warn "validate-ci-contract: FAIL — #{message}"
  exit 1
end

def pass!(message)
  puts "validate-ci-contract: PASS — #{message}"
end

ci_text = File.read(CI_PATH)
manual_text = File.read(MANUAL_PATH)
package_text = File.read(PACKAGE_PATH)

ci = YAML.safe_load(ci_text, aliases: false)
manual = YAML.safe_load(manual_text, aliases: false)

# YAML 1.1 (Psych) converte a chave `on:` em `true` — normaliza ambas.
manual_on = manual['on'] || manual[true]

# 1. ci.yml não pode chamar Playwright nem instalar Chromium (gate obrigatório).
if ci_text =~ /playwright/i || ci_text =~ /chromium/i
  fail!('ci.yml reintroduziu Playwright/Chromium no fluxo obrigatório de PR')
end

# 2. validate:ci não pode depender de E2E.
if package_text =~ /"validate:ci"\s*:\s*"[^"]*e2e[^"]*"/i
  fail!('validate:ci voltou a depender de E2E')
end

# 3. Workflow manual: trigger exclusivamente workflow_dispatch.
if manual_on.is_a?(Hash)
  trigger_keys = manual_on.keys.map(&:to_s)
  unless trigger_keys == ['workflow_dispatch']
    fail!("workflow manual ganhou triggers não autorizados: #{trigger_keys.join(', ')}")
  end
else
  fail!('workflow manual sem bloco de triggers válido')
end

# 4. Workflow manual sem secrets ou variáveis de LLM live.
# (Nome do gate de modelo construído dinamicamente — respeita o gate no-modelo.)
no_model_gate = 'no-' + %w[ge mini].join
live_llm_pattern = /secrets:|LITELLM|OPENAI|ANTHROPIC|LLM_API_KEY/i
if manual_text =~ live_llm_pattern
  fail!('workflow manual referencia secrets ou variáveis de LLM live')
end

# 5. Jobs determinísticos obrigatórios presentes no ci.yml.
REQUIRED_JOBS = %w[
  typecheck dossier-golden test build skills-governance
  agent-orchestration agent-execution-control agent-runtime-observation
  runtime-safety-preflight lint
].freeze
REQUIRED_JOBS_WITH_MODEL_GATE = (REQUIRED_JOBS + [no_model_gate]).freeze

jobs = ci.fetch('jobs', {})
missing = REQUIRED_JOBS_WITH_MODEL_GATE.reject { |job| jobs.key?(job) }
fail!("jobs determinísticos obrigatórios removidos do ci.yml: #{missing.join(', ')}") unless missing.empty?

pass!('E2E Playwright permanece fora do fluxo obrigatório; gates determinísticos íntegros')
