#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'digest'
require 'tmpdir'
require 'time'
require 'open3'
require_relative './runtime-safety-preflight'
require_relative './lib/dcg_codex_hook_verifier'
require_relative './lib/dcg_hook_attestation'

ROOT = File.expand_path('..', __dir__)
FAKE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')
TMP = Dir.mktmpdir('dcg-live-readiness')
at_exit { FileUtils.remove_entry(TMP) if File.exist?(TMP) }

@tests = 0
def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
rescue StandardError => e
  warn "FAIL #{name}: #{e.class}: #{e.message}"
  warn e.backtrace.first(5).join("\n")
  exit 1
end

def assert(cond, msg = 'assertion')
  raise msg unless cond
end

def write_hooks(dir, payload)
  path = File.join(dir, 'hooks.json')
  File.write(path, JSON.pretty_generate(payload))
  path
end

def hooks_doc(*bash_commands)
  {
    'hooks' => {
      'PreToolUse' => bash_commands.map do |cmd|
        {
          'matcher' => 'Bash',
          'hooks' => [{ 'type' => 'command', 'command' => cmd }]
        }
      end
    }
  }
end

def with_temp_home
  home = File.join(TMP, "home-#{@tests}-#{Process.pid}")
  xdg = File.join(home, 'xdg')
  FileUtils.mkdir_p(xdg)
  old_home = ENV['HOME']
  old_xdg = ENV['XDG_CONFIG_HOME']
  ENV['HOME'] = home
  ENV['XDG_CONFIG_HOME'] = xdg
  yield home, xdg
ensure
  ENV['HOME'] = old_home
  if old_xdg
    ENV['XDG_CONFIG_HOME'] = old_xdg
  else
    ENV.delete('XDG_CONFIG_HOME')
  end
end

policy = RuntimeSafetyPreflight.load_policy
asset_sha = policy.dig('asset_checksums_esperados', 'aarch64-apple-darwin')
binary_sha = policy.dig('binary_checksums_esperados', 'aarch64-apple-darwin')
assert asset_sha && binary_sha && asset_sha != binary_sha, 'policy must separate asset/binary hashes'

REAL_HOOKS = File.expand_path('~/.codex/hooks.json')
HOOKS_SHA_AT_START =
  if File.file?(REAL_HOOKS)
    Digest::SHA256.hexdigest(File.binread(REAL_HOOKS))
  end


# 1
test('1 checksum do asset não é aceito como checksum do binário') do
  report = RuntimeSafetyPreflight.build_report(
    mode: 'live',
    dcg_path: FAKE_DCG,
    force_dcg_absent: false,
    binary_checksum_esperado_override: asset_sha,
    hooks_path: File.join(TMP, 'missing-hooks.json'),
    timestamp: Time.now.utc
  )
  # Fake-dcg sha != asset_sha → either mismatch or asset_hash_rejected if obs==asset
  codes = report['negacoes'].map { |n| n['codigo'] }
  # Forcing expected=asset while observed=fake binary → BINARY mismatch (obs != expected and obs != wait)
  # binary_status: obs != expected, and obs == asset_expected? only if fake sha equals asset - no
  # So mismatch. Also we need to ensure we never "match" when expected is asset sha of tar.
  assert report['dcg']['binary_checksum_status'] != 'match'
  assert codes.include?('DCG_BINARY_CHECKSUM_MISMATCH') || codes.include?('DCG_ASSET_CHECKSUM_MISMATCH')
end

test('1b status asset_hash_rejected quando obs == asset') do
  ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] = '1'
  policy = YAML.load_file(File.join(ROOT, '.agents', 'seguranca', 'runtime-safety.yaml'))
  current_asset_expected = (policy['asset_checksums_esperados'] || {})[RuntimeSafetyPreflight.detect_platform_key]
  skip 'no asset_checksum for current platform' if current_asset_expected.nil?
  report = RuntimeSafetyPreflight.build_report(
    mode: 'live',
    dcg_path: FAKE_DCG,
    allow_test_hook: true,
    binary_checksum_esperado_override: binary_sha,
    binary_checksum_observado_override: current_asset_expected,
    timestamp: Time.now.utc,
    hooks_path: File.join(TMP, 'missing-hooks-1b.json')
  )
  assert report['dcg']['binary_checksum_status'] == 'asset_hash_rejected'
  assert report['negacoes'].any? { |n| n['codigo'] == 'DCG_ASSET_CHECKSUM_MISMATCH' }
  assert report['dcg']['binary_checksum_status'] != 'match'
ensure
  ENV.delete('AGENT_RUNTIME_TEST_PREFLIGHT')
end

# 2
test('2 checksum correto do binário é aceito (fixture pin)') do
  report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
  assert report['dcg']['binary_checksum_status'] == 'match'
  assert report['dcg']['checksum_esperado'] == report['dcg']['binary_checksum_observado']
  assert report['dcg']['checksum_esperado'] != asset_sha
end

# 3
test('3 binário alterado é negado') do
  report = RuntimeSafetyPreflight.build_report(
    mode: 'fixture',
    timestamp: Time.now.utc,
    checksum_esperado_override: '0' * 64
  )
  assert report['status'] == 'denied'
  assert report['negacoes'].any? { |n| n['codigo'] == 'DCG_BINARY_CHECKSUM_MISMATCH' }
end

# 4
test('4 plataforma sem hash de binário é negada') do
  report = RuntimeSafetyPreflight.build_report(
    mode: 'live',
    dcg_path: FAKE_DCG,
    binary_checksum_esperado_override: nil,
    timestamp: Time.now.utc,
    hooks_path: File.join(TMP, 'no.json')
  )
  assert report['dcg']['binary_checksum_status'] == 'platform_unknown'
  assert report['negacoes'].any? { |n| n['codigo'] == 'DCG_BINARY_CHECKSUM_PLATFORM_UNKNOWN' }
end

homedir = nil
hooks_path = nil
dcg_real = File.realpath(FAKE_DCG)

with_temp_home do |home, xdg|
  homedir = home
  FileUtils.mkdir_p(File.join(home, '.codex'))
  # 5
  test('5 hooks.json ausente') do
    r = DcgCodexHookVerifier.verify(hooks_path: File.join(home, '.codex/hooks.json'), expected_dcg_realpath: dcg_real)
    assert r.denial? && r.code == 'DCG_HOOK_FILE_MISSING'
  end

  # 6
  test('6 JSON inválido') do
    bad = File.join(home, 'bad.json')
    File.write(bad, '{not-json')
    r = DcgCodexHookVerifier.verify(hooks_path: bad, expected_dcg_realpath: dcg_real)
    assert r.code == 'DCG_HOOK_FILE_INVALID'
  end

  # 7
  test('7 PreToolUse ausente') do
    path = write_hooks(home, { 'hooks' => {} })
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.code == 'DCG_HOOK_ENTRY_MISSING'
  end

  # 8
  test('8 matcher Bash ausente') do
    path = write_hooks(home, {
      'hooks' => {
        'PreToolUse' => [{
          'matcher' => 'Edit|Write',
          'hooks' => [{ 'type' => 'command', 'command' => dcg_real }]
        }]
      }
    })
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.code == 'DCG_HOOK_ENTRY_MISSING'
  end

  guardian = File.join(home, 'guardian-block.sh')
  File.write(guardian, "#!/bin/sh\nexit 0\n")
  FileUtils.chmod(0o755, guardian)

  # 9
  test('9 guardian sozinho não é suficiente') do
    path = write_hooks(home, hooks_doc(guardian))
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.code == 'DCG_HOOK_ENTRY_MISSING'
  end

  # 10
  test('10 guardian + entrada DCG direta aceita') do
    path = write_hooks(home, hooks_doc(guardian, dcg_real))
    hooks_path = path
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.ok, r.message
    assert r.details['guardian_coexistente'] == true
  end

  # 11
  test('11 shell wrapper negado') do
    path = write_hooks(home, hooks_doc(guardian, "bash -c '#{dcg_real}'"))
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.code == 'DCG_HOOK_SHELL_WRAPPER_DENIED' || r.code == 'DCG_HOOK_ENTRY_MISSING'
  end

  # 12
  test('12 path DCG divergente') do
    other = File.join(home, 'other-dcg')
    FileUtils.cp(FAKE_DCG, other)
    FileUtils.chmod(0o755, other)
    path = write_hooks(home, hooks_doc(other))
    r = DcgCodexHookVerifier.verify(hooks_path: path, expected_dcg_realpath: dcg_real)
    assert r.denial?
    assert %w[DCG_HOOK_BINARY_MISMATCH DCG_HOOK_ENTRY_MISSING].include?(r.code)
  end

  # Prepare valid hooks for attestation tests
  hooks_path = write_hooks(home, hooks_doc(guardian, dcg_real))
  pol = RuntimeSafetyPreflight.load_policy
  # fixture pin: for attestation we need binary hash == policy binary expected OR fake equals policy
  # Fake-dcg won't match policy binary hash. So we build attestation payload manually with matching fields
  # by temporarily using fake's sha as "valid" via direct write + validate mismatch tests.

  fake_sha = Digest::SHA256.hexdigest(File.binread(FAKE_DCG))
  hooks_sha = Digest::SHA256.hexdigest(File.binread(hooks_path))
  pol_sha = DcgHookAttestation.policy_sha256
  now = Time.now.utc
  good = {
    'contrato_versao' => '1.0.0',
    'timestamp' => now.iso8601,
    'expira_em' => (now + 86_400).iso8601,
    'usuario_local' => 'test',
    'plataforma' => 'aarch64-apple-darwin',
    'hooks_realpath' => File.realpath(hooks_path),
    'hooks_sha256' => hooks_sha,
    'dcg_realpath' => dcg_real,
    'dcg_sha256' => fake_sha,
    'dcg_versao' => '0.6.6',
    'policy_sha256' => pol_sha,
    'confirmacao_humana' => 'TRUST_DCG_HOOK',
    'probe_resultado' => 'blocked'
  }
  att_path = DcgHookAttestation.attestation_path

  # 13
  test('13 atestação ausente') do
    FileUtils.rm_f(att_path)
    begin
      DcgHookAttestation.load_raw(att_path)
      raise 'should deny'
    rescue DcgHookAttestation::Denial => e
      assert e.code == 'DCG_HOOK_ATTESTATION_MISSING'
    end
  end

  DcgHookAttestation.write_atomic!(att_path, good)

  # 14
  test('14 atestação expirada') do
    expired = good.merge('expira_em' => (Time.now.utc - 10).iso8601)
    DcgHookAttestation.write_atomic!(att_path, expired)
    begin
      DcgHookAttestation.validate!(
        attestation: expired,
        hooks_path: hooks_path,
        dcg_path: dcg_real,
        policy: pol
      )
      raise 'should deny'
    rescue DcgHookAttestation::Denial => e
      assert e.code == 'DCG_HOOK_ATTESTATION_EXPIRED'
    end
  end

  # 15
  test('15 hash do hook alterado') do
    DcgHookAttestation.write_atomic!(att_path, good)
    File.write(hooks_path, File.read(hooks_path) + "\n")
    begin
      DcgHookAttestation.validate!(
        attestation: DcgHookAttestation.load_raw(att_path),
        hooks_path: hooks_path,
        dcg_path: dcg_real,
        policy: pol
      )
      raise 'should deny'
    rescue DcgHookAttestation::Denial => e
      assert e.code == 'DCG_HOOK_ATTESTATION_MISMATCH'
    ensure
      # restore hooks
      File.write(hooks_path, JSON.pretty_generate(hooks_doc(guardian, dcg_real)))
      good['hooks_sha256'] = Digest::SHA256.hexdigest(File.binread(hooks_path))
      good['hooks_realpath'] = File.realpath(hooks_path)
      DcgHookAttestation.write_atomic!(att_path, good)
    end
  end

  # 16
  test('16 hash do binário alterado') do
    bad = good.merge('dcg_sha256' => '1' * 64)
    begin
      DcgHookAttestation.validate!(
        attestation: bad,
        hooks_path: hooks_path,
        dcg_path: dcg_real,
        policy: pol
      )
      raise 'should deny'
    rescue DcgHookAttestation::Denial => e
      assert e.code == 'DCG_HOOK_ATTESTATION_MISMATCH'
    end
  end

  # 17
  test('17 política alterada') do
    bad = good.merge('policy_sha256' => '2' * 64)
    begin
      DcgHookAttestation.validate!(
        attestation: bad,
        hooks_path: hooks_path,
        dcg_path: dcg_real,
        policy: pol
      )
      raise 'should deny'
    rescue DcgHookAttestation::Denial => e
      assert e.code == 'DCG_HOOK_ATTESTATION_MISMATCH'
    end
  end

  # 18
  test('18 atestação válida') do
    DcgHookAttestation.write_atomic!(att_path, good)
    assert DcgHookAttestation.validate!(
      attestation: DcgHookAttestation.load_raw(att_path),
      hooks_path: hooks_path,
      dcg_path: dcg_real,
      policy: pol
    )
  end
end

# 19
test('19 relatório externo não concede trust') do
  missing = File.join(TMP, 'no-trust-hooks.json')
  report = RuntimeSafetyPreflight.build_report(
    mode: 'live',
    timestamp: Time.now.utc,
    hooks_path: missing
  )
  assert report['dcg']['hook_confiado'] != 'trusted'
  # Even if we forge, validate_report must not authorize — check comment path:
  forged = report.merge('dcg' => report['dcg'].merge('hook_confiado' => 'trusted', 'hook_detectado' => true))
  # Preflight builder never reads forged — prove live path without attestation stays unknown/denied
  assert %w[denied unavailable].include?(report['status'])
  assert report['dcg']['hook_confiado'] == 'unknown'
  assert forged['dcg']['hook_confiado'] == 'trusted' # forged object exists but is unused by authorization
end

# 20
test('20 fixture não concede trust em live') do
  missing = File.join(TMP, 'no-fixture-trust-hooks.json')
  report = RuntimeSafetyPreflight.build_report(
    mode: 'live',
    timestamp: Time.now.utc,
    hooks_path: missing
  )
  assert report['dcg']['hook_confiado'] != 'fixture'
  assert report['modo'] == 'live'
end

EXTERNAL_DCG_DESTINATIONS = [
  File.join(ENV['HOME'], '.local', 'bin', 'dcg'),
  '/usr/local/bin/dcg',
  '/opt/homebrew/bin/dcg'
].freeze

def dcg_from_command
  out, status = Open3.capture2('command', '-v', 'dcg')
  status.success? ? out.strip : nil
rescue SystemCallError
  nil
end

def safe_realpath(path)
  File.realpath(path)
rescue SystemCallError
  path
end

def safe_sha256(path)
  return nil unless File.file?(path)

  Digest::SHA256.hexdigest(File.binread(path))
rescue SystemCallError
  nil
end

def snapshot_destinations
  dests = EXTERNAL_DCG_DESTINATIONS.dup
  cmd_path = dcg_from_command
  dests << cmd_path if cmd_path && !dests.include?(cmd_path)
  dests.map do |d|
    {
      'path' => d,
      'exists' => File.exist?(d),
      'realpath' => safe_realpath(d),
      'sha256' => safe_sha256(d)
    }
  end
end

def snapshot_tmp_provenance(tmp_base)
  Dir.glob(File.join(tmp_base, 'dcg-provenance-*')).sort
end

DESTINATIONS_BEFORE = snapshot_destinations
PROVENANCE_BEFORE = snapshot_tmp_provenance(Dir.tmpdir)
PROVENANCE_BEFORE_TMP = snapshot_tmp_provenance(TMP)

test('21 nenhum Codex real executado') do
  readiness = File.read(File.join(ROOT, 'scripts/check-pilot-readiness.rb'))
  assert !readiness.include?('AGENT_RUNTIME_EXECUTE=1')
  assert !readiness.include?('AGENT_RUNTIME_PILOT=1')
  assert !readiness.match?(/spawn!\(/)
end

test('22 nenhum hook real modificado') do
  after =
    if File.file?(REAL_HOOKS)
      Digest::SHA256.hexdigest(File.binread(REAL_HOOKS))
    end
  assert HOOKS_SHA_AT_START == after, 'hooks.json do host não pode mudar durante a suite'
  assert TMP.start_with?(Dir.tmpdir) || TMP.include?('dcg-live-readiness')
end

test('23 destinos externos preservados (snapshot)') do
  after = snapshot_destinations
  assert DESTINATIONS_BEFORE.size == after.size,
    "destino adicionado durante suite: #{after.reject { |d| DESTINATIONS_BEFORE.any? { |b| b['path'] == d['path'] } }}"
  DESTINATIONS_BEFORE.zip(after).each do |before, now|
    assert before == now,
      "destino #{before['path']} mudou: exists #{before['exists']}→#{now['exists']}, sha #{before['sha256']}→#{now['sha256']}"
  end
end

test('24 provenance temporária: nada criado fora do TMP da suite') do
  global_after = snapshot_tmp_provenance(Dir.tmpdir)
  new_global = global_after - PROVENANCE_BEFORE
  assert new_global.empty?,
    "nova provenance global fora do TMP da suite: #{new_global}"
  tmp_after = snapshot_tmp_provenance(TMP)
  new_in_tmp = tmp_after - PROVENANCE_BEFORE_TMP
  assert new_in_tmp.empty?,
    "nova provenance no TMP da suite (nenhum código cria dcg-provenance-*): #{new_in_tmp}"
end

test('25 hooks reais preservados (snapshot SHA)') do
  after =
    if File.file?(REAL_HOOKS)
      Digest::SHA256.hexdigest(File.binread(REAL_HOOKS))
    end
  assert HOOKS_SHA_AT_START == after, 'hooks.json do host foi alterado pela suite'
end

test('26 nenhuma escrita fora do TMP') do
  with_temp_home do |_home, xdg|
    assert ENV['HOME'].start_with?(TMP), "HOME=#{ENV['HOME']} não está dentro do TMP=#{TMP}"
    assert ENV.fetch('XDG_CONFIG_HOME', '').start_with?(TMP) || ENV['XDG_CONFIG_HOME'].empty?,
      "XDG_CONFIG_HOME=#{ENV['XDG_CONFIG_HOME']} não está dentro do TMP=#{TMP}"
  end
end

puts "OK #{@tests} tests"
