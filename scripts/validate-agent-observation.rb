#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'yaml'

ROOT = File.expand_path('..', __dir__)
errors = []

def fail!(msg, errors)
  errors << msg
  warn "FAIL #{msg}"
end

%w[
  scripts/lib/agent_run_comparator.rb
  scripts/lib/agent_task_ledger.rb
  scripts/lib/agent_supervised_pilot.rb
  scripts/validate-agent-observation.rb
  scripts/test-agent-observation.rb
  .agents/pilotos/primeiro-piloto.json
  .agents/pilotos/README.md
  .agents/orquestracao/executor/contrato-relatorio.schema.json
].each do |rel|
  path = File.join(ROOT, rel)
  fail!("missing #{rel}", errors) unless File.file?(path)
end

schema = JSON.parse(File.read(File.join(ROOT, '.agents/orquestracao/executor/contrato-relatorio.schema.json')))
%w[planned_snapshot observed_snapshot comparacao task_ledger handoff planned_snapshot_sha256 observed_snapshot_sha256].each do |key|
  fail!("schema missing #{key}", errors) unless schema.dig('properties', key)
end

tmpl = JSON.parse(File.read(File.join(ROOT, '.agents/pilotos/primeiro-piloto.json')))
fail!('piloto template id', errors) unless tmpl.dig('missao', 'id') == 'primeiro-piloto-supervisionado'
fail!('piloto template timeout', errors) unless tmpl.dig('limites', 'max_tempo_segundos').to_i <= 180
write = tmpl.dig('card', 'escopo', 'escrita')
fail!('piloto write scope size', errors) unless Array(write).size == 1
fail!('piloto write path', errors) unless write.first.to_s.start_with?('.agents/pilotos/sandbox/')

gitignore = File.read(File.join(ROOT, '.gitignore'))
fail!('state gitignored', errors) unless gitignore.include?('.agents/pilotos/state/')

readme = File.read(File.join(ROOT, '.agents/pilotos/README.md'))
fail!('readme warn', errors) unless readme.include?('NÃO EXECUTAR SEM AUTORIZAÇÃO HUMANA EXPLÍCITA')

ci = File.read(File.join(ROOT, '.github/workflows/ci.yml'))
fail!('ci observation gate', errors) unless ci.include?('test-agent-observation.rb')

# Fixtures must not be loadable without test env markers (static check).
src = File.read(File.join(ROOT, 'scripts/lib/codex_single_agent_runtime.rb'))
fail!('fake requires AGENT_RUNTIME_TEST_CODEX', errors) unless src.include?('AGENT_RUNTIME_TEST_CODEX')

if errors.empty?
  puts 'OK validate-agent-observation'
  exit 0
end
warn "#{errors.size} error(s)"
exit 1
