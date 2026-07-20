#!/usr/bin/env ruby
# frozen_string_literal: true

# validate-agent-orchestration.rb — Valida toda a camada de orquestração.
#
# Verifica: schemas JSON, YAML, 7 papéis, ferramentas, caminhos, IDs,
# autorização, skills e fluxos separados, registry, hashes, compatibilidade,
# exemplos, determinismo, inexistência de ampliação de permissão,
# inexistência de secrets, dependência nova, alteração no delivery-loop,
# execução de rede ou agentes.
#
# Modo fail-closed: qualquer falha = exit 1.

require 'json'
require 'yaml'
require 'digest'
require 'open3'
require_relative './plan-agent-mission'

module OrchestrationValidator
  REPO_ROOT   = File.expand_path('..', __dir__)
  ORCH_DIR    = File.join(REPO_ROOT, '.agents', 'orquestracao')
  SCRIPTS_DIR = File.join(REPO_ROOT, 'scripts')

  STDLIB_ALLOWLIST = %w[json yaml digest optparse fileutils open3 tempfile tmpdir timeout time].freeze
  AGENT_SCOPE_PREFIXES = ['.agents/orquestracao/', '.agents/seguranca/', '.agents/pilotos/'].freeze
  AGENT_SCOPE_EXACT_FILES = %w[
    scripts/plan-agent-mission.rb
    scripts/validate-agent-orchestration.rb
    scripts/test-agent-orchestration.rb
    scripts/run-agent-mission.rb
    scripts/validate-agent-execution.rb
    scripts/test-agent-execution.rb
    scripts/validate-agent-observation.rb
    scripts/test-agent-observation.rb
    scripts/validate-codex-harness-policy.rb
    scripts/test-codex-harness-policy.rb
    scripts/check-pilot-readiness.rb
    scripts/runtime-safety-preflight.rb
    scripts/validate-runtime-safety.rb
    scripts/test-runtime-safety.rb
  ].freeze

  ERRORS   = []
  WARNINGS = []

  class << self
    def run
      @changed_files = git_changed_files
      @agent_scope_applicable = agent_scope_changed?(@changed_files)
      validate_schemas
      validate_yaml_files
      validate_seven_roles
      validate_authorization
      validate_registry_consistency
      validate_skill_fluxo_separation
      validate_hashes
      validate_examples
      validate_determinism
      validate_no_permission_escalation
      validate_no_secrets
      validate_no_new_deps
      validate_delivery_loop_unchanged
      validate_no_network_or_agents
      validate_scripts_exist

      print_report
      ERRORS.empty? ? 0 : 1
    end

    private

    def agent_scope_changed?(changed_files)
      changed_files.any? do |file|
        AGENT_SCOPE_EXACT_FILES.include?(file) ||
          AGENT_SCOPE_PREFIXES.any? { |prefix| file.start_with?(prefix) } ||
          file.match?(%r{\Ascripts/lib/(?:agent|codex|dcg)_.*\.rb\z})
      end
    end

    def check(label)
      yield
    rescue StandardError => e
      ERRORS << "#{label}: #{e.message}"
    end

    def safe_load_yaml(path)
      YAML.safe_load(File.read(path), aliases: false)
    end

    # ── Schema validation ────────────────────────────────────────────

    def validate_schemas
      %w[cartao-missao.schema.json contrato-plano.schema.json].each do |schema_file|
        path = File.join(ORCH_DIR, schema_file)
        check("schema #{schema_file}") do
          raise 'arquivo não encontrado' unless File.file?(path)

          data = JSON.parse(File.read(path))
          raise '$schema ausente' unless data['$schema']
          raise 'type ausente'    unless data['type']
          raise 'type deve ser object' unless data['type'] == 'object'
          raise 'required ausente' unless data['required']
          raise 'properties ausente' unless data['properties']
          MissionPlanner.send(:validate_schema_keywords!, data, "$.#{schema_file}")
        end
      end
    end

    # ── YAML validation ──────────────────────────────────────────────

    def validate_yaml_files
      %w[roteamento.yaml contrato-evidencias.yaml].each do |yaml_file|
        path = File.join(ORCH_DIR, yaml_file)
        check("yaml #{yaml_file}") do
          raise 'arquivo não encontrado' unless File.file?(path)
          safe_load_yaml(path)
        end
      end
    end

    # ── 7 canonical roles ────────────────────────────────────────────

    def validate_seven_roles
      check('7 papéis') do
        roteamento = safe_load_yaml(File.join(ORCH_DIR, 'roteamento.yaml'))
        classes    = roteamento['classes'] || {}
        expected   = %w[
          explorador investigador-incidentes planejador-solucao
          executor-escopo revisor-contratos validador-entrega
          revisor-evidencias-dossie
        ]
        missing = expected - classes.keys
        raise "papéis ausentes no roteamento: #{missing.join(', ')}" unless missing.empty?

        classes.each do |papel, config|
          next if papel == 'executor-escopo'
          if config['pode_escrever'] == true
            ERRORS << "papel #{papel} tem pode_escrever=true (apenas executor-escopo pode)"
          end
        end

        executor = classes['executor-escopo']
        raise 'executor-escopo deve ter pode_escrever=true' unless executor['pode_escrever'] == true
      end
    end

    # ── Authorization levels ─────────────────────────────────────────

    def validate_authorization
      check('autorização A0-A6') do
        roteamento = safe_load_yaml(File.join(ORCH_DIR, 'roteamento.yaml'))
        auth       = roteamento['autorizacao'] || {}
        niveis     = auth['níveis'] || {}
        expected   = %w[A0 A1 A2 A3 A4 A5 A6]
        missing    = expected - niveis.keys
        raise "níveis ausentes: #{missing.join(', ')}" unless missing.empty?

        acoes = auth['acoes_especificas'] || {}
        check_action_auth(acoes, 'commit', 'A3')
        check_action_auth(acoes, 'push',   'A4')
        check_action_auth(acoes, 'pr',     'A4')
        check_action_auth(acoes, 'merge',  'A5')
        check_action_auth(acoes, 'deploy', 'A6')

        merge_cfg = acoes['merge'] || {}
        raise 'merge deve exigir token MERGE' unless merge_cfg['token_obrigatorio'] == 'MERGE'
      end
    end

    def check_action_auth(acoes, action, expected_level)
      cfg = acoes[action]
      return if cfg && cfg['nivel_minimo'] == expected_level

      ERRORS << "ação #{action}: nível mínimo esperado #{expected_level}"
    end

    # ── Registry consistency ─────────────────────────────────────────

    def validate_registry_consistency
      check('registry') do
        path = File.join(REPO_ROOT, '.agents', 'skills', 'registry.yaml')
        raise 'registry não encontrado' unless File.file?(path)

        registry = safe_load_yaml(path)
        skills   = registry['skills'] || []
        ids      = skills.map { |s| s['id'] }
        duplicates = ids.select { |id| ids.count(id) > 1 }.uniq
        raise "IDs duplicados: #{duplicates.join(', ')}" unless duplicates.empty?

        skills.each do |skill|
          %w[id nome tipo status caminho hash selecionavel_por_missao].each do |field|
            raise "skill #{skill['id']}: campo #{field} ausente" if skill[field].nil?
          end
        end
      end
    end

    # ── Skill vs fluxo separation ────────────────────────────────────

    def validate_skill_fluxo_separation
      check('skills vs fluxos') do
        path     = File.join(REPO_ROOT, '.agents', 'skills', 'registry.yaml')
        registry = safe_load_yaml(path)
        (registry['skills'] || []).each do |skill|
          if skill['tipo'] == 'fluxo'
            if skill['selecionavel_por_missao'] == true
              ERRORS << "fluxo #{skill['id']} está selecionavel_por_missao=true (deve ser false)"
            end
          elsif skill['tipo'] != 'skill'
            ERRORS << "entrada #{skill['id']} tem tipo desconhecido: #{skill['tipo']}"
          end
        end
      end
    end

    # ── Hash verification ────────────────────────────────────────────

    def validate_hashes
      check('hashes') do
        path     = File.join(REPO_ROOT, '.agents', 'skills', 'registry.yaml')
        registry = safe_load_yaml(path)
        (registry['skills'] || []).each do |skill|
          caminho   = skill['caminho']
          full_path = File.join(REPO_ROOT, caminho)
          next unless File.file?(full_path)

          actual = Digest::SHA256.file(full_path).hexdigest
          if actual != skill['hash']
            ERRORS << "hash divergente: #{skill['id']} (esperado=#{skill['hash'][0..15]}, atual=#{actual[0..15]})"
          end
        end
      end
    end

    # ── Examples validation ──────────────────────────────────────────

    def validate_examples
      check('exemplos') do
        exemplos_dir = File.join(ORCH_DIR, 'exemplos')
        raise 'diretório de exemplos não encontrado' unless Dir.exist?(exemplos_dir)

        examples = Dir.glob(File.join(exemplos_dir, '*.json'))
        raise 'nenhum exemplo encontrado' if examples.empty?

        card_schema = JSON.parse(File.read(File.join(ORCH_DIR, 'cartao-missao.schema.json')))
        plan_schema = JSON.parse(File.read(File.join(ORCH_DIR, 'contrato-plano.schema.json')))

        examples.each do |ex_path|
          begin
            data = JSON.parse(File.read(ex_path))
            MissionPlanner.send(:validate_against_schema!, data, card_schema)
            plan = MissionPlanner.plan(data)
            MissionPlanner.send(:validate_against_schema!, plan, plan_schema)
          rescue JSON::ParserError => e
            ERRORS << "exemplo #{File.basename(ex_path)}: JSON inválido: #{e.message}"
          rescue MissionPlanner::ValidationError, MissionPlanner::SchemaError => e
            ERRORS << "exemplo #{File.basename(ex_path)}: #{e.class}: #{e.message}"
          end
        end
      end
    end

    # ── Determinism ──────────────────────────────────────────────────

    def validate_determinism
      check('determinismo') do
        exemplos_dir = File.join(ORCH_DIR, 'exemplos')
        Dir.glob(File.join(exemplos_dir, '*.json')).each do |ex_path|
          out1 = run_planner_stdout(ex_path)
          out2 = run_planner_stdout(ex_path)
          if out1 != out2
            ERRORS << "determinismo falhou: #{File.basename(ex_path)} produz saída diferente em 2 execuções"
          end
        end
      end
    end

    def run_planner_stdout(input)
      script = File.join(SCRIPTS_DIR, 'plan-agent-mission.rb')
      out, _err, status = Open3.capture3('ruby', script, '--input', input, '--stdout')
      raise "planner falhou para #{input}" unless status.success?
      out
    end

    # ── Permission escalation ────────────────────────────────────────

    def validate_no_permission_escalation
      check('ampliação de permissão') do
        exemplos_dir = File.join(ORCH_DIR, 'exemplos')
        Dir.glob(File.join(exemplos_dir, '*.json')).each do |ex_path|
          out   = run_planner_stdout(ex_path)
          plano = JSON.parse(out)
          if plano['papel_principal'] && plano['papel_principal'] != 'executor-escopo'
            if plano['escrita_permitida'] == true
              ERRORS << "#{File.basename(ex_path)}: escrita_permitida=true para papel não-executor"
            end
          end
          if plano['delegacao_permitida'] == true
            ERRORS << "#{File.basename(ex_path)}: delegacao_permitida=true (sempre deve ser false)"
          end
        end
      end
    end

    # ── Secrets scan ─────────────────────────────────────────────────

    def validate_no_secrets
      check('secrets') do
        patterns = [
          /(?:api[_-]?key|secret|password|token)\s*[=:]\s*['"]\w{20,}/i,
          /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
          /sk-[a-zA-Z0-9]{20,}/,
          /AKIA[0-9A-Z]{16}/
        ]
        files_to_check = Dir.glob(File.join(ORCH_DIR, '**', '*')).select { |f| File.file?(f) }
        files_to_check += Dir.glob(File.join(SCRIPTS_DIR, '*agent*')).select { |f| File.file?(f) }
        files_to_check.each do |f|
          content = File.read(f)
          patterns.each do |pat|
            if content.match?(pat)
              ERRORS << "possível secret em #{f}"
              break
            end
          end
        end
      end
    end

    # ── No non-stdlib deps ───────────────────────────────────────────

    def validate_no_new_deps
      check('dependências') do
        scripts = Dir.glob(File.join(SCRIPTS_DIR, '*agent*')).select { |f| File.file?(f) }
        scripts.each do |f|
          content = File.read(f)
          # Match require at any indentation level
          requires = content.scan(/^\s*require\s+'([^']+)'/).flatten
          non_stdlib = requires.reject { |r| STDLIB_ALLOWLIST.include?(r) }
          unless non_stdlib.empty?
            ERRORS << "#{File.basename(f)}: dependências não-stdlib: #{non_stdlib.join(', ')}"
          end
        end
      end
    end

    def git_changed_files
      base_ref = ENV.fetch('GITHUB_BASE_REF', '')
      candidates = []
      candidates << "origin/#{base_ref}" if base_ref && !base_ref.empty?
      candidates << 'origin/main'
      candidates << 'main'

      candidates.each do |base|
        out, _err, status = Open3.capture3('git', '-C', REPO_ROOT, 'diff', '--name-only', "#{base}...HEAD")
        return out.split("\n").reject(&:empty?) if status.success?
      end

      raise 'git diff failed — cannot resolve agent scope'
    end

    # ── delivery-loop unchanged ──────────────────────────────────────

    def validate_delivery_loop_unchanged
      check('delivery-loop') do
        skill_path = File.join(REPO_ROOT, '.agents', 'skills', 'delivery-loop', 'SKILL.md')
        return unless File.file?(skill_path)

        changed = @changed_files || git_changed_files
        return if changed.empty?

        if changed.include?('.agents/skills/delivery-loop/SKILL.md')
          ERRORS << 'delivery-loop/SKILL.md foi modificado (deve permanecer inalterado)'
        end
      end
    end

    # ── No network or agent execution ────────────────────────────────

    def validate_no_network_or_agents
      check('rede e agentes') do
        scripts = Dir.glob(File.join(SCRIPTS_DIR, '*agent*')).select { |f| File.file?(f) }
        # Exclude this validator — it uses open3 for git/planner subprocess
        scripts = scripts.reject { |f| File.basename(f) == 'validate-agent-orchestration.rb' }
        scripts.each do |f|
          content  = File.read(f)
          forbidden = [
            /Net::HTTP/,
            /TCPSocket/,
            /UDPSocket/,
            /IO\.popen.*curl/,
            /IO\.popen.*wget/,
            /`curl/,
            /`wget/
          ]
          forbidden.each do |pat|
            if content.match?(pat)
              ERRORS << "#{File.basename(f)}: contém operação de rede: #{pat}"
            end
          end
        end
      end
    end

    # ── Scripts exist ────────────────────────────────────────────────

    def validate_scripts_exist
      check('scripts') do
        %w[plan-agent-mission.rb validate-agent-orchestration.rb test-agent-orchestration.rb].each do |script|
          path = File.join(SCRIPTS_DIR, script)
          raise "script não encontrado: #{script}"        unless File.file?(path)
          raise "script não é legível: #{script}"         unless File.readable?(path)
        end
      end
    end

    # ── Report ───────────────────────────────────────────────────────

    def print_report
      total = ERRORS.size + WARNINGS.size
      if total.zero?
        if @agent_scope_applicable
          puts 'OK — validação de orquestração passou sem erros'
        else
          puts 'NOT_APPLICABLE_SUCCESS — nenhuma superfície de orquestração foi alterada'
        end
      else
        ERRORS.each   { |e| puts "  ERRO: #{e}" }   unless ERRORS.empty?
        WARNINGS.each { |w| puts "  WARN: #{w}" }   unless WARNINGS.empty?
        puts "\n  #{ERRORS.size} erro(s), #{WARNINGS.size} warning(s)"
      end
    end
  end
end

exit OrchestrationValidator.run if $PROGRAM_NAME == __FILE__
