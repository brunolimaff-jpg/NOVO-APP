#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'tmpdir'
require 'fileutils'
require_relative './lib/agent_evidence_sanitizer'
require_relative './lib/agent_forensic_evidence'
require_relative './lib/codex_single_agent_runtime'

TESTS = []
def test(name, &block)
  TESTS << [name, block]
end

def assert(value, message = 'assertion failed')
  raise message unless value
end

test('raiz operacional exige caminho explícito') do
  begin
    AgentForensicEvidence.resolve_root!(nil, env: {})
    raise 'expected root denial'
  rescue AgentForensicEvidence::Denial => e
    assert e.code == 'FORENSIC_EVIDENCE_ROOT_REQUIRED'
  end
end

test('sanitiza segredos e caminhos sem preservar o original') do
  result = AgentEvidenceSanitizer.sanitize(
    'command' => 'curl -H Authorization: Bearer sk-secret-token',
    'cwd' => '/Users/bruno/projeto',
    'message' => 'cookie=session-secret'
  )
  json = JSON.generate(result)
  assert !json.include?('sk-secret-token')
  assert !json.include?('session-secret')
  assert !json.include?('/Users/bruno')
  assert result['command'].include?('[REDACTED]')
  assert result['cwd'] == '<HOME>/projeto'
end

test('preserva métricas de tokens e redige credenciais') do
  result = AgentEvidenceSanitizer.sanitize(
    'token_count' => 3,
    'prompt_tokens' => 1,
    'completion_tokens' => 2,
    'total_tokens' => 3,
    'cached_tokens' => 0,
    'reasoning_tokens' => 0,
    'access_token' => 'access-secret',
    'api_token' => 'api-secret',
    'api_key' => 'key-secret'
  )
  assert result['token_count'] == 3
  assert result['prompt_tokens'] == 1
  assert result['completion_tokens'] == 2
  assert result['total_tokens'] == 3
  assert result['cached_tokens'] == 0
  assert result['reasoning_tokens'] == 0
  assert result['access_token'] == '[REDACTED]'
  assert result['api_token'] == '[REDACTED]'
  assert result['api_key'] == '[REDACTED]'
end

test('linha inválida vira registro explícito e limitado') do
  record = AgentEvidenceSanitizer.invalid_jsonl_record(3, 'not-json', 'unexpected token')
  assert record['type'] == 'invalid_jsonl_line'
  assert record['sequence'] == 3
  assert !record['original'].include?('not-json')
  assert record['original_sha256'].length == 64
end

test('limite de bytes e registros é aplicado antes de acumular') do
  assert AgentForensicEvidence::MAX_STREAM_BYTES == 1_048_576
  assert AgentForensicEvidence::MAX_STREAM_RECORDS == 10_000
  assert AgentEvidenceSanitizer::MAX_FIELD_BYTES == 16 * 1024
end

test('manifesto é determinístico e registra artefatos') do
  Dir.mktmpdir('forensic-test') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'm1', attempt: 1)
    evidence.reserve!
    evidence.append_stdout('{"type":"turn.completed"}\n')
    manifest = evidence.finalize!(status: 'complete')
    assert manifest['schema_version'] == 1
    assert manifest['retention_days'] == 30
    assert manifest['artifacts'].map { |a| a['name'] } == %w[execution-evidence.json execution-stream.sanitized.jsonl stderr.sanitized.log].sort
    manifest_path = File.join(root, 'm1', 'attempt-001', 'evidence-manifest.json')
    assert File.file?(manifest_path)
    assert manifest['manifest_sha256'] == Digest::SHA256.file(manifest_path).hexdigest
  end
end

test('checkpoint sanitiza argv e limita permissões') do
  Dir.mktmpdir('forensic-permissions') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'safe', paths: { 'worktree' => '/Users/bruno/repo' })
    evidence.reserve!
    evidence.checkpoint('spawn_started', 'process' => { 'argv' => ['codex', '--token=secret-value'], 'cwd' => '/Users/bruno/repo' })
    evidence_path = File.join(root, 'safe', 'attempt-001', 'execution-evidence.json')
    raw = File.read(evidence_path)
    assert !raw.include?('secret-value')
    assert raw.include?('<WORKTREE>')
    assert (File.stat(root).mode & 0o777) == 0o700
    assert (File.stat(evidence_path).mode & 0o777) == 0o600
  end
end

test('symlink de missão é rejeitado sem escrever fora da raiz') do
  Dir.mktmpdir('forensic-symlink') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    outside = File.join(dir, 'outside')
    FileUtils.mkdir(outside, mode: 0o700)
    FileUtils.mkdir(root, mode: 0o700)
    File.symlink(outside, File.join(root, 'escape'))
    begin
      AgentForensicEvidence.new(root: root, mission_id: 'escape').reserve!
      raise 'expected symlink denial'
    rescue AgentForensicEvidence::Denial => e
      assert e.code == 'FORENSIC_EVIDENCE_SYMLINK'
    end
    assert !File.exist?(File.join(outside, 'attempt-001', 'execution-evidence.json'))
  end
end

test('reserva exclusiva marca tentativa antes de qualquer processo') do
  Dir.mktmpdir('state-test') do |dir|
    path = File.join(dir, 'mission.json')
    File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write('{"status":"reserved"}') }
    assert JSON.parse(File.read(path))['status'] == 'reserved'
    begin
      File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |_f| }
      raise 'second reservation unexpectedly succeeded'
    rescue Errno::EEXIST
      true
    end
  end
end

test('JSONL retoma após linha acima do limite') do
  Dir.mktmpdir('forensic-jsonl') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'jsonl')
    evidence.reserve!
    old = ENV.to_h
    ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
    ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = File.expand_path('../.agents/seguranca/fixtures/fake-codex', __dir__)
    ENV['AGENT_RUNTIME_FAKE_SCENARIO'] = 'oversized-jsonl'
    result = CodexSingleAgentRuntime.spawn!(argv: [ENV['AGENT_RUNTIME_TEST_CODEX_BIN'], 'exec', '-'], prompt: '', chdir: Dir.pwd, timeout_seconds: 5, evidence: evidence)
    stream = File.read(File.join(root, 'jsonl', 'attempt-001', 'execution-stream.sanitized.jsonl'))
    assert result['evidence_status'] == 'partial'
    assert stream.include?('turn.completed')
  ensure
    ENV.replace(old) if old
  end
end

test('stderr dividido em chunks não vaza credencial') do
  Dir.mktmpdir('forensic-stderr') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'stderr')
    evidence.reserve!
    old = ENV.to_h
    ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
    ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = File.expand_path('../.agents/seguranca/fixtures/fake-codex', __dir__)
    ENV['AGENT_RUNTIME_FAKE_SCENARIO'] = 'stderr-split-secret'
    CodexSingleAgentRuntime.spawn!(argv: [ENV['AGENT_RUNTIME_TEST_CODEX_BIN'], 'exec', '-'], prompt: '', chdir: Dir.pwd, timeout_seconds: 5, evidence: evidence)
    stderr = File.read(File.join(root, 'stderr', 'attempt-001', 'stderr.sanitized.log'))
    assert !stderr.include?('sk-live-secret')
  ensure
    ENV.replace(old) if old
  end
end

test('JSON válido não objeto e sanitização de URL/path são explícitos') do
  Dir.mktmpdir('forensic-values') do |dir|
    root = File.join(File.realpath(dir), 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'values')
    evidence.reserve!
    evidence.append_stdout("[1,2,3]\n")
    evidence.append_stdout("{\"nested\":{\"api_key\":\"secret\"}}\n")
    raw = File.read(File.join(root, 'values', 'attempt-001', 'execution-stream.sanitized.jsonl'))
    assert raw.include?('jsonl_value')
    assert !raw.include?('secret')
    sanitized = AgentEvidenceSanitizer.sanitize_string('erro em /Users/bruno/app https://host/api?token=secret')
    assert !sanitized.include?('/Users/bruno')
    assert !sanitized.include?('token=secret')
  end
end

failures = []
TESTS.each do |name, block|
  begin
    block.call
    puts "PASS #{name}"
  rescue StandardError => e
    failures << [name, e]
    warn "FAIL #{name}: #{e.class}: #{e.message}"
  end
end
abort "#{failures.size} failures" unless failures.empty?
puts "#{TESTS.size} passed"
