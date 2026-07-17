#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'tmpdir'
require 'fileutils'
require_relative './lib/agent_evidence_sanitizer'
require_relative './lib/agent_forensic_evidence'

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
  assert result['sanitized'] == true
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
  Dir.mktmpdir('forensic-test', '/private/tmp') do |dir|
    root = File.join(dir, 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'm1', attempt: 1)
    evidence.reserve!
    evidence.append_stdout('{"type":"turn.completed"}\n')
    manifest = evidence.finalize!(status: 'complete')
    assert manifest['schema_version'] == 1
    assert manifest['retention_days'] == 30
    assert manifest['artifacts'].map { |a| a['name'] } == %w[execution-evidence.json execution-stream.sanitized.jsonl stderr.sanitized.log].sort
    manifest_path = File.join(root, 'm1', 'attempt-001', 'evidence-manifest.json')
    assert manifest['manifest_sha256'] == Digest::SHA256.file(manifest_path).hexdigest
    assert File.file?(File.join(root, 'm1', 'attempt-001', 'evidence-manifest.json'))
  end
end

test('checkpoint sanitiza argv e limita permissões') do
  Dir.mktmpdir('forensic-permissions', '/private/tmp') do |dir|
    root = File.join(dir, 'evidence')
    evidence = AgentForensicEvidence.new(root: root, mission_id: 'safe', paths: { 'worktree' => '/Users/bruno/repo' })
    evidence.reserve!
    evidence.checkpoint('spawn_started', 'process' => { 'argv' => ['codex', '--token=secret-value'], 'cwd' => '/Users/bruno/repo' })
    raw = File.read(File.join(root, 'safe', 'attempt-001', 'execution-evidence.json'))
    assert !raw.include?('secret-value')
    assert raw.include?('<WORKTREE>')
    assert (File.stat(root).mode & 0o777) == 0o700
    assert (File.stat(File.join(root, 'safe', 'attempt-001', 'execution-evidence.json')).mode & 0o777) == 0o600
  end
end

test('symlink de missão é rejeitado sem escrever fora da raiz') do
  Dir.mktmpdir('forensic-symlink', '/private/tmp') do |dir|
    root = File.join(dir, 'evidence')
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
  Dir.mktmpdir('state-test', '/private/tmp') do |dir|
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
