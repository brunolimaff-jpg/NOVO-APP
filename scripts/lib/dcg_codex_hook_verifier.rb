# frozen_string_literal: true

require 'json'
require 'digest'
require 'fileutils'
require 'shellwords'

# Verificação read-only do hook Codex PreToolUse Bash → DCG (Fase 3B.3C.1).
# Não edita hooks. Não confia em relatório externo nem em fixtures no modo live.
module DcgCodexHookVerifier
  DEFAULT_HOOKS = File.expand_path('~/.codex/hooks.json')
  FORBIDDEN_SHELL = [
    /\Abash\b.*\s-c\b/i,
    /\Ash\b.*\s-c\b/i,
    /\Azsh\b.*\s-c\b/i,
    /\Beval\b/i,
    /\A\/bin\/(ba)?sh\b.*\s-c\b/i,
    /\A\/usr\/bin\/env\s+(bash|sh|zsh)\b.*\s-c\b/i
  ].freeze

  class Result
    attr_reader :ok, :code, :message, :details

    def initialize(ok:, code: nil, message: '', details: {})
      @ok = ok
      @code = code
      @message = message
      @details = details
    end

    def denial?
      !ok
    end
  end

  module_function

  def default_hooks_path
    DEFAULT_HOOKS
  end

  def expand_command(cmd)
    s = cmd.to_s.strip
    s = s.sub(/\A~(?=\/)/, ENV.fetch('HOME', ''))
    s = s.gsub(/\$HOME\b/, ENV.fetch('HOME', ''))
    s = s.gsub(/\$\{HOME\}/, ENV.fetch('HOME', ''))
    s
  end

  def shell_wrapper?(cmd)
    FORBIDDEN_SHELL.any? { |re| cmd.match?(re) }
  end

  def resolve_command_binary(cmd, path_env: ENV['PATH'])
    expanded = expand_command(cmd)
    return nil if expanded.empty?
    return nil if shell_wrapper?(expanded)

    # Reject multi-token shell pipelines / wrappers (allow only path-like single argv0).
    tokens = expanded.shellsplit rescue expanded.split(/\s+/)
    return nil if tokens.size != 1

    candidate = tokens.first
    if candidate.include?(File::SEPARATOR) || candidate.start_with?('/')
      return nil unless File.file?(candidate)

      begin
        return File.realpath(candidate)
      rescue SystemCallError
        return nil
      end
    end

    # bare name: look up PATH
    Array(path_env.to_s.split(File::PATH_SEPARATOR)).each do |dir|
      next if dir.empty?

      path = File.join(dir, candidate)
      next unless File.file?(path) && File.executable?(path)

      begin
        return File.realpath(path)
      rescue SystemCallError
        next
      end
    end
    nil
  end

  def bash_matcher?(matcher)
    m = matcher.to_s
    return true if m.empty? # some formats omit matcher (= all tools) — treat cautiously: no
    m.split('|').map(&:strip).any? { |p| p == 'Bash' || p.casecmp('bash').zero? }
  end

  def load_hooks(hooks_path)
    path = File.expand_path(hooks_path.to_s)
    unless File.file?(path)
      return Result.new(ok: false, code: 'DCG_HOOK_FILE_MISSING', message: "hooks ausente: #{path}")
    end

    begin
      data = JSON.parse(File.read(path))
    rescue JSON::ParserError => e
      return Result.new(ok: false, code: 'DCG_HOOK_FILE_INVALID', message: "JSON inválido: #{e.message}")
    end
    unless data.is_a?(Hash)
      return Result.new(ok: false, code: 'DCG_HOOK_FILE_INVALID', message: 'hooks raiz deve ser objeto')
    end

    Result.new(ok: true, details: { 'path' => path, 'realpath' => (File.realpath(path) rescue path), 'data' => data })
  end

  def collect_bash_commands(data)
    hooks_root = data['hooks'] || data
    entries = hooks_root.is_a?(Hash) ? hooks_root['PreToolUse'] : nil
    return [] unless entries.is_a?(Array)

    cmds = []
    entries.each do |group|
      next unless group.is_a?(Hash)
      next unless bash_matcher?(group['matcher'])

      Array(group['hooks']).each do |hook|
        next unless hook.is_a?(Hash)

        cmd = hook['command'] || hook['cmd']
        cmds << cmd.to_s if cmd
      end
    end
    cmds
  end

  # expected_dcg_realpath: realpath do binário DCG já validado (versão/checksum).
  def verify(hooks_path:, expected_dcg_realpath:, path_env: ENV['PATH'])
    loaded = load_hooks(hooks_path)
    return loaded if loaded.denial?

    data = loaded.details['data']
    hooks_real = loaded.details['realpath']
    cmds = collect_bash_commands(data)

    if cmds.empty?
      # Distinguish missing PreToolUse vs missing Bash vs empty
      hooks_root = data['hooks'] || data
      unless hooks_root.is_a?(Hash) && hooks_root.key?('PreToolUse')
        return Result.new(ok: false, code: 'DCG_HOOK_ENTRY_MISSING', message: 'PreToolUse ausente')
      end
      return Result.new(ok: false, code: 'DCG_HOOK_ENTRY_MISSING', message: 'matcher Bash ausente ou sem comandos')
    end

    begin
      expected_real = File.realpath(expected_dcg_realpath)
    rescue SystemCallError
      return Result.new(ok: false, code: 'DCG_HOOK_BINARY_UNVERIFIED', message: 'binário DCG esperado ilegível')
    end

    guardian_seen = false
    dcg_match = false
    wrapper_seen = false

    cmds.each do |raw|
      expanded = expand_command(raw)
      if shell_wrapper?(expanded)
        wrapper_seen = true
        next
      end
      guardian_seen = true if expanded.include?('guardian-block')

      resolved = resolve_command_binary(raw, path_env: path_env)
      next if resolved.nil?

      dcg_match = true if resolved == expected_real
    end

    if wrapper_seen && !dcg_match
      return Result.new(
        ok: false,
        code: 'DCG_HOOK_SHELL_WRAPPER_DENIED',
        message: 'hook DCG via shell wrapper rejeitado'
      )
    end

    unless dcg_match
      if guardian_seen && cmds.size >= 1
        return Result.new(
          ok: false,
          code: 'DCG_HOOK_ENTRY_MISSING',
          message: 'guardian sozinho não é suficiente; falta entrada DCG direta'
        )
      end
      return Result.new(
        ok: false,
        code: 'DCG_HOOK_BINARY_MISMATCH',
        message: 'nenhuma entrada PreToolUse Bash resolve para o binário DCG validado'
      )
    end

    Result.new(
      ok: true,
      details: {
        'hooks_realpath' => hooks_real,
        'hooks_sha256' => Digest::SHA256.hexdigest(File.binread(hooks_real)),
        'dcg_realpath' => expected_real,
        'guardian_coexistente' => guardian_seen,
        'comandos_bash' => cmds
      }
    )
  end
end
