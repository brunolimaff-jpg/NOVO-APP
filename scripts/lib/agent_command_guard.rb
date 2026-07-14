# frozen_string_literal: true

# Proteção fail-closed do catálogo interno do NOVO-APP.
# Autorização primária = catálogo argv. DCG é segunda barreira (não substituta).
# Sem parser universal de shell.

module AgentCommandGuard
  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  CANONICAL_IDS = %w[
    validate-skills-governance
    test-skills-governance
    validate-agent-orchestration
    test-agent-orchestration
    git-diff-check
  ].freeze

  SHELL_WRAPPERS = %w[bash sh zsh fish dash cmd powershell pwsh].freeze

  METACHAR_PATTERN = /[\n;|&><`]|\$\(/

  DESTRUCTIVE_SUBSTRINGS = [
    'rm -rf',
    'git reset --hard',
    'git clean -fd',
    'git clean -fdx',
    'git clean -ffdx',
    'git push --force',
    'git push --force-with-lease',
    'git branch -D',
    'git checkout -- .',
    'gh pr merge',
    'gh repo delete',
    'docker system prune',
    'supabase db reset',
    'terraform destroy',
    'drop table',
    'truncate',
    'vercel --prod',
    'vercel deploy --prod',
    'npm publish',
    'git push origin main',
    'git push origin master'
  ].freeze

  BYPASS_ENV = %w[DCG_BYPASS DCG_DISABLE].freeze

  def self.load_catalog!(path)
    require 'yaml'
    data = YAML.safe_load(File.read(path), aliases: false)
    raise Denial.new('COMMAND_ENTRY_INVALID', 'catálogo sem chave comandos') unless data.is_a?(Hash) && data['comandos'].is_a?(Hash)

    commands = data['comandos']
    raise Denial.new('COMMAND_ENTRY_INVALID', 'catálogo deve ter exatamente 5 comandos') unless commands.keys.sort == CANONICAL_IDS.sort

    commands.each do |id, entry|
      validate_entry!(id, entry)
    end
    commands
  end

  def self.validate_entry!(id, entry)
    unless entry.is_a?(Hash) && entry.keys == ['argv']
      raise Denial.new('COMMAND_ENTRY_INVALID', "entrada inválida para #{id}: apenas chave argv permitida")
    end
    argv = entry['argv']
    unless argv.is_a?(Array) && !argv.empty? && argv.all? { |a| a.is_a?(String) }
      raise Denial.new('COMMAND_ENTRY_INVALID', "argv inválido para #{id}: deve ser array de strings")
    end
    scan_argv!(argv)
  end

  def self.resolve_argv!(catalog, id)
    deny_bypass_env!
    raise Denial.new('COMMAND_NOT_IN_CATALOG', "command not in catalog: #{id}") unless catalog.key?(id)

    entry = catalog[id]
    validate_entry!(id, entry)
    argv = entry['argv']
    scan_argv!(argv)
    argv.dup
  end

  def self.scan_argv!(argv)
    raise Denial.new('COMMAND_ENTRY_INVALID', 'argv vazio') if argv.nil? || argv.empty?

    first = argv.first.to_s
    if SHELL_WRAPPERS.include?(first) || first.end_with?('/bash') || first.end_with?('/sh') || first.end_with?('/zsh')
      raise Denial.new('COMMAND_SHELL_WRAPPER_DENIED', "shell wrapper negado: #{first}")
    end

    argv.each do |arg|
      s = arg.to_s
      if s.match?(METACHAR_PATTERN)
        raise Denial.new('COMMAND_METACHARACTER_DENIED', "metacaractere negado em argumento: #{s.inspect}")
      end
      if %w[-c -lc --command].include?(s)
        raise Denial.new('COMMAND_SHELL_WRAPPER_DENIED', "flag de shell negada: #{s}")
      end
    end

    joined = argv.join(' ').downcase
    DESTRUCTIVE_SUBSTRINGS.each do |bad|
      if joined.include?(bad)
        raise Denial.new('COMMAND_DESTRUCTIVE_DENIED', "padrão destrutivo negado: #{bad}")
      end
    end
  end

  def self.assert_no_extra_args!(canonical_argv, provided_argv)
    unless provided_argv == canonical_argv
      raise Denial.new('COMMAND_ARGUMENT_MISMATCH', 'argumentos não batem com o catálogo')
    end
  end

  def self.deny_bypass_env!
    present = BYPASS_ENV.select { |k| !ENV[k].nil? && !ENV[k].to_s.empty? }
    return if present.empty?

    raise Denial.new('DCG_BYPASS_ENV', "variável de bypass presente: #{present.join(',')}")
  end
end
