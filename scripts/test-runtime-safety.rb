#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'yaml'
require 'tmpdir'
require 'fileutils'
require 'digest'
require 'open3'
require_relative './runtime-safety-preflight'
require_relative './lib/agent_path_guard'
require_relative './lib/agent_command_guard'

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
  ['double encoding', '%252e%252e/etc/passwd', 'PATH_PERCENT_ENCODING_INVALID'],
  ['percent malformado', '%ZZ/x', 'PATH_PERCENT_ENCODING_INVALID'],
  ['null byte', "scripts/\0evil", 'PATH_NULL_BYTE_DENIED'],
  ['absoluto Unix', '/tmp/x', 'PATH_ABSOLUTE_DENIED'],
  ['absoluto Windows', 'C:\\Windows\\System32', 'PATH_ABSOLUTE_DENIED'],
  ['drive-relative Windows C:foo', 'C:foo', 'PATH_ABSOLUTE_DENIED']
].each do |name, raw, code|
  test(name) do
    _out, negs = AgentPathGuard.normalize_path_list([raw], worktree_root: ROOT)
    assert(negs.any? { |n| n['codigo'] == code }, negs.inspect)
  end
end

test('%25 aceito como percentual literal') do
  # scripts/%25x → scripts/%x after single decode; no remaining %HH
  Dir.mktmpdir('pct') do |dir|
    FileUtils.mkdir_p(File.join(dir, 'scripts'))
    File.write(File.join(dir, 'scripts', '%x'), '1')
    out, negs = AgentPathGuard.normalize_path_list(['scripts/%25x'], worktree_root: dir)
    assert(negs.empty?, negs.inspect)
    assert_eq(out, ['scripts/%x'])
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
    assert(report['negacoes'].any? { |n| n['codigo'] == 'DCG_BINARY_CHECKSUM_MISMATCH' }, report['negacoes'].inspect)
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
    Dir.mktmpdir('hook-absent') do |dir|
      missing = File.join(dir, 'no-hooks.json')
      report = RuntimeSafetyPreflight.build_report(
        mode: 'live',
        timestamp: Time.now.utc,
        hooks_path: missing
      )
      # live never fixture-trusts; missing hooks file → unknown
      assert(%w[denied unavailable].include?(report['status']), report['status'].inspect)
      assert_eq(report['dcg']['hook_confiado'], 'unknown')
    end
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

test('timestamp inválido → RUNTIME_SAFETY_TIMESTAMP_INVALID') do
  with_clean_bypass_env do
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    report['timestamp'] = '2026-99-99T00:00:00Z'
    report['relatorio_sha256'] = RuntimeSafetyPreflight.compute_hash(report.reject { |k, _| k == 'relatorio_sha256' })
    begin
      RuntimeSafetyPreflight.validate_report!(report)
      raise 'deveria negar timestamp'
    rescue RuntimeSafetyPreflight::Denied => e
      assert_eq(e.code, 'RUNTIME_SAFETY_TIMESTAMP_INVALID')
    end
  end
end

test('command guard: cinco IDs canônicos') do
  with_clean_bypass_env do
    require_relative './lib/agent_command_guard'
    catalog = AgentCommandGuard.load_catalog!(File.join(ROOT, '.agents/orquestracao/executor/catalogo-comandos.yaml'))
    AgentCommandGuard::CANONICAL_IDS.each do |id|
      argv = AgentCommandGuard.resolve_argv!(catalog, id)
      assert(argv.is_a?(Array) && !argv.empty?)
    end
  end
end

[
  ['bash -lc', %w[bash -lc echo hi], 'COMMAND_SHELL_WRAPPER_DENIED'],
  ['rm -rf', %w[rm -rf /tmp], 'COMMAND_DESTRUCTIVE_DENIED'],
  ['git reset --hard', ['git', 'reset', '--hard'], 'COMMAND_DESTRUCTIVE_DENIED'],
  ['gh pr merge', %w[gh pr merge], 'COMMAND_DESTRUCTIVE_DENIED'],
  ['supabase db reset', %w[supabase db reset], 'COMMAND_DESTRUCTIVE_DENIED'],
  ['metachar pipe', ['echo', 'a|b'], 'COMMAND_METACHARACTER_DENIED']
].each do |name, argv, code|
  test("command guard nega #{name}") do
    begin
      AgentCommandGuard.scan_argv!(argv)
      raise 'deveria negar'
    rescue AgentCommandGuard::Denial => e
      assert_eq(e.code, code)
    end
  end
end

test('command guard ID desconhecido') do
  with_clean_bypass_env do
    catalog = AgentCommandGuard.load_catalog!(File.join(ROOT, '.agents/orquestracao/executor/catalogo-comandos.yaml'))
    begin
      AgentCommandGuard.resolve_argv!(catalog, 'rm-rf-all')
      raise 'deveria negar'
    rescue AgentCommandGuard::Denial => e
      assert_eq(e.code, 'COMMAND_NOT_IN_CATALOG')
    end
  end
end

test('command guard catálogo string inválida') do
  begin
    AgentCommandGuard.validate_entry!('x', { 'argv' => 'ruby scripts/x.rb' })
    raise 'deveria negar string'
  rescue AgentCommandGuard::Denial => e
    assert_eq(e.code, 'COMMAND_ENTRY_INVALID')
  end
end

test('command guard argumento adicional mismatch') do
  with_clean_bypass_env do
    catalog = AgentCommandGuard.load_catalog!(File.join(ROOT, '.agents/orquestracao/executor/catalogo-comandos.yaml'))
    canonical = AgentCommandGuard.resolve_argv!(catalog, 'git-diff-check')
    begin
      AgentCommandGuard.assert_no_extra_args!(canonical, canonical + ['--extra'])
      raise 'deveria mismatch'
    rescue AgentCommandGuard::Denial => e
      assert_eq(e.code, 'COMMAND_ARGUMENT_MISMATCH')
    end
  end
end

test('command guard bypass env') do
  ENV['DCG_BYPASS'] = '1'
  begin
    AgentCommandGuard.deny_bypass_env!
    raise 'deveria negar bypass'
  rescue AgentCommandGuard::Denial => e
    assert_eq(e.code, 'DCG_BYPASS_ENV')
  ensure
    ENV.delete('DCG_BYPASS')
  end
end

test('comando seguro executado sem shell') do
  with_clean_bypass_env do
    out, err, status = Open3.capture3('git', 'diff', '--check', chdir: ROOT)
    assert(status.exitstatus.is_a?(Integer))
    assert(err.is_a?(String))
    assert(out.is_a?(String))
  end
end

# ── read_version: formatos legítimos do DCG real (sem DCG real) ────────

def write_fake_dcg(path, body)
  File.write(path, body)
  FileUtils.chmod('+x', path)
  path
end

def assert_read_version(body, expected)
  Dir.mktmpdir('dcg-verparse') do |dir|
    fake = write_fake_dcg(File.join(dir, 'dcg'), body)
    assert_eq(RuntimeSafetyPreflight.read_version(fake), expected)
  end
end

test('read_version: stdout puro 0.6.6') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6.6'; exit 0; fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: stdout v0.6.6') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'v0.6.6'; exit 0; fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: banner dcg v0.6.6 em stdout') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'dcg v0.6.6'; exit 0; fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: host-like stdout 0.6.6 + banner stderr') do
  assert_read_version(
    "#!/bin/sh\n" \
    "if [ \"$1\" = --version ]; then\n" \
    "  echo '0.6.6'\n" \
    "  echo 'dcg v0.6.6' 1>&2\n" \
    "  exit 0\n" \
    "fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: somente banner legítimo em stderr') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'dcg v0.6.6' 1>&2; exit 0; fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: mesma versão em stdout e stderr') do
  assert_read_version(
    "#!/bin/sh\n" \
    "if [ \"$1\" = --version ]; then\n" \
    "  echo '0.6.6'\n" \
    "  echo 'dcg 0.6.6' 1>&2\n" \
    "  exit 0\n" \
    "fi\nexit 2\n",
    '0.6.6'
  )
end

test('read_version: exit status não zero → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6.6'; exit 1; fi\nexit 2\n",
    nil
  )
end

test('read_version: streams vazios → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: texto arbitrário com número → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'downloaded dependency 0.6.6'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: versão incompleta → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: versão com 4 segmentos → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6.6.1'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: pre-release → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6.6-beta'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: build metadata → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo '0.6.6+build'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: versões divergentes entre streams → nil') do
  assert_read_version(
    "#!/bin/sh\n" \
    "if [ \"$1\" = --version ]; then\n" \
    "  echo '0.6.6'\n" \
    "  echo 'dcg v0.6.7' 1>&2\n" \
    "  exit 0\n" \
    "fi\nexit 2\n",
    nil
  )
end

test('read_version: arquivo inexistente → nil') do
  assert_eq(RuntimeSafetyPreflight.read_version('/tmp/dcg-does-not-exist-xyz'), nil)
end

test('read_version: arquivo sem permissão de execução → nil, sem exceção') do
  Dir.mktmpdir('dcg-noperm') do |dir|
    fake = File.join(dir, 'dcg')
    File.write(fake, "#!/bin/sh\necho '0.6.6'\n")
    FileUtils.chmod(0o644, fake)
    ver = RuntimeSafetyPreflight.read_version(fake)
    assert_eq(ver, nil)
  end
end

test('read_version: not-dcg v0.6.6 → nil') do
  assert_read_version(
    "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'not-dcg v0.6.6'; exit 0; fi\nexit 2\n",
    nil
  )
end

test('read_version: fixture clássica dcg 0.6.6 em stdout') do
  assert_eq(RuntimeSafetyPreflight.read_version(FIXTURE_DCG), '0.6.6')
end

test('pilot readiness: host-like versão não é o bloqueador') do
  require 'rbconfig'
  require_relative './check-pilot-readiness'
  fake_codex = File.join(ROOT, '.agents/seguranca/fixtures/fake-codex')
  FileUtils.chmod('+x', fake_codex)

  with_clean_bypass_env do
    Dir.mktmpdir('dcg-readiness-ver') do |dir|
      home = File.join(dir, 'home')
      xdg = File.join(dir, 'xdg')
      bin = File.join(dir, 'bin')
      FileUtils.mkdir_p([home, xdg, bin])

      fake = write_fake_dcg(
        File.join(bin, 'dcg'),
        "#!/bin/sh\n" \
        "if [ \"$1\" = --version ]; then\n" \
        "  echo '0.6.6'\n" \
        "  echo 'dcg v0.6.6' 1>&2\n" \
        "  exit 0\n" \
        "fi\n" \
        "if [ \"$1\" = test ]; then\n" \
        "  echo '{\"decision\":\"deny\"}'\n" \
        "  exit 1\n" \
        "fi\nexit 2\n"
      )

      out, err, st = Open3.capture3(fake, '--version')
      assert(st.success?, 'fake --version deve sair 0')
      assert_eq(out.strip, '0.6.6')
      assert(err.include?('dcg v0.6.6'), "stderr esperado: #{err.inspect}")
      assert_eq(RuntimeSafetyPreflight.read_version(fake), '0.6.6')

      saved = {
        path: ENV['PATH'],
        home: ENV['HOME'],
        xdg: ENV['XDG_CONFIG_HOME'],
        execute: ENV['AGENT_RUNTIME_EXECUTE'],
        pilot: ENV['AGENT_RUNTIME_PILOT'],
        test_codex: ENV['AGENT_RUNTIME_TEST_CODEX'],
        test_codex_bin: ENV['AGENT_RUNTIME_TEST_CODEX_BIN'],
        host_os: RbConfig::CONFIG['host_os'],
        host_cpu: RbConfig::CONFIG['host_cpu']
      }

      begin
        ENV['HOME'] = home
        ENV['XDG_CONFIG_HOME'] = xdg
        ENV['PATH'] = "#{bin}:#{ENV['PATH']}"
        ENV.delete('AGENT_RUNTIME_EXECUTE')
        ENV.delete('AGENT_RUNTIME_PILOT')
        ENV.delete('DCG_BYPASS')
        ENV.delete('DCG_DISABLE')
        ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
        ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = fake_codex
        RbConfig::CONFIG['host_os'] = 'darwin'
        RbConfig::CONFIG['host_cpu'] = 'arm64'

        report = PilotReadiness.check!
        assert(report.is_a?(Hash), report.inspect)
        assert(report['codigo'] != 'DCG_VERSION_MISMATCH', report.inspect)
        assert(report['resultado'] != 'BLOCKED_DCG_VERSION_MISMATCH', report.inspect)
        assert_eq(report['codigo'], 'DCG_BINARY_CHECKSUM_MISMATCH')
        assert(report['status'] == 'blocked', report.inspect)
      ensure
        ENV['PATH'] = saved[:path]
        ENV['HOME'] = saved[:home]
        saved[:xdg].nil? ? ENV.delete('XDG_CONFIG_HOME') : ENV['XDG_CONFIG_HOME'] = saved[:xdg]
        saved[:execute].nil? ? ENV.delete('AGENT_RUNTIME_EXECUTE') : ENV['AGENT_RUNTIME_EXECUTE'] = saved[:execute]
        saved[:pilot].nil? ? ENV.delete('AGENT_RUNTIME_PILOT') : ENV['AGENT_RUNTIME_PILOT'] = saved[:pilot]
        saved[:test_codex].nil? ? ENV.delete('AGENT_RUNTIME_TEST_CODEX') : ENV['AGENT_RUNTIME_TEST_CODEX'] = saved[:test_codex]
        saved[:test_codex_bin].nil? ? ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN') : ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = saved[:test_codex_bin]
        RbConfig::CONFIG['host_os'] = saved[:host_os]
        RbConfig::CONFIG['host_cpu'] = saved[:host_cpu]
      end
    end
  end
end

puts "\n#{@tests} passed, #{@failed} failed"
exit(@failed.zero? ? 0 : 1)
