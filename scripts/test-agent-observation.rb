#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'open3'
require 'digest'
require 'fileutils'
require 'tmpdir'
require 'time'
require_relative './run-agent-mission'
require_relative './lib/agent_run_comparator'
require_relative './lib/agent_task_ledger'
require_relative './lib/agent_supervised_pilot'
require_relative './lib/agent_single_runtime'
require_relative './lib/codex_single_agent_runtime'

ROOT = File.expand_path('..', __dir__)
RUNNER = File.join(ROOT, 'scripts/run-agent-mission.rb')
FAKE_CODEX = File.join(ROOT, '.agents/seguranca/fixtures/fake-codex')
FAKE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')
TMP = Dir.mktmpdir('agent-observation-tests')
at_exit { FileUtils.remove_entry(TMP) if File.exist?(TMP) }

@tests = 0
@counter = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
rescue StandardError => e
  warn "FAIL #{name}: #{e.class}: #{e.message}"
  warn e.backtrace.first(6).join("\n")
  exit 1
end

def assert(cond, msg = 'assertion failed')
  raise msg unless cond
end

def uniq_name(prefix)
  @counter += 1
  "#{prefix}-#{Process.pid}-#{@counter}-#{Time.now.to_f.to_s.tr('.', '')}"
end

def deep_merge(a, b)
  a.merge(b) do |_k, x, y|
    x.is_a?(Hash) && y.is_a?(Hash) ? deep_merge(x, y) : y
  end
end

def planned_base(overrides = {})
  deep_merge({
    'missao_id' => 'm1',
    'plan_hash' => Digest::SHA256.hexdigest('p'),
    'estrategia' => 'agente-unico',
    'ferramenta_selecionada' => 'codex',
    'adapter' => '.agents/seguranca/CODEX-RUNTIME.md',
    'agentes_planejados' => 1,
    'writers_planejados' => 1,
    'papel' => 'executor-escopo',
    'permissao' => 'workspace-write',
    'comandos_planejados' => ['git-diff-check'],
    'arquivos_leitura' => ['scripts/'],
    'arquivos_escrita' => ['tmp/a.md'],
    'paths_protegidos' => ['.github/workflows/ci.yml'],
    'rede_permitida' => false,
    'delegacao_permitida' => false,
    'max_agentes' => 1,
    'max_paralelo' => 1,
    'max_tempo_segundos' => 30,
    'branch_esperada' => 'feat/x',
    'worktree_esperada' => '/tmp/wt',
    'git_head_esperado' => 'abc',
    'resultado_esperado' => 'ok',
    'condicoes_parada' => ['done']
  }, overrides)
end

def observed_base(overrides = {})
  deep_merge({
    'ferramenta_observada' => 'codex',
    'versao_codex' => '0.144.0',
    'versao_dcg' => '0.6.6',
    'adapter_observado' => '.agents/seguranca/CODEX-RUNTIME.md',
    'agentes_observados' => 1,
    'writers_observados' => 1,
    'processos_iniciados' => 1,
    'comandos_catalogo_executados' => false,
    'processo_codex_iniciado' => true,
    'rede_observada' => false,
    'subdelegacao_observada' => false,
    'branch_observada' => 'feat/x',
    'worktree_observada' => '/tmp/wt',
    'head_inicial' => 'abc',
    'head_final' => 'abc',
    'arquivos_modificados' => ['tmp/a.md'],
    'arquivos_untracked' => [],
    'arquivos_fora_escopo' => [],
    'arquivos_protegidos_alterados' => [],
    'commit_criado' => false,
    'refs_alteradas' => false,
    'timeout_observado' => false,
    'exit_code' => 0,
    'sinal' => nil,
    'duracao_ms' => 100,
    'stdout_sha256' => Digest::SHA256.hexdigest(''),
    'stderr_sha256' => Digest::SHA256.hexdigest(''),
    'stdout_truncado' => false,
    'stderr_truncado' => false,
    'status_final' => 'success'
  }, overrides)
end

def codes(cmp)
  Array(cmp['itens']).map { |i| i['codigo'] }.compact
end

# --- Comparador 1-16 ---

test('1 execução totalmente conforme') do
  cmp = AgentRunComparator.compare(planned_base, observed_base)
  assert cmp['status'] == 'conforme', cmp.inspect
end

test('2 ferramenta divergente') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('ferramenta_observada' => 'cursor'))
  assert cmp['status'] == 'violacao'
  assert codes(cmp).include?('OBSERVED_TOOL_MISMATCH')
end

test('3 adapter divergente') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('adapter_observado' => 'cursor-adapter'))
  assert codes(cmp).include?('OBSERVED_ADAPTER_MISMATCH')
end

test('4 dois agentes observados') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('agentes_observados' => 2))
  assert codes(cmp).include?('OBSERVED_AGENT_COUNT_MISMATCH')
end

test('5 dois writers observados') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('writers_observados' => 2))
  assert codes(cmp).include?('OBSERVED_WRITER_COUNT_MISMATCH')
end

test('6 dois processos Codex') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('processos_iniciados' => 2, 'processo_codex_iniciado' => true))
  assert codes(cmp).include?('OBSERVED_PROCESS_COUNT_MISMATCH')
end

test('7 rede observada') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('rede_observada' => true))
  assert codes(cmp).include?('OBSERVED_NETWORK_VIOLATION')
end

test('8 subdelegação observada') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('subdelegacao_observada' => true))
  assert codes(cmp).include?('OBSERVED_SUBDELEGATION_VIOLATION')
end

test('9 path fora do escopo') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('arquivos_fora_escopo' => ['tmp/evil.txt']))
  assert codes(cmp).include?('OBSERVED_SCOPE_VIOLATION')
end

test('10 protegido alterado') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('arquivos_protegidos_alterados' => ['.github/workflows/ci.yml']))
  assert codes(cmp).include?('OBSERVED_PROTECTED_PATH_MUTATED')
end

test('11 commit criado') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('commit_criado' => true))
  assert codes(cmp).include?('OBSERVED_GIT_STATE_MUTATED')
end

test('12 HEAD alterado') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('head_final' => 'def'))
  assert codes(cmp).include?('OBSERVED_GIT_STATE_MUTATED')
end

test('13 timeout excedido') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('timeout_observado' => true, 'duracao_ms' => 60_000))
  assert codes(cmp).include?('OBSERVED_TIMEOUT_EXCEEDED')
end

test('14 evidência ausente') do
  obs = observed_base
  obs['ferramenta_observada'] = nil
  cmp = AgentRunComparator.compare(planned_base, obs)
  assert cmp['status'] == 'indisponivel' || codes(cmp).include?('OBSERVED_EVIDENCE_UNAVAILABLE')
  assert cmp['status'] != 'conforme'
end

test('15 arquivo planejado não modificado') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('arquivos_modificados' => []))
  assert codes(cmp).include?('OBSERVED_EXPECTED_FILE_UNCHANGED')
  assert %w[desvio conforme].include?(cmp['status']) == false || cmp['status'] == 'desvio'
  assert cmp['status'] == 'desvio'
end

test('16 exit code não zero sem violação') do
  cmp = AgentRunComparator.compare(planned_base, observed_base('exit_code' => 7, 'status_final' => 'failure'))
  assert codes(cmp).include?('OBSERVED_NONZERO_EXIT')
  assert cmp['status'] == 'desvio'
end

# --- Ledger 17-23 ---

test('17 transição planned → authorized → running → succeeded') do
  t0 = Time.parse('2026-07-14T12:00:00Z')
  ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(missao_id: 'm1', at: t0))
  AgentTaskLedger.transition!(ledger, to: 'authorized', at: t0 + 1)
  AgentTaskLedger.transition!(ledger, to: 'running', at: t0 + 2)
  AgentTaskLedger.transition!(ledger, to: 'succeeded', at: t0 + 3, codigo: 'OK')
  assert ledger.first['status'] == 'succeeded'
end

test('18 denied antes do spawn') do
  t0 = Time.now.utc
  ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(missao_id: 'm1', at: t0))
  AgentTaskLedger.finalize_from_run!(ledger, comparison_status: 'violacao', run_status: 'denied', spawn_started: false, at: t0 + 1)
  assert ledger.first['status'] == 'denied'
end

test('19 timeout') do
  t0 = Time.now.utc
  ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(missao_id: 'm1', at: t0))
  AgentTaskLedger.transition!(ledger, to: 'authorized', at: t0 + 1)
  AgentTaskLedger.finalize_from_run!(ledger, comparison_status: 'desvio', run_status: 'timeout', spawn_started: true, at: t0 + 2)
  assert ledger.first['status'] == 'timeout'
end

test('20 falha do Codex') do
  t0 = Time.now.utc
  ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(missao_id: 'm1', at: t0))
  AgentTaskLedger.transition!(ledger, to: 'authorized', at: t0 + 1)
  AgentTaskLedger.finalize_from_run!(ledger, comparison_status: 'desvio', run_status: 'failure', spawn_started: true, at: t0 + 2)
  assert ledger.first['status'] == 'failed'
end

test('21 tentativa diferente de 1 negada') do
  entry = AgentTaskLedger.new_entry(missao_id: 'm1')
  entry['tentativa'] = 2
  begin
    AgentTaskLedger.validate!([entry])
    raise 'should deny'
  rescue AgentTaskLedger::Denial => e
    assert e.code == 'LEDGER_ATTEMPT_DENIED'
  end
end

test('22 mais de uma tarefa negada') do
  e1 = AgentTaskLedger.new_entry(missao_id: 'm1')
  e2 = AgentTaskLedger.new_entry(missao_id: 'm1')
  begin
    AgentTaskLedger.validate!([e1, e2])
    raise 'should deny'
  rescue AgentTaskLedger::Denial => e
    assert e.code == 'LEDGER_MULTI_TASK'
  end
end

test('23 timestamps inválidos negados') do
  t0 = Time.parse('2026-07-14T12:00:00Z')
  ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(missao_id: 'm1', at: t0))
  begin
    AgentTaskLedger.transition!(ledger, to: 'authorized', at: t0 - 10)
    raise 'should deny'
  rescue AgentTaskLedger::Denial => e
    assert e.code == 'LEDGER_TIMESTAMP_INVALID'
  end
end

# --- Handoff 24-27 ---

test('24 success recomenda revisão do diff') do
  h = AgentTaskLedger.build_handoff(
    missao_id: 'm1', task_id: 't1', run_status: 'success',
    comparison: { 'status' => 'conforme' }, arquivos_modificados: ['tmp/a.md'],
    avisos: [], violacoes: []
  )
  assert h['proxima_acao_recomendada'] == 'revisar_diff'
  assert h['requer_aprovacao_humana'] == true
end

test('25 violação recomenda investigação') do
  h = AgentTaskLedger.build_handoff(
    missao_id: 'm1', task_id: 't1', run_status: 'denied',
    comparison: { 'status' => 'violacao' }, arquivos_modificados: [],
    avisos: [], violacoes: ['x']
  )
  assert h['proxima_acao_recomendada'] == 'investigar_violacao'
end

test('26 timeout recomenda correção manual') do
  h = AgentTaskLedger.build_handoff(
    missao_id: 'm1', task_id: 't1', run_status: 'timeout',
    comparison: { 'status' => 'desvio' }, arquivos_modificados: [],
    avisos: [], violacoes: []
  )
  assert h['proxima_acao_recomendada'] == 'corrigir_manualmente'
end

test('27 aprovação humana sempre obrigatória') do
  %w[success failure denied timeout].each do |st|
    h = AgentTaskLedger.build_handoff(
      missao_id: 'm1', task_id: 't1', run_status: st,
      comparison: { 'status' => 'conforme' }, arquivos_modificados: [],
      avisos: [], violacoes: []
    )
    assert h['requer_aprovacao_humana'] == true
  end
end

# --- Piloto 28-40 ---

def build_card_pilot(auth: 'A3', id: 'primeiro-piloto-supervisionado', escrita: ['.agents/pilotos/sandbox/resultado-primeiro-piloto.md'])
  {
    'versao' => 1,
    'id' => id,
    'titulo' => 'Piloto',
    'objetivo' => 'sandbox',
    'contexto' => 't',
    'resultado_esperado' => 'arquivo',
    'autorizacao' => {
      'nivel' => auth,
      'acoes_permitidas' => %w[ler escrever testar],
      'acoes_solicitadas' => [],
      'acoes_proibidas' => %w[merge deploy push]
    },
    'escopo' => { 'leitura' => ['.agents/pilotos/'], 'escrita' => escrita },
    'restricoes' => [],
    'verificacao' => ['ok'],
    'evidencias_requeridas' => [],
    'condicoes_parada' => ['done'],
    'executor' => { 'comandos' => ['git-diff-check'] }
  }
end

def build_plan_pilot(overrides = {})
  write = overrides.delete('write') || ['.agents/pilotos/sandbox/resultado-primeiro-piloto.md']
  timeout = overrides.delete('timeout') || 60
  base = {
    'versao' => 1,
    'missao_id' => 'primeiro-piloto-supervisionado',
    'status' => 'planejado',
    'papel_principal' => 'executor-escopo',
    'ferramenta_selecionada' => 'codex',
    'adaptador_selecionado' => '.agents/seguranca/CODEX-RUNTIME.md',
    'skills_selecionadas' => [],
    'autorizacao_fornecida' => 'A3',
    'autorizacao_necessaria' => 'A3',
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
      'estrategia' => 'agente-unico', 'origem' => 'default', 'motivo' => 'piloto',
      'justificativa_multiagente' => nil, 'ganho_esperado' => nil,
      'perfil_execucao' => 'minimal-change', 'gate_qualidade' => 'evidence-first'
    },
    'resumo_operacional' => {
      'harness' => 'codex-cli', 'estrategia' => 'agente-unico', 'agentes_planejados' => 1,
      'max_paralelo' => 1, 'writers' => 1, 'risco' => 'baixo', 'requer_aprovacao' => true, 'executavel' => true
    },
    'topologia' => {
      'max_agentes' => 1, 'max_profundidade' => 1, 'permite_subdelegacao' => false,
      'agentes' => [{ 'id' => 'principal', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] }]
    },
    'tarefas_planejadas' => [{
      'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'sandbox',
      'entrega_esperada' => 'md', 'nao_fazer' => %w[commit push],
      'arquivos' => { 'leitura' => ['.agents/pilotos/'], 'escrita' => write },
      'depende_de' => []
    }],
    'simplicidade' => {
      'avaliada' => true, 'multiagente_necessario' => false, 'justificativa_multiagente' => nil,
      'reutiliza_existente' => true, 'nova_dependencia' => false, 'nova_abstracao' => false
    },
    'limites' => { 'max_retentativas' => 1, 'max_rodadas_revisao' => 1, 'max_tempo_segundos' => timeout }
  }
  deep_merge(base, overrides)
end

test('28 flag ausente') do
  begin
    AgentSupervisedPilot.enforce_activation!(supervised_pilot: false, pilot_ack: 'RUN_SUPERVISED_PILOT')
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_FLAG_REQUIRED'
  end
end

test('29 ack ausente') do
  ENV['AGENT_RUNTIME_PILOT'] = '1'
  begin
    AgentSupervisedPilot.enforce_activation!(supervised_pilot: true, pilot_ack: nil)
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_ACK_REQUIRED'
  ensure
    ENV.delete('AGENT_RUNTIME_PILOT')
  end
end

test('30 env ausente') do
  ENV.delete('AGENT_RUNTIME_PILOT')
  begin
    AgentSupervisedPilot.enforce_activation!(supervised_pilot: true, pilot_ack: 'RUN_SUPERVISED_PILOT')
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_ENV_REQUIRED'
  end
end

test('31 missão fora do template') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(id: 'outra'),
      plan: build_plan_pilot('missao_id' => 'outra'),
      template: tmpl,
      root: ROOT
    )
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert %w[SUPERVISED_PILOT_SCOPE_DENIED SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH].include?(e.code)
  end
end

test('32 mais de um arquivo permitido') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(escrita: ['.agents/pilotos/sandbox/a.md', '.agents/pilotos/sandbox/b.md']),
      plan: build_plan_pilot('write' => ['.agents/pilotos/sandbox/a.md', '.agents/pilotos/sandbox/b.md']),
      template: tmpl,
      root: ROOT
    )
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_SCOPE_DENIED'
  end
end

test('33 path funcional proibido') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(escrita: ['package.json']),
      plan: build_plan_pilot('write' => ['package.json']),
      template: tmpl,
      root: ROOT
    )
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_SCOPE_DENIED'
  end
end

test('34 timeout acima de 180') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot,
      plan: build_plan_pilot('timeout' => 181),
      template: tmpl,
      root: ROOT
    )
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_SCOPE_DENIED'
  end
end

test('35 autorização abaixo de A3') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(auth: 'A2'),
      plan: build_plan_pilot('autorizacao_fornecida' => 'A2'),
      template: tmpl,
      root: ROOT
    )
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_SCOPE_DENIED'
  end
end

test('36 piloto duplicado') do
  sdir = File.join(TMP, uniq_name('state'))
  AgentSupervisedPilot.claim_mission!(state_dir: sdir, missao_id: 'primeiro-piloto-supervisionado', report_hash: 'a' * 64)
  begin
    AgentSupervisedPilot.claim_mission!(state_dir: sdir, missao_id: 'primeiro-piloto-supervisionado', report_hash: 'b' * 64)
    raise 'should deny'
  rescue AgentSupervisedPilot::Denial => e
    assert e.code == 'SUPERVISED_PILOT_ALREADY_EXECUTED'
  end
end

test('37 estado criado atomicamente') do
  sdir = File.join(TMP, uniq_name('state'))
  path = AgentSupervisedPilot.claim_mission!(state_dir: sdir, missao_id: 'm-atomic', report_hash: 'c' * 64)
  assert File.file?(path)
  data = JSON.parse(File.read(path))
  assert data['missao_id'] == 'm-atomic'
  assert data['report_hash'] == 'c' * 64
  assert data['timestamp']
end

test('38 dry-run não cria estado') do
  sdir = File.join(TMP, uniq_name('state'))
  AgentSupervisedPilot.claim_mission!(state_dir: sdir, missao_id: 'm-dry', report_hash: 'd' * 64, dry_run: true)
  assert !AgentSupervisedPilot.already_executed?(state_dir: sdir, missao_id: 'm-dry')
end

def make_worktree
  name = uniq_name('obs-wt')
  path = File.join(TMP, name)
  branch = "feat/#{name}"
  out, err, st = Open3.capture3('git', '-C', ROOT, 'worktree', 'add', '-b', branch, path, 'HEAD')
  raise "worktree add failed: #{err}" unless st.success?
  [path, branch]
end

def remove_worktree(path, branch)
  Open3.capture3('git', '-C', ROOT, 'worktree', 'remove', '--force', path)
  Open3.capture3('git', '-C', ROOT, 'branch', '-D', branch)
rescue StandardError
  nil
end

def write_json(data)
  @counter += 1
  path = File.join(TMP, "obs-#{@counter}.json")
  File.write(path, JSON.pretty_generate(data))
  path
end

def test_env(extra = {})
  {
    'PATH' => ENV['PATH'],
    'HOME' => ENV['HOME'],
    'TMPDIR' => ENV['TMPDIR'] || '/tmp',
    'AGENT_RUNTIME_EXECUTE' => '1',
    'AGENT_RUNTIME_TEST_CODEX' => '1',
    'AGENT_RUNTIME_TEST_CODEX_BIN' => FAKE_CODEX,
    'AGENT_RUNTIME_TEST_PREFLIGHT' => '1',
    'AGENT_RUNTIME_TEST_DCG_BIN' => FAKE_DCG,
    'AGENT_RUNTIME_EVIDENCE_ROOT' => File.join(File.realpath(Dir.tmpdir), "agent-observation-evidence-#{Process.pid}-#{@counter}")
  }.merge(extra)
end

def run_runtime(card:, plan:, worktree:, env: {}, extra_argv: [])
  card_path = write_json(card)
  plan_path = write_json(plan)
  out_path = File.join(TMP, uniq_name('report') + '.json')
  argv = [
    'ruby', RUNNER,
    '--card', card_path,
    '--plan', plan_path,
    '--worktree', worktree,
    '--agent-runtime',
    '--runtime-ack', 'RUN_SINGLE_AGENT',
    '--output', out_path,
    *extra_argv
  ]
  full_env = test_env(env)
  stdout, stderr, status = Open3.capture3(full_env, *argv)
  report = File.file?(out_path) ? JSON.parse(File.read(out_path)) : {}
  [report, status.exitstatus, stdout, stderr]
end

test('39 fake Codex produz relatório completo') do
  wt, branch = make_worktree
  begin
    FileUtils.mkdir_p(File.join(wt, '.agents/pilotos/sandbox'))
    Open3.capture3('git', '-C', wt, 'add', '.agents/pilotos/sandbox')
    # ensure clean; .gitkeep may need commit? worktree from HEAD already clean
    card = build_card_pilot
    # Adapt runtime write scope via plan tarefa (sandbox path may not exist yet — ok)
    plan = build_plan_pilot
    # For runtime path, write into tmp inside worktree to reuse fake scenario, but for this
    # observation test we want full report fields. Use success-noop.
    report, = run_runtime(
      card: build_card_pilot(escrita: ['tmp/runtime-write.txt']).tap { |c|
        c['id'] = 'missao-obs-report'
        c['autorizacao']['nivel'] = 'A2'
      },
      plan: begin
        p = build_plan_pilot('missao_id' => 'missao-obs-report', 'autorizacao_fornecida' => 'A2', 'autorizacao_necessaria' => 'A2', 'write' => ['tmp/runtime-write.txt'])
        p
      end,
      worktree: wt,
      env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'success-noop' }
    )
    %w[planned_snapshot planned_snapshot_sha256 observed_snapshot observed_snapshot_sha256 comparacao task_ledger handoff relatorio_sha256].each do |k|
      assert report.key?(k), "missing #{k}"
    end
    assert report['task_ledger'].size == 1
    assert report['handoff']['requer_aprovacao_humana'] == true
    assert report['avisos'].include?('CODEX_SUBSTITUI_EXECUCAO_DOS_COMANDOS')
    assert report.dig('runtime', 'comandos_catalogo_executados') == false
    assert Array(report['comandos']).all? { |c| c['executado'] == false }
  ensure
    remove_worktree(wt, branch)
  end
end

test('40 fake Codex modifica somente o arquivo permitido') do
  wt, branch = make_worktree
  begin
    write_rel = 'tmp/runtime-write.txt'
    report, = run_runtime(
      card: build_card_pilot(escrita: [write_rel]).tap { |c|
        c['id'] = 'missao-obs-write'
        c['autorizacao']['nivel'] = 'A2'
        c['escopo']['escrita'] = [write_rel]
      },
      plan: build_plan_pilot(
        'missao_id' => 'missao-obs-write',
        'autorizacao_fornecida' => 'A2',
        'autorizacao_necessaria' => 'A2',
        'write' => [write_rel]
      ),
      worktree: wt,
      env: {
        'AGENT_RUNTIME_FAKE_SCENARIO' => 'write-in-scope',
        'AGENT_RUNTIME_FAKE_WRITE_PATH' => write_rel
      }
    )
    mods = Array(report.dig('observed_snapshot', 'arquivos_modificados'))
    assert mods == [write_rel], mods.inspect
    assert Array(report.dig('observed_snapshot', 'arquivos_fora_escopo')).empty?
    assert %w[success desvio].include?(report['status']) || report['comparacao']['status'] != 'violacao'
  ensure
    remove_worktree(wt, branch)
  end
end

# --- Compatibilidade 41-45 ---

test('41 runtime normal da 3B.3B continua funcionando') do
  wt, branch = make_worktree
  begin
    report, code, = run_runtime(
      card: build_card_pilot(escrita: ['tmp/x.txt']).tap { |c|
        c['id'] = 'missao-compat-3b3b'
        c['autorizacao']['nivel'] = 'A2'
      },
      plan: build_plan_pilot(
        'missao_id' => 'missao-compat-3b3b',
        'autorizacao_fornecida' => 'A2',
        'autorizacao_necessaria' => 'A2',
        'write' => ['tmp/x.txt']
      ),
      worktree: wt,
      env: { 'AGENT_RUNTIME_FAKE_SCENARIO' => 'success-noop' }
    )
    # sem chaves de piloto
    assert report['modo'] == 'agent-runtime'
    assert code != 4
    assert report['status'] != 'internal-error'
  ensure
    remove_worktree(wt, branch)
  end
end

test('42 dry-run legado continua funcionando') do
  card = write_json(build_card_pilot.tap { |c| c['autorizacao']['nivel'] = 'A2'; c['id'] = 'dry1' })
  plan = write_json(build_plan_pilot('missao_id' => 'dry1', 'autorizacao_fornecida' => 'A2', 'autorizacao_necessaria' => 'A2'))
  stdout, _stderr, st = Open3.capture3(
    { 'PATH' => ENV['PATH'], 'HOME' => ENV['HOME'] },
    'ruby', RUNNER, '--card', card, '--plan', plan, '--stdout'
  )
  report = JSON.parse(stdout.lines.find { |l| l.strip.start_with?('{') } ? stdout[stdout.index('{')..] : stdout)
  assert report['modo'] == 'dry-run'
  assert st.exitstatus == 0
end

test('43 cinco comandos canônicos continuam iguais') do
  require 'yaml'
  catalog = YAML.load_file(File.join(ROOT, '.agents/orquestracao/executor/catalogo-comandos.yaml'))
  ids = catalog.fetch('comandos').keys.sort
  expected = %w[
    git-diff-check
    test-agent-orchestration
    test-skills-governance
    validate-agent-orchestration
    validate-skills-governance
  ]
  assert ids == expected, ids.inspect
end

test('44 multi-agent continua negado') do
  wt, branch = make_worktree
  begin
    plan = build_plan_pilot(
      'missao_id' => 'missao-multi',
      'autorizacao_fornecida' => 'A2',
      'autorizacao_necessaria' => 'A2',
      'write' => ['tmp/x.txt']
    )
    plan['resumo_operacional']['estrategia'] = 'multiagente'
    plan['resumo_operacional']['agentes_planejados'] = 2
    plan['topologia']['max_agentes'] = 2
    plan['topologia']['agentes'] = [
      { 'id' => 'a', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] },
      { 'id' => 'b', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] }
    ]
    report, = run_runtime(
      card: build_card_pilot(escrita: ['tmp/x.txt']).tap { |c| c['id'] = 'missao-multi'; c['autorizacao']['nivel'] = 'A2' },
      plan: plan,
      worktree: wt
    )
    codes = Array(report['negacoes']).map { |e| e.split(':', 2).first }
    assert codes.any? { |c| c.include?('SINGLE_AGENT') || c.include?('RUNTIME_SINGLE') }, report['negacoes'].inspect
  ensure
    remove_worktree(wt, branch)
  end
end

test('45 nenhum Codex real é descoberto durante os testes') do
  # Without TEST markers, resolve must not pick fixture path from PATH accidentally in production path.
  ENV.delete('AGENT_RUNTIME_TEST_CODEX')
  ENV.delete('AGENT_RUNTIME_TEST_CODEX_BIN')
  begin
    # Fake path must be rejected without test env
    begin
      CodexSingleAgentRuntime.resolve_codex_bin!
      # may find real codex — assert fixture not used
      bin = CodexSingleAgentRuntime.resolve_codex_bin!
      assert !bin.include?('fixtures/fake-codex'), bin
    rescue CodexSingleAgentRuntime::Denial
      # ok — no codex
    end
  ensure
    # leave clean
  end
end

# ── Template registry (Fase 3B.4B.1) ──

test('t01 primeiro piloto resolve pelo legado') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  assert tmpl.is_a?(Hash)
  assert tmpl.dig('missao', 'id') == 'primeiro-piloto-supervisionado' || tmpl['missao_id'] == 'primeiro-piloto-supervisionado'
end

test('t02 segundo piloto resolve pelo template versionado') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'segundo-piloto-supervisionado-20260715t142707z')
  assert tmpl.is_a?(Hash)
  assert(tmpl.dig('missao', 'id') == 'segundo-piloto-supervisionado-20260715t142707z')
end

test('t03 mission_id desconhecido → TEMPLATE_NOT_APPROVED') do
  begin
    AgentSupervisedPilot.load_template!(ROOT, missao_id: 'misso-desconhecida-xyz')
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
  end
end

test('t04 path traversal ../ → negado') do
  begin
    AgentSupervisedPilot.load_template!(ROOT, missao_id: '../etc/passwd')
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
  end
end

test('t05 mission_id com slash → negado') do
  begin
    AgentSupervisedPilot.load_template!(ROOT, missao_id: 'foo/bar')
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
  end
end

test('t06 card id diferente do plan → denied') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(id: 'a'),
      plan: build_plan_pilot('missao_id' => 'b'),
      template: tmpl,
      root: ROOT
    )
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    assert %w[SUPERVISED_PILOT_SCOPE_DENIED SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH].include?(e.code)
  end
end

test('t07 card e plan iguais mas divergem do template → denied') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(id: 'missao-alheia'),
      plan: build_plan_pilot('missao_id' => 'missao-alheia'),
      template: tmpl,
      root: ROOT
    )
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    assert %w[SUPERVISED_PILOT_SCOPE_DENIED SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH].include?(e.code)
  end
end

test('t08 segundo piloto com output exato → válido') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'segundo-piloto-supervisionado-20260715t142707z')
  r = AgentSupervisedPilot.validate_mission!(
    card: build_card_pilot(id: 'segundo-piloto-supervisionado-20260715t142707z', escrita: ['.agents/pilotos/sandbox/resultado-segundo-piloto.md']),
    plan: build_plan_pilot('missao_id' => 'segundo-piloto-supervisionado-20260715t142707z', 'write' => ['.agents/pilotos/sandbox/resultado-segundo-piloto.md']),
    template: tmpl,
    root: ROOT
  )
  assert r == true
end

test('t09 segundo piloto com output diferente → OUTPUT_MISMATCH') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'segundo-piloto-supervisionado-20260715t142707z')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(id: 'segundo-piloto-supervisionado-20260715t142707z', escrita: ['.agents/pilotos/sandbox/outro-arquivo.md']),
      plan: build_plan_pilot('missao_id' => 'segundo-piloto-supervisionado-20260715t142707z', 'write' => ['.agents/pilotos/sandbox/outro-arquivo.md']),
      template: tmpl,
      root: ROOT
    )
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_OUTPUT_MISMATCH'
  end
end

test('t10 dois arquivos → negado') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  begin
    AgentSupervisedPilot.validate_mission!(
      card: build_card_pilot(escrita: ['.agents/pilotos/sandbox/a.md', '.agents/pilotos/sandbox/b.md']),
      plan: build_plan_pilot('write' => ['.agents/pilotos/sandbox/a.md', '.agents/pilotos/sandbox/b.md']),
      template: tmpl,
      root: ROOT
    )
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_SCOPE_DENIED'
  end
end

# ── Hardening fail-closed (Fase 3B.4B.1 corretiva) ──

def with_tmp_template(data, name: 'tmp-template')
  Dir.mktmpdir('tpl-test') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    path = File.join(tdir, "#{name}.json")
    File.write(path, data.is_a?(String) ? data : JSON.pretty_generate(data))
    yield dir, path, tdir
  end
end

test('t11 template JSON array → negado') do
  with_tmp_template('[1,2,3]') do |dir, path, _tdir|
    # Simular load_template com template não Hash
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'tmp-template')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
    end
  end
end

test('t12 template JSON string → negado') do
  with_tmp_template('"apenas string"') do |dir, path, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'tmp-template')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
    end
  end
end

test('t13 missao como string → negado controlado') do
  data = { 'versao' => 1, 'missao' => 'string-invalida', 'card' => { 'id' => 'x', 'escopo' => { 'escrita' => ['a.md'] } } }
  Dir.mktmpdir('tpl-missao-str') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'x.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      # template sem ID interno → negado
      assert %w[SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID].include?(e.code)
    end
  end
end

test('t14 card como array → negado controlado') do
  data = { 'versao' => 1, 'missao' => { 'id' => 'x' }, 'card' => ['invalido'] }
  Dir.mktmpdir('tpl-card-array') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'x.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      assert %w[SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID].include?(e.code)
    end
  end
end

test('t15 tarefa interna não Hash → negado') do
  data = {
    'missao' => { 'id' => 'x' },
    'card' => {
      'id' => 'x',
      'escopo' => { 'escrita' => ['a.md'] },
      'execucao_planejada' => {
        'tarefas' => ['nao-sou-hash']
      }
    },
    'formato_arquivo' => { 'path' => 'a.md' }
  }
  Dir.mktmpdir('tpl-task-bad') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'x.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t16 missao.id correto + card.id divergente → TEMPLATE_ID_MISMATCH') do
  data = { 'missao' => { 'id' => 'a' }, 'card' => { 'id' => 'b' } }
  Dir.mktmpdir('tpl-id-div') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'a.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'a')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH'
    end
  end
end

test('t17 missao_id diverge de missao.id → TEMPLATE_ID_MISMATCH') do
  data = { 'missao_id' => 'a', 'missao' => { 'id' => 'b' } }
  Dir.mktmpdir('tpl-id-div2') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'a.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'a')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH'
    end
  end
end

test('t18 execucao_planejada output diverge de escopo.escrita → OUTPUT_INVALID') do
  data = {
    'missao' => { 'id' => 'x' },
    'card' => {
      'id' => 'x',
      'escopo' => { 'escrita' => ['a.md'] },
      'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => ['b.md'] } }] }
    },
    'formato_arquivo' => { 'path' => 'a.md' }
  }
  Dir.mktmpdir('tpl-out-div') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'x.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t19 formato_arquivo.path diverge → OUTPUT_INVALID') do
  data = {
    'missao' => { 'id' => 'x' },
    'card' => {
      'id' => 'x',
      'escopo' => { 'escrita' => ['a.md'] },
      'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => ['a.md'] } }] }
    },
    'formato_arquivo' => { 'path' => 'c.md' }
  }
  Dir.mktmpdir('tpl-out-div2') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    File.write(File.join(tdir, 'x.json'), JSON.pretty_generate(data))
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t20 load_template e validate_mission não criam state nem sandbox') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'segundo-piloto-supervisionado-20260715t142707z')
  AgentSupervisedPilot.validate_mission!(
    card: build_card_pilot(id: 'segundo-piloto-supervisionado-20260715t142707z', escrita: ['.agents/pilotos/sandbox/resultado-segundo-piloto.md']),
    plan: build_plan_pilot('missao_id' => 'segundo-piloto-supervisionado-20260715t142707z', 'write' => ['.agents/pilotos/sandbox/resultado-segundo-piloto.md']),
    template: tmpl,
    root: ROOT
  )
  sdir = File.join(ROOT, '.agents/pilotos/state')
  sfile = File.join(sdir, 'segundo-piloto-supervisionado-20260715t142707z.json')
  raise 'state não deveria existir' if File.file?(sfile)
  raise 'sandbox não deveria existir' if File.file?(File.join(ROOT, '.agents/pilotos/sandbox/resultado-segundo-piloto.md'))
end

test('t21 segundo template válido continua aceito') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'segundo-piloto-supervisionado-20260715t142707z')
  assert tmpl.is_a?(Hash)
end

test('t22 primeiro template legado continua aceito') do
  tmpl = AgentSupervisedPilot.load_template!(ROOT, missao_id: 'primeiro-piloto-supervisionado')
  assert tmpl.is_a?(Hash)
end

test('t23 mission_id com whitespace → negado') do
  begin
    AgentSupervisedPilot.load_template!(ROOT, missao_id: '  com-espaco  ')
    raise 'deveria negar'
  rescue AgentSupervisedPilot::Denial => e
    raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
  end
end

# ── Hardening tipos inválidos (Fase 3B.4B.1 corretiva 2) ──

def with_tmp_template_full(data, name: 'tmp-tpl')
  Dir.mktmpdir('tpl-harden') do |dir|
    tdir = File.join(dir, '.agents', 'pilotos', 'templates')
    FileUtils.mkdir_p(tdir)
    path = File.join(tdir, "#{name}.json")
    File.write(path, data.is_a?(String) ? data : JSON.pretty_generate(data))
    yield dir, path, tdir
  end
end

test('t24 tarefa.arquivos como String → OUTPUT_INVALID') do
  with_tmp_template_full({
    'missao' => { 'id' => 'x' },
    'card' => { 'id' => 'x', 'escopo' => { 'escrita' => ['a.md'] }, 'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => 'string-invalida' }] } },
    'formato_arquivo' => { 'path' => 'a.md' }
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t25 tarefa.arquivos.escrita como String → OUTPUT_INVALID') do
  with_tmp_template_full({
    'missao' => { 'id' => 'x' },
    'card' => { 'id' => 'x', 'escopo' => { 'escrita' => ['a.md'] }, 'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => 'string' } }] } },
    'formato_arquivo' => { 'path' => 'a.md' }
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t26 card.escopo como String → OUTPUT_INVALID') do
  with_tmp_template_full({
    'missao' => { 'id' => 'x' },
    'card' => { 'id' => 'x', 'escopo' => 'string' },
    'formato_arquivo' => { 'path' => 'a.md' }
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t27 card.escopo.escrita como String → OUTPUT_INVALID') do
  with_tmp_template_full({
    'missao' => { 'id' => 'x' },
    'card' => { 'id' => 'x', 'escopo' => { 'escrita' => 'string' } },
    'formato_arquivo' => { 'path' => 'a.md' }
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t28 formato_arquivo como String → OUTPUT_INVALID') do
  with_tmp_template_full({
    'missao' => { 'id' => 'x' },
    'card' => { 'id' => 'x', 'escopo' => { 'escrita' => ['a.md'] }, 'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => ['a.md'] } }] } },
    'formato_arquivo' => 'string'
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID'
    end
  end
end

test('t29 missao como string + demais válidos → NOT_APPROVED') do
  with_tmp_template_full({
    'missao' => 'string-invalida',
    'card' => { 'id' => 'x', 'escopo' => { 'escrita' => ['a.md'] } },
    'formato_arquivo' => { 'path' => 'a.md' }
  }, name: 'x') do |dir, _p, _tdir|
    begin
      AgentSupervisedPilot.load_template!(dir, missao_id: 'x')
      raise 'deveria negar'
    rescue AgentSupervisedPilot::Denial => e
      raise e.code unless e.code == 'SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED'
    end
  end
end

test('t30 plan2writes com estruturas inválidas → [] sem exceção') do
  assert(AgentSupervisedPilot.plan2writes(nil) == [])
  assert(AgentSupervisedPilot.plan2writes('string') == [])
  assert(AgentSupervisedPilot.plan2writes([]) == [])
  assert(AgentSupervisedPilot.plan2writes({}) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => nil }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => 'str' } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => { 'tarefas' => 'str' } } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => { 'tarefas' => [nil] } } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => { 'tarefas' => [{}] } } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => nil }] } } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => nil } }] } } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'escopo' => nil } }) == [])
  assert(AgentSupervisedPilot.plan2writes({ 'card' => { 'escopo' => { 'escrita' => 'str' } } }) == [])
end

test('t31 plan2writes com estrutura válida → paths') do
  r = AgentSupervisedPilot.plan2writes({
    'card' => {
      'execucao_planejada' => { 'tarefas' => [{ 'arquivos' => { 'escrita' => ['a.md'] } }] },
      'escopo' => { 'escrita' => ['a.md'] }
    }
  })
  assert(r == ['a.md'], "esperado ['a.md'], got #{r.inspect}")
end

puts "OK #{@tests} tests"
