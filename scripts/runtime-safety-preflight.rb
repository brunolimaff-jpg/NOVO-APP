#!/usr/bin/env ruby
# frozen_string_literal: true

# Runtime Safety Preflight — fail-closed, deterministic report (Fase 3B.3A).
# Does NOT spawn agents. Does NOT execute destructive commands.
# Probe uses official `dcg test` only (analysis, no execution).

require 'json'
require 'yaml'
require 'optparse'
require 'open3'
require 'digest'
require 'time'
require 'fileutils'
require_relative './lib/agent_path_guard'
require_relative './plan-agent-mission'

module RuntimeSafetyPreflight
  ROOT = File.expand_path('..', __dir__)
  POLICY_PATH = File.join(ROOT, '.agents/seguranca/runtime-safety.yaml')
  SCHEMA_PATH = File.join(ROOT, '.agents/seguranca/contrato-runtime-safety.schema.json')
  CONFIG_PATH = File.join(ROOT, '.agents/seguranca/.dcg.toml')
  FIXTURE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')

  module_function

  def load_policy
    YAML.safe_load(File.read(POLICY_PATH), aliases: false)
  end

  def git_head
    out, status = Open3.capture2('git', '-C', ROOT, 'rev-parse', 'HEAD')
    return out.strip if status.success?

    'unknown'
  end

  def detect_platform_key
    require 'rbconfig'
    host = RbConfig::CONFIG['host_os'].to_s
    cpu = RbConfig::CONFIG['host_cpu'].to_s
    if host =~ /darwin/i
      return cpu =~ /arm|aarch64/i ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
    end
    if host =~ /linux/i
      return cpu =~ /arm|aarch64/i ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-musl'
    end
    if host =~ /mswin|mingw|cygwin/i
      return 'x86_64-pc-windows-msvc'
    end
    'unknown'
  end

  def find_dcg(mode:, fixture_dcg:, force_absent: false, override: nil)
    return nil if force_absent
    return override if override.is_a?(String) && !override.empty?

    if mode == 'fixture'
      return fixture_dcg if File.executable?(fixture_dcg) || File.exist?(fixture_dcg)

      return nil
    end
    from_env = ENV['DCG_PATH']&.strip
    return from_env unless from_env.nil? || from_env.empty?

    path, status = Open3.capture2('bash', '-lc', 'command -v dcg')
    status.success? ? path.strip : nil
  end

  def read_version(dcg_path)
    out, _err, status = Open3.capture3(dcg_path, '--version')
    return nil unless status.success?

    m = out.match(/dcg\s+([0-9]+\.[0-9]+\.[0-9]+)/i)
    m && m[1]
  end

  def file_sha256(path)
    return nil unless path && File.file?(path)

    Digest::SHA256.hexdigest(File.binread(path))
  end

  def bypass_env_present(policy)
    Array(policy['bypass_env_proibidas']).select do |name|
      val = ENV[name]
      !val.nil? && !val.to_s.empty?
    end
  end

  def run_probe(dcg_path, sample)
    # Official non-executing analysis: `dcg test --format json "<cmd>"`
    out, err, status = Open3.capture3(dcg_path, 'test', '--format', 'json', sample)
    decision = nil
    begin
      parsed = JSON.parse(out)
      decision = parsed['decision']
    rescue JSON::ParserError
      decision = nil
    end
    blocked = status.exitstatus == 1 || %w[deny block denied blocked].include?(decision.to_s.downcase)
    {
      'executado' => true,
      'modo' => 'dcg test --format json',
      'resultado' => blocked ? 'blocked' : (decision ? 'allowed' : 'error'),
      'comando_amostra' => sample,
      'stdout_preview' => out.byteslice(0, 200).to_s.force_encoding('UTF-8').scrub,
      'stderr_preview' => err.byteslice(0, 200).to_s.force_encoding('UTF-8').scrub
    }
  rescue Errno::ENOENT
    {
      'executado' => false,
      'modo' => 'dcg test --format json',
      'resultado' => 'unsupported',
      'comando_amostra' => sample
    }
  end

  def sort_keys_deep(obj)
    case obj
    when Hash
      obj.keys.sort.each_with_object({}) { |k, h| h[k] = sort_keys_deep(obj[k]) }
    when Array
      obj.map { |v| sort_keys_deep(v) }
    else
      obj
    end
  end

  def compute_hash(report_without_hash)
    canonical = JSON.generate(sort_keys_deep(report_without_hash))
    Digest::SHA256.hexdigest(canonical)
  end

  def build_report(opts)
    policy = load_policy
    mode = opts[:mode] || 'live'
    worktree = File.realpath(opts[:worktree] || ROOT)
    negacoes = []
    avisos = []

    bypass = bypass_env_present(policy)
    bypass.each do |name|
      negacoes << { 'codigo' => 'DCG_BYPASS_ENV', 'mensagem' => "variável de bypass presente: #{name}" }
    end

    config_ok = File.file?(CONFIG_PATH)
    unless config_ok
      negacoes << { 'codigo' => 'DCG_CONFIG_MISSING', 'mensagem' => "config ausente: #{CONFIG_PATH}" }
    end

    platform = detect_platform_key
    expected_checksum = (policy.dig('checksums_esperados') || {})[platform]
    fixture_dcg = opts[:fixture_dcg] || FIXTURE_DCG
    dcg_path = find_dcg(
      mode: mode,
      fixture_dcg: fixture_dcg,
      force_absent: opts[:force_dcg_absent],
      override: opts[:dcg_path]
    )

    presente = !dcg_path.nil? && File.exist?(dcg_path)
    versao_obs = presente ? read_version(dcg_path) : nil
    checksum_obs = presente ? file_sha256(dcg_path) : nil
    versao_esp = policy['versao_esperada'].to_s

    # Fixture mode pins checksum to the fixture file itself (CI never downloads release artifacts).
    if mode == 'fixture' && presente
      expected_checksum = checksum_obs
    end
    expected_checksum = opts[:checksum_esperado_override] if opts.key?(:checksum_esperado_override)

    probe = {
      'executado' => false,
      'modo' => 'dcg test --format json',
      'resultado' => 'skipped',
      'comando_amostra' => policy.dig('probe', 'comando_amostra') || 'git reset --hard'
    }

    if !presente
      if mode == 'live'
        # unavailable — tool missing
      else
        negacoes << { 'codigo' => 'DCG_MISSING', 'mensagem' => 'fixture DCG ausente' }
      end
    else
      if versao_obs.nil? || versao_obs != versao_esp
        negacoes << {
          'codigo' => 'DCG_VERSION_MISMATCH',
          'mensagem' => "versão observada=#{versao_obs.inspect} esperada=#{versao_esp}"
        }
      end
      if expected_checksum.nil?
        avisos << 'CHECKSUM_PLATFORM_UNKNOWN'
      elsif checksum_obs != expected_checksum
        negacoes << {
          'codigo' => 'DCG_CHECKSUM_MISMATCH',
          'mensagem' => 'checksum do binário diverge do esperado'
        }
      end
      probe = run_probe(dcg_path, probe['comando_amostra'])
      if probe['resultado'] != 'blocked'
        negacoes << {
          'codigo' => 'DCG_PROBE_NOT_BLOCKED',
          'mensagem' => "probe não bloqueou amostra (resultado=#{probe['resultado']})"
        }
      end
    end

    # Hook trust: without programmatic evidence → unknown (fail-closed).
    hook_detectado = mode == 'fixture' && File.file?(File.join(ROOT, '.agents/seguranca/fixtures/hook-marker.json'))
    hook_confiado =
      if mode == 'fixture' && hook_detectado
        'fixture'
      else
        'unknown'
      end

    unless mode == 'fixture' && hook_confiado == 'fixture'
      negacoes << {
        'codigo' => 'DCG_HOOK_TRUST_UNKNOWN',
        'mensagem' => policy['passo_humano_hook_trust'].to_s.strip
      }
      avisos << 'HOOK_TRUST_REQUIRES_HUMAN'
    end

    sample_paths = opts[:paths] || %w[scripts/runtime-safety-preflight.rb .agents/seguranca/runtime-safety.yaml]
    normalized, path_negs = AgentPathGuard.normalize_path_list(sample_paths, worktree_root: worktree)
    path_negs.each { |n| negacoes << n }

    # Self-protection: deny mutation targets in missão sample (rule registration).
    Array(opts[:mutation_paths]).each do |p|
      begin
        rel = AgentPathGuard.validate_path!(p, worktree_root: worktree)
        if AgentPathGuard.protected_mutation?(rel) && !opts[:security_maintenance]
          negacoes << {
            'codigo' => 'SECURITY_SURFACE_MUTATION_DENIED',
            'mensagem' => "missão não pode alterar superfície de segurança: #{rel}"
          }
        end
      rescue AgentPathGuard::Denial => error
        negacoes << { 'codigo' => error.code, 'mensagem' => error.message }
      end
    end

    status =
      if !presente && mode == 'live'
        'unavailable'
      elsif negacoes.any?
        'denied'
      else
        'ready'
      end

    # Strip probe previews from hashed document for stability in schema.
    probe_public = probe.slice('executado', 'modo', 'resultado', 'comando_amostra')

    report = {
      'status' => status,
      'contrato_versao' => policy['contrato_versao'].to_s,
      'timestamp' => (opts[:timestamp] || Time.now.utc).iso8601,
      'repo_root' => ROOT,
      'worktree_realpath' => worktree,
      'git_head' => git_head,
      'dcg' => {
        'presente' => presente,
        'path' => presente ? dcg_path : nil,
        'versao_observada' => versao_obs,
        'versao_esperada' => versao_esp,
        'checksum_observado' => checksum_obs,
        'checksum_esperado' => expected_checksum,
        'configuracao_encontrada' => config_ok,
        'hook_detectado' => hook_detectado,
        'hook_confiado' => hook_confiado,
        'probe' => probe_public
      },
      'bypass_env_detectado' => bypass,
      'validacao_paths' => {
        'ok' => path_negs.empty?,
        'caminhos' => normalized,
        'negacoes' => path_negs
      },
      'negacoes' => negacoes.uniq { |n| [n['codigo'], n['mensagem']] },
      'avisos' => avisos.uniq,
      'modo' => mode
    }

    report['relatorio_sha256'] = compute_hash(report.reject { |k, _| k == 'relatorio_sha256' })
    report
  end

  def validate_report!(report, expect_worktree: nil, ttl_seconds: nil, now: Time.now.utc)
    schema = JSON.parse(File.read(SCHEMA_PATH))
    MissionPlanner.send(:validate_against_schema!, report, schema)

    policy = load_policy
    ttl = ttl_seconds || policy['preflight_ttl_segundos'].to_i
    ts = Time.parse(report.fetch('timestamp'))
    age = now - ts
    if age > ttl || age < -60
      raise Denied.new('RUNTIME_SAFETY_REPORT_EXPIRED', "relatório expirado (age=#{age.to_i}s ttl=#{ttl})")
    end

    recomputed = compute_hash(report.reject { |k, _| k == 'relatorio_sha256' })
    unless recomputed == report['relatorio_sha256']
      raise Denied.new('RUNTIME_SAFETY_HASH_MISMATCH', 'hash do relatório adulterado')
    end

    wt = expect_worktree ? File.realpath(expect_worktree) : File.realpath(ROOT)
    unless File.realpath(report.fetch('worktree_realpath')) == wt &&
           File.realpath(report.fetch('repo_root')) == File.realpath(ROOT)
      raise Denied.new('RUNTIME_SAFETY_SCOPE_MISMATCH', 'repo/worktree divergente')
    end

    case report['status']
    when 'ready'
      true
    when 'unavailable', 'denied'
      raise Denied.new('RUNTIME_SAFETY_NOT_READY', "status=#{report['status']}")
    else
      raise Denied.new('RUNTIME_SAFETY_NOT_READY', "status inválido=#{report['status']}")
    end
  end

  class Denied < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  def parse(argv)
    opts = { mode: 'live', stdout: false }
    OptionParser.new do |p|
      p.on('--mode MODE', 'live|fixture') { |v| opts[:mode] = v }
      p.on('--output PATH') { |v| opts[:output] = v }
      p.on('--stdout') { opts[:stdout] = true }
      p.on('--worktree PATH') { |v| opts[:worktree] = v }
      p.on('--fixture-dcg PATH') { |v| opts[:fixture_dcg] = v }
      p.on('--mutation-path PATH') { |v| (opts[:mutation_paths] ||= []) << v }
      p.on('--timestamp ISO8601') { |v| opts[:timestamp] = Time.parse(v) }
    end.parse!(argv)
    raise 'use --stdout or --output' unless opts[:stdout] || opts[:output]

    opts
  end

  def run(argv)
    opts = parse(argv)
    report = build_report(opts)
    text = JSON.pretty_generate(sort_keys_deep(report)) + "\n"
    File.write(opts[:output], text) if opts[:output]
    print text if opts[:stdout]
    exit(report['status'] == 'ready' ? 0 : 1)
  end
end

RuntimeSafetyPreflight.run(ARGV) if $PROGRAM_NAME == __FILE__
