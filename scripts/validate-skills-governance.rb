#!/usr/bin/env ruby
require 'yaml'
require 'json'
require 'set'
require 'shellwords'

ROOT = File.expand_path('..', __dir__)

def fail!(msg)
  warn msg
  exit 1
end

registry_path = File.join(ROOT, '.agents/skills/registry.yaml')
compat_path = File.join(ROOT, '.agents/skills/compatibilidade.yaml')
policy_path = File.join(ROOT, '.agents/skills/politica-seguranca.md')
readme_path = File.join(ROOT, '.agents/skills/README.md')
lockfile_path = File.join(ROOT, 'skills-lock.json')

[registry_path, compat_path, policy_path, readme_path, lockfile_path].each do |path|
  fail!("missing required file: #{path}") unless File.exist?(path)
end

registry = YAML.safe_load(File.read(registry_path), aliases: false)
compat = YAML.safe_load(File.read(compat_path), aliases: false)
lockfile = JSON.parse(File.read(lockfile_path))

allowed_status = Set.new(%w[aprovada aprovada-com-restricoes bloqueada legada não-auditada candidata desativada])
allowed_tools = Set.new(%w[codex claude-code cursor opencode cline])
allowed_roles = Set.new(%w[explorador investigador-incidentes planejador-solucao executor-escopo revisor-contratos validador-entrega revisor-evidencias-dossie])

skills = registry.fetch('skills') { fail!('registry missing skills') }
fail!('skills must be an array') unless skills.is_a?(Array)

ids = Set.new
paths = Set.new

skills.each do |skill|
  %w[id nome descricao status origem escopo caminho ferramentas_compativeis papeis_permitidos tecnologias versao hash possui_scripts acesso_rede pode_escrever pode_executar_shell pode_delegar riscos restricoes validacao rollback].each do |key|
    fail!("skill missing key #{key}") unless skill.key?(key)
  end

fail!("duplicate skill id #{skill['id']}") unless ids.add?(skill['id'])
  fail!("invalid status #{skill['status']}") unless allowed_status.include?(skill['status'])
  fail!("missing path #{skill['caminho']}") unless File.exist?(File.join(ROOT, skill['caminho']))
  paths.add?(skill['caminho'])
  fail!("hash format invalid for #{skill['id']}") unless skill['hash'].is_a?(String) && skill['hash'].match?(/\A[a-f0-9]{64}\z/)
  fail!("ferramentas_compativeis invalid for #{skill['id']}") unless skill['ferramentas_compativeis'].is_a?(Array) && skill['ferramentas_compativeis'].all? { |t| allowed_tools.include?(t) }
  fail!("papeis_permitidos invalid for #{skill['id']}") unless skill['papeis_permitidos'].is_a?(Array) && skill['papeis_permitidos'].all? { |r| allowed_roles.include?(r) }
  fail!("no approved skill without origin: #{skill['id']}") if %w[aprovada aprovada-com-restricoes].include?(skill['status']) && skill['origem'].to_s.strip.empty?
  fail!("no approved skill without validation: #{skill['id']}") if %w[aprovada aprovada-com-restricoes].include?(skill['status']) && skill['validacao'].to_s.strip.empty?
  fail!("skill cannot permit delegation: #{skill['id']}") if skill['pode_delegar'] == true
  if skill['pode_executar_shell'] == true && skill['papeis_permitidos'].any? { |r| r != 'executor-escopo' && r != 'validador-entrega' && r != 'revisor-contratos' }
    fail!("mutating or shell-capable skill mapped to forbidden role in #{skill['id']}")
  end
end

fail!('compatibilidade missing ferramentas') unless compat['ferramentas'].is_a?(Hash)
%w[codex claude-code cursor opencode cline].each do |tool|
  fail!("compatibilidade missing #{tool}") unless compat['ferramentas'].key?(tool)
end

changed = `git -C #{Shellwords.escape(ROOT)} diff --name-only origin/main...HEAD 2>/dev/null`
changed_files = changed.split("\n").reject(&:empty?)
allowed_prefixes = [
  '.agents/skills/',
  'docs/SKILLS-GOVERNANCE.md',
  'AGENTS.md',
  '.agents/papeis/README.md',
  'scripts/validate-skills-governance.rb'
]
forbidden = changed_files.reject do |f|
  allowed_prefixes.any? { |p| f == p || f.start_with?(p) }
end
fail!("forbidden changed files: #{forbidden.join(', ')}") unless forbidden.empty?

lock_skills = lockfile['skills'] || {}
fail!('lockfile skills must be object') unless lock_skills.is_a?(Hash)

puts 'OK registry.yaml'
puts 'OK compatibilidade.yaml'
puts 'OK skills-lock.json'
puts 'OK changed-file policy'
