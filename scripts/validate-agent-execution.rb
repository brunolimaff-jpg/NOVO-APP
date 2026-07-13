#!/usr/bin/env ruby
require 'json'
require 'yaml'
require_relative './run-agent-mission'

root = File.expand_path('..', __dir__)
catalog = AgentMissionRunner.load_catalog
expected = %w[validate-skills-governance test-skills-governance validate-agent-orchestration test-agent-orchestration git-diff-check]
raise "catalog mismatch" unless catalog.keys.sort == expected.sort

schema = JSON.parse(File.read(File.join(root, '.agents/orquestracao/executor/contrato-relatorio.schema.json')))
%w[versao missao_id plan_hash modo status inicio fim duracao_ms comandos negacoes avisos evidencias].each do |key|
  raise "schema missing #{key}" unless schema.dig('properties', key)
end

runner = File.read(File.join(root, 'scripts/run-agent-mission.rb'))
raise 'unsafe runner eval call' if runner.match?(/\beval\s*\(/)
raise 'unsafe runner system call' if runner.match?(/\bsystem\s*\(/)
raise 'unsafe runner backtick call' if runner.match?(/`[^`]+`/)

puts 'OK executor catalog'
puts 'OK report schema'
puts 'OK runner safety scan'
