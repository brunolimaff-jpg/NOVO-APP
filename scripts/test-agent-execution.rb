#!/usr/bin/env ruby
require 'json'
require 'tempfile'
require 'open3'
require 'digest'
require_relative './run-agent-mission'

ROOT = File.expand_path('..', __dir__)
RUNNER = File.join(ROOT, 'scripts/run-agent-mission.rb')

@tests = 0
def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
end

def write_json(data)
  file = Tempfile.new(['agent-exec', '.json'])
  file.write(JSON.pretty_generate(data))
  file.close
  file.path
end

def card(commands = ['git-diff-check'], auth = 'A2')
  {
    'id' => 'missao-exec-1',
    'autorizacao' => { 'nivel' => auth },
    'executor' => { 'comandos' => commands }
  }
end

def plan(status = 'planejado', commands = ['git-diff-check'])
  {
    'missao_id' => 'missao-exec-1',
    'status' => status,
    'negacoes' => [],
    'comandos' => commands
  }
end

def run(card_data, plan_data, execute: false, env: {})
  args = ['ruby', RUNNER, '--card', write_json(card_data), '--plan', write_json(plan_data), '--stdout']
  args << '--execute' if execute
  out, err, status = Open3.capture3(env, *args, chdir: ROOT)
  [JSON.parse(out), err, status.exitstatus]
end

def assert_denied(name, card_data, plan_data)
  report, = run(card_data, plan_data)
  raise "#{name}: expected denied" unless report['status'] == 'denied'
end

test('dry-run padrão') { report, = run(card, plan); raise unless report['status'] == 'dry-run' && report['comandos'].first['executado'] == false }
test('sem --execute permanece dry-run') { report, = run(card, plan, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' }); raise unless report['modo'] == 'dry-run' }
test('sem variável permanece dry-run') { report, = run(card, plan, execute: true); raise unless report['modo'] == 'dry-run' }
test('execução autorizada') { report, = run(card, plan, execute: true, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1', 'PATH' => ENV['PATH'], 'HOME' => ENV['HOME'] }); raise unless %w[success failure].include?(report['status']) && report['comandos'].first['executado'] }
test('cinco IDs do catálogo em dry-run') { report, = run(card(AgentMissionRunner.load_catalog.keys), plan('planejado', [])); raise unless report['comandos'].length == 5 }
test('relatório tem hash') { report, = run(card, plan); raise unless report['plan_hash'].match?(/\A[a-f0-9]{64}\z/) }
test('hashes de saída existem') { report, = run(card, plan); raise unless report['comandos'].first['stdout_sha256'] == Digest::SHA256.hexdigest('') }
test('timeout default registrado') { report, = run(card, plan); raise unless report['comandos'].first['timeout'] == false }
test('truncamento default registrado') { report, = run(card, plan); raise if report['comandos'].first['stdout_truncado'] }
test('determinismo em dry-run parcial') { a, = run(card, plan); b, = run(card, plan); raise unless a['comandos'] == b['comandos'] && a['status'] == b['status'] }
test('plano negado') { assert_denied('negado', card, plan('negado')) }
test('plano incompleto') { assert_denied('incompleto', card, plan('incompleto')) }
test('missão divergente') { p = plan; p['missao_id'] = 'outra'; assert_denied('divergente', card, p) }
test('comando inexistente') { assert_denied('missing', card(['missing']), plan('planejado', ['missing'])) }
test('comando arbitrário') { assert_denied('arbitrary', card(['ruby -e puts']), plan('planejado', ['ruby -e puts'])) }
test('shell bloqueado no catálogo') { begin AgentMissionRunner.validate_argv!('bad', ['bash', '-c', 'echo x']); raise 'expected error'; rescue RuntimeError => e; raise unless e.message.include?('blocked') end }
test('rede bloqueada no catálogo') { begin AgentMissionRunner.validate_argv!('bad', ['curl', 'https://example.com']); raise 'expected error'; rescue RuntimeError => e; raise unless e.message.include?('blocked') end }
test('git push bloqueado') { begin AgentMissionRunner.validate_argv!('bad', ['git', 'push']); raise 'expected error'; rescue RuntimeError => e; raise unless e.message.include?('blocked') end }
test('parâmetro extra no catálogo bloqueado') { begin AgentMissionRunner.load_catalog(write_json('comandos' => { 'x' => { 'argv' => ['git'], 'extra' => true } })); raise 'expected error'; rescue RuntimeError => e; raise unless e.message.include?('extra') end }
test('path traversal no card') { _out, err, status = Open3.capture3('ruby', RUNNER, '--card', '/etc/passwd', '--plan', write_json(plan), '--stdout', chdir: ROOT); raise if status.success? || err.empty? }
test('output fora de repo/tmp') { _out, err, status = Open3.capture3('ruby', RUNNER, '--card', write_json(card), '--plan', write_json(plan), '--output', '/etc/out.json', chdir: ROOT); raise if status.success? || err.empty? }
test('schema inválido') { report, = run({ 'id' => '' }, plan); raise unless report['status'] == 'denied' }
test('plano adulterado com negacao') { p = plan; p['negacoes'] = ['x']; assert_denied('negacao', card, p) }
test('autorização insuficiente') { assert_denied('auth', card(['git-diff-check'], 'A1'), plan) }
test('regression plano negado não executa') { report, = run(card, plan('negado'), execute: true, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' }); raise unless report['comandos'].empty? }

puts "OK #{@tests} tests"
