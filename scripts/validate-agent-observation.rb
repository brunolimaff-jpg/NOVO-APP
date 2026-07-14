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
card = tmpl['card']
fail!('piloto template card ausente', errors) unless card.is_a?(Hash)
if card.is_a?(Hash)
  fail!('piloto template autorizacao A3', errors) unless card.dig('autorizacao', 'nivel') == 'A3'
  fail!('piloto template papel executor-escopo', errors) unless card['papel_preferido'] == 'executor-escopo'
  fail!('piloto template ferramentas codex', errors) unless Array(card['ferramentas_permitidas']) == ['codex']
  fail!('piloto template rede false', errors) unless card['rede_permitida'] == false
  fail!('piloto template shell false', errors) unless card['shell_permitido'] == false
  fail!('piloto template delegacao false', errors) unless card['delegacao_permitida'] == false
  write_list = Array(card.dig('escopo', 'escrita'))
  fail!('piloto write scope size', errors) unless write_list.size == 1
  fail!('piloto write path', errors) unless write_list.first.to_s.start_with?('.agents/pilotos/sandbox/')
  fail!('piloto executor.git-diff-check', errors) unless Array(card.dig('executor', 'comandos')) == ['git-diff-check']

  ep = card['execucao_planejada']
  fail!('piloto execucao_planejada ausente', errors) unless ep.is_a?(Hash)
  if ep.is_a?(Hash)
    fail!('execucao_planejada estrategia', errors) unless ep['estrategia'] == 'agente-unico'
    fail!('execucao_planejada agentes size', errors) unless Array(ep['agentes']).size == 1
    ag = ep.dig('agentes', 0)
    fail!('execucao_planejada agente papel', errors) unless ag.is_a?(Hash) && ag['papel'] == 'executor-escopo'
    fail!('execucao_planejada agente permissao', errors) unless ag.is_a?(Hash) && ag['permissao'] == 'workspace-write'
    fail!('execucao_planejada tarefas size', errors) unless Array(ep['tarefas']).size == 1
    task_write = ep.dig('tarefas', 0, 'arquivos', 'escrita')
    fail!('execucao_planejada task escrita size', errors) unless Array(task_write).size == 1
    fail!('execucao_planejada task escrita path', errors) unless Array(task_write).first.to_s.start_with?('.agents/pilotos/sandbox/')
    lim = ep['limites']
    fail!('execucao_planejada limites ausente', errors) unless lim.is_a?(Hash)
    if lim.is_a?(Hash)
      external_timeout = tmpl.dig('limites', 'max_tempo_segundos')
      fail!('limite externo max_tempo_segundos != 180', errors) unless external_timeout == 180
      fail!('execucao_planejada limites max_agentes', errors) unless lim['max_agentes'] == 1
      fail!('execucao_planejada limites max_paralelo', errors) unless lim['max_paralelo'] == 1
      fail!('execucao_planejada limites max_tempo_segundos != externo', errors) unless lim['max_tempo_segundos'] == external_timeout
      fail!('execucao_planejada limites max_tempo_segundos > 180', errors) unless lim['max_tempo_segundos'] <= 180
      fail!('execucao_planejada limites max_retentativas', errors) unless lim['max_retentativas'] == 0
      fail!('execucao_planejada limites max_rodadas_revisao', errors) unless lim['max_rodadas_revisao'] == 0
      fail!('execucao_planejada limites permite_subdelegacao', errors) unless lim['permite_subdelegacao'] == false
    end
  end
end

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
