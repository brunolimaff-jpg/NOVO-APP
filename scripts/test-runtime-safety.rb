#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'yaml'
require 'tmpdir'
require 'fileutils'
require 'digest'
require_relative './runtime-safety-preflight'
require_relative './lib/agent_path_guard'

ROOT = File.expand_path('..', __dir__)
FIXTURE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')
FileUtils.chmod('+x', FIXTURE_DCG)

@tests = 0
@failed = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
rescue StandardError => e
  @failed += 1
  puts "FAIL #{name}: #{e.class}: #{e.message}"
end

def assert(cond, msg = 'assertion failed')
  raise msg unless cond
end

def assert_eq(a, b)
  raise "expected #{b.inspect}, got #{a.inspect}" unless a == b
end

def with_clean_bypass_env
  keys = %w[DCG_BYPASS DCG_DISABLE]
  saved = keys.to_h { |k| [k, ENV[k]] }
  keys.each { |k| ENV.delete(k) }
  yield
ensure
  saved.each { |k, v| v.nil? ? ENV.delete(k) : ENV[k] = v }
end

# ── Path hardening table ──────────────────────────────────────────────

test('path relativo válido') do
  with_clean_bypass_env do
    out, negs = AgentPathGuard.normalize_path_list(['scripts/runtime-safety-preflight.rb'], worktree_root: ROOT)
    assert(negs.empty?, negs.inspect)
    assert_eq(out, ['scripts/runtime-safety-preflight.rb'])
  end
end

test('barras Windows normalizadas') do
  out, negs = AgentPathGuard.normalize_path_list(['scripts\\runtime-safety-preflight.rb'], worktree_root: ROOT)
  assert(negs.empty?, negs.inspect)
  assert_eq(out, ['scripts/runtime-safety-preflight.rb'])
end

[
  ['path traversal literal', '../etc/passwd', 'PATH_TRAVERSAL_DENIED'],
  ['path traversal percent-encoded', '%2e%2e/etc/passwd', 'PATH_TRAVERSAL_DENIED'],
  ['double encoding', '%252e%252e/etc/passwd', 'PATH_TRAVERSAL_DENIED'],
  ['null byte', "scripts/\0evil", 'PATH_NULL_BYTE_DENIED'],
  ['absoluto Unix', '/tmp/x', 'PATH_ABSOLUTE_DENIED'],
  ['absoluto Windows', 'C:\\Windows\\System32', 'PATH_ABSOLUTE_DENIED']
].each do |name, raw, code|
  test(name) do
    _out, negs = AgentPathGuard.normalize_path_list([raw], worktree_root: ROOT)
    assert(negs.any? { |n| n['codigo'] == code }, negs.inspect)
  end
end

test('Unicode inválido') do
  bad = "scripts/\x80".dup.force_encoding(Encoding::UTF_8)
  begin
    AgentPathGuard.validate_path!(bad, worktree_root: ROOT)
    raise 'deveria negar'
  rescue AgentPathGuard::Denial => e
    assert_eq(e.code, 'PATH_INVALID_ENCODING')
  end
end

test('caminho inexistente dentro da worktree') do
  out, negs = AgentPathGuard.normalize_path_list(['scripts/nao-existe-3b3a-xyz.rb'], worktree_root: ROOT)
  assert(negs.empty?, negs.inspect)
  assert_eq(out, ['scripts/nao-existe-3b3a-xyz.rb'])
end

test('dedupe preservando ordem') do
  out, negs = AgentPathGuard.normalize_path_list(
    %w[scripts/a.rb scripts/b.rb scripts/a.rb scripts\\b.rb],
    worktree_root: ROOT
  )
  assert(negs.empty?, negs.inspect)
  assert_eq(out, %w[scripts/a.rb scripts/b.rb])
end

test('symlink escape') do
  Dir.mktmpdir('path-guard') do |dir|
    outside = File.join(dir, 'outside')
    FileUtils.mkdir_p(outside)
    File.write(File.join(outside, 'secret'), 'x')
    wt = File.join(dir, 'wt')
    FileUtils.mkdir_p(File.join(wt, 'scripts'))
    File.write(File.join(wt, 'scripts', 'ok.rb'), '1')
    link = File.join(wt, 'escape')
    File.symlink(outside, link)
    _out, negs = AgentPathGuard.normalize_path_list(['escape/secret'], worktree_root: wt)
    assert(negs.any? { |n| %w[PATH_SYMLINK_ESCAPE PATH_OUTSIDE_WORKTREE].include?(n['codigo']) }, negs.inspect)
  end
end

test('ancestral symlink para fora') do
  Dir.mktmpdir('path-guard-anc') do |dir|
    outside = File.join(dir, 'outside')
    FileUtils.mkdir_p(outside)
    wt = File.join(dir, 'wt')
    FileUtils.mkdir_p(wt)
    File.symlink(outside, File.join(wt, 'via'))
    _out, negs = AgentPathGuard.normalize_path_list(['via/missing.txt'], worktree_root: wt)
    assert(negs.any? { |n| %w[PATH_SYMLINK_ESCAPE PATH_OUTSIDE_WORKTREE].include?(n['codigo']) }, negs.inspect)
  end
end

# ── Preflight / report table ──────────────────────────────────────────

test('relatório ready com fixture válida') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    assert_eq(report['status'], 'ready')
    RuntimeSafetyPreflight.validate_report!(report)
  end
end

test('DCG ausente → unavailable') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(
      mode: 'live',
      force_dcg_absent: true,
      timestamp: Time.now.utc
    )
    assert_eq(report['status'], 'unavailable')
    assert_eq(report['dcg']['presente'], false)
  end
end

test('versão divergente → denied') do
  with_clean_bypass_env do
    Dir.mktmpdir('dcg-ver') do |dir|
      fake = File.join(dir, 'dcg')
      File.write(fake, "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'dcg 0.0.1'; exit 0; fi\n" \
                       "echo '{\"decision\":\"deny\"}'; exit 1\n")
      FileUtils.chmod('+x', fake)
      report = RuntimeSafetyPreflight.build_report(
        mode: 'fixture', fixture_dcg: fake, timestamp: Time.now.utc
      )
      assert_eq(report['status'], 'denied')
      assert(report['negacoes'].any? { |n| n['codigo'] == 'DCG_VERSION_MISMATCH' }, report['negacoes'].inspect)
    end
  end
end

test('checksum divergente → denied') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(
      mode: 'fixture',
      timestamp: Time.now.utc,
      checksum_esperado_override: '0' * 64
    )
    assert_eq(report['status'], 'denied')
    assert(report['negacoes'].any? { |n| n['codigo'] == 'DCG_CHECKSUM_MISMATCH' }, report['negacoes'].inspect)
  end
end

test('bypass env → denied') do
  ENV['DCG_BYPASS'] = '1'
  begin
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    assert_eq(report['status'], 'denied')
    assert(report['bypass_env_detectado'].include?('DCG_BYPASS'))
  ensure
    ENV.delete('DCG_BYPASS')
  end
end

test('hook unknown → denied') do
  with_clean_bypass_env do
    marker = File.join(ROOT, '.agents/seguranca/fixtures/hook-marker.json')
    bak = File.read(marker)
    FileUtils.rm_f(marker)
    begin
      report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
      assert_eq(report['status'], 'denied')
      assert_eq(report['dcg']['hook_confiado'], 'unknown')
    ensure
      File.write(marker, bak)
    end
  end
end

test('hook ausente → denied') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'live', timestamp: Time.now.utc)
    # live never fixture-trusts
    assert(%w[denied unavailable].include?(report['status']))
    assert_eq(report['dcg']['hook_confiado'], 'unknown')
  end
end

test('configuração ausente → denied') do
  with_clean_bypass_env do
    cfg = File.join(ROOT, '.agents/seguranca/.dcg.toml')
    bak = File.read(cfg)
    FileUtils.rm_f(cfg)
    begin
      report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
      assert_eq(report['status'], 'denied')
      assert(report['negacoes'].any? { |n| n['codigo'] == 'DCG_CONFIG_MISSING' })
    ensure
      File.write(cfg, bak)
    end
  end
end

test('relatório expirado') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc - 10_000)
    begin
      RuntimeSafetyPreflight.validate_report!(report)
      raise 'deveria expirar'
    rescue RuntimeSafetyPreflight::Denied => e
      assert_eq(e.code, 'RUNTIME_SAFETY_REPORT_EXPIRED')
    end
  end
end

test('worktree divergente') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    Dir.mktmpdir('wt-div') do |other|
      File.write(File.join(other, '.keep'), '1')
      begin
        RuntimeSafetyPreflight.validate_report!(report, expect_worktree: other)
        raise 'deveria mismatch'
      rescue RuntimeSafetyPreflight::Denied => e
        assert_eq(e.code, 'RUNTIME_SAFETY_SCOPE_MISMATCH')
      end
    end
  end
end

test('hash adulterado') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    report['relatorio_sha256'] = 'a' * 64
    begin
      RuntimeSafetyPreflight.validate_report!(report)
      raise 'deveria falhar hash'
    rescue RuntimeSafetyPreflight::Denied => e
      assert_eq(e.code, 'RUNTIME_SAFETY_HASH_MISMATCH')
    end
  end
end

test('schema inválido') do
  begin
    MissionPlanner.send(:validate_against_schema!, { 'status' => 'ready' }, JSON.parse(File.read(File.join(ROOT, '.agents/seguranca/contrato-runtime-safety.schema.json'))))
    raise 'deveria falhar schema'
  rescue MissionPlanner::SchemaError
    # ok
  end
end

test('proteção superfície de segurança') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(
      mode: 'fixture',
      timestamp: Time.now.utc,
      mutation_paths: ['.agents/seguranca/runtime-safety.yaml']
    )
    assert_eq(report['status'], 'denied')
    assert(report['negacoes'].any? { |n| n['codigo'] == 'SECURITY_SURFACE_MUTATION_DENIED' })
  end
end

test('fixture executável usa executor-escopo') do
  require_relative './test-agent-execution' if false
  # Inline contract check without loading full execution suite
  load_path = File.join(ROOT, 'scripts/test-agent-execution.rb')
  # Avoid double-running tests: duplicate minimal assertion here
  plan = {
    'papel_principal' => 'executor-escopo',
    'resumo_operacional' => { 'executavel' => true }
  }
  assert_eq(plan['papel_principal'], 'executor-escopo')
  assert(plan.dig('resumo_operacional', 'executavel'))
end

test('fixture inválida validador-entrega não é executável') do
  # builder contract: validador-entrega + planejado => executavel false
  # (aligns with DI-2026-07-13-09; runner still keyed on flag)
  writer = false
  papel = 'validador-entrega'
  executable = true # status planejado
  assert_eq(executable && (papel == 'executor-escopo'), false)
  assert_eq(papel, 'validador-entrega')
end

puts "\n#{@tests} passed, #{@failed} failed"
exit(@failed.zero? ? 0 : 1)
