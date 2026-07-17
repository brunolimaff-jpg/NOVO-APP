# frozen_string_literal: true

require 'digest'
require 'fileutils'
require 'json'
require 'tmpdir'
require_relative './agent_evidence_sanitizer'

class AgentForensicEvidence
  SCHEMA_VERSION = 1
  RETENTION_DAYS = 30
  MAX_STREAM_BYTES = 1_048_576
  MAX_STREAM_RECORDS = 10_000

  class Denial < StandardError
    attr_reader :code
    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  attr_reader :dir, :mission_id, :attempt, :truncated, :discarded_bytes, :discarded_records, :sanitization_failed

  def self.resolve_root!(path, env: ENV)
    raw = path.to_s.strip
    raw = env['AGENT_RUNTIME_EVIDENCE_ROOT'].to_s.strip if raw.empty?
    raise Denial.new('FORENSIC_EVIDENCE_ROOT_REQUIRED', 'raiz externa de evidências obrigatória') if raw.empty?
    expanded = File.expand_path(raw)
    raise Denial.new('FORENSIC_EVIDENCE_ROOT_SYMLINK', 'raiz de evidências não pode ser symlink') if File.symlink?(expanded)
    parent = File.dirname(expanded)
    raise Denial.new('FORENSIC_EVIDENCE_ROOT_INVALID', 'ancestor da raiz não existe') unless File.directory?(parent)
    raise Denial.new('FORENSIC_EVIDENCE_ROOT_SYMLINK', 'ancestor da raiz é symlink') if File.realpath(parent) != parent
    expanded
  rescue SystemCallError => e
    raise Denial.new('FORENSIC_EVIDENCE_ROOT_INVALID', e.message)
  end

  def initialize(root:, mission_id:, attempt: 1, paths: {})
    @root = self.class.resolve_root!(root, env: {})
    @mission_id = mission_id.to_s
    @attempt = Integer(attempt)
    raise Denial.new('FORENSIC_MISSION_ID_INVALID', 'mission_id inválida') unless @mission_id.match?(/\A[a-zA-Z0-9][a-zA-Z0-9_.-]*\z/)
    raise Denial.new('FORENSIC_ATTEMPT_INVALID', 'tentativa inválida') unless @attempt.positive?
    @dir = File.join(@root, @mission_id, format('attempt-%03d', @attempt))
    @stream_bytes = 0
    @stream_records = 0
    @stderr_bytes = 0
    @truncated = false
    @discarded_bytes = 0
    @discarded_records = 0
    @sanitization_failed = false
    @paths = paths
    @state = 'initialized'
  end

  def reserve!
    FileUtils.mkdir_p(@root, mode: 0o700)
    File.chmod(0o700, @root) if File.directory?(@root)
    mission_dir = File.join(@root, @mission_id)
    ensure_directory!(mission_dir)
    File.chmod(0o700, mission_dir)
    attempt_parent = File.dirname(@dir)
    ensure_directory!(attempt_parent)
    File.chmod(0o700, attempt_parent)
    begin
      FileUtils.mkdir(@dir, mode: 0o700)
    rescue Errno::EEXIST
      raise Denial.new('FORENSIC_ATTEMPT_ALREADY_RESERVED', 'tentativa de evidência já reservada')
    end
    File.chmod(0o700, @dir)
    %w[execution-stream.sanitized.jsonl stderr.sanitized.log].each { |name| ensure_file!(File.join(@dir, name)) }
    write_json('execution-evidence.json', base_record.merge('state' => 'reserved'))
    @state = 'reserved'
    self
  rescue SystemCallError => e
    raise Denial.new('FORENSIC_PERSISTENCE_FAILED', e.message)
  end

  def checkpoint(state, extra = {})
    @state = state.to_s
    sanitized_extra = AgentEvidenceSanitizer.sanitize(extra, nil, @paths)
    @sanitization_failed ||= sanitized_extra.is_a?(Hash) && sanitized_extra['sanitization_failed'] == true
    write_json('execution-evidence.json', base_record.merge('state' => @state).merge(sanitized_extra))
  end

  def append_stdout(line)
    raw = line.to_s.b
    return drop!(raw.bytesize, record: true) if @stream_bytes >= MAX_STREAM_BYTES || @stream_records >= MAX_STREAM_RECORDS

    record = begin
      parsed = JSON.parse(line)
      sanitized = AgentEvidenceSanitizer.sanitize(parsed, nil, @paths)
      @sanitization_failed ||= sanitized.is_a?(Hash) && sanitized['sanitization_failed'] == true
      if sanitized.is_a?(Hash)
        sanitized.merge('sequence' => @stream_records + 1)
      else
        { 'type' => 'jsonl_value', 'value' => sanitized, 'sequence' => @stream_records + 1, 'sanitized' => true }
      end
    rescue JSON::ParserError => e
      AgentEvidenceSanitizer.invalid_jsonl_record(@stream_records + 1, line, e.message)
    end
    serialized = JSON.generate(record) + "\n"
    if @stream_bytes + serialized.bytesize > MAX_STREAM_BYTES
      drop!(raw.bytesize, record: true)
      return ''
    end
    File.open(File.join(@dir, 'execution-stream.sanitized.jsonl'), 'ab', 0o600) { |f| f.write(serialized) }
    @stream_bytes += serialized.bytesize
    @stream_records += 1
    serialized
  rescue SystemCallError => e
    raise Denial.new('FORENSIC_PERSISTENCE_FAILED', e.message)
  end

  def append_stderr(chunk)
    raw = chunk.to_s.b
    return drop!(raw.bytesize) if @stderr_bytes >= MAX_STREAM_BYTES
    remaining = MAX_STREAM_BYTES - @stderr_bytes
    sanitized = AgentEvidenceSanitizer.sanitize_string(raw, max_bytes: raw.bytesize)
    text = sanitized.byteslice(0, remaining).to_s
    File.open(File.join(@dir, 'stderr.sanitized.log'), 'ab', 0o600) { |f| f.write(text) }
    @stderr_bytes += text.bytesize
    @discarded_bytes += [sanitized.bytesize - remaining, 0].max
  rescue SystemCallError => e
    raise Denial.new('FORENSIC_PERSISTENCE_FAILED', e.message)
  end

  def finalize!(status: 'complete', delivery: nil, limitations: [])
    @state = status.to_s
    checkpoint('report_finalized', 'delivery' => delivery || {}, 'limitations' => Array(limitations))
    artifacts = %w[execution-stream.sanitized.jsonl execution-evidence.json stderr.sanitized.log].each_with_object([]) do |name, list|
      path = File.join(@dir, name)
      next unless File.file?(path)
      bytes = File.binread(path)
      list << { 'name' => name, 'sha256' => Digest::SHA256.hexdigest(bytes), 'bytes' => bytes.bytesize,
                'encoding' => 'UTF-8', 'truncated' => @truncated, 'sanitized' => true }
    end
    manifest = {
      'schema_version' => SCHEMA_VERSION, 'mission_id' => @mission_id, 'attempt' => @attempt,
      'retention_days' => RETENTION_DAYS, 'evidence_status' => status.to_s,
      'limits' => { 'stream_bytes' => MAX_STREAM_BYTES, 'stream_records' => MAX_STREAM_RECORDS,
                    'field_bytes' => AgentEvidenceSanitizer::MAX_FIELD_BYTES },
      'truncated' => @truncated, 'discarded_bytes' => @discarded_bytes,
      'discarded_records' => @discarded_records, 'artifacts' => artifacts.sort_by { |a| a['name'] },
      'sanitization' => { 'sanitized' => true, 'fail_closed' => true, 'sanitization_failed' => @sanitization_failed },
      'integrity' => { 'manifest_hash_excludes_self' => true }
    }
    write_json('evidence-manifest.json', manifest)
    manifest.merge('manifest_sha256' => Digest::SHA256.file(File.join(@dir, 'evidence-manifest.json')).hexdigest)
  rescue SystemCallError => e
    raise Denial.new('FORENSIC_PERSISTENCE_FAILED', e.message)
  end

  def evidence_relpath
    File.join(@mission_id, format('attempt-%03d', @attempt))
  end

  def mark_truncated!(bytes:, records: 0)
    drop!(bytes, record: records.positive?)
  end

  private

  def drop!(bytes, record: false)
    @truncated = true
    @discarded_bytes += bytes.to_i
    @discarded_records += 1 if record
    ''
  end

  def base_record
    { 'schema_version' => SCHEMA_VERSION, 'mission_id' => @mission_id, 'attempt' => @attempt,
      'stream' => { 'max_bytes' => MAX_STREAM_BYTES, 'max_records' => MAX_STREAM_RECORDS,
                    'bytes' => @stream_bytes, 'records' => @stream_records,
                    'truncated' => @truncated, 'discarded_bytes' => @discarded_bytes,
                    'discarded_records' => @discarded_records } }
  end

  def write_json(name, object)
    atomic_write(File.join(@dir, name), JSON.generate(sort_keys(object)) + "\n")
  end

  def atomic_write(path, text)
    tmp = "#{path}.tmp-#{Process.pid}-#{Thread.current.object_id}"
    File.open(tmp, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write(text); f.flush; f.fsync }
    File.rename(tmp, path)
  ensure
    File.delete(tmp) if tmp && File.exist?(tmp)
  end

  def ensure_directory!(path)
    raise Denial.new('FORENSIC_EVIDENCE_SYMLINK', "diretório de evidência é symlink: #{path}") if File.symlink?(path)
    FileUtils.mkdir(path, mode: 0o700) unless File.exist?(path)
    raise Denial.new('FORENSIC_EVIDENCE_INVALID', "diretório de evidência inválido: #{path}") unless File.directory?(path)
    raise Denial.new('FORENSIC_EVIDENCE_SYMLINK', "ancestor de evidência é symlink: #{path}") unless File.realpath(path) == path
  end

  def ensure_file!(path)
    raise Denial.new('FORENSIC_EVIDENCE_SYMLINK', "arquivo de evidência é symlink: #{path}") if File.symlink?(path)
    File.open(path, File::WRONLY | File::CREAT, 0o600) {} unless File.exist?(path)
    File.chmod(0o600, path)
  end

  def sort_keys(value)
    return value unless value.is_a?(Hash)
    value.keys.sort.each_with_object({}) { |k, h| h[k] = sort_keys(value[k]) }
  end
end
