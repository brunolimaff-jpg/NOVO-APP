#!/usr/bin/env ruby
require 'yaml'
require 'json'
require 'set'
require 'open3'
require 'digest'

module SkillsGovernanceValidator
  module_function

  ALLOWED_STATUS = Set.new(%w[aprovada aprovada-com-restricoes bloqueada legada não-auditada candidata desativada]).freeze
  ALLOWED_TYPES = Set.new(%w[skill fluxo]).freeze
  ALLOWED_TOOLS = Set.new(%w[codex claude-code cursor opencode cline]).freeze
  ALLOWED_ROLES = Set.new(%w[explorador investigador-incidentes planejador-solucao executor-escopo revisor-contratos validador-entrega revisor-evidencias-dossie]).freeze
  WRITER_ROLES = Set.new(%w[executor-escopo]).freeze
  BOOLEAN_FIELDS = %w[selecionavel_por_missao possui_scripts acesso_rede pode_escrever pode_executar_shell pode_delegar].freeze
  ALLOWED_DIRECTORIES = ['.agents/skills/', '.agents/orquestracao/', '.agents/seguranca/'].freeze
  ALLOWED_EXACT_FILES = [
    'docs/SKILLS-GOVERNANCE.md',
    'AGENTS.md',
    'HANDOFF_AI.md',
    '.agents/memory/activeContext.md',
    '.agents/memory/progress.md',
    '.agents/papeis/README.md',
    'scripts/validate-skills-governance.rb',
    'scripts/test-validate-skills-governance.rb',
    'scripts/plan-agent-mission.rb',
    'scripts/validate-agent-orchestration.rb',
    'scripts/test-agent-orchestration.rb',
    'scripts/run-agent-mission.rb',
    'scripts/validate-agent-execution.rb',
    'scripts/test-agent-execution.rb',
    'scripts/validate-codex-harness-policy.rb',
    'scripts/test-codex-harness-policy.rb',
    'scripts/runtime-safety-preflight.rb',
    'scripts/validate-runtime-safety.rb',
    'scripts/test-runtime-safety.rb',
    'scripts/lib/agent_path_guard.rb',
    'scripts/lib/agent_command_guard.rb',
    'scripts/lib/codex_single_agent_runtime.rb',
    'scripts/lib/agent_single_runtime.rb',
    'scripts/lib/agent_mission_contract.rb',
    'scripts/test-agent-runtime.rb',
    'scripts/hook-sensitive-file-alert.sh',
    '.claude/settings.json',
    '.cursor/hooks.json',
    '.cursor/hooks/branch-health-json.sh',
    '.codex/config.toml',
    '.agents/adaptadores/README.md',
    '.agents/adaptadores/mapa-adaptadores.yaml',
    '.agents/memory/decisions.md',
    'docs/benchmarks/codex-harness-5.6.md',
    '.gitignore',
    '.github/workflows/ci.yml',
    '.ruby-version'
  ].freeze

  def fail!(msg)
    raise RuntimeError, msg
  end

  def required_files(root)
    {
      registry: File.join(root, '.agents/skills/registry.yaml'),
      compat: File.join(root, '.agents/skills/compatibilidade.yaml'),
      policy: File.join(root, '.agents/skills/politica-seguranca.md'),
      readme: File.join(root, '.agents/skills/README.md'),
      lockfile: File.join(root, 'skills-lock.json')
    }
  end

  def load_data(root)
    paths = required_files(root)
    paths.each_value do |path|
      fail!("missing required file: #{path}") unless File.exist?(path)
    end

    {
      registry: YAML.safe_load(File.read(paths[:registry]), aliases: false),
      compat: YAML.safe_load(File.read(paths[:compat]), aliases: false),
      lockfile: JSON.parse(File.read(paths[:lockfile])),
      paths: paths
    }
  end

  def resolve_diff_base(root, explicit_base_ref = nil)
    candidates = []
    candidates << "origin/#{explicit_base_ref}" if explicit_base_ref && !explicit_base_ref.empty?
    candidates << 'origin/main'
    candidates << 'main'

    candidates.each do |base|
      out, err, status = Open3.capture3('git', '-C', root, 'diff', '--name-only', "#{base}...HEAD")
      return [base, out] if status.success?
    end

    fail!('git diff failed — cannot verify changed-file policy')
  end

  def file_allowed?(path)
    return true if ALLOWED_EXACT_FILES.include?(path)
    ALLOWED_DIRECTORIES.any? { |prefix| path.start_with?(prefix) }
  end

  def validate_ruby_baseline!(root)
    ruby_version_path = File.join(root, '.ruby-version')
    fail!('missing .ruby-version') unless File.exist?(ruby_version_path)

    repo_version = File.read(ruby_version_path).strip
    fail!(".ruby-version must be Ruby 3.3.x, got #{repo_version.inspect}") unless repo_version.match?(/\A3\.3\.\d+\z/)
    fail!('Ruby 2.6 is not a supported governance baseline') if repo_version.start_with?('2.6')

    workflow_path = File.join(root, '.github/workflows/ci.yml')
    workflow = YAML.safe_load(File.read(workflow_path), aliases: false)
    jobs = workflow.fetch('jobs') { fail!('ci.yml missing jobs') }

    {
      'skills-governance' => 'Skills Governance',
      'agent-orchestration' => 'Agent Orchestration'
    }.each do |job_id, label|
      job = jobs[job_id] || fail!("ci.yml missing #{label} job")
      setup_step = Array(job['steps']).find { |step| step.is_a?(Hash) && step['uses'].to_s.start_with?('ruby/setup-ruby@') }
      fail!("#{label} must use ruby/setup-ruby") unless setup_step

      ci_version = setup_step.fetch('with', {})['ruby-version']
      fail!("#{label} must use Ruby #{repo_version}, got #{ci_version.inspect}") unless ci_version == repo_version
      fail!("#{label} must use Ruby 3.3.x") unless ci_version.match?(/\A3\.3\.\d+\z/)
    end

    repo_version
  end

  def validate_skill!(root, skill, ids, paths)
    required_keys = %w[id nome descricao tipo selecionavel_por_missao status origem escopo caminho ferramentas_compativeis papeis_permitidos tecnologias versao hash possui_scripts acesso_rede pode_escrever pode_executar_shell pode_delegar riscos restricoes validacao rollback]
    required_keys.each do |key|
      fail!("skill missing key #{key}") unless skill.key?(key)
    end

    fail!("duplicate skill id #{skill['id']}") unless ids.add?(skill['id'])
    fail!("invalid type #{skill['tipo']}") unless ALLOWED_TYPES.include?(skill['tipo'])
    fail!("invalid status #{skill['status']}") unless ALLOWED_STATUS.include?(skill['status'])
    BOOLEAN_FIELDS.each do |field|
      fail!("#{field} must be boolean for #{skill['id']}") unless [true, false].include?(skill[field])
    end

    caminho = skill['caminho']
    fail!("skill caminho must be a non-empty string for #{skill['id']}") unless caminho.is_a?(String) && !caminho.strip.empty?
    fail!("duplicate skill path #{caminho}") unless paths.add?(caminho)

    absolute_path = File.join(root, caminho)
    fail!("missing path #{caminho}") unless File.exist?(absolute_path)
    fail!("path is not a regular file #{caminho}") unless File.file?(absolute_path)

    fail!("hash format invalid for #{skill['id']}") unless skill['hash'].is_a?(String) && skill['hash'].match?(/\A[a-f0-9]{64}\z/)
    actual_hash = Digest::SHA256.file(absolute_path).hexdigest
    fail!("hash mismatch for #{skill['id']}") unless actual_hash == skill['hash']

    fail!("ferramentas_compativeis invalid for #{skill['id']}") unless skill['ferramentas_compativeis'].is_a?(Array) && skill['ferramentas_compativeis'].all? { |t| ALLOWED_TOOLS.include?(t) }
    fail!("papeis_permitidos invalid for #{skill['id']}") unless skill['papeis_permitidos'].is_a?(Array) && skill['papeis_permitidos'].all? { |r| ALLOWED_ROLES.include?(r) }
    fail!("no approved skill without origin: #{skill['id']}") if %w[aprovada aprovada-com-restricoes].include?(skill['status']) && skill['origem'].to_s.strip.empty?
    fail!("no approved skill without validation: #{skill['id']}") if %w[aprovada aprovada-com-restricoes].include?(skill['status']) && skill['validacao'].to_s.strip.empty?
    fail!("skill cannot permit delegation: #{skill['id']}") if skill['pode_delegar'] == true

    mutating = skill['pode_escrever'] == true || skill['pode_executar_shell'] == true
    if mutating
      fail!("mutating or shell-capable skill mapped to forbidden role in #{skill['id']}") unless skill['papeis_permitidos'].all? { |r| WRITER_ROLES.include?(r) }
    end

    if skill['tipo'] == 'fluxo'
      fail!("flow cannot be selectable #{skill['id']}") if skill['selecionavel_por_missao'] == true
      fail!("flow cannot have allowed roles #{skill['id']}") unless skill['papeis_permitidos'].empty?
    end

    if skill['selecionavel_por_missao'] == true
      fail!("selectable entry must be skill #{skill['id']}") unless skill['tipo'] == 'skill'
      fail!("selectable entry must be approved or approved with restrictions #{skill['id']}") unless %w[aprovada aprovada-com-restricoes].include?(skill['status'])
    end
  end

  def validate!(root:, base_ref: ENV['GITHUB_BASE_REF'])
    ruby_version = validate_ruby_baseline!(root)
    data = load_data(root)
    registry = data[:registry]
    compat = data[:compat]
    lockfile = data[:lockfile]

    skills = registry.fetch('skills') { fail!('registry missing skills') }
    fail!('skills must be an array') unless skills.is_a?(Array)

    ids = Set.new
    paths = Set.new
    skills.each { |skill| validate_skill!(root, skill, ids, paths) }

    fail!('compatibilidade missing ferramentas') unless compat['ferramentas'].is_a?(Hash)
    %w[codex claude-code cursor opencode cline].each do |tool|
      fail!("compatibilidade missing #{tool}") unless compat['ferramentas'].key?(tool)
    end

    used_base, changed_output = resolve_diff_base(root, base_ref)
    changed_files = changed_output.split("\n").reject(&:empty?)
    forbidden = changed_files.reject { |f| file_allowed?(f) }
    fail!("forbidden changed files: #{forbidden.join(', ')}") unless forbidden.empty?

    lock_skills = lockfile['skills'] || {}
    fail!('lockfile skills must be object') unless lock_skills.is_a?(Hash)

    {
      used_base: used_base,
      ruby_version: ruby_version,
      skills_count: skills.length,
      changed_files: changed_files
    }
  end
end

if $PROGRAM_NAME == __FILE__
  root = File.expand_path('..', __dir__)
  result = SkillsGovernanceValidator.validate!(root: root)
  puts 'OK registry.yaml'
  puts 'OK compatibilidade.yaml'
  puts 'OK skills-lock.json'
  puts "OK Ruby baseline #{result[:ruby_version]}"
  puts "OK changed-file policy (base=#{result[:used_base]})"
end
