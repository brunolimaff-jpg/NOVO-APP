#!/usr/bin/env ruby
require 'json'
require 'yaml'
require 'optparse'
require 'open3'
require 'timeout'
require 'digest'
require 'tmpdir'
require 'time'
require_relative './plan-agent-mission'

module AgentMissionRunner
  ROOT = File.expand_path('..', __dir__)
  ORCH_DIR = File.join(ROOT, '.agents/orquestracao')
  CATALOG_PATH = File.join(ORCH_DIR, 'executor/catalogo-comandos.yaml')
  CARD_SCHEMA_PATH = File.join(ORCH_DIR, 'cartao-missao.schema.json')
  PLAN_SCHEMA_PATH = File.join(ORCH_DIR, 'contrato-plano.schema.json')
  TIMEOUT_SECONDS = 120
  MAX_OUTPUT_BYTES = 1_048_576
  SAFE_ENV_KEYS = %w[PATH HOME LANG LC_ALL CI GITHUB_BASE_REF].freeze
  BLOCKED_TOKENS = %w[sh bash zsh fish eval source curl wget ssh scp nc gh vercel supabase].freeze
  BLOCKED_PAIRS = [%w[npm install], %w[gem install], %w[git push], %w[git commit]].freeze
  DRY_RUN_TIMESTAMP = '1970-01-01T00:00:00Z'

  class DeniedError < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def parse(argv)
    opts = { execute: false, stdout: false }
    OptionParser.new do |parser|
      parser.on('--card PATH') { |v| opts[:card] = v }
      parser.on('--plan PATH') { |v| opts[:plan] = v }
      parser.on('--output PATH') { |v| opts[:output] = v }
      parser.on('--stdout') { opts[:stdout] = true }
      parser.on('--execute') { opts[:execute] = true }
    end.parse!(argv)
    raise 'missing --card' unless opts[:card]
    raise 'missing --plan' unless opts[:plan]
    raise 'use --stdout or --output' unless opts[:stdout] || opts[:output]
    opts
  end

  def safe_path(path, must_exist: false)
    expanded = File.expand_path(path, ROOT)
    allowed_roots = [File.realpath(ROOT), File.realpath(Dir.tmpdir)]
    target = must_exist ? File.realpath(expanded) : File.realpath(File.dirname(expanded))
    raise "path rejected: #{path}" unless allowed_roots.any? { |root| target == root || target.start_with?(root + File::SEPARATOR) }
    expanded
  end

  def load_json(path)
    JSON.parse(File.read(safe_path(path, must_exist: true)))
  end

  def load_schema(path)
    JSON.parse(File.read(path))
  end

  def load_catalog(path = CATALOG_PATH)
    data = YAML.safe_load(File.read(path), aliases: false)
    commands = data.fetch('comandos')
    commands.each do |id, entry|
      argv = entry['argv']
      raise "catalog command #{id} must be argv array" unless argv.is_a?(Array) && argv.all? { |a| a.is_a?(String) }
      raise "catalog command #{id} has extra arguments" if entry.keys != ['argv']
      validate_argv!(id, argv)
    end
    commands
  end

  def validate_argv!(id, argv)
    joined = argv.join(' ')
    raise "blocked shell command in #{id}" if BLOCKED_TOKENS.include?(argv.first)
    raise "blocked token in #{id}" if argv.any? { |arg| arg.include?('|') || arg.include?('>') || arg.include?('<') || arg.include?('`') || arg.include?('$(') }
    raise "blocked network/install/git command in #{id}" if BLOCKED_PAIRS.any? { |pair| joined.include?(pair.join(' ')) }
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

  def validate_schemas!(card, plan)
    card_schema = load_schema(CARD_SCHEMA_PATH)
    plan_schema = load_schema(PLAN_SCHEMA_PATH)
    MissionPlanner.send(:validate_against_schema!, card, card_schema)
    MissionPlanner.send(:validate_against_schema!, plan, plan_schema)
  end

  def validate_inputs!(card, plan, catalog)
    validate_schemas!(card, plan)
    raise DeniedError.new('MISSION_MISMATCH', 'mission id mismatch') unless plan['missao_id'] == card['id']
    raise DeniedError.new('PLAN_STATUS_INVALID', 'plan status must be planejado') unless plan['status'] == 'planejado'
    raise DeniedError.new('PLAN_NEGATIONS', 'plan has negacoes') unless Array(plan['negacoes']).empty?
    raise DeniedError.new('AUTH_INSUFFICIENT', 'insufficient authorization') unless %w[A2 A3 A4 A5].include?(card.dig('autorizacao', 'nivel'))

    commands = validate_command_alignment!(card, plan)
    commands.each do |id|
      raise DeniedError.new('COMMAND_NOT_IN_CATALOG', "command not in catalog: #{id}") unless catalog.key?(id)
    end
    commands
  end

  def sanitized_env
    ENV.to_h.select { |key, _| SAFE_ENV_KEYS.include?(key) }
  end

  def trunc(value)
    bytes = value.to_s.b
    [bytes.byteslice(0, MAX_OUTPUT_BYTES) || '', bytes.bytesize > MAX_OUTPUT_BYTES]
  end

  def command_report(id, argv, execute)
    stdout = +''
    stderr = +''
    exit_code = nil
    timed_out = false
    if execute
      begin
        Timeout.timeout(TIMEOUT_SECONDS) do
          stdout, stderr, status = Open3.capture3(sanitized_env, *argv, chdir: ROOT, unsetenv_others: true)
          exit_code = status.exitstatus
        end
      rescue Timeout::Error
        timed_out = true
        exit_code = nil
      end
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
      error.message
    end
  end

  def run(argv)
    opts = parse(argv)
    card = load_json(opts[:card])
    plan = load_json(opts[:plan])
    catalog = load_catalog
    execute = opts[:execute] && ENV['AGENT_ORCHESTRATION_EXECUTE'] == '1'
    commands = []
    status = execute ? 'success' : 'dry-run'
    negacoes = []
    start = execute ? Time.now.utc : nil
    begin
      validated_commands = validate_inputs!(card, plan, catalog)
      validated_commands.each do |id|
        report = command_report(id, catalog.fetch(id).fetch('argv'), execute)
        status = 'timeout' if report['timeout']
        status = 'failure' if execute && report['exit_code'] && report['exit_code'] != 0 && status == 'success'
        commands << report
      end
    rescue DeniedError, MissionPlanner::SchemaError => error
      status = 'denied'
      negacoes << denial_entry(error)
    rescue StandardError => error
      status = 'denied'
      negacoes << denial_entry(error)
    end

    if execute
      finish = Time.now.utc
      inicio = start.iso8601
      fim = finish.iso8601
      duracao_ms = ((finish - start) * 1000).round
    else
      inicio = fim = DRY_RUN_TIMESTAMP
      duracao_ms = 0
    end

    report = {
      'avisos' => execute ? [] : ['dry-run: use --execute e AGENT_ORCHESTRATION_EXECUTE=1 para execução real'],
      'comandos' => commands,
      'duracao_ms' => duracao_ms,
      'evidencias' => ['catalogo fixo', 'argv sem shell', 'ambiente sanitizado', 'sem git mutante'],
      'fim' => fim,
      'inicio' => inicio,
      'missao_id' => card['id'],
      'modo' => execute ? 'execute' : 'dry-run',
      'negacoes' => negacoes,
      'plan_hash' => Digest::SHA256.hexdigest(JSON.generate(plan)),
      'status' => status,
      'versao' => 1
    }
    json = JSON.pretty_generate(report) + "\n"
    File.write(safe_path(opts[:output]), json) if opts[:output]
    puts json if opts[:stdout]
    status == 'denied' ? 2 : 0
  end
end

exit AgentMissionRunner.run(ARGV) if $PROGRAM_NAME == __FILE__
