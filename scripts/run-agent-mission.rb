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
require_relative './lib/agent_mission_contract'
require_relative './lib/agent_single_runtime'
require_relative './lib/agent_supervised_pilot'

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
    'internal-error' => 4,
    'unavailable' => 5
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
    opts = {
      execute: false,
      stdout: false,
      agent_runtime: false,
      runtime_ack: nil,
      worktree: nil,
      supervised_pilot: false,
      pilot_ack: nil,
      pilot_state_dir: nil
    }
    OptionParser.new do |parser|
      parser.on('--card PATH') { |v| opts[:card] = v }
      parser.on('--plan PATH') { |v| opts[:plan] = v }
      parser.on('--output PATH') { |v| opts[:output] = v }
      parser.on('--stdout') { opts[:stdout] = true }
      parser.on('--execute') { opts[:execute] = true }
      parser.on('--safety-report PATH') { |v| opts[:safety_report] = v }
      parser.on('--agent-runtime') { opts[:agent_runtime] = true }
      parser.on('--runtime-ack VALUE') { |v| opts[:runtime_ack] = v }
      parser.on('--worktree PATH') { |v| opts[:worktree] = v }
      parser.on('--supervised-pilot') { opts[:supervised_pilot] = true }
      parser.on('--pilot-ack VALUE') { |v| opts[:pilot_ack] = v }
      parser.on('--pilot-state-dir PATH') { |v| opts[:pilot_state_dir] = v }
    end.parse!(argv)
    raise 'missing --card' unless opts[:card]
    raise 'missing --plan' unless opts[:plan]
    raise 'use --stdout or --output' unless opts[:stdout] || opts[:output]
    opts
  end

  def enforce_runtime_safety!(opts)
    mode = AgentSingleRuntime.enforce_activation!(opts)
    return mode if mode == :legacy

    # Piloto: seis chaves (só quando solicitado). Runtime 3B.3B continua sem elas.
    begin
      AgentSupervisedPilot.enforce_activation!(opts)
    rescue AgentSupervisedPilot::Denial => error
      raise DeniedError.new(error.code, error.message)
    end

    # External safety report is diagnostic only — never authorizes.
    if opts[:safety_report] && !opts[:safety_report].to_s.strip.empty?
      begin
        report = JSON.parse(File.read(safe_path(opts[:safety_report], must_exist: true)))
        RuntimeSafetyPreflight.validate_report!(report)
      rescue RuntimeSafetyPreflight::Denied, MissionPlanner::SchemaError, JSON::ParserError, DeniedError
        # ignored: authorization comes only from live preflight inside AgentSingleRuntime
      end
    end

    unless opts[:worktree] && !opts[:worktree].to_s.strip.empty?
      raise DeniedError.new('RUNTIME_PRIMARY_WORKTREE_DENIED', '--worktree dedicado obrigatório')
    end

    :agent_runtime
  rescue AgentSingleRuntime::Denial => error
    raise DeniedError.new(error.code, error.message)
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
    AgentMissionContract.normalize_commands(list)
  end

  def card_commands(card)
    AgentMissionContract.card_commands(card)
  end

  def plan_commands(plan)
    AgentMissionContract.plan_commands(plan)
  rescue AgentMissionContract::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def validate_command_alignment!(card, plan)
    AgentMissionContract.validate_command_alignment!(card, plan)
  rescue AgentMissionContract::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def validate_executable_plan_commands!(plan)
    AgentMissionContract.validate_executable_plan_commands!(plan)
  rescue AgentMissionContract::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def validate_schemas!(card, plan)
    AgentMissionContract.validate_schemas!(card, plan)
  rescue AgentMissionContract::Denial => error
    raise DeniedError.new(error.code, error.message)
  end

  def validate_inputs!(card, plan, catalog)
    AgentMissionContract.validate_inputs!(card, plan, catalog)
  rescue AgentMissionContract::Denial => error
    raise DeniedError.new(error.code, error.message)
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
    runtime_report = nil
    mode_label = 'dry-run'

    begin
      runtime_mode = enforce_runtime_safety!(opts)
      card = load_json(opts[:card])
      plan = load_json(opts[:plan])
      catalog = load_catalog

      if runtime_mode == :agent_runtime
        mode_label = 'agent-runtime'
        worktree = File.expand_path(opts[:worktree], ROOT)
        validate_inputs!(card, plan, catalog)

        pilot_mode = AgentSupervisedPilot.pilot_requested?(opts)
        delivery_contract = nil
        if pilot_mode
          template = AgentSupervisedPilot.load_template!(ROOT, missao_id: card['id'].to_s)
          AgentSupervisedPilot.validate_mission!(card: card, plan: plan, template: template, root: ROOT)
          delivery_contract = AgentSupervisedPilot.extract_delivery_contract(template)
          state_dir = AgentSupervisedPilot.state_dir(ROOT, override: opts[:pilot_state_dir])
          if AgentSupervisedPilot.already_executed?(state_dir: state_dir, missao_id: card['id'])
            raise DeniedError.new('SUPERVISED_PILOT_ALREADY_EXECUTED', "piloto já registrado: #{card['id']}")
          end
        end

        runtime_report = AgentSingleRuntime.run!(
          card: card,
          plan: plan,
          catalog: catalog,
          worktree: worktree,
          safety_report_path: opts[:safety_report] && safe_path(opts[:safety_report], must_exist: true),
          repo_root: ROOT,
          delivery_contract: delivery_contract
        )
        status = runtime_report['status']
        negacoes = Array(runtime_report['negacoes'])
        execute = true
        start = Time.parse(runtime_report['inicio']) rescue Time.now.utc

        if pilot_mode
          sdir = AgentSupervisedPilot.state_dir(ROOT, override: opts[:pilot_state_dir])
          AgentSupervisedPilot.claim_mission!(
            state_dir: sdir,
            missao_id: card['id'],
            report_hash: runtime_report['relatorio_sha256'],
            dry_run: ENV['AGENT_RUNTIME_PILOT_DRY'] == '1'
          )
        end
      else
        execute = opts[:execute] && ENV['AGENT_ORCHESTRATION_EXECUTE'] == '1'
        status = execute ? 'success' : 'dry-run'
        mode_label = execute ? 'execute' : 'dry-run'
        start = execute ? Time.now.utc : nil

        validated_commands = validate_inputs!(card, plan, catalog)
        validated_commands.each do |id|
          cmd_argv = resolve_command_argv!(catalog, id)
          report = command_report(id, cmd_argv, execute)
          if report['timeout']
            status = 'timeout'
          elsif execute && report['exit_code'] && report['exit_code'] != 0 && status == 'success'
            status = 'failure'
          end
          commands << report
        end
      end
    rescue DeniedError, MissionPlanner::SchemaError, AgentMissionContract::Denial, AgentSingleRuntime::Denial, CodexSingleAgentRuntime::Denial, AgentSupervisedPilot::Denial => error
      status = 'denied'
      code = error.respond_to?(:code) ? error.code : nil
      negacoes << (code ? "#{code}: #{error.message}" : denial_entry(error))
    rescue StandardError => error
      status = 'internal-error'
      negacoes << denial_entry(error)
    end

    if runtime_report
      report = runtime_report
      report['status'] = status if status == 'denied' && runtime_report['status'] != 'denied'
      report['negacoes'] = negacoes if status == 'denied' && Array(runtime_report['negacoes']).empty?
      # recompute hash if mutated
      if report.key?('relatorio_sha256')
        report['relatorio_sha256'] = AgentSingleRuntime.compute_report_hash(report)
      end
    else
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
        'modo' => mode_label,
        'negacoes' => negacoes,
        'plan_hash' => plan_hash,
        'status' => status,
        'versao' => 1
      }
    end
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
