#!/usr/bin/env ruby
require 'json'
require 'yaml'
require 'optparse'
require 'open3'
require 'timeout'
require 'digest'
require 'tmpdir'
require 'time'

module AgentMissionRunner
  ROOT = File.expand_path('..', __dir__)
  CATALOG_PATH = File.join(ROOT, '.agents/orquestracao/executor/catalogo-comandos.yaml')
  TIMEOUT_SECONDS = 120
  MAX_OUTPUT_BYTES = 1_048_576
  SAFE_ENV_KEYS = %w[PATH HOME LANG LC_ALL CI GITHUB_BASE_REF].freeze
  BLOCKED_TOKENS = %w[sh bash zsh fish eval source curl wget ssh scp nc gh vercel supabase].freeze
  BLOCKED_PAIRS = [%w[npm install], %w[gem install], %w[git push], %w[git commit]].freeze

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

  def requested_commands(card, plan)
    from_card = card.dig('executor', 'comandos') || card.dig('verificacao', 'comandos') || []
    from_plan = plan['comandos'] || plan.dig('executor', 'comandos') || []
    commands = (from_card + from_plan).uniq
    raise 'missing execution commands' if commands.empty?
    commands
  end

  def validate_inputs!(card, plan, catalog)
    raise 'invalid card id' unless card['id'].is_a?(String) && !card['id'].empty?
    raise 'mission id mismatch' unless plan['missao_id'] == card['id']
    raise 'plan status must be planejado' unless plan['status'] == 'planejado'
    raise 'plan has negacoes' unless Array(plan['negacoes']).empty?
    raise 'insufficient authorization' unless %w[A2 A3 A4 A5].include?(card.dig('autorizacao', 'nivel'))
    requested_commands(card, plan).each do |id|
      raise "command not in catalog: #{id}" unless catalog.key?(id)
    end
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
          stdout, stderr, status = Open3.capture3(sanitized_env, *argv, chdir: ROOT)
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

  def run(argv)
    opts = parse(argv)
    card = load_json(opts[:card])
    plan = load_json(opts[:plan])
    catalog = load_catalog
    execute = opts[:execute] && ENV['AGENT_ORCHESTRATION_EXECUTE'] == '1'
    start = Time.now.utc
    commands = []
    status = execute ? 'success' : 'dry-run'
    negacoes = []
    begin
      validate_inputs!(card, plan, catalog)
      requested_commands(card, plan).each do |id|
        report = command_report(id, catalog.fetch(id).fetch('argv'), execute)
        status = 'timeout' if report['timeout']
        status = 'failure' if execute && report['exit_code'] && report['exit_code'] != 0 && status == 'success'
        commands << report
      end
    rescue StandardError => error
      status = 'denied'
      negacoes << error.message
    end
    finish = Time.now.utc
    report = {
      'avisos' => execute ? [] : ['dry-run: use --execute e AGENT_ORCHESTRATION_EXECUTE=1 para execução real'],
      'comandos' => commands,
      'duracao_ms' => ((finish - start) * 1000).round,
      'evidencias' => ['catalogo fixo', 'argv sem shell', 'ambiente sanitizado', 'sem git mutante'],
      'fim' => finish.iso8601,
      'inicio' => start.iso8601,
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
