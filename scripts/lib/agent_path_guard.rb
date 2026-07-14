# frozen_string_literal: true

require 'pathname'

# Canonical worktree-relative path hardening (DI-2026-07-13-12).
# Ruby stdlib only — reused by planner, preflight and future runtime.
module AgentPathGuard
  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  MAX_PERCENT_ROUNDS = 1

  PROTECTED_PREFIXES = [
    '.agents/seguranca/',
    '.dcg.toml',
    '.dcg/',
    'scripts/runtime-safety-preflight.rb',
    'scripts/validate-runtime-safety.rb',
    'scripts/test-runtime-safety.rb',
    'scripts/lib/agent_path_guard.rb',
    'scripts/lib/agent_command_guard.rb'
  ].freeze

  def self.normalize_path_list(paths, worktree_root:)
    negacoes = []
    seen = {}
    out = []
    Array(paths).each do |raw|
      next if raw.nil?

      begin
        normalized = validate_path!(raw, worktree_root: worktree_root)
      rescue Denial => error
        negacoes << { 'codigo' => error.code, 'mensagem' => error.message }
        next
      end
      next if seen[normalized]

      seen[normalized] = true
      out << normalized
    end
    [out, negacoes]
  end

  def self.validate_path!(raw, worktree_root:)
    raise Denial.new('PATH_INVALID_ENCODING', 'path deve ser String') unless raw.is_a?(String)

    s = raw.dup
    begin
      s.force_encoding(Encoding::UTF_8)
    rescue EncodingError
      raise Denial.new('PATH_INVALID_ENCODING', 'encoding inválido')
    end
    raise Denial.new('PATH_INVALID_ENCODING', 'UTF-8 inválido') unless s.valid_encoding?
    raise Denial.new('PATH_NULL_BYTE_DENIED', 'null byte proibido') if s.include?("\0")

    s = s.strip.gsub('\\', '/')
    raise Denial.new('PATH_INVALID_ENCODING', 'path vazio') if s.empty?

    s = limited_percent_decode(s)
    raise Denial.new('PATH_NULL_BYTE_DENIED', 'null byte após percent-decode') if s.include?("\0")
    raise Denial.new('PATH_INVALID_ENCODING', 'UTF-8 inválido após percent-decode') unless s.valid_encoding?

    s = s.unicode_normalize(:nfc)
    reject_absolute!(s)
    reject_dotdot_segments!(s)

    cleaned = Pathname.new(s).cleanpath.to_s.sub(%r{\A\./}, '')
    raise Denial.new('PATH_TRAVERSAL_DENIED', "cleanpath escapa: #{cleaned}") if cleaned == '..' || cleaned.start_with?('../')
    reject_dotdot_segments!(cleaned)
    raise Denial.new('PATH_ABSOLUTE_DENIED', "caminho absoluto após cleanpath: #{cleaned}") if cleaned.start_with?('/')

    resolve_under_worktree!(cleaned, worktree_root)
  end

  def self.protected_mutation?(relative_path)
    rel = relative_path.to_s.sub(%r{\A\./}, '')
    PROTECTED_PREFIXES.any? do |prefix|
      if prefix.end_with?('/')
        rel == prefix.chomp('/') || rel.start_with?(prefix)
      else
        rel == prefix
      end
    end
  end

  # Single-pass percent-decode. Double encoding and malformed %HH are denied.
  # Literal '%' encoded as %25 is allowed (decodes to '%' without remaining %HH).
  def self.limited_percent_decode(input)
    raise Denial.new('PATH_PERCENT_ENCODING_INVALID', 'percent-encoding inválido') if input.match?(/%(?![0-9A-Fa-f]{2})/)

    decoded = input.gsub(/%([0-9A-Fa-f]{2})/) { [::Regexp.last_match(1)].pack('H*') }
    decoded.force_encoding(Encoding::UTF_8)
    raise Denial.new('PATH_INVALID_ENCODING', 'UTF-8 inválido no percent-decode') unless decoded.valid_encoding?

    if decoded.match?(/%[0-9A-Fa-f]{2}/)
      raise Denial.new('PATH_PERCENT_ENCODING_INVALID', 'double percent-encoding detectado')
    end
    decoded
  end
  private_class_method :limited_percent_decode

  def self.reject_absolute!(s)
    if s.start_with?('/') || s.match?(/\A[a-zA-Z]:/) || s.start_with?('//')
      raise Denial.new('PATH_ABSOLUTE_DENIED', "caminho absoluto proibido: #{s}")
    end
  end
  private_class_method :reject_absolute!

  def self.reject_dotdot_segments!(s)
    segments = s.split('/')
    if segments.any? { |seg| seg == '..' }
      raise Denial.new('PATH_TRAVERSAL_DENIED', "segmento .. proibido: #{s}")
    end
  end
  private_class_method :reject_dotdot_segments!

  def self.under_root?(root_real, candidate_real)
    candidate_real == root_real || candidate_real.start_with?(root_real + File::SEPARATOR)
  end
  private_class_method :under_root?

  def self.resolve_under_worktree!(rel, worktree_root)
    begin
      root_real = File.realpath(worktree_root)
    rescue SystemCallError
      raise Denial.new('PATH_OUTSIDE_WORKTREE', "worktree inválida: #{worktree_root}")
    end

    absolute = File.join(root_real, rel)

    if File.exist?(absolute) || File.symlink?(absolute)
      begin
        real = File.realpath(absolute)
      rescue SystemCallError
        raise Denial.new('PATH_SYMLINK_ESCAPE', "falha ao resolver realpath: #{rel}")
      end
      unless under_root?(root_real, real)
        code = (File.symlink?(absolute) || symlink_in_ancestry?(File.dirname(absolute), root_real)) ? 'PATH_SYMLINK_ESCAPE' : 'PATH_OUTSIDE_WORKTREE'
        raise Denial.new(code, "path fora da worktree: #{rel}")
      end
      return Pathname.new(real).relative_path_from(Pathname.new(root_real)).to_s
    end

    probe = absolute
    loop do
      parent = File.dirname(probe)
      if File.symlink?(probe) || File.symlink?(parent)
        begin
          target = File.exist?(probe) ? probe : parent
          real_parent = File.realpath(target)
        rescue SystemCallError
          raise Denial.new('PATH_SYMLINK_ESCAPE', "ancestral symlink inválido: #{rel}")
        end
        unless under_root?(root_real, real_parent)
          raise Denial.new('PATH_SYMLINK_ESCAPE', "ancestral symlink escapa: #{rel}")
        end
      end
      if File.exist?(probe) || File.symlink?(probe)
        begin
          real_anc = File.realpath(probe)
        rescue SystemCallError
          raise Denial.new('PATH_OUTSIDE_WORKTREE', "ancestral inexistente: #{rel}")
        end
        unless under_root?(root_real, real_anc)
          raise Denial.new('PATH_SYMLINK_ESCAPE', "ancestral fora da worktree: #{rel}")
        end
        suffix = absolute.delete_prefix(probe).sub(%r{\A/}, '')
        reconstructed = suffix.empty? ? real_anc : File.join(real_anc, suffix)
        unless under_root?(root_real, File.expand_path(reconstructed))
          raise Denial.new('PATH_OUTSIDE_WORKTREE', "reconstrução fora da worktree: #{rel}")
        end
        return Pathname.new(File.expand_path(reconstructed)).relative_path_from(Pathname.new(root_real)).to_s
      end
      break if parent == probe

      probe = parent
    end

    raise Denial.new('PATH_OUTSIDE_WORKTREE', "não resolve dentro da worktree: #{rel}")
  end
  private_class_method :resolve_under_worktree!

  def self.symlink_in_ancestry?(path, root_real)
    probe = path
    loop do
      return true if File.symlink?(probe)
      break if probe == root_real || File.dirname(probe) == probe

      probe = File.dirname(probe)
    end
    false
  end
  private_class_method :symlink_in_ancestry?
end
