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
require_relative './lib/dcg_codex_hook_verifier'
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

    # PATH lookup sem shell (não usa bash -lc).
    ENV.fetch('PATH', '').split(File::PATH_SEPARATOR).each do |dir|
      next if dir.empty?

      candidate = File.join(dir, 'dcg')
      begin
        return candidate if File.file?(candidate) && File.executable?(candidate)
      rescue SystemCallError
        next
      end
    end
    nil
  rescue SystemCallError
    nil
  end

  def read_version(dcg_path)
    out, _err, status = Open3.capture3(dcg_path, '--version')
    return nil unless status.success?

    m = out.match(/dcg\s+([0-9]+\.[0-9]+\.[0-9]+)/i)
    m && m[1]
  rescue SystemCallError
    nil
  end

  def file_sha256(path)
    return nil unless path && File.file?(path)

    Digest::SHA256.hexdigest(File.binread(path))
  rescue SystemCallError
    nil
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
  rescue SystemCallError
    {
      'executado' => false,
      'modo' => 'dcg test --format json',
      'resultado' => 'unsupported',
      'comando_amostra' => sample,
      'codigo' => 'DCG_EXECUTION_UNAVAILABLE'
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
    begin
      worktree = File.realpath(opts[:worktree] || ROOT)
    rescue SystemCallError
      # Fail-closed: report denied with scope mismatch rather than crashing.
      return denied_bootstrap_report(policy, mode, 'RUNTIME_SAFETY_SCOPE_MISMATCH', 'worktree realpath inválido')
    end
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
    asset_expected = (policy.dig('asset_checksums_esperados') || {})[platform]
    binary_expected = (policy.dig('binary_checksums_esperados') || {})[platform]
    fixture_dcg = opts[:fixture_dcg] || FIXTURE_DCG
    dcg_path = find_dcg(
      mode: mode,
      fixture_dcg: fixture_dcg,
      force_absent: opts[:force_dcg_absent],
      override: opts[:dcg_path]
    )

    presente = !dcg_path.nil? && File.exist?(dcg_path)
    begin
      dcg_realpath = presente ? File.realpath(dcg_path) : nil
    rescue SystemCallError
      dcg_realpath = dcg_path
    end
    versao_obs = presente ? read_version(dcg_path) : nil
    binary_obs = presente ? file_sha256(dcg_path) : nil
    # Test-only: never honor observed override outside fixture/explicit test preflight.
    if opts.key?(:binary_checksum_observado_override) &&
       (mode == 'fixture' || (opts[:allow_test_hook] && ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] == '1'))
      binary_obs = opts[:binary_checksum_observado_override]
    end
    versao_esp = policy['versao_esperada'].to_s

    if presente && versao_obs.nil?
      negacoes << { 'codigo' => 'DCG_EXECUTION_UNAVAILABLE', 'mensagem' => 'falha ao ler versão do DCG' }
    end

    # Fixture/test: pin expected binary checksum to the fixture itself (CI never downloads assets).
    if (mode == 'fixture' || (opts[:allow_test_hook] && ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] == '1')) && presente
      binary_expected = binary_obs
    end
    binary_expected = opts[:checksum_esperado_override] if opts.key?(:checksum_esperado_override)
    binary_expected = opts[:binary_checksum_esperado_override] if opts.key?(:binary_checksum_esperado_override)

    binary_status =
      if !presente
        'skipped'
      elsif binary_expected.nil?
        'platform_unknown'
      elsif binary_obs == binary_expected
        'match'
      elsif !asset_expected.nil? && binary_obs == asset_expected
        'asset_hash_rejected'
      else
        'mismatch'
      end

    # Legacy fields mirror BINARY comparison only (never asset tarball hash as expected).
    checksum_obs = binary_obs
    expected_checksum = binary_expected

    probe_sample = policy.dig('probe', 'comando_amostra') || ('git ' + 'reset' + ' --' + 'hard')
    probe = {
      'executado' => false,
      'modo' => 'dcg test --format json',
      'resultado' => 'skipped',
      'comando_amostra' => probe_sample
    }

    if !presente
      if mode == 'live'
        # unavailable — tool missing
      else
        negacoes << { 'codigo' => 'DCG_MISSING', 'mensagem' => 'fixture DCG ausente' }
      end
    else
      if versao_obs && versao_obs != versao_esp
        negacoes << {
          'codigo' => 'DCG_VERSION_MISMATCH',
          'mensagem' => "versão observada=#{versao_obs.inspect} esperada=#{versao_esp}"
        }
      end
      if binary_status == 'platform_unknown'
        negacoes << {
          'codigo' => 'DCG_BINARY_CHECKSUM_PLATFORM_UNKNOWN',
          'mensagem' => "plataforma sem checksum de binário conhecido: #{platform}"
        }
        avisos << 'BINARY_CHECKSUM_PLATFORM_UNKNOWN'
      elsif binary_status == 'asset_hash_rejected'
        negacoes << {
          'codigo' => 'DCG_ASSET_CHECKSUM_MISMATCH',
          'mensagem' => 'hash do asset compactado não pode ser usado como checksum do binário'
        }
      elsif binary_status == 'mismatch'
        negacoes << {
          'codigo' => 'DCG_BINARY_CHECKSUM_MISMATCH',
          'mensagem' => 'checksum do binário diverge do esperado'
        }
      end
      probe = run_probe(dcg_path, probe['comando_amostra'])
      if probe['codigo'] == 'DCG_EXECUTION_UNAVAILABLE'
        negacoes << {
          'codigo' => 'DCG_EXECUTION_UNAVAILABLE',
          'mensagem' => 'falha ao iniciar probe dcg test'
        }
      elsif probe['resultado'] != 'blocked'
        negacoes << {
          'codigo' => 'DCG_PROBE_NOT_BLOCKED',
          'mensagem' => "probe não bloqueou amostra (resultado=#{probe['resultado']})"
        }
      end
    end

    # Hook trust — live: verifier + human attestation. Never trust external JSON.
    hook_marker = File.file?(File.join(ROOT, '.agents/seguranca/fixtures/hook-marker.json'))
    hook_detectado = false
    hook_confiado = 'unknown'

    if mode == 'fixture'
      hook_detectado = hook_marker
      hook_confiado = hook_detectado ? 'fixture' : 'unknown'
    elsif opts[:allow_test_hook] && ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] == '1'
      hook_detectado = hook_marker
      hook_confiado = hook_detectado ? 'verified-test' : 'unknown'
    elsif mode == 'live' && presente && binary_status == 'match' && versao_obs == versao_esp
      hooks_path = opts[:hooks_path] || DcgCodexHookVerifier.default_hooks_path
      verify = DcgCodexHookVerifier.verify(
        hooks_path: hooks_path,
        expected_dcg_realpath: dcg_realpath
      )
      if verify.ok
        hook_detectado = true
        begin
          require_relative './lib/dcg_hook_attestation'
          att_path = opts[:attestation_path] || DcgHookAttestation.attestation_path
          att = DcgHookAttestation.load_raw(att_path)
          DcgHookAttestation.validate!(
            attestation: att,
            hooks_path: hooks_path,
            dcg_path: dcg_realpath,
            policy: policy
          )
          hook_confiado = 'verified-local-human'
        rescue DcgHookAttestation::Denial => error
          negacoes << { 'codigo' => error.code, 'mensagem' => error.message }
          avisos << 'HOOK_TRUST_REQUIRES_HUMAN_ATTESTATION'
        rescue LoadError, StandardError => error
          negacoes << {
            'codigo' => 'DCG_HOOK_ATTESTATION_MISSING',
            'mensagem' => "atestação indisponível: #{error.message}"
          }
        end
      else
        hook_detectado = false
        negacoes << { 'codigo' => verify.code || 'DCG_HOOK_ENTRY_MISSING', 'mensagem' => verify.message }
      end
    end

    unless %w[fixture verified-test verified-local-human].include?(hook_confiado)
      unless negacoes.any? { |n| n['codigo'].to_s.start_with?('DCG_HOOK') }
        negacoes << {
          'codigo' => 'DCG_HOOK_TRUST_UNKNOWN',
          'mensagem' => policy['passo_humano_hook_trust'].to_s.strip
        }
      end
      avisos << 'HOOK_TRUST_REQUIRES_HUMAN'
      hook_confiado = 'unknown'
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

    finalize_report(
      status: status,
      policy: policy,
      mode: mode,
      worktree: worktree,
      presente: presente,
      dcg_path: dcg_path,
      versao_obs: versao_obs,
      versao_esp: versao_esp,
      checksum_obs: checksum_obs,
      expected_checksum: expected_checksum,
      config_ok: config_ok,
      hook_detectado: hook_detectado,
      hook_confiado: hook_confiado,
      probe_public: probe_public,
      bypass: bypass,
      path_negs: path_negs,
      normalized: normalized,
      negacoes: negacoes,
      avisos: avisos,
      timestamp: opts[:timestamp] || Time.now.utc,
      asset_checksum_esperado: asset_expected,
      binary_checksum_esperado: binary_expected,
      binary_checksum_observado: binary_obs,
      binary_checksum_status: binary_status,
      platform: platform
    )
  end

  def denied_bootstrap_report(policy, mode, code, message)
    negacoes = [{ 'codigo' => code, 'mensagem' => message }]
    finalize_report(
      status: 'denied',
      policy: policy,
      mode: mode,
      worktree: ROOT,
      presente: false,
      dcg_path: nil,
      versao_obs: nil,
      versao_esp: policy['versao_esperada'].to_s,
      checksum_obs: nil,
      expected_checksum: nil,
      config_ok: File.file?(CONFIG_PATH),
      hook_detectado: false,
      hook_confiado: 'unknown',
      probe_public: {
        'executado' => false,
        'modo' => 'dcg test --format json',
        'resultado' => 'skipped',
        'comando_amostra' => 'git reset --hard'
      },
      bypass: [],
      path_negs: [],
      normalized: [],
      negacoes: negacoes,
      avisos: ['REPORT_IS_NOT_CREDENTIAL'],
      timestamp: Time.now.utc
    )
  end

  def finalize_report(status:, policy:, mode:, worktree:, presente:, dcg_path:, versao_obs:, versao_esp:,
                      checksum_obs:, expected_checksum:, config_ok:, hook_detectado:, hook_confiado:,
                      probe_public:, bypass:, path_negs:, normalized:, negacoes:, avisos:, timestamp:,
                      asset_checksum_esperado: nil, binary_checksum_esperado: nil,
                      binary_checksum_observado: nil, binary_checksum_status: nil, platform: nil)
    avisos = (avisos + ['REPORT_IS_NOT_CREDENTIAL', 'REPORT_DOES_NOT_AUTHORIZE_RUNTIME']).uniq
    report = {
      'status' => status,
      'contrato_versao' => policy['contrato_versao'].to_s,
      'timestamp' => timestamp.iso8601,
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
        'asset_checksum_esperado' => asset_checksum_esperado,
        'binary_checksum_esperado' => binary_checksum_esperado,
        'binary_checksum_observado' => binary_checksum_observado,
        'binary_checksum_status' => binary_checksum_status,
        'plataforma' => platform,
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
    # Diagnóstico only: schema/TTL/hash/scope. NÃO concede autorização de runtime.
    schema = JSON.parse(File.read(SCHEMA_PATH))
    MissionPlanner.send(:validate_against_schema!, report, schema)

    policy = load_policy
    ttl = ttl_seconds || policy['preflight_ttl_segundos'].to_i
    begin
      ts = Time.parse(report.fetch('timestamp'))
    rescue ArgumentError
      raise Denied.new('RUNTIME_SAFETY_TIMESTAMP_INVALID', 'timestamp inválido no relatório')
    end
    age = now - ts
    if age > ttl || age < -60
      raise Denied.new('RUNTIME_SAFETY_REPORT_EXPIRED', "relatório expirado (age=#{age.to_i}s ttl=#{ttl})")
    end

    recomputed = compute_hash(report.reject { |k, _| k == 'relatorio_sha256' })
    unless recomputed == report['relatorio_sha256']
      raise Denied.new('RUNTIME_SAFETY_HASH_MISMATCH', 'hash do relatório adulterado')
    end

    begin
      wt = expect_worktree ? File.realpath(expect_worktree) : File.realpath(ROOT)
      report_wt = File.realpath(report.fetch('worktree_realpath'))
      report_root = File.realpath(report.fetch('repo_root'))
      root_real = File.realpath(ROOT)
    rescue SystemCallError
      raise Denied.new('RUNTIME_SAFETY_SCOPE_MISMATCH', 'realpath inválido no escopo do relatório')
    end

    unless report_wt == wt && report_root == root_real
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
