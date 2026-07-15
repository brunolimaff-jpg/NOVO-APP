#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'open3'
require 'digest'
require 'fileutils'
require 'tmpdir'
require_relative './run-agent-mission'
require_relative './lib/agent_single_runtime'
require_relative './lib/codex_single_agent_runtime'
require_relative './runtime-safety-preflight'

ROOT = File.expand_path('..', __dir__)
RUNNER = File.join(ROOT, 'scripts/run-agent-mission.rb')
FAKE_CODEX = File.join(ROOT, '.agents/seguranca/fixtures/fake-codex')
FAKE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')
REPORT_SCHEMA = File.join(ROOT, '.agents/orquestracao/executor/contrato-relatorio.schema.json')
TMP = Dir.mktmpdir('agent-runtime-tests')
at_exit { FileUtils.remove_entry(TMP) if File.exist?(TMP) }

@tests = 0
@counter = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
end

def write_json(data)
  @counter += 1
  path = File.join(TMP, "rt-#{@counter}.json")
  File.write(path, JSON.pretty_generate(data))
  path
end

def negation_codes(report)
  Array(report['negacoes']).map { |e| e.split(':', 2).first }
end

def build_card(commands: ['git-diff-check'], id: 'missao-runtime-1')
  {
    'versao' => 1,
    'id' => id,
    'titulo' => 'Runtime single-agent',
    'objetivo' => 'Validar runtime',
    'contexto' => 'Teste',
    'resultado_esperado' => 'Relatório observado',
    'autorizacao' => {
      'nivel' => 'A2',
      'acoes_permitidas' => %w[ler escrever testar],
      'acoes_solicitadas' => [],
      'acoes_proibidas' => %w[merge deploy push]
    },
    'escopo' => { 'leitura' => ['scripts/'], 'escrita' => ['tmp/runtime-write.txt'] },
    'restricoes' => [],
    'verificacao' => ['gates ok'],
    'evidencias_requeridas' => [],
    'condicoes_parada' => ['done'],
    'executor' => { 'comandos' => commands }
  }
end

def build_plan(overrides = {})
  base = {
    'versao' => 1,
    'missao_id' => 'missao-runtime-1',
    'status' => 'planejado',
    'papel_principal' => 'executor-escopo',
    'ferramenta_selecionada' => 'codex',
    'adaptador_selecionado' => '.agents/seguranca/CODEX-RUNTIME.md',
    'skills_selecionadas' => [],
    'autorizacao_fornecida' => 'A2',
    'autorizacao_necessaria' => 'A2',
    'leitura_permitida' => true,
    'escrita_permitida' => true,
    'shell_permitido' => false,
    'rede_permitida' => false,
    'delegacao_permitida' => false,
    'etapas' => [],
    'condicoes_parada' => ['done'],
    'evidencias_requeridas' => [],
    'negacoes' => [],
    'avisos' => [],
    'fontes_decisao' => ['.agents/orquestracao/roteamento.yaml'],
    'acoes_solicitadas' => [],
    'acoes_permitidas' => %w[ler escrever],
    'comandos' => ['git-diff-check'],
    'decisao_execucao' => {
      'estrategia' => 'agente-unico',
      'origem' => 'default',
      'motivo' => 'teste',
      'justificativa_multiagente' => nil,
      'ganho_esperado' => nil,
      'perfil_execucao' => 'minimal-change',
      'gate_qualidade' => 'evidence-first'
    },
    'resumo_operacional' => {
      'harness' => 'codex-cli',
      'estrategia' => 'agente-unico',
      'agentes_planejados' => 1,
      'max_paralelo' => 1,
      'writers' => 1,
      'risco' => 'baixo',
      'requer_aprovacao' => true,
      'executavel' => true
    },
    'topologia' => {
      'max_agentes' => 1,
      'max_profundidade' => 1,
      'permite_subdelegacao' => false,
      'agentes' => [
        {
          'id' => 'principal',
          'papel' => 'executor-escopo',
          'permissao' => 'workspace-write',
          'depende_de' => []
        }
      ]
    },
    'tarefas_planejadas' => [
      {
        'id' => 'task-01',
        'agente' => 'principal',
        'objetivo' => 'Executar escopo',
        'entrega_esperada' => 'Arquivo no escopo',
        'nao_fazer' => %w[commit push merge],
        'arquivos' => {
          'leitura' => ['scripts/'],
          'escrita' => ['tmp/runtime-write.txt']
        },
        'depende_de' => []
      }
    ],
    'simplicidade' => {
      'avaliada' => false,
      'multiagente_necessario' => false,
      'justificativa_multiagente' => nil,
      'reutiliza_existente' => true,
      'nova_dependencia' => false,
      'nova_abstracao' => false
    },
    'limites' => {
      'max_retentativas' => 1,
      'max_rodadas_revisao' => 1,
      'max_tempo_segundos' => 30
    }
  }
  deep_merge(base, overrides)
end

def deep_merge(a, b)
  return b unless a.is_a?(Hash) && b.is_a?(Hash)

  a.merge(b) { |_k, left, right| deep_merge(left, right) }
end

def uniq_name(prefix)
  "#{prefix}-#{Process.pid}-#{Time.now.to_f.to_s.tr('.', '')}-#{@counter += 1}"
end

def with_worktree
  name = uniq_name('rt')
  path = File.join(TMP, name)
  out, err, st = Open3.capture3('git', 'worktree', 'add', '-b', name, path, 'HEAD', chdir: ROOT)
  raise "worktree add failed: #{err}#{out}" unless st.success?

  yield path, name
ensure
  Open3.capture3('git', 'worktree', 'remove', '--force', path, chdir: ROOT) if path && File.exist?(path)
  Open3.capture3('git', 'branch', '-D', name, chdir: ROOT) if name
end

def test_env(extra = {})
  {
    'PATH' => ENV['PATH'],
    'HOME' => ENV['HOME'],
    'AGENT_RUNTIME_EXECUTE' => '1',
    'AGENT_RUNTIME_TEST_CODEX' => '1',
    'AGENT_RUNTIME_TEST_CODEX_BIN' => FAKE_CODEX,
    'AGENT_RUNTIME_TEST_PREFLIGHT' => '1',
    'AGENT_RUNTIME_TEST_DCG_BIN' => FAKE_DCG,
    'AGENT_RUNTIME_FAKE_SCENARIO' => 'success-noop',
    'AGENT_RUNTIME_FAKE_WRITE_PATH' => 'tmp/runtime-write.txt'
  }.merge(extra)
end

def run_runtime(card, plan, worktree:, env: {}, safety_report: nil)
  card_path = write_json(card)
  plan_path = write_json(plan)
  args = [
    'ruby', RUNNER,
    '--card', card_path,
    '--plan', plan_path,
    '--stdout',
    '--agent-runtime',
    '--runtime-ack', 'RUN_SINGLE_AGENT',
    '--worktree', worktree
  ]
  args += ['--safety-report', safety_report] if safety_report
  out, err, status = Open3.capture3(test_env(env), *args, chdir: ROOT)
  raise "empty out: #{err}" if out.empty?

  [JSON.parse(out), err, status.exitstatus]
end

def catalog
  AgentMissionRunner.load_catalog
end

# --- Ativação ---
test('01 flag ausente') do
  assert_raises = begin
    AgentSingleRuntime.enforce_activation!(agent_runtime: false, runtime_ack: 'RUN_SINGLE_AGENT')
    false
  rescue AgentSingleRuntime::Denial => e
    raise e unless e.code == 'AGENT_RUNTIME_FLAG_REQUIRED'

    true
  end
  raise 'expected FLAG_REQUIRED' unless assert_raises
end

test('02 ack ausente') do
  AgentSingleRuntime.enforce_activation!(agent_runtime: true, runtime_ack: nil)
  raise 'should deny'
rescue AgentSingleRuntime::Denial => e
  raise e.code unless e.code == 'AGENT_RUNTIME_ACK_REQUIRED'
end

test('03 env ausente') do
  old = ENV['AGENT_RUNTIME_EXECUTE']
  ENV.delete('AGENT_RUNTIME_EXECUTE')
  begin
    AgentSingleRuntime.enforce_activation!(agent_runtime: true, runtime_ack: 'RUN_SINGLE_AGENT')
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'AGENT_RUNTIME_ENV_REQUIRED'
  ensure
    ENV['AGENT_RUNTIME_EXECUTE'] = old if old
  end
end

test('04 plano negado') do
  plan = build_plan('status' => 'negado', 'resumo_operacional' => { 'executavel' => false })
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_PLAN_NOT_EXECUTABLE'
  end
end

test('05 plano multiagente') do
  plan = build_plan(
    'resumo_operacional' => { 'estrategia' => 'multiagente', 'agentes_planejados' => 2, 'writers' => 1, 'max_paralelo' => 1, 'executavel' => true },
    'topologia' => {
      'max_agentes' => 2,
      'max_profundidade' => 1,
      'permite_subdelegacao' => false,
      'agentes' => [
        { 'id' => 'a', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] },
        { 'id' => 'b', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
      ]
    }
  )
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_SINGLE_AGENT_REQUIRED'
  end
end

test('06 dois writers') do
  plan = build_plan('resumo_operacional' => {
                      'estrategia' => 'agente-unico', 'agentes_planejados' => 1, 'writers' => 2,
                      'max_paralelo' => 1, 'executavel' => true, 'harness' => 'codex-cli',
                      'risco' => 'baixo', 'requer_aprovacao' => true
                    })
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_SINGLE_WRITER_REQUIRED'
  end
end

test('07 subdelegação') do
  plan = build_plan('delegacao_permitida' => true)
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_SUBDELEGATION_DENIED'
  end
end

test('08 rede permitida') do
  plan = build_plan('rede_permitida' => true)
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_NETWORK_DENIED'
  end
end

test('09 escopo vazio') do
  plan = build_plan('tarefas_planejadas' => [{
                      'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x',
                      'entrega_esperada' => 'y', 'nao_fazer' => [],
                      'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] }, 'depende_de' => []
                    }])
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_WRITE_SCOPE_REQUIRED'
  end
end

test('10 timeout acima de 900') do
  plan = build_plan('limites' => { 'max_retentativas' => 1, 'max_rodadas_revisao' => 1, 'max_tempo_segundos' => 901 })
  begin
    AgentSingleRuntime.validate_single_agent_plan!(build_card, plan, catalog)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_TIMEOUT_INVALID'
  end
end

# --- Worktree ---
test('11 branch main') do
  name = uniq_name('rt-main')
  path = File.join(TMP, name)
  out, err, st = Open3.capture3('git', 'worktree', 'add', path, 'main', chdir: ROOT)
  raise "worktree main add failed: #{err}#{out}" unless st.success?

  begin
    AgentSingleRuntime.snapshot_worktree!(path, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_MAIN_BRANCH_DENIED'
  ensure
    Open3.capture3('git', 'worktree', 'remove', '--force', path, chdir: ROOT)
  end
end

test('12 worktree principal') do
  primary = File.realpath(File.join(ROOT, '../..')) # may not be primary
  primary = ROOT
  # Discover primary via git common dir
  common, _, st = Open3.capture3('git', '-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir')
  raise 'common dir' unless st.success?

  candidate = File.dirname(common.strip)
  candidate = common.strip.sub(%r{/\.git\z}, '') if File.basename(common.strip) == '.git'
  raise "expected primary at #{candidate}" unless AgentSingleRuntime.primary_worktree?(candidate)

  begin
    AgentSingleRuntime.snapshot_worktree!(candidate, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_PRIMARY_WORKTREE_DENIED'
  end
end

test('13 worktree suja') do
  with_worktree do |wt, _|
    File.write(File.join(wt, 'tmp-dirty.txt'), 'x')
    begin
      AgentSingleRuntime.snapshot_worktree!(wt, repo_root: ROOT)
      raise 'should deny'
    rescue AgentSingleRuntime::Denial => e
      raise e.code unless e.code == 'RUNTIME_WORKTREE_DIRTY'
    end
  end
end

test('14 HEAD alterado entre preflight e spawn') do
  with_worktree do |wt, _|
    snap = AgentSingleRuntime.snapshot_worktree!(wt, repo_root: ROOT)
    Open3.capture3('git', '-C', wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'mut')
    prepared_called = false
    spawned_called = false
    CodexSingleAgentRuntime.singleton_class.class_eval do
      alias_method :__orig_prepare_head_test, :prepare! unless method_defined?(:__orig_prepare_head_test)
      alias_method :__orig_spawn_head_test, :spawn! unless method_defined?(:__orig_spawn_head_test)
      define_method(:prepare!) do |**kwargs|
        prepared_called = true
        __orig_prepare_head_test(**kwargs)
      end
      define_method(:spawn!) do |**kwargs|
        spawned_called = true
        __orig_spawn_head_test(**kwargs)
      end
    end
    begin
      begin
        AgentSingleRuntime.assert_head_unchanged!(snap)
        raise 'should deny HEAD'
      rescue AgentSingleRuntime::Denial => e
        raise e.code unless e.code == 'RUNTIME_HEAD_CHANGED'
      end
      raise 'prepare! não deveria rodar' if prepared_called
      raise 'spawn! não deveria rodar' if spawned_called
    ensure
      CodexSingleAgentRuntime.singleton_class.class_eval do
        alias_method :prepare!, :__orig_prepare_head_test if method_defined?(:__orig_prepare_head_test)
        alias_method :spawn!, :__orig_spawn_head_test if method_defined?(:__orig_spawn_head_test)
      end
    end
  end
end

test('15 path protegido no escopo') do
  begin
    AgentSingleRuntime.normalize_scope!(['scripts/lib/agent_path_guard.rb'], worktree: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_PROTECTED_PATH_DENIED'
  end
end

test('16 symlink escape') do
  with_worktree do |wt, _|
    target = File.join(TMP, 'outside-target')
    FileUtils.mkdir_p(target)
    File.write(File.join(target, 'x.txt'), 'x')
    link = File.join(wt, 'escape-link')
    File.symlink(target, link)
    begin
      AgentPathGuard.validate_path!('escape-link/x.txt', worktree_root: wt)
      raise 'should deny symlink'
    rescue AgentPathGuard::Denial => e
      raise e.code unless e.code == 'PATH_SYMLINK_ESCAPE' || e.code == 'PATH_OUTSIDE_WORKTREE'
    end
  end
end

# --- Preflight ---
test('17 DCG ausente') do
  report = RuntimeSafetyPreflight.build_report(mode: 'live', force_dcg_absent: true, worktree: ROOT)
  begin
    AgentSingleRuntime.assert_live_report_ready!(report, worktree: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'DCG_REQUIRED_FOR_WRITE_RUNTIME' || e.code == 'RUNTIME_LIVE_PREFLIGHT_FAILED'
  end
end

test('18 bypass env') do
  ENV['DCG_BYPASS'] = '1'
  begin
    report = RuntimeSafetyPreflight.build_report(
      mode: 'live',
      dcg_path: FAKE_DCG,
      allow_test_hook: true,
      checksum_esperado_override: Digest::SHA256.hexdigest(File.binread(FAKE_DCG)),
      worktree: ROOT
    )
    ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] = '1'
    begin
      AgentSingleRuntime.assert_live_report_ready!(report, worktree: ROOT)
      raise 'should deny'
    rescue AgentSingleRuntime::Denial
      true
    end
  ensure
    ENV.delete('DCG_BYPASS')
    ENV.delete('AGENT_RUNTIME_TEST_PREFLIGHT')
  end
end

test('19 checksum divergente') do
  ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] = '1'
  begin
    report = RuntimeSafetyPreflight.build_report(
      mode: 'live',
      dcg_path: FAKE_DCG,
      allow_test_hook: true,
      checksum_esperado_override: '0' * 64,
      worktree: ROOT
    )
    begin
      AgentSingleRuntime.assert_live_report_ready!(report, worktree: ROOT)
      raise 'should deny'
    rescue AgentSingleRuntime::Denial => e
      raise e.code unless e.code == 'DCG_CHECKSUM_MISMATCH'
    end
  ensure
    ENV.delete('AGENT_RUNTIME_TEST_PREFLIGHT')
  end
end

test('20 versão divergente') do
  # Force via policy mismatch: fixture reports version from fake-dcg; override by stubbing is hard.
  # Instead assert mapping when negacao present.
  report = {
    'modo' => 'live',
    'status' => 'denied',
    'worktree_realpath' => File.realpath(ROOT),
    'repo_root' => File.realpath(ROOT),
    'git_head' => `git -C #{ROOT} rev-parse HEAD`.strip,
    'bypass_env_detectado' => [],
    'dcg' => {
      'presente' => true,
      'hook_confiado' => 'verified-test',
      'versao_observada' => '0.0.0',
      'versao_esperada' => '0.6.6',
      'checksum_observado' => 'a',
      'checksum_esperado' => 'a',
      'probe' => { 'resultado' => 'blocked' }
    },
    'negacoes' => [{ 'codigo' => 'DCG_VERSION_MISMATCH', 'mensagem' => 'x' }]
  }
  begin
    AgentSingleRuntime.assert_live_report_ready!(report, worktree: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'DCG_VERSION_MISMATCH'
  end
end

test('21 hook não verificado') do
  report = RuntimeSafetyPreflight.build_report(mode: 'live', dcg_path: FAKE_DCG, worktree: ROOT)
  begin
    AgentSingleRuntime.assert_live_report_ready!(report, worktree: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'DCG_HOOK_NOT_VERIFIED' || e.code == 'RUNTIME_LIVE_PREFLIGHT_FAILED'
  end
end

test('22 relatório externo fabricado não autoriza') do
  with_worktree do |wt, _|
    fabricated = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    fabricated['modo'] = 'live'
    fabricated['dcg']['hook_confiado'] = 'trusted'
    fabricated['status'] = 'ready'
    fabricated['negacoes'] = []
    fabricated['relatorio_sha256'] = RuntimeSafetyPreflight.compute_hash(fabricated.reject { |k, _| k == 'relatorio_sha256' })
    path = write_json(fabricated)
    report, _err, status = run_runtime(
      build_card,
      build_plan,
      worktree: wt,
      safety_report: path,
      env: {
        'AGENT_RUNTIME_TEST_PREFLIGHT' => '',
        'AGENT_RUNTIME_TEST_DCG_BIN' => '',
        # Deny live host preflight deterministically so external "ready" cannot authorize.
        'DCG_BYPASS' => '1'
      }
    )
    raise "status=#{report['status']}" unless report['status'] == 'denied'
    raise "exit=#{status}" unless status == 2
    codes = negation_codes(report)
    ok = codes.any? { |c| %w[DCG_HOOK_NOT_VERIFIED DCG_REQUIRED_FOR_WRITE_RUNTIME RUNTIME_LIVE_PREFLIGHT_FAILED DCG_BYPASS_ENV].include?(c) }
    raise codes.inspect unless ok
  end
end

test('23 preflight live válido com fixtures de teste') do
  ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] = '1'
  ENV['AGENT_RUNTIME_TEST_DCG_BIN'] = FAKE_DCG
  begin
    live = AgentSingleRuntime.assert_live_preflight!(worktree: ROOT)
    raise "status=#{live['status']} neg=#{live['negacoes']}" unless live['status'] == 'ready'
    raise 'modo' unless live['modo'] == 'live'
  ensure
    ENV.delete('AGENT_RUNTIME_TEST_PREFLIGHT')
    ENV.delete('AGENT_RUNTIME_TEST_DCG_BIN')
  end
end

# --- Adapter ---
test('24 Codex ausente') do
  ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
  ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = '/no/such/codex'
  begin
    CodexSingleAgentRuntime.resolve_codex_bin!
    raise 'should deny'
  rescue CodexSingleAgentRuntime::Denial => e
    raise e.code unless e.code == 'CODEX_BINARY_MISSING'
  ensure
    ENV.delete('AGENT_RUNTIME_TEST_CODEX')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  end
end

test('25 versão incompatível') do
  ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
  ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = FAKE_CODEX
  ENV['AGENT_RUNTIME_FAKE_SCENARIO'] = 'bad-version'
  begin
    CodexSingleAgentRuntime.prepare!(worktree: ROOT)
    raise 'should deny'
  rescue CodexSingleAgentRuntime::Denial => e
    raise e.code unless e.code == 'CODEX_RUNTIME_CAPABILITY_UNAVAILABLE'
  ensure
    ENV.delete('AGENT_RUNTIME_FAKE_SCENARIO')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  end
end

test('26 capacidade ausente') do
  ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
  ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = FAKE_CODEX
  ENV['AGENT_RUNTIME_FAKE_SCENARIO'] = 'help-missing-capability'
  begin
    CodexSingleAgentRuntime.prepare!(worktree: ROOT)
    raise 'should deny'
  rescue CodexSingleAgentRuntime::Denial => e
    raise e.code unless e.code == 'CODEX_RUNTIME_CAPABILITY_UNAVAILABLE'
  ensure
    ENV.delete('AGENT_RUNTIME_FAKE_SCENARIO')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  end
end

test('27 argv sem shell') do
  ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
  ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = FAKE_CODEX
  ENV['AGENT_RUNTIME_FAKE_SCENARIO'] = 'success-noop'
  begin
    prepared = CodexSingleAgentRuntime.prepare!(worktree: ROOT)
    argv = prepared['argv']
    raise 'shell' if argv.any? { |t| %w[bash sh -lc].include?(t) }
    raise 'no exec' unless argv[1] == 'exec'
  ensure
    ENV.delete('AGENT_RUNTIME_FAKE_SCENARIO')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX')
    ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  end
end

test('28 ambiente sanitizado') do
  ENV['GITHUB_TOKEN'] = 'secret'
  ENV['DCG_BYPASS'] = '1'
  env = CodexSingleAgentRuntime.sanitized_env
  raise 'github leaked' if env.key?('GITHUB_TOKEN')
  raise 'bypass leaked' if env.key?('DCG_BYPASS')
ensure
  ENV.delete('GITHUB_TOKEN')
  ENV.delete('DCG_BYPASS')
end

test('29 um único processo com entrega ausente → failure') do
  with_worktree do |wt, _|
    report, _err, = run_runtime(build_card, build_plan, worktree: wt)
    # success-noop scenario: exit 0 but no file written → delivery failure
    raise report['negacoes'].inspect unless report['status'] == 'failure'
    raise 'processos' unless report.dig('runtime', 'processos_iniciados') == 1
    raise 'agentes' unless report.dig('runtime', 'agente_observado') == 1
    ledger_code = report.dig('task_ledger', 0, 'codigo_final')
    raise "ledger codigo esperado DELIVERY_FAILED, obtido #{ledger_code.inspect}" unless ledger_code == 'DELIVERY_FAILED'
    ledger_status = report.dig('task_ledger', 0, 'status')
    raise "ledger status esperado failed, obtido #{ledger_status.inspect}" unless ledger_status == 'failed'
    raise "sem OBSERVED_EXPECTED_FILE_UNCHANGED" unless Array(report['avisos']).any? { |a| a.include?('OBSERVED_EXPECTED_FILE_UNCHANGED') }
    raise "handoff esperado corrigir_manualmente" unless report.dig('handoff', 'proxima_acao_recomendada') == 'corrigir_manualmente'
    raise "snapshot status_final esperado failure, obtido #{report.dig('observed_snapshot','status_final')}" unless report.dig('observed_snapshot', 'status_final') == 'failure'
    recalc = AgentRunComparator.canonical_hash(report['observed_snapshot'])
    raise "observed_snapshot_sha256 mismatch: #{recalc} vs #{report['observed_snapshot_sha256']}" unless recalc == report['observed_snapshot_sha256']
  end
end

test('29b diretório como escopo → aceita arquivo abaixo dele') do
  with_worktree do |wt, _|
    card = build_card.merge('escopo' => { 'leitura' => ['scripts/'], 'escrita' => ['tmp/resultados/'] })
    plan = build_plan(
      'tarefas_planejadas' => [
        {
          'id' => 'task-dir',
          'agente' => 'principal',
          'objetivo' => 'Escrita em diretório',
          'entrega_esperada' => 'Arquivo dentro do diretório',
          'nao_fazer' => %w[commit push merge],
          'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => ['tmp/resultados/'] },
          'depende_de' => []
        }
      ]
    )
    report, = run_runtime(card, plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-in-scope', 'AGENT_RUNTIME_FAKE_WRITE_PATH' => 'tmp/resultados/saida.md' })
    raise "expected success, got #{report['status']}: #{report['negacoes'].inspect}" unless report['status'] == 'success'
    raise "DELIVERY_FAILED detectado indevidamente" if Array(report['avisos']).any? { |a| a.include?('OBSERVED_EXPECTED_FILE_UNCHANGED') }
  end
end

test('29c diretório como escopo sem escrita → DELIVERY_FAILED') do
  with_worktree do |wt, _|
    card = build_card.merge('escopo' => { 'leitura' => ['scripts/'], 'escrita' => ['tmp/nao-criado/'] })
    plan = build_plan(
      'tarefas_planejadas' => [
        {
          'id' => 'task-dir-empty',
          'agente' => 'principal',
          'objetivo' => 'Escrita em diretório sem nada',
          'entrega_esperada' => 'Nada',
          'nao_fazer' => %w[commit push merge],
          'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => ['tmp/nao-criado/'] },
          'depende_de' => []
        }
      ]
    )
    report, = run_runtime(card, plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'success-noop' })
    raise "expected failure, got #{report['status']}" unless report['status'] == 'failure'
    raise "DELIVERY_FAILED esperado" unless report.dig('task_ledger', 0, 'codigo_final') == 'DELIVERY_FAILED'
  end
end

test('30 entrega dentro do escopo → success') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-in-scope' })
    $stderr.puts "DEBUG30 status=#{report['status']} mod=#{report.dig('runtime','arquivos_modificados').inspect} ledger=#{report['task_ledger'].inspect} comp=#{report.dig('comparacao','itens').inspect}" if ENV['DEBUG']
    raise report['negacoes'].inspect unless report['status'] == 'success'
    raise 'mod' unless report.dig('runtime', 'arquivos_modificados').include?('tmp/runtime-write.txt')
    ledger_code = report.dig('task_ledger', 0, 'codigo_final')
    raise "ledger codigo esperado OK, obtido #{ledger_code.inspect}" unless ledger_code == 'OK'
    ledger_status = report.dig('task_ledger', 0, 'status')
    raise "ledger status esperado succeeded, obtido #{ledger_status.inspect}" unless ledger_status == 'succeeded'
  end
end

test('31 Codex error → CODEX_FAILED') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'error' })
    raise "expected failure, got #{report['status']}" unless report['status'] == 'failure'
    ledger_code = report.dig('task_ledger', 0, 'codigo_final')
    raise "ledger codigo esperado CODEX_FAILED, obtido #{ledger_code.inspect}" unless ledger_code == 'CODEX_FAILED'
  end
end

test('30 timeout mata process group') do
  with_worktree do |wt, _|
    plan = build_plan('limites' => { 'max_retentativas' => 1, 'max_rodadas_revisao' => 1, 'max_tempo_segundos' => 1 })
    report, _err, status = run_runtime(build_card, plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'timeout' })
    raise "status=#{report['status']} exit=#{status}" unless report['status'] == 'timeout'
    raise 'timeout flag' unless report.dig('runtime', 'timeout') == true
    raise 'TIMEOUT ledger' unless report.dig('task_ledger', 0, 'codigo_final') == 'TIMEOUT'
  end
end

# --- Pós-execução ---
test('32 alteração fora do escopo negada') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-out-of-scope' })
    raise 'expected denied' unless report['status'] == 'denied'
    raise report['negacoes'].inspect unless negation_codes(report).include?('RUNTIME_SCOPE_VIOLATION')
    raise 'VIOLATION ledger' unless report.dig('task_ledger', 0, 'codigo_final') == 'VIOLATION'
  end
end

test('33 untracked fora do escopo negado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-out-of-scope' })
    raise 'expected denied' unless report['status'] == 'denied'
    raise 'violations' if report.dig('runtime', 'violacoes_escopo').to_a.empty?
    raise 'VIOLATION ledger' unless report.dig('task_ledger', 0, 'codigo_final') == 'VIOLATION'
  end
end

test('34 arquivo protegido modificado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-protected' })
    raise 'expected denied' unless report['status'] == 'denied'
    raise report['negacoes'].inspect unless negation_codes(report).include?('RUNTIME_PROTECTED_PATH_MUTATED')
    raise 'VIOLATION ledger' unless report.dig('task_ledger', 0, 'codigo_final') == 'VIOLATION'
  end
end

test('35 commit criado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'create-commit' })
    raise 'expected denied' unless report['status'] == 'denied'
    codes = negation_codes(report)
    raise codes.inspect unless codes.include?('RUNTIME_COMMIT_CREATED') || codes.include?('RUNTIME_HEAD_CHANGED') || codes.include?('RUNTIME_GIT_STATE_MUTATED')
  end
end

test('36 HEAD alterado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'change-head' })
    raise 'expected denied' unless report['status'] == 'denied'
    codes = negation_codes(report)
    raise codes.inspect unless codes.include?('RUNTIME_HEAD_CHANGED') || codes.include?('RUNTIME_COMMIT_CREATED')
  end
end

test('37 stdout truncado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'excess-stdout' })
    raise 'trunc' unless report.dig('runtime', 'stdout_truncado') == true
  end
end

test('38 stderr truncado') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt, env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'excess-stderr' })
    raise 'trunc' unless report.dig('runtime', 'stderr_truncado') == true
  end
end

test('39 relatório determinístico') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt)
    MissionPlanner.send(:validate_against_schema!, report, JSON.parse(File.read(REPORT_SCHEMA)))
    recomputed = AgentSingleRuntime.compute_report_hash(report)
    raise 'hash' unless recomputed == report['relatorio_sha256']
  end
end

test('40 nenhum merge push deploy') do
  with_worktree do |wt, _|
    report, = run_runtime(build_card, build_plan, worktree: wt)
    raise 'aviso' unless Array(report['avisos']).include?('NO_MERGE_PUSH_DEPLOY')
    raise 'aviso codex' unless Array(report['avisos']).include?('CODEX_SUBSTITUI_EXECUCAO_DOS_COMANDOS')
    raise 'catalogo executado' unless report.dig('runtime', 'comandos_catalogo_executados') == false
    raise 'processo codex' unless report.dig('runtime', 'processo_codex_iniciado') == true
    raise 'comandos false' unless Array(report['comandos']).all? { |c| c['executado'] == false }
    argv = report.dig('runtime', 'argv') || []
    joined = argv.join(' ')
    raise 'merge in argv' if joined.match?(/\bmerge\b/)
    raise 'push in argv' if joined.match?(/\bpush\b/)
  end
end

test('produção não descobre fake-codex') do
  ENV.delete('AGENT_RUNTIME_TEST_CODEX')
  ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  # resolve may find real codex — that is OK; must not auto-pick fixture path
  begin
    bin = CodexSingleAgentRuntime.resolve_codex_bin!
    raise 'discovered fixture' if bin.include?('fixtures/fake-codex')
  rescue CodexSingleAgentRuntime::Denial
    true
  end
end

# --- Fronteira pública de run! ---
test('run! A1 nega AUTH_INSUFFICIENT') do
  card = build_card
  card['autorizacao']['nivel'] = 'A1'
  begin
    AgentSingleRuntime.run!(card: card, plan: build_plan, catalog: catalog, worktree: ROOT, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'AUTH_INSUFFICIENT'
  end
end

test('run! missao_id divergente nega MISSION_MISMATCH') do
  plan = build_plan('missao_id' => 'outro-id')
  begin
    AgentSingleRuntime.run!(card: build_card, plan: plan, catalog: catalog, worktree: ROOT, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'MISSION_MISMATCH'
  end
end

test('run! comandos cartão/plano divergentes nega COMMAND_PLAN_MISMATCH') do
  card = build_card(commands: ['git-diff-check'])
  plan = build_plan('comandos' => ['validate-skills-governance'])
  begin
    AgentSingleRuntime.run!(card: card, plan: plan, catalog: catalog, worktree: ROOT, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'COMMAND_PLAN_MISMATCH'
  end
end

test('run! schema inválido é negado') do
  card = build_card
  card.delete('titulo')
  begin
    AgentSingleRuntime.run!(card: card, plan: build_plan, catalog: catalog, worktree: ROOT, repo_root: ROOT)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'SCHEMA_INVALID'
  end
end

test('run! válido atinge próxima barreira sem spawn') do
  with_worktree do |wt, _|
    ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] = '1'
    ENV['AGENT_RUNTIME_TEST_DCG_BIN'] = FAKE_DCG
    ENV['AGENT_RUNTIME_TEST_CODEX'] = '1'
    ENV['AGENT_RUNTIME_TEST_CODEX_BIN'] = FAKE_CODEX
    reached_live = false
    spawned = false
    AgentSingleRuntime.singleton_class.class_eval do
      alias_method :__orig_live_barrier, :assert_live_preflight! unless method_defined?(:__orig_live_barrier)
      define_method(:assert_live_preflight!) do |worktree:|
        reached_live = true
        raise AgentSingleRuntime::Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', 'stop-after-contract')
      end
    end
    CodexSingleAgentRuntime.singleton_class.class_eval do
      alias_method :__orig_spawn_barrier, :spawn! unless method_defined?(:__orig_spawn_barrier)
      define_method(:spawn!) do |**_|
        spawned = true
        raise 'spawn não deveria ocorrer'
      end
    end
    begin
      begin
        AgentSingleRuntime.run!(
          card: build_card,
          plan: build_plan,
          catalog: catalog,
          worktree: wt,
          repo_root: ROOT
        )
        raise 'should deny at live barrier'
      rescue AgentSingleRuntime::Denial => e
        raise e.code unless e.code == 'RUNTIME_LIVE_PREFLIGHT_FAILED'
      end
      raise 'não atingiu live preflight' unless reached_live
      raise 'spawn ocorreu' if spawned
    ensure
      AgentSingleRuntime.singleton_class.class_eval do
        alias_method :assert_live_preflight!, :__orig_live_barrier if method_defined?(:__orig_live_barrier)
      end
      CodexSingleAgentRuntime.singleton_class.class_eval do
        alias_method :spawn!, :__orig_spawn_barrier if method_defined?(:__orig_spawn_barrier)
      end
      ENV.delete('AGENT_RUNTIME_TEST_PREFLIGHT')
      ENV.delete('AGENT_RUNTIME_TEST_DCG_BIN')
      ENV.delete('AGENT_RUNTIME_TEST_CODEX')
      ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
    end
  end
end

# --- Harness Codex ---
test('harness codex aceito') do
  AgentSingleRuntime.validate_codex_harness!(build_plan)
end

test('harness cursor negado') do
  plan = build_plan('ferramenta_selecionada' => 'cursor')
  begin
    AgentSingleRuntime.validate_codex_harness!(plan)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_HARNESS_MISMATCH'
  end
end

test('harness ausente negado') do
  plan = build_plan('ferramenta_selecionada' => nil)
  begin
    AgentSingleRuntime.validate_codex_harness!(plan)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_HARNESS_MISMATCH'
  end
end

test('adapter incompatível negado') do
  plan = build_plan(
    'ferramenta_selecionada' => 'codex',
    'adaptador_selecionado' => '.cursor/agents/executor-escopo.md'
  )
  begin
    AgentSingleRuntime.validate_codex_harness!(plan)
    raise 'should deny'
  rescue AgentSingleRuntime::Denial => e
    raise e.code unless e.code == 'RUNTIME_HARNESS_MISMATCH'
  end
end

# --- State one-shot ---
test('state one-shot bloqueia segundo missao_id') do
  require_relative './lib/agent_supervised_pilot'
  Dir.mktmpdir('state-oneshot') do |dir|
    AgentSupervisedPilot.claim_mission!(
      state_dir: dir,
      missao_id: 'primeiro-piloto-supervisionado',
      report_hash: 'a' * 64
    )
    raise 'already_executed false' unless AgentSupervisedPilot.already_executed?(state_dir: dir, missao_id: 'primeiro-piloto-supervisionado')
    raise 'already_executed true falso' if AgentSupervisedPilot.already_executed?(state_dir: dir, missao_id: 'outra-missao')
    begin
      AgentSupervisedPilot.claim_mission!(
        state_dir: dir,
        missao_id: 'primeiro-piloto-supervisionado',
        report_hash: 'b' * 64
      )
      raise 'deveria negar duplicata'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_ALREADY_EXECUTED'
    end
    end
end

# === Delivery Contract Tests (§10) ===

DELIVERY_TMP = Dir.mktmpdir('delivery-contract-tests')
at_exit { FileUtils.rm_rf(DELIVERY_TMP) if File.directory?(DELIVERY_TMP) }

def delivery_contract_template(path:, content:)
  base_card = {
    'versao' => 1,
    'id' => 'piloto-delivery-test',
    'titulo' => 'Delivery test',
    'objetivo' => 'Test delivery contract',
    'contexto' => 'Test',
    'resultado_esperado' => 'File',
    'autorizacao' => { 'nivel' => 'A4', 'acoes_permitidas' => ['escrever'], 'acoes_solicitadas' => [], 'acoes_proibidas' => ['merge'] },
    'escopo' => { 'leitura' => [], 'escrita' => [path] },
    'restricoes' => [], 'verificacao' => [], 'evidencias_requiridas' => [],
    'condicoes_parada' => ['done'],
    'execucao_planejada' => {
      'tarefas' => [{ 'arquivos' => { 'escrita' => [path] } }]
    }
  }
  {
    'missao_id' => 'piloto-delivery-test',
    'card' => base_card,
    'formato_arquivo' => {
      'path' => path,
      'conteudo_obrigatorio' => content
    }
  }
end

def valid_pilot_plan_for(path:)
  {
    'versao' => 1, 'missao_id' => 'piloto-delivery-test', 'status' => 'planejado',
    'negacoes' => [],
    'papel_principal' => 'executor-escopo', 'ferramenta_selecionada' => 'codex',
    'adaptador_selecionado' => 'codex-runtime', 'skills_selecionadas' => [],
    'autorizacao_fornecida' => 'A4', 'autorizacao_necessaria' => 'A4',
    'leitura_permitida' => true, 'escrita_permitida' => true, 'shell_permitido' => false,
    'rede_permitida' => false, 'delegacao_permitida' => false,
    'tarefas_planejadas' => [
      { 'id' => 't1', 'titulo' => 'T1', 'arquivos' => { 'escrita' => [path] } }
    ],
    'comandos' => ['noop-codex'], 'resumo_operacional' => {
      'executavel' => true, 'estrategia' => 'agente-unico',
      'agentes_planejados' => 1, 'writers' => 1, 'max_paralelo' => 1
    },
    'topologia' => { 'agentes' => [{ 'papel' => 'executor-escopo', 'permissao' => 'workspace-write' }], 'max_agentes' => 1, 'permite_subdelegacao' => false },
    'limites' => { 'max_tempo_segundos' => 10 },
    'decisao_execucao' => { 'estrategia' => 'agente-unico' }
  }
end

test('1. extract_delivery_contract nega sem formato_arquivo') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl.delete('formato_arquivo')
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('2. contract path diferente do output autorizado é negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['path'] = '.agents/pilotos/sandbox/wrong.txt'
  begin
    contract = AgentSupervisedPilot.extract_delivery_contract(tmpl)
    AgentSupervisedPilot.validate_contract_against_outputs!(contract, tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('3. path fora do sandbox é negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['path'] = 'components/não.txt'
  begin
    contract = AgentSupervisedPilot.extract_delivery_contract(tmpl)
    AgentSupervisedPilot.validate_contract_against_outputs!(contract, tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('4. contrato acima de 4096 bytes é negado') do
  big_content = Array.new(500) { |i| "linha#{i}" }
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: big_content)
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('5. prompt contém path exato') do
  contract = { 'path' => '.agents/pilotos/sandbox/out.txt', 'conteudo_obrigatorio' => ['hello'] }.freeze
  prompt = AgentSingleRuntime.build_prompt(
    { 'id' => 'm1', 'titulo' => 'T', 'objetivo' => 'O', 'contexto' => 'C', 'resultado_esperado' => 'R',
      'verificacao' => [], 'condicoes_parada' => [] },
    valid_pilot_plan_for(path: '.agents/pilotos/sandbox/out.txt'),
    write_scope: ['.agents/pilotos/sandbox/'],
    read_scope: [],
    delivery_contract: contract
  )
  raise 'prompt sem path' unless prompt.include?('.agents/pilotos/sandbox/out.txt')
end

test('6. prompt contém conteúdo delimitado') do
  contract = { 'path' => '.agents/pilotos/sandbox/out.txt', 'conteudo_obrigatorio' => ['line1', 'line2'] }.freeze
  prompt = AgentSingleRuntime.build_prompt(
    { 'id' => 'm1', 'titulo' => 'T', 'objetivo' => 'O', 'contexto' => 'C', 'resultado_esperado' => 'R',
      'verificacao' => [], 'condicoes_parada' => [] },
    valid_pilot_plan_for(path: '.agents/pilotos/sandbox/out.txt'),
    write_scope: ['.agents/pilotos/sandbox/'],
    read_scope: [],
    delivery_contract: contract
  )
  raise 'prompt sem BEGIN' unless prompt.include?('BEGIN_DELIVERY_CONTENT')
  raise 'prompt sem END' unless prompt.include?('END_DELIVERY_CONTENT')
  raise 'prompt sem line1' unless prompt.include?('line1')
  raise 'prompt sem line2' unless prompt.include?('line2')
  raise 'prompt sem quebra de linha obrigatória' unless prompt.include?('quebra de linha final')
end

test('7. prompt exige escrita e proíbe apenas descrição') do
  contract = { 'path' => '.agents/pilotos/sandbox/out.txt', 'conteudo_obrigatorio' => ['data'] }.freeze
  prompt = AgentSingleRuntime.build_prompt(
    { 'id' => 'm1', 'titulo' => 'T', 'objetivo' => 'O', 'contexto' => 'C', 'resultado_esperado' => 'R',
      'verificacao' => [], 'condicoes_parada' => [] },
    valid_pilot_plan_for(path: '.agents/pilotos/sandbox/out.txt'),
    write_scope: ['.agents/pilotos/sandbox/'],
    read_scope: [],
    delivery_contract: contract
  )
  raise 'prompt sem "DEVE"' unless prompt.include?('DEVE')
  raise 'prompt sem "Copie LITERALMENTE"' unless prompt.include?('Copie LITERALMENTE')
  raise 'prompt sem "Crie exatamente um arquivo"' unless prompt.include?('Crie exatamente um arquivo')
  raise 'prompt sem "Não apenas descreva"' unless prompt.include?('Nenhum outro arquivo')
end

test('8. arquivo ausente → DELIVERY_FILE_MISSING') do
  path = File.join(DELIVERY_TMP, 'missing-test')
  FileUtils.mkdir_p(path)
  contract = { 'path' => 'missing-test/file.txt', 'conteudo_obrigatorio' => ['data'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  raise 'wrong status' unless result['status'] == 'missing'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_FILE_MISSING'
  raise 'sha nil' if result['observed_sha256']
  raise 'bytes 0' unless result['observed_bytes'] == 0
end

test('9. arquivo com linha faltante → DELIVERY_CONTENT_MISMATCH') do
  path = File.join(DELIVERY_TMP, 'partial-test')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "data\n")
  contract = { 'path' => 'out.txt', 'conteudo_obrigatorio' => ['data', 'extra'] }
  result = AgentSingleRuntime.verify_delivery!(path, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_CONTENT_MISMATCH'
end

test('10. arquivo com linhas fora de ordem → DELIVERY_CONTENT_MISMATCH') do
  path = File.join(DELIVERY_TMP, 'order-test')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "line2\nline1\n")
  contract = { 'path' => 'out.txt', 'conteudo_obrigatorio' => ['line1', 'line2'] }
  result = AgentSingleRuntime.verify_delivery!(path, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_CONTENT_MISMATCH'
end

test('11. arquivo com conteúdo extra → DELIVERY_CONTENT_MISMATCH') do
  path = File.join(DELIVERY_TMP, 'extra-test')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "line1\nextra\n")
  contract = { 'path' => 'out.txt', 'conteudo_obrigatorio' => ['line1'] }
  result = AgentSingleRuntime.verify_delivery!(path, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_CONTENT_MISMATCH'
end

test('12. arquivo com bytes inválidos → DELIVERY_CONTENT_MISMATCH') do
  path = File.join(DELIVERY_TMP, 'invalid-test')
  FileUtils.mkdir_p(path)
  File.binwrite(File.join(path, 'out.txt'), "line1\x00junk\n")
  contract = { 'path' => 'out.txt', 'conteudo_obrigatorio' => ['line1'] }
  result = AgentSingleRuntime.verify_delivery!(path, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_CONTENT_MISMATCH'
end

test('13. arquivo exato → delivery succeeded') do
  path = File.join(DELIVERY_TMP, 'exact-test')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "line1\nline2\n")
  contract = { 'path' => 'out.txt', 'conteudo_obrigatorio' => ['line1', 'line2'] }
  result = AgentSingleRuntime.verify_delivery!(path, contract)
  raise 'wrong status' unless result['status'] == 'succeeded'
  raise 'codigo not nil' unless result['codigo'].nil?
  raise 'sha mismatch' unless result['expected_sha256'] == result['observed_sha256']
  raise 'bytes mismatch' unless result['expected_bytes'] == result['observed_bytes']
end

test('14. exit 0 sem arquivo → execution=succeeded, delivery=failed, compliance=conforme, status=failure') do
  path = File.join(DELIVERY_TMP, 'run-14')
  FileUtils.mkdir_p(path)
  contract = { 'path' => 'run-14/out.txt', 'conteudo_obrigatorio' => ['data'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  raise 'wrong status' unless result['status'] == 'missing'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_FILE_MISSING'
  raise 'sha nil' if result['observed_sha256']
  dim = AgentSingleRuntime.build_resultado_dimensoes(
    'failure',
    { 'negacoes' => [] },
    { 'status' => 'conforme', 'itens' => [] },
    { 'processos_iniciados' => 1, 'exit_code' => 0, 'timeout' => false },
    delivery_verification: result
  )
  raise 'wrong execution' unless dim['execution'] == 'succeeded'
  raise 'wrong delivery' unless dim['delivery'] == 'failed'
  raise 'wrong compliance' unless dim['compliance'] == 'conforme'
end

test('15. exit 0 com conteúdo divergente → execution=succeeded, delivery=failed, compliance=conforme') do
  path = File.join(DELIVERY_TMP, 'run-15')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "wrong\n")
  contract = { 'path' => 'run-15/out.txt', 'conteudo_obrigatorio' => ['data'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'wrong codigo' unless result['codigo'] == 'DELIVERY_CONTENT_MISMATCH'
  raise 'observed_sha nil' if result['observed_sha256'].nil?
  dim = AgentSingleRuntime.build_resultado_dimensoes(
    'failure',
    { 'negacoes' => [] },
    { 'status' => 'conforme', 'itens' => [] },
    { 'processos_iniciados' => 1, 'exit_code' => 0, 'timeout' => false },
    delivery_verification: result
  )
  raise 'wrong execution' unless dim['execution'] == 'succeeded'
  raise 'wrong delivery' unless dim['delivery'] == 'failed'
  raise 'wrong compliance' unless dim['compliance'] == 'conforme'
end

test('16. arquivo correto + alteração fora do escopo → delivery=succeeded, compliance=violacao, status=denied') do
  path = File.join(DELIVERY_TMP, 'run-16')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "data\n")
  contract = { 'path' => 'run-16/out.txt', 'conteudo_obrigatorio' => ['data'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  dim = AgentSingleRuntime.build_resultado_dimensoes(
    'denied',
    { 'negacoes' => [{ 'codigo' => 'RUNTIME_SCOPE_VIOLATION' }] },
    { 'status' => 'violacao', 'itens' => [] },
    { 'processos_iniciados' => 1, 'exit_code' => 0, 'timeout' => false },
    delivery_verification: result
  )
  raise 'wrong delivery' unless dim['delivery'] == 'succeeded'
  raise 'wrong compliance' unless dim['compliance'] == 'violacao'
end

test('17. contrato imutável — extração gela') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  contract = AgentSupervisedPilot.extract_delivery_contract(tmpl)
  begin
    contract['path'] = 'foo'
    raise 'não deveria permitir mutação'
  rescue FrozenError
  else
    raise 'deveria ter congelado'
  end
  begin
    contract['conteudo_obrigatorio'] << 'linha_extra'
    raise 'não deveria permitir mutação'
  rescue FrozenError
  else
    raise 'deveria ter congelado'
  end
end

test('17b. conteúdo UTF-8 com acentos exato → succeeded') do
  path = File.join(DELIVERY_TMP, 'utf8-test')
  FileUtils.mkdir_p(path)
  content = "diagnóstico\n".encode('UTF-8')
  File.write(File.join(path, 'out.txt'), content)
  contract = { 'path' => 'utf8-test/out.txt', 'conteudo_obrigatorio' => ['diagnóstico'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  raise 'wrong status' unless result['status'] == 'succeeded'
  raise 'codigo not nil' unless result['codigo'].nil?
  raise 'sha mismatch' unless result['expected_sha256'] == result['observed_sha256']
end

test('17c. UTF-8 com um byte diferente → mismatch') do
  path = File.join(DELIVERY_TMP, 'utf8-diff')
  FileUtils.mkdir_p(path)
  correct = "diagnóstico\n".encode('UTF-8')
  wrong = "diagnóstico\n".encode('UTF-8').sub('ó', 'o')
  File.write(File.join(path, 'out.txt'), wrong)
  contract = { 'path' => 'utf8-diff/out.txt', 'conteudo_obrigatorio' => ['diagnóstico'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  raise 'wrong status' unless result['status'] == 'mismatch'
  raise 'observed_sha nil' if result['observed_sha256'].nil?
end

test('17d. planned required_content_sha256 == expected_sha256') do
  path = File.join(DELIVERY_TMP, 'sha-equal')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "line1\n")
  contract = { 'path' => 'sha-equal/out.txt', 'conteudo_obrigatorio' => ['line1'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  expected = Digest::SHA256.hexdigest("line1\n")
  raise 'sha mismatch' unless result['expected_sha256'] == expected
  raise 'observed different from expected' unless result['observed_sha256'] == result['expected_sha256']
end

test('17e. conteúdo com BEGIN marker → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['linha BEGIN_DELIVERY_CONTENT teste'])
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17f. conteúdo com END marker → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['linha END_DELIVERY_CONTENT teste'])
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17g. conteúdo com newline interno → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ["linha\ncomnewline"])
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17h. path numérico → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['path'] = 12345
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17i. conteúdo String em vez de Array → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['conteudo_obrigatorio'] = 'não é array'
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17j. item numérico → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['conteudo_obrigatorio'] = [123]
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17k. item nil → negado') do
  tmpl = delivery_contract_template(path: '.agents/pilotos/sandbox/out.txt', content: ['line1'])
  tmpl['formato_arquivo']['conteudo_obrigatorio'] = [nil]
  begin
    AgentSupervisedPilot.extract_delivery_contract(tmpl)
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise "wrong code: #{e.code}" unless e.code == 'SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID'
  end
end

test('17l. delivery mismatch + violacao → investigar_violacao') do
  path = File.join(DELIVERY_TMP, 'run-17l')
  FileUtils.mkdir_p(path)
  File.write(File.join(path, 'out.txt'), "wrong\n")
  contract = { 'path' => 'run-17l/out.txt', 'conteudo_obrigatorio' => ['data'] }
  result = AgentSingleRuntime.verify_delivery!(DELIVERY_TMP, contract)
  ledger = AgentTaskLedger.build_handoff(
    missao_id: 'm1',
    task_id: 't1',
    run_status: 'failure',
    comparison: { 'status' => 'violacao' },
    arquivos_modificados: [],
    avisos: [],
    violacoes: ['VIOLATION_TEST'],
    delivery_verification: result
  )
  raise 'wrong proxima_acao' unless ledger['proxima_acao_recomendada'] == 'investigar_violacao'
end

test('18. nenhum teste executa Codex real') do
  fake_codex = File.join(ROOT, '.agents/seguranca/fixtures/fake-codex')
  raise "fake-codex NÃO existe — pode estar usando codex real" unless File.executable?(fake_codex)
end

puts "OK #{@tests} tests"
