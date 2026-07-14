#!/usr/bin/env ruby
# frozen_string_literal: true

# Pilot Readiness — somente leitura. Não executa piloto. Não instala DCG. Não altera hooks.
# Uso: ruby scripts/check-pilot-readiness.rb --stdout

require 'json'
require 'optparse'
require 'open3'
require 'rbconfig'
require_relative './runtime-safety-preflight'
require_relative './lib/dcg_codex_hook_verifier'
require_relative './lib/dcg_hook_attestation'
require_relative './lib/codex_single_agent_runtime'

module PilotReadiness
  CODEX_EXPECTED = '0.144.0'

  module_function

  def blocked(code, message, details = {})
    {
      'status' => 'blocked',
      'codigo' => code,
      'mensagem' => message,
      'detalhes' => details,
      'resultado' => "BLOCKED_#{code.sub(/\ABLOCKED_/, '')}"
    }
  end

  def check!
    # Forbidden runtime/pilot keys must remain unset (read-only signal).
    %w[AGENT_RUNTIME_EXECUTE AGENT_RUNTIME_PILOT DCG_BYPASS DCG_DISABLE].each do |name|
      val = ENV[name]
      next if val.nil? || val.to_s.empty?

      code =
        case name
        when 'AGENT_RUNTIME_EXECUTE' then 'RUNTIME_ENV_ACTIVE'
        when 'AGENT_RUNTIME_PILOT' then 'PILOT_ENV_ACTIVE'
        when 'DCG_BYPASS' then 'DCG_BYPASS_ACTIVE'
        when 'DCG_DISABLE' then 'DCG_DISABLE_ACTIVE'
        end
      return blocked(code, "#{name} está definido")
    end

    host = RbConfig::CONFIG['host_os'].to_s
    cpu = RbConfig::CONFIG['host_cpu'].to_s
    unless host =~ /darwin/i && cpu =~ /arm|aarch64/i
      return blocked('UNSUPPORTED_LOCAL_PLATFORM', "plataforma=#{host}/#{cpu}")
    end

    # Codex
    bin = nil
    version = nil
    begin
      bin = CodexSingleAgentRuntime.resolve_codex_bin!
      prepared = CodexSingleAgentRuntime.prepare!(worktree: RuntimeSafetyPreflight::ROOT)
      version = prepared['version'].to_s
      unless version == CODEX_EXPECTED
        return blocked('CODEX_VERSION_MISMATCH', "versão=#{version}")
      end
    rescue CodexSingleAgentRuntime::Denial => e
      code = e.code.to_s.include?('CAPABILITY') ? 'CODEX_CAPABILITY_MISMATCH' : 'CODEX_NOT_INSTALLED'
      return blocked(code, e.message)
    end

    policy = RuntimeSafetyPreflight.load_policy
    dcg = RuntimeSafetyPreflight.find_dcg(mode: 'live', fixture_dcg: '')
    if dcg.nil?
      return blocked('DCG_NOT_INSTALLED', 'dcg ausente no PATH', 'runbook' => policy['instalacao_manual'])
    end

    versao = RuntimeSafetyPreflight.read_version(dcg)
    if versao != policy['versao_esperada'].to_s
      return blocked('DCG_VERSION_MISMATCH', "versão=#{versao.inspect}")
    end

    platform = RuntimeSafetyPreflight.detect_platform_key
    binary_expected = (policy['binary_checksums_esperados'] || {})[platform]
    asset_expected = (policy['asset_checksums_esperados'] || {})[platform]
    binary_obs = RuntimeSafetyPreflight.file_sha256(dcg)
    if binary_expected.nil?
      return blocked('DCG_BINARY_CHECKSUM_PLATFORM_UNKNOWN', "plataforma=#{platform}")
    end
    if binary_obs == asset_expected
      return blocked('DCG_ASSET_CHECKSUM_MISMATCH', 'hash do asset não equivale ao binário')
    end
    if binary_obs != binary_expected
      return blocked('DCG_BINARY_CHECKSUM_MISMATCH', 'checksum do binário diverge')
    end

    sample = policy.dig('probe', 'comando_amostra') || ('git ' + 'reset' + ' --' + 'hard')
    probe = RuntimeSafetyPreflight.run_probe(dcg, sample)
    if probe['resultado'] != 'blocked'
      return blocked('DCG_PROBE_FAILED', "resultado=#{probe['resultado']}")
    end

    hooks = DcgCodexHookVerifier.default_hooks_path
    verify = DcgCodexHookVerifier.verify(hooks_path: hooks, expected_dcg_realpath: File.realpath(dcg))
    unless verify.ok
      return blocked(verify.code.sub(/\ADCG_/, ''), verify.message)
    end

    begin
      att = DcgHookAttestation.load_raw(DcgHookAttestation.attestation_path)
      DcgHookAttestation.validate!(
        attestation: att,
        hooks_path: hooks,
        dcg_path: File.realpath(dcg),
        policy: policy
      )
    rescue DcgHookAttestation::Denial => e
      return blocked(e.code.sub(/\ADCG_/, ''), e.message)
    end

    {
      'status' => 'ready',
      'resultado' => 'PILOT_READY_ENVIRONMENT',
      'plataforma' => platform,
      'codex' => { 'path' => bin, 'versao' => version },
      'dcg' => {
        'path' => File.realpath(dcg),
        'versao' => versao,
        'binary_checksum' => binary_obs,
        'probe' => probe['resultado']
      },
      'hook' => {
        'detectado' => true,
        'confiado' => 'verified-local-human',
        'guardian_coexistente' => verify.details['guardian_coexistente']
      },
      'bypass_env' => [],
      'spawn' => false,
      'repo_mutado' => false
    }
  end
end

if $PROGRAM_NAME == __FILE__
  stdout = false
  OptionParser.new { |p| p.on('--stdout') { stdout = true } }.parse!
  report = PilotReadiness.check!
  json = JSON.pretty_generate(report) + "\n"
  puts json if stdout || true
  exit(report['status'] == 'ready' ? 0 : 2)
end
