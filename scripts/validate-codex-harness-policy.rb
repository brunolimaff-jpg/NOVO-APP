#!/usr/bin/env ruby
# frozen_string_literal: true

# validate-codex-harness-policy.rb — Política conservadora do harness Codex (Fase 3B.1.5).
#
# Fail-closed: qualquer violação = exit 1.

module CodexHarnessPolicy
  REPO_ROOT = File.expand_path('..', __dir__)

  FORBIDDEN_CONFIG_KEYS = %w[
    multi_agent_v2
    hide_spawn_agent_metadata
    tool_namespace
    expose_spawn_agent_model_overrides
    model_context_window
    model_auto_compact_token_limit
    job_max_runtime_seconds
    fast_mode
    service_tier
  ].freeze

  # Only flag "35 tests/testes" when clearly about orchestration.
  STALE_ORCH_COUNTS = [
    /35\s+testes?\s+de\s+orquestra/i,
    /test-agent-orchestration\.rb[^\n]{0,80}35\s+tests?/i,
    /35\s+tests?[^\n]{0,80}test-agent-orchestration\.rb/i,
    /Agent Orchestration[^\n]{0,80}35\s+tests?/i,
    /35\s+tests?[^\n]{0,80}Agent Orchestration/i,
    /orquestra[cç][aã]o[^\n]{0,80}35\s+tests?/i,
    /35\s+tests?[^\n]{0,80}orquestra/i
  ].freeze

  QUOTED_KEY_ERROR = 'quoted TOML keys are unsupported by the harness policy validator'
  COMPOSITE_VALUE_ERROR = 'composite TOML values are unsupported by the harness policy validator'
  DOTTED_ASSIGNMENT_ERROR = 'dotted TOML assignment keys are unsupported by the harness policy validator'
  INVALID_TABLE_HEADER_ERROR = 'invalid TOML table header'

  module_function

  def fail!(msg)
    raise RuntimeError, msg
  end

  # Fail-closed: quoted assignment keys and quoted table-header segments are unsupported.
  def reject_quoted_key!(token)
    fail!(QUOTED_KEY_ERROR) if token.include?('"') || token.include?("'")
  end

  def reject_dotted_assignment_key!(key)
    fail!(DOTTED_ASSIGNMENT_ERROR) if key.include?('.')
  end

  def reject_composite_value!(value)
    return if value.start_with?('"') || value.start_with?("'")

    fail!(COMPOSITE_VALUE_ERROR) if value.start_with?('{') || value.start_with?('[')
  end

  def parse_table_header!(header)
    reject_quoted_key!(header)
    segments = header.split('.', -1).map(&:strip)
    fail!(INVALID_TABLE_HEADER_ERROR) if segments.empty? || segments.any?(&:empty?)

    segments.each { |segment| reject_quoted_key!(segment) }
    segments
  end

  # Strip a trailing # comment unless the # is inside a quoted string.
  def strip_trailing_comment(value)
    in_single = false
    in_double = false
    value.chars.each_with_index do |ch, idx|
      if ch == '"' && !in_single
        in_double = !in_double
      elsif ch == "'" && !in_double
        in_single = !in_single
      elsif ch == '#' && !in_single && !in_double
        return value[0...idx].rstrip
      end
    end
    value
  end

  # Minimal TOML reader for the flat/project shapes used here.
  def parse_simple_toml(text)
    result = {}
    current = result
    text.each_line do |raw|
      line = raw.strip
      next if line.empty? || line.start_with?('#')

      if line =~ /\A\[([^\]]+)\]\z/
        path = parse_table_header!(Regexp.last_match(1))
        current = result
        path.each do |part|
          current[part] ||= {}
          current = current[part]
        end
        next
      end

      key, value = line.split('=', 2)
      fail!("invalid toml line: #{line}") unless key && value

      key = key.strip
      reject_quoted_key!(key)
      reject_dotted_assignment_key!(key)
      value = strip_trailing_comment(value.strip)
      fail!("invalid toml line: #{line}") if value.empty?
      reject_composite_value!(value)

      parsed =
        if value.match?(/\A\d+\z/)
          value.to_i
        elsif value == 'true'
          true
        elsif value == 'false'
          false
        elsif (value.start_with?('"') && value.end_with?('"')) ||
              (value.start_with?("'") && value.end_with?("'"))
          value[1..-2]
        else
          value
        end
      current[key] = parsed
    end
    result
  end

  def each_parsed_key(node, &block)
    return unless node.is_a?(Hash)

    node.each do |key, value|
      block.call(key.to_s)
      each_parsed_key(value, &block)
    end
  end

  def reject_forbidden_keys!(data)
    each_parsed_key(data) do |key|
      fail!("forbidden experimental key present: #{key}") if FORBIDDEN_CONFIG_KEYS.include?(key)
    end
  end

  def validate_config!(root: REPO_ROOT, config_text: nil)
    path = File.join(root, '.codex', 'config.toml')
    text = config_text
    if text.nil?
      fail!('missing .codex/config.toml') unless File.file?(path)
      text = File.read(path)
    end
    fail!('missing .codex/config.toml') if text.strip.empty?

    data = parse_simple_toml(text)
    reject_forbidden_keys!(data)

    agents = data['agents']
    fail!('missing [agents] section') unless agents.is_a?(Hash)
    fail!("max_threads must be 3, got #{agents['max_threads'].inspect}") unless agents['max_threads'] == 3
    fail!("max_depth must be 1, got #{agents['max_depth'].inspect}") unless agents['max_depth'] == 1
    true
  end

  def validate_agents_md!(root: REPO_ROOT, agents_text: nil)
    path = File.join(root, 'AGENTS.md')
    text = agents_text
    if text.nil?
      fail!('missing AGENTS.md') unless File.file?(path)
      text = File.read(path)
    end
    fail!('AGENTS.md contains obsolete <claude-mem-context> block') if text.include?('<claude-mem-context>')
    fail!('AGENTS.md missing Orçamento de subagentes policy') unless text.include?('## Orçamento de subagentes')
    fail!('AGENTS.md missing max 2 children policy') unless text.include?('Máximo operacional padrão: 2 filhos por missão')
    STALE_ORCH_COUNTS.each do |pat|
      fail!('AGENTS.md still claims 35 orchestration tests') if text.match?(pat)
    end
    true
  end

  def validate_docs_trust_boundary!(root: REPO_ROOT)
    required = [
      File.join(root, 'HANDOFF_AI.md'),
      File.join(root, '.agents', 'memory', 'decisions.md'),
      File.join(root, '.agents', 'adaptadores', 'README.md')
    ]
    required.each { |p| fail!("missing #{p}") unless File.file?(p) }
    texts = required.map { |p| File.read(p) }.join("\n")

    unless texts.match?(/Multi-Agent V2/i) &&
           texts.match?(/n[aã]o[^\n]{0,120}confi[aá]vel/i)
      fail!('documentation must record Multi-Agent V2 as untrusted until runtime proof')
    end

    STALE_ORCH_COUNTS.each do |pat|
      fail!('docs still claim 35 orchestration tests') if texts.match?(pat)
    end
    true
  end

  def validate_benchmark_doc!(root: REPO_ROOT)
    path = File.join(root, 'docs', 'benchmarks', 'codex-harness-5.6.md')
    fail!('missing docs/benchmarks/codex-harness-5.6.md') unless File.file?(path)
    text = File.read(path)
    %w[SUPPORTED PARTIAL UNRELIABLE BLOCKED_BY_HARNESS BLOCKED_BY_QUOTA NOT_EXECUTED].each do |klass|
      fail!("benchmark doc missing classification #{klass}") unless text.include?(klass)
    end
    true
  end

  def validate!(root: REPO_ROOT)
    validate_config!(root: root)
    validate_agents_md!(root: root)
    validate_docs_trust_boundary!(root: root)
    validate_benchmark_doc!(root: root)
    {
      max_threads: 3,
      max_depth: 1
    }
  end
end

if $PROGRAM_NAME == __FILE__
  result = CodexHarnessPolicy.validate!
  puts 'OK .codex/config.toml (max_threads=3, max_depth=1)'
  puts 'OK AGENTS.md (no claude-mem-context; budget policy present)'
  puts 'OK Multi-Agent V2 documented as untrusted until runtime proof'
  puts 'OK benchmark protocol present'
  puts "OK harness policy (threads=#{result[:max_threads]}, depth=#{result[:max_depth]})"
end
