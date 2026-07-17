# frozen_string_literal: true

require 'open3'
require 'digest'
require 'json'
require 'rbconfig'
require 'time'
require_relative './codex_jsonl_diagnostics'
require_relative './agent_forensic_evidence'

# Adapter Codex single-agent (Fase 3B.3B).
# Executa apenas via argv + Open3. Sem shell, sem eval, sem fallback livre.
module CodexSingleAgentRuntime
  TESTED_VERSION = '0.144.0'
  DOC_PATH = '.agents/seguranca/CODEX-RUNTIME.md'
  REQUIRED_HELP_PATTERNS = [
    /(?:^|\s)-C,\s*--cd\b/m,
    /(?:^|\s)-s,\s*--sandbox\b/m,
    /workspace-write/,
    /(?:^|\s)-c,\s*--config\b/m,
    /(?:^|\s)--json\b/m
  ].freeze
  FORBIDDEN_ARGV_TOKENS = %w[
    bash sh zsh fish dash cmd powershell pwsh
    eval
  ].freeze
  FORBIDDEN_SHELL_FLAGS = %w[-lc -c].freeze
  STRIP_ENV = %w[
    DCG_BYPASS DCG_DISABLE
    GITHUB_TOKEN GH_TOKEN VERCEL_TOKEN
    SUPABASE_ACCESS_TOKEN DATABASE_URL POSTGRES_URL
    AGENT_ORCHESTRATION_EXECUTE AGENT_RUNTIME_EXECUTE
    AGENT_RUNTIME_TEST_CODEX AGENT_RUNTIME_TEST_CODEX_BIN
    AGENT_RUNTIME_TEST_PREFLIGHT AGENT_RUNTIME_TEST_DCG_BIN
    AGENT_RUNTIME_FAKE_SCENARIO AGENT_RUNTIME_FAKE_WRITE_PATH
    AGENT_RUNTIME_FAKE_PROTECTED_PATH
  ].freeze
  KEEP_ENV_PREFIXES = %w[CODEX_ OPENAI_].freeze
  KEEP_ENV_EXACT = %w[
    PATH HOME TMPDIR TMP TEMP LANG LC_ALL USER LOGNAME
    CODEX_HOME TERM
  ].freeze
  MAX_OUTPUT_BYTES = 1_048_576
  TERM_GRACE_SECONDS = 0.5

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def resolve_codex_bin!
    if ENV['AGENT_RUNTIME_TEST_CODEX'] == '1'
      bin = ENV['AGENT_RUNTIME_TEST_CODEX_BIN'].to_s.strip
      if bin.empty?
        raise Denial.new('CODEX_RUNTIME_TEST_BIN_REQUIRED', 'AGENT_RUNTIME_TEST_CODEX_BIN obrigatório em modo teste')
      end
      raise Denial.new('CODEX_BINARY_MISSING', "fake codex ausente: #{bin}") unless File.file?(bin) && File.executable?(bin)

      begin
        real = File.realpath(bin)
      rescue SystemCallError
        raise Denial.new('CODEX_BINARY_MISSING', "fake codex inválido: #{bin}")
      end
      fixtures = File.realpath(File.join(File.expand_path('../..', __dir__), '.agents/seguranca/fixtures'))
      unless real.start_with?(fixtures + File::SEPARATOR)
        raise Denial.new('CODEX_BINARY_MISSING', 'fake codex deve viver em .agents/seguranca/fixtures/')
      end
      return real
    end

    ENV.fetch('PATH', '').split(File::PATH_SEPARATOR).each do |dir|
      next if dir.empty?

      candidate = File.join(dir, 'codex')
      begin
        return File.realpath(candidate) if File.file?(candidate) && File.executable?(candidate)
      rescue SystemCallError
        next
      end
    end
    raise Denial.new('CODEX_BINARY_MISSING', 'binário codex não encontrado no PATH')
  end

  def read_version!(bin)
    out, err, status = Open3.capture3(bin, '--version')
    raise Denial.new('CODEX_VERSION_UNAVAILABLE', "falha ao ler versão: #{err}") unless status.success?

    text = out.to_s.strip
    m = text.match(/(\d+\.\d+\.\d+)/)
    raise Denial.new('CODEX_VERSION_UNAVAILABLE', "versão não parseável: #{text}") unless m

    m[1]
  rescue SystemCallError => error
    raise Denial.new('CODEX_VERSION_UNAVAILABLE', error.message)
  end

  def read_exec_help!(bin)
    out, err, status = Open3.capture3(bin, 'exec', '--help')
    text = "#{out}#{err}"
    raise Denial.new('CODEX_RUNTIME_CAPABILITY_UNAVAILABLE', 'codex exec --help falhou') unless status.success? || !text.empty?

    text
  rescue SystemCallError => error
    raise Denial.new('CODEX_RUNTIME_CAPABILITY_UNAVAILABLE', error.message)
  end

  def assert_capabilities!(help_text)
    REQUIRED_HELP_PATTERNS.each do |pattern|
      next if help_text.match?(pattern)

      raise Denial.new(
        'CODEX_RUNTIME_CAPABILITY_UNAVAILABLE',
        "capacidade obrigatória ausente no help (padrão #{pattern.inspect})"
      )
    end
    if help_text.match?(/multi[- ]?agent/i) && help_text.match?(/--enable\s+multi/i)
      raise Denial.new('CODEX_RUNTIME_CAPABILITY_UNAVAILABLE', 'help expõe multi-agent experimental sem controle')
    end
    true
  end

  def build_argv!(bin, worktree:)
    argv = [
      bin,
      'exec',
      '-C', worktree,
      '-s', 'workspace-write',
      '-c', 'approval_policy="never"',
      '-c', 'sandbox_workspace_write.network_access=false',
      '--json',
      '--color', 'never',
      '-'
    ]
    assert_argv_safe!(argv)
    argv
  end

  def assert_argv_safe!(argv)
    raise Denial.new('CODEX_ARGV_INVALID', 'argv vazio') if argv.nil? || argv.empty?
    raise Denial.new('CODEX_ARGV_INVALID', 'argv deve ser Array') unless argv.is_a?(Array)

    argv.each_with_index do |token, idx|
      raise Denial.new('CODEX_ARGV_INVALID', 'token argv deve ser String') unless token.is_a?(String)
      raise Denial.new('CODEX_ARGV_SHELL_DENIED', "token shell proibido: #{token}") if FORBIDDEN_ARGV_TOKENS.include?(token)
      prev = idx.positive? ? argv[idx - 1] : nil
      if FORBIDDEN_SHELL_FLAGS.include?(token) && prev && FORBIDDEN_ARGV_TOKENS.include?(File.basename(prev.to_s))
        raise Denial.new('CODEX_ARGV_SHELL_DENIED', "flag shell proibida após #{prev}")
      end
      raise Denial.new('CODEX_ARGV_SHELL_DENIED', 'metacaractere de shell no argv') if token.match?(%r{[\n;|&><`$]})
    end
  end

  def sanitized_env
    env = {}
    test_mode = ENV['AGENT_RUNTIME_TEST_CODEX'] == '1'
    ENV.each do |key, value|
      next if value.nil?
      next if STRIP_ENV.include?(key) && !(test_mode && key.start_with?('AGENT_RUNTIME_FAKE_'))
      next if key.match?(/\A(VERCEL_|SUPABASE_|DATABASE_|POSTGRES_|DEPLOY_)/)
      next if !test_mode && key.start_with?('AGENT_RUNTIME_FAKE_')

      keep = KEEP_ENV_EXACT.include?(key) ||
             KEEP_ENV_PREFIXES.any? { |p| key.start_with?(p) } ||
             (test_mode && key.start_with?('AGENT_RUNTIME_FAKE_'))
      env[key] = value if keep
    end
    env['PATH'] ||= '/usr/bin:/bin'
    env
  end

  def trunc(value, max_bytes: MAX_OUTPUT_BYTES)
    bytes = value.to_s.b
    sliced = bytes.byteslice(0, max_bytes) || ''
    text = sliced.dup.force_encoding(Encoding::UTF_8).scrub
    [text, bytes.bytesize > max_bytes]
  end

  def process_alive?(pid)
    Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  end

  def terminate_process_group!(pid)
    begin
      Process.kill('TERM', -pid)
    rescue Errno::ESRCH, Errno::EPERM
      begin
        Process.kill('TERM', pid)
      rescue Errno::ESRCH, Errno::EPERM
      end
    end

    deadline = Time.now + TERM_GRACE_SECONDS
    sleep 0.05 while process_alive?(pid) && Time.now < deadline
    return unless process_alive?(pid)

    begin
      Process.kill('KILL', -pid)
    rescue Errno::ESRCH, Errno::EPERM
      begin
        Process.kill('KILL', pid)
      rescue Errno::ESRCH, Errno::EPERM
      end
    end
  end

  def spawn!(argv:, prompt:, chdir:, timeout_seconds:, evidence: nil, on_spawn: nil)
    assert_argv_safe!(argv)
    stdout_data = +''
    stderr_data = +''
    exit_code = nil
    signal = nil
    timed_out = false
    pid = nil
    started = Time.now.utc

    raw_stdout_bytes = 0
    raw_stderr_bytes = 0
    stdout_truncated = false
    stderr_truncated = false
    stdout_for_diagnostics = +''
    stderr_buffer = +''
    stderr_capture_limit = AgentForensicEvidence::MAX_STREAM_BYTES + AgentEvidenceSanitizer::MAX_FIELD_BYTES
    output_mutex = Mutex.new

    read_stdout = lambda do |io|
      buffer = +''
      line_sequence = 0
      discard_long_line = false
      loop do
        chunk = io.readpartial(16 * 1024)
        raw_stdout_bytes += chunk.bytesize
        if stdout_data.bytesize < MAX_OUTPUT_BYTES
          take = [MAX_OUTPUT_BYTES - stdout_data.bytesize, chunk.bytesize].min
          stdout_data << chunk.byteslice(0, take)
          stdout_truncated = true if take < chunk.bytesize
        else
          stdout_truncated = true
        end
        if discard_long_line
          newline = chunk.index("\n")
          if newline
            evidence&.mark_truncated!(bytes: newline + 1)
            discard_long_line = false
            chunk = chunk.byteslice(newline + 1, chunk.bytesize).to_s
            next if chunk.empty?
          else
            evidence&.mark_truncated!(bytes: chunk.bytesize)
            next
          end
        end

        buffer << chunk.byteslice(0, [chunk.bytesize, AgentEvidenceSanitizer::MAX_FIELD_BYTES].min).to_s
        while (idx = buffer.index("\n"))
          line = buffer.slice!(0..idx)
          line_sequence += 1
          sanitized_line = evidence ? evidence.append_stdout(line) : line
          evidence&.mark_truncated!(bytes: line.bytesize, records: 1) if line.bytesize > AgentEvidenceSanitizer::MAX_FIELD_BYTES
          output_mutex.synchronize do
            if stdout_for_diagnostics.bytesize < MAX_OUTPUT_BYTES
              stdout_for_diagnostics << line.to_s.byteslice(0, MAX_OUTPUT_BYTES - stdout_for_diagnostics.bytesize).to_s
            end
          end
        end
        if buffer.bytesize > AgentEvidenceSanitizer::MAX_FIELD_BYTES
          line_sequence += 1
          evidence&.append_stdout(buffer.byteslice(0, AgentEvidenceSanitizer::MAX_FIELD_BYTES).to_s)
          evidence&.mark_truncated!(bytes: buffer.bytesize, records: 1)
          buffer = +''
          discard_long_line = true
        end
      end
    rescue EOFError
      unless buffer.empty? || discard_long_line
        line_sequence += 1
        sanitized_line = evidence ? evidence.append_stdout(buffer) : buffer
        output_mutex.synchronize { stdout_for_diagnostics << buffer.to_s.byteslice(0, MAX_OUTPUT_BYTES - stdout_for_diagnostics.bytesize).to_s }
      end
    end

    read_stderr = lambda do |io|
      loop do
        chunk = io.readpartial(16 * 1024)
        raw_stderr_bytes += chunk.bytesize
        if stderr_data.bytesize < MAX_OUTPUT_BYTES
          take = [MAX_OUTPUT_BYTES - stderr_data.bytesize, chunk.bytesize].min
          stderr_data << chunk.byteslice(0, take)
          stderr_truncated = true if take < chunk.bytesize
        else
          stderr_truncated = true
        end
        remaining = stderr_capture_limit - stderr_buffer.bytesize
        if remaining.positive?
          stderr_buffer << chunk.byteslice(0, remaining).to_s
          evidence&.mark_truncated!(bytes: chunk.bytesize - remaining) if chunk.bytesize > remaining
        else
          evidence&.mark_truncated!(bytes: chunk.bytesize)
        end
      end
    rescue EOFError
      evidence&.append_stderr(stderr_buffer)
    end

    Open3.popen3(sanitized_env, *argv, chdir: chdir, unsetenv_others: true, pgroup: true) do |stdin, stdout, stderr, thr|
      pid = thr.pid
      on_spawn&.call(pid)
      evidence&.checkpoint('spawn_started', 'process' => { 'pid' => pid, 'argv' => argv })
      stdin.write(prompt.to_s)
      stdin.close

      evidence&.checkpoint('stream_capture_started')
      out_reader = Thread.new { read_stdout.call(stdout) }
      err_reader = Thread.new { read_stderr.call(stderr) }

      deadline = Time.now + timeout_seconds
      until thr.join(0.05)
        next if Time.now < deadline

        timed_out = true
        terminate_process_group!(pid)
        break
      end

      status = thr.value
      exit_code = status&.exitstatus
      signal = status&.termsig
      out_reader.value
      err_reader.value
      evidence&.checkpoint('streams_drained')
    end

    if pid && process_alive?(pid)
      terminate_process_group!(pid)
      begin
        Process.wait(pid)
      rescue Errno::ECHILD
      end
    end

    out, out_trunc = trunc(stdout_data)
    err, err_trunc = trunc(stderr_data)
    out_trunc ||= stdout_truncated
    err_trunc ||= stderr_truncated
    finished = Time.now.utc
    diagnostico = CodexJsonlDiagnostics.parse(stdout_for_diagnostics.empty? ? out : stdout_for_diagnostics, truncated: out_trunc)
    {
      'processos_iniciados' => pid ? 1 : 0,
      'pid' => pid,
      'exit_code' => exit_code,
      'sinal' => signal,
      'timeout' => timed_out,
      'inicio' => started.iso8601,
      'fim' => finished.iso8601,
      'duracao_ms' => ((finished - started) * 1000).round,
      'stdout_sha256' => Digest::SHA256.hexdigest(out),
      'stderr_sha256' => Digest::SHA256.hexdigest(err),
      'stdout_truncado' => out_trunc,
      'stderr_truncado' => err_trunc,
      'stdout_bytes_observados' => raw_stdout_bytes,
      'stderr_bytes_observados' => raw_stderr_bytes,
      'evidence_status' => evidence ? (evidence.truncated || evidence.sanitization_failed ? 'partial' : 'complete') : 'unavailable',
      'evidence_dir_rel' => evidence&.evidence_relpath,
      'argv' => argv,
      'codex_version_tested' => TESTED_VERSION,
      'diagnostico_jsonl' => diagnostico
    }
  rescue SystemCallError => error
    raise Denial.new('CODEX_SPAWN_FAILED', error.message)
  end

  def prepare!(worktree:)
    bin = resolve_codex_bin!
    version = read_version!(bin)
    tested_minor = TESTED_VERSION.split('.').first(2).join('.')
    observed_minor = version.split('.').first(2).join('.')
    unless observed_minor == tested_minor
      raise Denial.new(
        'CODEX_RUNTIME_CAPABILITY_UNAVAILABLE',
        "versão Codex #{version} fora da faixa testada #{TESTED_VERSION} (exige #{tested_minor}.x)"
      )
    end
    help = read_exec_help!(bin)
    assert_capabilities!(help)
    argv = build_argv!(bin, worktree: worktree)
    {
      'bin' => bin,
      'version' => version,
      'argv' => argv,
      'doc' => DOC_PATH
    }
  end
end
