# frozen_string_literal: true

require 'json'
require 'digest'
require 'fileutils'
require 'time'
require 'etc'
require 'open3'
require 'rbconfig'
require_relative './dcg_codex_hook_verifier'

def _platform_key
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

def _dcg_version(dcg_path)
  return nil if dcg_path.nil? || dcg_path.to_s.empty?
  return nil unless File.file?(dcg_path) && File.executable?(dcg_path)
  out, err, status = Open3.capture3(dcg_path, '--version')
  return nil unless status.success?
  uniq = (out + err).each_line.map(&:strip).grep(/\Av?([0-9]+\.[0-9]+\.[0-9]+)\z/) { $1 }.compact.uniq
  return uniq.first if uniq.size == 1
  nil
rescue SystemCallError
  nil
end

def _sha256_file(path)
  return nil unless path && File.file?(path)
  Digest::SHA256.hexdigest(File.binread(path))
rescue SystemCallError
  nil
end

# Atestação humana local do hook DCG (fora do repositório). Fail-closed.
module DcgHookAttestation
  CONTRACT = '1.0.0'
  ACK = 'TRUST_DCG_HOOK'

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def attestation_path(override: nil)
    return File.expand_path(override) if override && !override.to_s.strip.empty?

    xdg = ENV['XDG_CONFIG_HOME'].to_s.strip
    base =
      if !xdg.empty?
        File.join(xdg, 'novo-app')
      else
        File.join(Dir.home, '.config', 'novo-app')
      end
    File.join(base, 'runtime-safety', 'dcg-hook-attestation.json')
  end

  def policy_sha256(policy_path)
    Digest::SHA256.hexdigest(File.binread(policy_path))
  end

  def build_payload(hooks_path:, dcg_path:, policy:, probe_ok:, ack:, policy_path:)
    raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "ack deve ser #{ACK}") unless ack.to_s == ACK

    begin
      hooks_real = File.realpath(hooks_path)
      dcg_real = File.realpath(dcg_path)
    rescue SystemCallError => e
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "path ilegível: #{e.message}")
    end
    platform = _platform_key
    binary_expected = (policy['binary_checksums_esperados'] || {})[platform]
    binary_obs = _sha256_file(dcg_real)
    versao = _dcg_version(dcg_real)

    unless binary_expected && binary_obs == binary_expected
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'checksum do binário DCG inválido para atestação')
    end
    unless versao == policy['versao_esperada'].to_s
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "versão DCG inválida: #{versao.inspect}")
    end
    raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'probe não blocked') unless probe_ok

    verify = DcgCodexHookVerifier.verify(hooks_path: hooks_real, expected_dcg_realpath: dcg_real)
    unless verify.ok
      raise Denial.new(verify.code || 'DCG_HOOK_ATTESTATION_INVALID', verify.message)
    end

    now = Time.now.utc
    max_days = (policy.dig('attestation', 'max_dias') || 30).to_i
    usuario =
      begin
        Etc.getpwuid(Process.euid).name
      rescue ArgumentError, SystemCallError
        ENV['USER'].to_s.empty? ? 'unknown' : ENV['USER']
      end
    {
      'contrato_versao' => CONTRACT,
      'timestamp' => now.iso8601,
      'expira_em' => (now + (max_days * 24 * 60 * 60)).iso8601,
      'usuario_local' => usuario,
      'plataforma' => platform,
      'hooks_realpath' => hooks_real,
      'hooks_sha256' => Digest::SHA256.hexdigest(File.binread(hooks_real)),
      'dcg_realpath' => dcg_real,
      'dcg_sha256' => binary_obs,
      'dcg_versao' => versao,
      'policy_sha256' => policy_sha256(policy_path),
      'confirmacao_humana' => ACK,
      'probe_resultado' => 'blocked'
    }
  end

  def write_atomic!(path, payload)
    dir = File.dirname(path)
    FileUtils.mkdir_p(dir, mode: 0o700)
    tmp = "#{path}.tmp.#{Process.pid}"
    File.open(tmp, File::WRONLY | File::CREAT | File::TRUNC, 0o600) do |f|
      f.write(JSON.pretty_generate(payload) + "\n")
      f.flush
      f.fsync
    end
    File.chmod(0o600, tmp)
    File.rename(tmp, path)
    File.chmod(0o600, path)
    path
  ensure
    FileUtils.rm_f(tmp) if defined?(tmp) && tmp && File.exist?(tmp)
  end

  def load_raw(path)
    unless File.file?(path)
      raise Denial.new('DCG_HOOK_ATTESTATION_MISSING', "atestação ausente: #{path}")
    end

    JSON.parse(File.read(path))
  rescue JSON::ParserError => e
    raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "JSON inválido: #{e.message}")
  end

  def validate!(attestation:, hooks_path:, dcg_path:, policy:, now: Time.now.utc, policy_path:)
    raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'payload inválido') unless attestation.is_a?(Hash)
    if attestation['confirmacao_humana'].to_s != ACK
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'confirmação humana ausente/ inválida')
    end

    begin
      exp = Time.parse(attestation['expira_em'].to_s)
    rescue ArgumentError, TypeError
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'expira_em inválido')
    end
    if now > exp
      raise Denial.new('DCG_HOOK_ATTESTATION_EXPIRED', "atestação expirada em #{attestation['expira_em']}")
    end

    begin
      hooks_real = File.realpath(hooks_path)
      dcg_real = File.realpath(dcg_path)
    rescue SystemCallError => e
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "path ilegível: #{e.message}")
    end
    begin
      hooks_sha = Digest::SHA256.hexdigest(File.binread(hooks_real))
    rescue SystemCallError => e
      raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', "falha ao ler hooks: #{e.message}")
    end
    dcg_sha = _sha256_file(dcg_real)
    raise Denial.new('DCG_HOOK_ATTESTATION_INVALID', 'falha ao ler checksum DCG') if dcg_sha.nil?

    pol_sha = policy_sha256(policy_path)

    if attestation['hooks_realpath'].to_s != hooks_real || attestation['hooks_sha256'] != hooks_sha
      raise Denial.new('DCG_HOOK_ATTESTATION_MISMATCH', 'hooks path/hash diverge da atestação')
    end
    if attestation['dcg_realpath'].to_s != dcg_real || attestation['dcg_sha256'] != dcg_sha
      raise Denial.new('DCG_HOOK_ATTESTATION_MISMATCH', 'DCG path/hash diverge da atestação')
    end
    if attestation['policy_sha256'] != pol_sha
      raise Denial.new('DCG_HOOK_ATTESTATION_MISMATCH', 'política diverge da atestação')
    end

    verify = DcgCodexHookVerifier.verify(hooks_path: hooks_real, expected_dcg_realpath: dcg_real)
    unless verify.ok
      raise Denial.new(verify.code || 'DCG_HOOK_ATTESTATION_MISMATCH', verify.message)
    end

    true
  end
end
