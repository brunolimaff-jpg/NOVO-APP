#!/usr/bin/env ruby
require 'json'
require 'open3'
require 'digest'
require 'fileutils'
require 'tmpdir'
require_relative './run-agent-mission'
require_relative './plan-agent-mission'

ROOT = File.expand_path('..', __dir__)
RUNNER = File.join(ROOT, 'scripts/run-agent-mission.rb')
REPORT_SCHEMA_PATH = File.join(ROOT, '.agents/orquestracao/executor/contrato-relatorio.schema.json')
TMP_DIR = Dir.mktmpdir('agent-execution-tests')
at_exit { FileUtils.remove_entry(TMP_DIR) if File.exist?(TMP_DIR) }

@tests = 0
@write_counter = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
end

def write_json(data)
  @write_counter += 1
  path = File.join(TMP_DIR, "agent-exec-#{@write_counter}.json")
  File.write(path, JSON.pretty_generate(data))
  path
end

def build_execution_card(commands = ['git-diff-check'], auth: 'A2', id: 'missao-exec-1')
  {
    'versao' => 1,
    'id' => id,
    'titulo' => 'Execução controlada de gates',
    'objetivo' => 'Validar gates de governança',
    'contexto' => 'Teste do executor',
    'resultado_esperado' => 'Relatório de execução',
    'autorizacao' => {
      'nivel' => auth,
      'acoes_permitidas' => %w[ler testar],
      'acoes_solicitadas' => [],
      'acoes_proibidas' => %w[merge deploy]
    },
    'escopo' => { 'leitura' => ['scripts/'], 'escrita' => [] },
    'restricoes' => [],
    'verificacao' => [],
    'evidencias_requeridas' => [],
    'condicoes_parada' => ['gates ok'],
    'executor' => { 'comandos' => commands }
  }
end

def build_execution_plan(commands = ['git-diff-check'], status: 'planejado', missao_id: 'missao-exec-1', negacoes: [])
  {
    'versao' => 1,
    'missao_id' => missao_id,
    'status' => status,
    'papel_principal' => 'validador-entrega',
    'ferramenta_selecionada' => 'cursor',
    'adaptador_selecionado' => '.cursor/agents/validador-entrega.md',
    'skills_selecionadas' => [],
    'autorizacao_fornecida' => 'A2',
    'autorizacao_necessaria' => 'A2',
    'leitura_permitida' => true,
    'escrita_permitida' => false,
    'shell_permitido' => false,
    'rede_permitida' => false,
    'delegacao_permitida' => false,
    'etapas' => [],
    'condicoes_parada' => [],
    'evidencias_requeridas' => [],
    'negacoes' => negacoes,
    'avisos' => [],
    'fontes_decisao' => ['.agents/orquestracao/roteamento.yaml'],
    'acoes_solicitadas' => [],
    'acoes_permitidas' => %w[ler],
    'comandos' => commands
  }
end

def run(card_data, plan_data, execute: false, env: {})
  card_path = write_json(card_data)
  plan_path = write_json(plan_data)
  args = ['ruby', RUNNER, '--card', card_path, '--plan', plan_path, '--stdout']
  args << '--execute' if execute
  merged_env = { 'PATH' => ENV['PATH'], 'HOME' => ENV['HOME'] }.merge(env)
  out, err, status = Open3.capture3(merged_env, *args, chdir: ROOT)
  raise "runner failed: #{err}" if out.empty? && !status.success?
  [JSON.parse(out), err, status.exitstatus]
end

def negation_codes(report)
  (report['negacoes'] || []).map { |entry| entry.split(':', 2).first }
end

def negation_messages(report)
  (report['negacoes'] || []).map { |entry| entry.include?(':') ? entry.split(':', 2).last.strip : entry }
end

def assert_denied(name, card_data, plan_data, code: nil, message: nil, exit_code: 2)
  report, _err, status = run(card_data, plan_data)
  raise "#{name}: expected denied status, got #{report['status']}" unless report['status'] == 'denied'
  raise "#{name}: expected exit #{exit_code}, got #{status}" unless status == exit_code
  raise "#{name}: expected negacoes" if report['negacoes'].empty?
  if code && !negation_codes(report).include?(code)
    raise "#{name}: expected code #{code}, got #{report['negacoes'].inspect}"
  end
  if message && negation_messages(report).none? { |m| m.include?(message) }
    raise "#{name}: expected message #{message.inspect}, got #{report['negacoes'].inspect}"
  end
  report
end

def assert_raises(expected_class, message_fragment: nil)
  caught = nil
  begin
    yield
  rescue expected_class => error
    caught = error
  end
  raise "expected #{expected_class}" unless caught
  if message_fragment && !caught.message.include?(message_fragment)
    raise "expected message containing #{message_fragment.inspect}, got #{caught.message.inspect}"
  end
  caught
end

def validate_report_schema!(report)
  schema = JSON.parse(File.read(REPORT_SCHEMA_PATH))
  MissionPlanner.send(:validate_against_schema!, report, schema)
end

card = ->(commands = ['git-diff-check'], auth = 'A2') { build_execution_card(commands, auth: auth) }
plan = ->(status = 'planejado', commands = ['git-diff-check']) { build_execution_plan(commands, status: status) }

test('dry-run padrão') do
  report, = run(card.call, plan.call)
  raise unless report['status'] == 'dry-run' && report['comandos'].first['executado'] == false
end

test('sem --execute permanece dry-run') do
  report, = run(card.call, plan.call, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' })
  raise unless report['modo'] == 'dry-run'
end

test('sem variável permanece dry-run') do
  report, = run(card.call, plan.call, execute: true)
  raise unless report['modo'] == 'dry-run'
end

test('execução autorizada') do
  report, = run(card.call, plan.call, execute: true, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' })
  raise unless %w[success failure].include?(report['status']) && report['comandos'].first['executado']
end

test('cinco IDs do catálogo em dry-run') do
  ids = AgentMissionRunner.load_catalog.keys
  report, = run(card.call(ids), plan.call('planejado', ids))
  raise unless report['comandos'].length == 5
end

test('relatório tem hash') do
  report, = run(card.call, plan.call)
  raise unless report['plan_hash'].match?(/\A[a-f0-9]{64}\z/)
end

test('hashes de saída existem') do
  report, = run(card.call, plan.call)
  raise unless report['comandos'].first['stdout_sha256'] == Digest::SHA256.hexdigest('')
end

test('timeout default registrado') do
  report, = run(card.call, plan.call)
  raise unless report['comandos'].first['timeout'] == false
end

test('truncamento default registrado') do
  report, = run(card.call, plan.call)
  raise if report['comandos'].first['stdout_truncado']
end

test('determinismo em dry-run completo') do
  a, = run(card.call, plan.call)
  b, = run(card.call, plan.call)
  raise unless a == b
end

test('timestamps fixos em dry-run') do
  report, = run(card.call, plan.call)
  raise unless report['inicio'] == '1970-01-01T00:00:00Z'
  raise unless report['fim'] == '1970-01-01T00:00:00Z'
  raise unless report['duracao_ms'] == 0
end

test('tempfiles sobrevivem ao GC') do
  card_path = write_json(card.call)
  plan_path = write_json(plan.call)
  GC.start
  args = ['ruby', RUNNER, '--card', card_path, '--plan', plan_path, '--stdout']
  out, err, status = Open3.capture3({ 'PATH' => ENV['PATH'], 'HOME' => ENV['HOME'] }, *args, chdir: ROOT)
  raise "runner failed after GC: #{err}" unless status.success? || status.exitstatus == 2
  parsed = JSON.parse(out)
  raise unless parsed['status'] == 'dry-run'
end

test('comandos iguais card e plano') do
  report, = run(card.call(['git-diff-check']), plan.call('planejado', ['git-diff-check']))
  raise unless report['status'] == 'dry-run'
end

test('mesmo conjunto ordem diferente aceito') do
  cmds = %w[git-diff-check validate-skills-governance]
  report, = run(card.call(cmds.reverse), plan.call('planejado', cmds))
  raise unless report['status'] == 'dry-run'
  raise unless report['comandos'].map { |c| c['id'] } == cmds
end

test('card adiciona comando nega') do
  assert_denied('card extra', card.call(%w[git-diff-check validate-skills-governance]), plan.call('planejado', ['git-diff-check']),
                code: 'COMMAND_PLAN_MISMATCH')
end

test('plano adiciona comando nega') do
  assert_denied('plan extra', card.call(['git-diff-check']), plan.call('planejado', %w[git-diff-check validate-skills-governance]),
                code: 'COMMAND_PLAN_MISMATCH')
end

test('duplicatas normalizadas para comparação') do
  card_norm = AgentMissionRunner.normalize_commands(['git-diff-check', 'git-diff-check'])
  plan_norm = AgentMissionRunner.normalize_commands(['git-diff-check'])
  raise unless card_norm == plan_norm
  report, = run(card.call(['git-diff-check']), plan.call('planejado', ['git-diff-check']))
  raise unless report['status'] == 'dry-run'
end

test('ambiente sanitizado remove segredo do filho') do
  fixture = File.join(TMP_DIR, 'env-check.rb')
  File.write(fixture, "print(ENV.key?('SECRET_MARKER') ? 'present' : 'absent')")
  previous = ENV['SECRET_MARKER']
  ENV['SECRET_MARKER'] = 'leak'
  begin
    child_env = AgentMissionRunner.sanitized_env
    raise if child_env.key?('SECRET_MARKER')
    out, = Open3.capture3(
      child_env,
      'ruby', fixture,
      chdir: ROOT,
      unsetenv_others: true
    )
    raise unless out.strip == 'absent'
  ensure
    if previous.nil?
      ENV.delete('SECRET_MARKER')
    else
      ENV['SECRET_MARKER'] = previous
    end
  end
end

test('plano negado') { assert_denied('negado', card.call, plan.call('negado'), code: 'PLAN_STATUS_INVALID') }
test('plano incompleto') { assert_denied('incompleto', card.call, plan.call('incompleto'), code: 'PLAN_STATUS_INVALID') }
test('missão divergente') do
  p = plan.call
  p['missao_id'] = 'outra'
  assert_denied('divergente', card.call, p, code: 'MISSION_MISMATCH')
end
test('comando inexistente') do
  assert_denied('missing', card.call(['missing']), plan.call('planejado', ['missing']), code: 'COMMAND_NOT_IN_CATALOG')
end
test('comando arbitrário') do
  assert_denied('arbitrary', card.call(['ruby -e puts']), plan.call('planejado', ['ruby -e puts']), code: 'COMMAND_NOT_IN_CATALOG')
end

test('shell bloqueado no catálogo') do
  assert_raises(RuntimeError, message_fragment: 'blocked') { AgentMissionRunner.validate_argv!('bad', ['bash', '-c', 'echo x']) }
end
test('rede bloqueada no catálogo') do
  assert_raises(RuntimeError, message_fragment: 'blocked') { AgentMissionRunner.validate_argv!('bad', ['curl', 'https://example.com']) }
end
test('git push bloqueado') do
  assert_raises(RuntimeError, message_fragment: 'blocked') { AgentMissionRunner.validate_argv!('bad', ['git', 'push']) }
end
test('parâmetro extra no catálogo bloqueado') do
  bad_catalog = File.join(TMP_DIR, 'bad-catalog.yaml')
  File.write(bad_catalog, "comandos:\n  x:\n    argv: ['git']\n    extra: true\n")
  assert_raises(RuntimeError, message_fragment: 'extra') { AgentMissionRunner.load_catalog(bad_catalog) }
end

test('path traversal no card') do
  _out, err, status = Open3.capture3('ruby', RUNNER, '--card', '/etc/passwd', '--plan', write_json(plan.call), '--stdout', chdir: ROOT)
  raise if status.success? || err.empty?
end

test('output fora de repo/tmp') do
  _out, err, status = Open3.capture3('ruby', RUNNER, '--card', write_json(card.call), '--plan', write_json(plan.call), '--output', '/etc/out.json', chdir: ROOT)
  raise if status.success? || err.empty?
end

test('schema inválido no card') do
  bad = card.call
  bad.delete('titulo')
  assert_denied('card schema', bad, plan.call, code: 'SCHEMA_INVALID')
end

test('schema inválido no plano') do
  bad = plan.call
  bad.delete('papel_principal')
  assert_denied('plan schema', card.call, bad, code: 'SCHEMA_INVALID')
end

test('propriedade desconhecida no card') do
  bad = card.call
  bad['campo_fake'] = true
  assert_denied('unknown card prop', bad, plan.call, code: 'SCHEMA_INVALID')
end

test('autorização insuficiente') do
  assert_denied('auth', card.call(['git-diff-check'], 'A1'), plan.call, code: 'AUTH_INSUFFICIENT')
end

test('plano adulterado com negacao') do
  p = plan.call
  p['negacoes'] = [{ 'codigo' => 'X', 'mensagem' => 'adulterado' }]
  assert_denied('negacao', card.call, p, code: 'PLAN_NEGATIONS')
end

test('regression plano negado não executa') do
  report, = run(card.call, plan.call('negado'), execute: true, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' })
  raise unless report['comandos'].empty?
end

test('relatório dry-run válido contra schema') do
  report, = run(card.call, plan.call)
  validate_report_schema!(report)
end

test('relatório negado válido contra schema') do
  report = assert_denied('schema denied', card.call(['missing']), plan.call('planejado', ['missing']), code: 'COMMAND_NOT_IN_CATALOG')
  validate_report_schema!(report)
end

puts "OK #{@tests} tests"
