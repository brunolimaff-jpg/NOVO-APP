#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'yaml'
require 'optparse'
require 'open3'
require 'digest'
require 'tmpdir'
require 'time'
require 'fileutils'
require_relative './plan-agent-mission'
require_relative './runtime-safety-preflight'
require_relative './lib/agent_command_guard'

module AgentMissionRunner
  ROOT = File.expand_path('..', __dir__)
  ORCH_DIR = File.join(ROOT, '.agents/orquestracao')
  CATALOG_PATH = File.join(ORCH_DIR, 'executor/catalogo-comandos.yaml')
  CARD_SCHEMA_PATH = File.join(ORCH_DIR, 'cartao-missao.schema.json')
  PLAN_SCHEMA_PATH = File.join(ORCH_DIR, 'contrato-plano.schema.json')
  TIMEOUT_SECONDS = 120
  MAX_OUTPUT_BYTES = 1_048_576
  TERM_GRACE_SECONDS = 0.5
  SAFE_ENV_KEYS = %w[PATH HOME LANG LC_ALL CI GITHUB_BASE_REF].freeze
  DRY_RUN_TIMESTAMP = '1970-01-01T00:00:00Z'
  EXIT_BY_STATUS = {
    'dry-run' => 0,
    'success' => 0,
    'failure' => 1,
    'denied' => 2,
    'timeout' => 3,
    'internal-error' => 4
  }.freeze

  class DeniedError < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def parse(argv)
    opts = { execute: false, stdout: false, agent_runtime: false }
    OptionParser.new do |parser|
      parser.on('--card PATH') { |v| opts[:card] = v }
      parser.on('--plan PATH') { |v| opts[:plan] = v }
      parser.on('--output PATH') { |v| opts[:output] = v }
      parser.on('--stdout') { opts[:stdout] = true }
      parser.on('--execute') { opts[:execute] = true }
      parser.on('--safety-report PATH') { |v| opts[:safety_report] = v }
      # Future agent-runtime gate only. Does NOT spawn agents in 3B.3A.
      parser.on('--agent-runtime') { opts[:agent_runtime] = true }
    end.parse!(argv)
    raise 'missing --card' unless opts[:card]
    raise 'missing --plan' unless opts[:plan]
    raise 'use --stdout or --output' unless opts[:stdout] || opts[:output]
    opts
  end

  def enforce_runtime_safety!(opts)
    return unless opts[:agent_runtime]

    # Fase 3B.3A: runtime hard-disabled. Relatório é só diagnóstico —
    # fixture/live/JSON fabricado NÃO concedem autorização.
    if opts[:safety_report] && !opts[:safety_report].to_s.strip.empty?
      begin
        report = JSON.parse(File.read(safe_path(opts[:safety_report], must_exist: true)))
        RuntimeSafetyPreflight.validate_report!(report)
      rescue RuntimeSafetyPreflight::Denied, MissionPlanner::SchemaError, JSON::ParserError, DeniedError
        # Ignorado de propósito: mesmo relatório "ready" é negado abaixo.
      end
    end

    raise DeniedError.new(
      'AGENT_RUNTIME_NOT_ENABLED',
      'agent runtime is not enabled in phase 3B.3A'
    )
  end

  def allowed_roots
    [File.realpath(ROOT), File.realpath(Dir.tmpdir)]
  end

  def under_allowed_roots?(target)
    allowed_roots.any? { |root| target == root || target.start_with?(root + File::SEPARATOR) }
  end

  def nearest_existing_ancestor(path)
    probe = path
    loop do
      return probe if File.exist?(probe) || File.symlink?(probe)
      parent = File.dirname(probe)
      break if parent == probe
      probe = parent
    end
    nil
  end

  def assert_under_roots!(target, original)
    unless under_allowed_roots?(target)
      raise DeniedError.new('PATH_REJECTED', "path rejected: #{original}")
    end
  end

  def safe_path(path, must_exist: false)
    expanded = File.expand_path(path, ROOT)

    if File.symlink?(expanded)
      raise DeniedError.new('PATH_SYMLINK', "symlink rejected: #{path}")
    end

    if must_exist
      unless File.exist?(expanded)
        raise DeniedError.new('PATH_MISSING', "path not found: #{path}")
      end
      begin
        target = File.realpath(expanded)
      rescue Errno::ENOENT
        raise DeniedError.new('PATH_MISSING', "path not found: #{path}")
      end
      assert_under_roots!(target, path)
      return expanded
    end

    ancestor = nearest_existing_ancestor(File.dirname(expanded))
    if ancestor.nil?
      raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}")
    end

    begin
      real_ancestor = File.realpath(ancestor)
    rescue Errno::ENOENT
      raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}")
    end
    assert_under_roots!(real_ancestor, path)

    # Reconstruct candidate from real ancestor + remaining relative segments.
    rel = expanded.delete_prefix(ancestor)
    rel = rel.sub(%r{\A#{Regexp.escape(File::SEPARATOR)}}, '')
    candidate_parent = real_ancestor
    unless rel.empty?
      parts = rel.split(File::SEPARATOR)
      # Drop the final filename; validate parent chain only.
      parts.pop
      parts.each do |part|
        next if part.empty? || part == '.'
        raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}") if part == '..'
        candidate_parent = File.join(candidate_parent, part)
        if File.symlink?(candidate_parent)
          begin
            real_parent = File.realpath(candidate_parent)
          rescue Errno::ENOENT
            raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}")
          end
          assert_under_roots!(real_parent, path)
        elsif File.exist?(candidate_parent)
          begin
            real_parent = File.realpath(candidate_parent)
          rescue Errno::ENOENT
            raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}")
          end
          assert_under_roots!(real_parent, path)
        end
      end
    end

    # Parent symlink escape: if dirname exists via symlink outside roots.
    dirname = File.dirname(expanded)
    if File.exist?(dirname) || File.symlink?(dirname)
      begin
        assert_under_roots!(File.realpath(dirname), path)
      rescue Errno::ENOENT
        raise DeniedError.new('PATH_REJECTED', "path rejected: #{path}")
      end
    end

    expanded
  rescue DeniedError
    raise
  rescue SystemCallError => error
    raise DeniedError.new('PATH_REJECTED', "path rejected: #{path} (#{error.class})")
  end

  def load_json(path)
    JSON.parse(File.read(safe_path(path, must_exist: true)))
  end

  def load_schema(path)
    JSON.parse(File.read(path))
  end

  def load_catalog(path = CATALOG_PATH)
    AgentCommandGuard.load_catalog!(path)
  rescue AgentCommandGuard::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def resolve_command_argv!(catalog, id)
    AgentCommandGuard.resolve_argv!(catalog, id)
  rescue AgentCommandGuard::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def normalize_commands(list)
    Array(list).map(&:to_s).uniq.sort
  end

  def card_commands(card)
    card.dig('executor', 'comandos') || []
  end

  def plan_commands(plan)
    commands = plan['comandos']
    raise DeniedError.new('MISSING_COMMANDS', 'plan has no comandos') unless commands.is_a?(Array) && !commands.empty?
    commands
  end

  def validate_command_alignment!(card, plan)
    card_norm = normalize_commands(card_commands(card))
    plan_norm = normalize_commands(plan_commands(plan))
    return plan_commands(plan) if card_norm == plan_norm

    raise DeniedError.new(
      'COMMAND_PLAN_MISMATCH',
      "card commands #{card_norm.inspect} differ from plan commands #{plan_norm.inspect}"
    )
  end

  def validate_executable_plan_commands!(plan)
    return unless plan.dig('resumo_operacional', 'executavel') == true
    return unless plan['status'] == 'planejado'

    cmds = plan['comandos']
    unless cmds.is_a?(Array) && !cmds.empty? && cmds.all? { |c| c.is_a?(String) }
      raise DeniedError.new(
        'PLANEJADO_REQUIRES_COMMANDS',
        'plano planejado exige comandos array não vazio'
      )
    end
  end

  def validate_schemas!(card, plan)
    card_schema = load_schema(CARD_SCHEMA_PATH)
    plan_schema = load_schema(PLAN_SCHEMA_PATH)
    MissionPlanner.send(:validate_against_schema!, card, card_schema)
    MissionPlanner.send(:validate_against_schema!, plan, plan_schema)
    validate_executable_plan_commands!(plan)
  end

  def validate_inputs!(card, plan, catalog)
    validate_schemas!(card, plan)
    raise DeniedError.new('MISSION_MISMATCH', 'mission id mismatch') unless plan['missao_id'] == card['id']
    raise DeniedError.new('PLAN_STATUS_INVALID', 'plan status must be planejado') unless plan['status'] == 'planejado'
    raise DeniedError.new('PLAN_NEGATIONS', 'plan has negacoes') unless Array(plan['negacoes']).empty?
    unless plan.dig('resumo_operacional', 'executavel') == true
      raise DeniedError.new('PLAN_NOT_EXECUTABLE', 'plan is not marked as executable')
    end
    raise DeniedError.new('AUTH_INSUFFICIENT', 'insufficient authorization') unless %w[A2 A3 A4 A5].include?(card.dig('autorizacao', 'nivel'))

    commands = validate_command_alignment!(card, plan)
    commands.each do |id|
      resolve_command_argv!(catalog, id)
    end
    commands
  end

  def sanitized_env
    ENV.to_h.select { |key, _| SAFE_ENV_KEYS.include?(key) }
  end

  def trunc(value)
    bytes = value.to_s.b
    sliced = bytes.byteslice(0, MAX_OUTPUT_BYTES) || ''
    # Ensure valid UTF-8 after a mid-codepoint cut so JSON serialization stays valid.
    text = sliced.dup.force_encoding(Encoding::UTF_8).scrub
    [text, bytes.bytesize > MAX_OUTPUT_BYTES]
  end

  def process_alive?(pid)
    Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  end

  def terminate_process_group!(pid)
    begin
      Process.kill('TERM', -pid)
    rescue Errno::ESRCH, Errno::EPERM
      begin
        Process.kill('TERM', pid)
      rescue Errno::ESRCH, Errno::EPERM
      end
    end

    deadline = Time.now + TERM_GRACE_SECONDS
    sleep 0.05 while process_alive?(pid) && Time.now < deadline

    return unless process_alive?(pid)

    begin
      Process.kill('KILL', -pid)
    rescue Errno::ESRCH, Errno::EPERM
      begin
        Process.kill('KILL', pid)
      rescue Errno::ESRCH, Errno::EPERM
      end
    end
  end

  def capture_command(argv, timeout_seconds: TIMEOUT_SECONDS)
    stdout_data = +''
    stderr_data = +''
    exit_code = nil
    timed_out = false
    wait_thr = nil
    pid = nil

    Open3.popen3(sanitized_env, *argv, chdir: ROOT, unsetenv_others: true, pgroup: true) do |stdin, stdout, stderr, thr|
      stdin.close
      wait_thr = thr
      pid = thr.pid

      out_reader = Thread.new { stdout.read.to_s }
      err_reader = Thread.new { stderr.read.to_s }

      deadline = Time.now + timeout_seconds
      until thr.join(0.05)
        next if Time.now < deadline

        timed_out = true
        terminate_process_group!(pid)
        break
      end

      # Always reap the process.
      status = thr.value
      exit_code = status&.exitstatus
      stdout_data = out_reader.value
      stderr_data = err_reader.value
    end

    # Final reap/kill belt-and-suspenders if the block exited early.
    if pid && process_alive?(pid)
      terminate_process_group!(pid)
      begin
        Process.wait(pid)
      rescue Errno::ECHILD
      end
    end

    [stdout_data, stderr_data, exit_code, timed_out, pid]
  end

  def command_report(id, argv, execute, timeout_seconds: TIMEOUT_SECONDS)
    stdout = +''
    stderr = +''
    exit_code = nil
    timed_out = false
    if execute
      stdout, stderr, exit_code, timed_out, = capture_command(argv, timeout_seconds: timeout_seconds)
    end
    out, out_trunc = trunc(stdout)
    err, err_trunc = trunc(stderr)
    {
      'id' => id,
      'argv' => argv,
      'executado' => execute,
      'exit_code' => exit_code,
      'timeout' => timed_out,
      'stdout_sha256' => Digest::SHA256.hexdigest(out),
      'stderr_sha256' => Digest::SHA256.hexdigest(err),
      'stdout_truncado' => out_trunc,
      'stderr_truncado' => err_trunc
    }
  end

  def denial_entry(error)
    if error.is_a?(DeniedError)
      "#{error.code}: #{error.message}"
    elsif error.is_a?(MissionPlanner::SchemaError)
      "SCHEMA_INVALID: #{error.message}"
    else
      "#{error.class}: operação interna falhou"
    end
  end

  def exit_code_for(status)
    EXIT_BY_STATUS.fetch(status, 4)
  end

  def run(argv)
    opts = parse(argv)
    card = nil
    plan = nil
    commands = []
    status = 'dry-run'
    negacoes = []
    execute = false
    start = nil

    begin
      enforce_runtime_safety!(opts)
      card = load_json(opts[:card])
      plan = load_json(opts[:plan])
      catalog = load_catalog
      execute = opts[:execute] && ENV['AGENT_ORCHESTRATION_EXECUTE'] == '1'
      status = execute ? 'success' : 'dry-run'
      start = execute ? Time.now.utc : nil

      validated_commands = validate_inputs!(card, plan, catalog)
      validated_commands.each do |id|
        argv = resolve_command_argv!(catalog, id)
        report = command_report(id, argv, execute)
        if report['timeout']
          status = 'timeout'
        elsif execute && report['exit_code'] && report['exit_code'] != 0 && status == 'success'
          status = 'failure'
        end
        commands << report
      end
    rescue DeniedError, MissionPlanner::SchemaError => error
      status = 'denied'
      negacoes << denial_entry(error)
    rescue StandardError => error
      status = 'internal-error'
      negacoes << denial_entry(error)
    end

    if execute
      finish = Time.now.utc
      inicio = (start || finish).iso8601
      fim = finish.iso8601
      duracao_ms = ((finish - (start || finish)) * 1000).round
    else
      inicio = fim = DRY_RUN_TIMESTAMP
      duracao_ms = 0
    end

    missao_id = if card.is_a?(Hash) && card['id'].is_a?(String) && !card['id'].empty?
                  card['id']
                else
                  'unknown'
                end
    plan_hash = if plan.is_a?(Hash)
                  Digest::SHA256.hexdigest(JSON.generate(plan))
                else
                  Digest::SHA256.hexdigest('')
                end

    report = {
      'avisos' => execute ? [] : ['dry-run: use --execute e AGENT_ORCHESTRATION_EXECUTE=1 para execução real'],
      'comandos' => commands,
      'duracao_ms' => duracao_ms,
      'evidencias' => ['catalogo fixo', 'argv sem shell', 'ambiente sanitizado', 'sem git mutante'],
      'fim' => fim,
      'inicio' => inicio,
      'missao_id' => missao_id,
      'modo' => execute ? 'execute' : 'dry-run',
      'negacoes' => negacoes,
      'plan_hash' => plan_hash,
      'status' => status,
      'versao' => 1
    }
    json = JSON.pretty_generate(report) + "\n"
    begin
      if opts[:output]
        output_path = safe_path(opts[:output])
        FileUtils.mkdir_p(File.dirname(output_path))
        File.write(output_path, json)
      end
      puts json if opts[:stdout]
    rescue DeniedError, MissionPlanner::SchemaError => error
      status = 'denied'
      negacoes = [denial_entry(error)]
      report['status'] = status
      report['negacoes'] = negacoes
      json = JSON.pretty_generate(report) + "\n"
      puts json if opts[:stdout]
    rescue StandardError => error
      status = 'internal-error'
      negacoes = [denial_entry(error)]
      report['status'] = status
      report['negacoes'] = negacoes
      json = JSON.pretty_generate(report) + "\n"
      puts json if opts[:stdout]
    end
    exit_code_for(status)
  end
end

exit AgentMissionRunner.run(ARGV) if $PROGRAM_NAME == __FILE__
