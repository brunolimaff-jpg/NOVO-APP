#!/usr/bin/env ruby
# frozen_string_literal: true

require 'tmpdir'
require 'fileutils'
require_relative './validate-codex-harness-policy'

def write(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

def pass!(label)
  puts "PASS #{label}"
end

def expect_error(label, pattern)
  begin
    yield
  rescue RuntimeError => error
    unless pattern === error.message
      raise "#{label}: unexpected error: #{error.message.inspect}"
    end
    puts "PASS #{label}"
    return
  end
  raise "#{label}: expected validation error"
end

CANONICAL_CONFIG = <<~TOML
  # Configuração Codex project-scoped — Senior Scout 360
  # Esta config mescla com ~/.codex/config.toml global.

  [agents]
  max_threads = 3
  max_depth = 1
TOML

CANONICAL_AGENTS = <<~MD
  # AGENTS.md

  ## Orçamento de subagentes

  - Máximo operacional padrão: 2 filhos por missão.
  - Orchestration: 57 testes.
MD

CANONICAL_HANDOFF = <<~MD
  Multi-Agent V2 não é tratado como roteador confiável até prova de runtime.
MD

CANONICAL_DECISIONS = <<~MD
  ### DI: Multi-Agent V2 não é tratado como roteador confiável até prova de runtime
MD

CANONICAL_ADAPTERS = <<~MD
  No Multi-Agent V2 tool-backed, o runtime pode ignorar agente/modelo.
  Multi-Agent V2 não é tratado como roteador confiável até prova de runtime.
MD

CANONICAL_BENCHMARK = <<~MD
  SUPPORTED
  PARTIAL
  UNRELIABLE
  BLOCKED_BY_HARNESS
  BLOCKED_BY_QUOTA
  NOT_EXECUTED
MD

def seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG)
  write(File.join(dir, 'AGENTS.md'), CANONICAL_AGENTS)
  write(File.join(dir, 'HANDOFF_AI.md'), CANONICAL_HANDOFF)
  write(File.join(dir, '.agents/memory/decisions.md'), CANONICAL_DECISIONS)
  write(File.join(dir, '.agents/adaptadores/README.md'), CANONICAL_ADAPTERS)
  write(File.join(dir, 'docs/benchmarks/codex-harness-5.6.md'), CANONICAL_BENCHMARK)
end

tests = []

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  CodexHarnessPolicy.validate!(root: dir)
  pass!('canonical configuration passes')
  tests << 'canonical-pass'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG.sub('max_threads = 3', 'max_threads = 6'))
  expect_error('max_threads=6 fails', /max_threads must be 3/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'max-threads-6'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG.sub('max_depth = 1', 'max_depth = 2'))
  expect_error('max_depth>1 fails', /max_depth must be 1/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'max-depth-gt-1'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\n[features.multi_agent_v2]\nhide_spawn_agent_metadata = false\n")
  expect_error('multi_agent_v2 key fails', /forbidden experimental key present: multi_agent_v2/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'multi-agent-v2'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\n# evitar multi_agent_v2 nesta fase\n")
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('comment containing multi_agent_v2 passes')
  tests << 'comment-multi-agent-v2'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\nnote = \"do not enable multi_agent_v2\"\n")
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('string containing multi_agent_v2 passes')
  tests << 'string-multi-agent-v2'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\n[nested.section]\nmulti_agent_v2 = true\n")
  expect_error('nested multi_agent_v2 key fails', /forbidden experimental key present: multi_agent_v2/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'nested-multi-agent-v2'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\nmodel_context_window = 128000\n")
  expect_error('fixed context window fails', /forbidden experimental key present: model_context_window/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'context-window'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\njob_max_runtime_seconds = 600\n")
  expect_error('job_max_runtime_seconds fails', /forbidden experimental key present: job_max_runtime_seconds/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'job-max-runtime'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3 # teto operacional
      max_depth = 1 # sem netos
    TOML
  )
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('integer with trailing comment passes')
  tests << 'trailing-comment-int'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      enabled = true # ok
    TOML
  )
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('boolean with trailing comment passes')
  tests << 'trailing-comment-bool'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      label = "keep # inside"
    TOML
  )
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('string with internal hash passes')
  tests << 'string-internal-hash'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      label = 'single-quoted'
    TOML
  )
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('single-quoted string passes')
  tests << 'single-quoted'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      not-a-valid-assignment
      max_depth = 1
    TOML
  )
  expect_error('invalid toml line fails', /invalid toml line/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'invalid-toml-line'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'AGENTS.md'), CANONICAL_AGENTS + "\n<claude-mem-context>\nold\n</claude-mem-context>\n")
  expect_error('claude-mem-context fails', /claude-mem-context/) do
    CodexHarnessPolicy.validate_agents_md!(root: dir)
  end
  tests << 'claude-mem'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'AGENTS.md'), "# AGENTS.md\n\nSem orçamento.\n")
  expect_error('missing budget policy fails', /Orçamento de subagentes/) do
    CodexHarnessPolicy.validate_agents_md!(root: dir)
  end
  tests << 'missing-budget'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'AGENTS.md'), CANONICAL_AGENTS + "\nScripts: scripts/test-agent-orchestration.rb (35 tests).\n")
  expect_error('stale 35 orchestration tests fails', /35 orchestration tests/) do
    CodexHarnessPolicy.validate_agents_md!(root: dir)
  end
  tests << 'stale-35'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'AGENTS.md'), CANONICAL_AGENTS + "\nUnrelated note: suite X has (35 tests).\n")
  CodexHarnessPolicy.validate_agents_md!(root: dir)
  pass!('unrelated 35 tests passes')
  tests << 'unrelated-35'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'HANDOFF_AI.md'), "Sem menção ao harness.\n")
  write(File.join(dir, '.agents/memory/decisions.md'), "Sem decisão.\n")
  write(File.join(dir, '.agents/adaptadores/README.md'), "Sem V2.\n")
  expect_error('missing V2 untrusted docs fails', /Multi-Agent V2|untrusted/) do
    CodexHarnessPolicy.validate_docs_trust_boundary!(root: dir)
  end
  tests << 'docs-untrusted'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, 'HANDOFF_AI.md'), "Multi-Agent V2 nao e confiavel ate prova.\n")
  write(File.join(dir, '.agents/memory/decisions.md'), "ok\n")
  write(File.join(dir, '.agents/adaptadores/README.md'), "ok\n")
  CodexHarnessPolicy.validate_docs_trust_boundary!(root: dir)
  pass!('accent-tolerant V2 wording passes')
  tests << 'docs-accent-tolerant'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(File.join(dir, '.codex/config.toml'), CANONICAL_CONFIG + "\nfast_mode = true\n")
  expect_error('fast_mode fails', /forbidden experimental key present: fast_mode/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'fast-mode'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      [features]
      "multi_agent_v2" = true
    TOML
  )
  expect_error('double-quoted forbidden key fails', /quoted TOML keys are unsupported/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'quoted-key-double'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      [features]
      'multi_agent_v2' = true
    TOML
  )
  expect_error('single-quoted forbidden key fails', /quoted TOML keys are unsupported/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'quoted-key-single'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      [features."multi_agent_v2"]
      enabled = true
    TOML
  )
  expect_error('quoted table segment fails', /quoted TOML keys are unsupported/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'quoted-table-segment'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      ["features.multi_agent_v2"]
      enabled = true
    TOML
  )
  expect_error('fully quoted table header fails', /quoted TOML keys are unsupported/) do
    CodexHarnessPolicy.validate_config!(root: dir)
  end
  tests << 'quoted-table-full'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  write(
    File.join(dir, '.codex/config.toml'),
    <<~TOML
      [agents]
      max_threads = 3
      max_depth = 1
      description = "texto com multi_agent_v2"
      note = 'texto'
    TOML
  )
  CodexHarnessPolicy.validate_config!(root: dir)
  pass!('normal quoted values pass')
  tests << 'quoted-values-ok'
end

Dir.mktmpdir('codex-harness-policy') do |dir|
  seed_docs!(dir)
  FileUtils.rm_f(File.join(dir, 'docs/benchmarks/codex-harness-5.6.md'))
  expect_error('missing benchmark doc fails', /missing docs\/benchmarks\/codex-harness-5.6.md/) do
    CodexHarnessPolicy.validate_benchmark_doc!(root: dir)
  end
  tests << 'missing-benchmark'
end

puts "OK #{tests.size} codex harness policy tests"
raise "expected at least 10 tests, got #{tests.size}" if tests.size < 10
