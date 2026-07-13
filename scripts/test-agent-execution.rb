#!/usr/bin/env ruby
require 'json'
require 'open3'
require 'digest'
require 'fileutils'
require 'tmpdir'
require 'tempfile'
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
    'comandos' => commands,
    'resumo_operacional' => {
      'harness' => 'codex-cli',
      'estrategia' => 'agente-unico',
      'agentes_planejados' => 1,
      'max_paralelo' => 1,
      'writers' => 0,
      'risco' => 'baixo',
      'requer_aprovacao' => true,
      'executavel' => false
    },
    'topologia' => {
      'max_agentes' => 1,
      'max_profundidade' => 1,
      'permite_subdelegacao' => false,
      'agentes' => [
        {
          'id' => 'principal',
          'papel' => 'validador-entrega',
          'permissao' => 'read-only',
          'depende_de' => []
        }
      ]
    },
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
      'max_rodadas_revisao' => 1
    }
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

def capture_stdout
  old = $stdout
  tmp = Tempfile.new('stdout-capture')
  tmp_path = tmp.path
  tmp.close
  File.open(tmp_path, 'w') do |io|
    $stdout = io
    yield
  end
  File.read(tmp_path)
ensure
  $stdout = old
  FileUtils.rm_f(tmp_path) if defined?(tmp_path) && tmp_path
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
test('plano planejado-com-restricoes não é executável') do
  assert_denied(
    'restricoes',
    card.call,
    plan.call('planejado-com-restricoes'),
    code: 'PLAN_STATUS_INVALID'
  )
end
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
  out, _err, status = Open3.capture3('ruby', RUNNER, '--card', '/etc/passwd', '--plan', write_json(plan.call), '--stdout', chdir: ROOT)
  raise 'path traversal should fail' if status.success?
  report = JSON.parse(out)
  raise unless report['status'] == 'denied'
  raise unless negation_codes(report).include?('PATH_REJECTED') || negation_codes(report).include?('PATH_MISSING') || negation_codes(report).include?('PATH_SYMLINK') || status.exitstatus == 2
end

test('output fora de repo/tmp') do
  out, _err, status = Open3.capture3('ruby', RUNNER, '--card', write_json(card.call), '--plan', write_json(plan.call), '--output', '/etc/out.json', '--stdout', chdir: ROOT)
  raise 'outside output should fail' if status.success?
  report = JSON.parse(out)
  raise unless report['status'] == 'denied'
  raise unless negation_codes(report).include?('PATH_REJECTED')
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

test('exit code dry-run é 0') do
  report, _err, status = run(card.call, plan.call)
  raise unless report['status'] == 'dry-run' && status == 0
end

test('exit code success é 0') do
  report, _err, status = run(card.call, plan.call, execute: true, env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' })
  raise "status=#{report['status']}" unless report['status'] == 'success'
  raise "exit=#{status}" unless status == 0
end

test('exit code denied é 2') do
  report, _err, status = run(card.call, plan.call('negado'))
  raise unless report['status'] == 'denied' && status == 2
end

test('exit code timeout é 3') do
  report = AgentMissionRunner.command_report(
    'blocked-sleep',
    ['ruby', '-e', 'sleep 30'],
    true,
    timeout_seconds: 1
  )
  raise "timeout flag=#{report['timeout']}" unless report['timeout']
  raise unless AgentMissionRunner.exit_code_for('timeout') == 3

  # CLI path: force timeout via monkeypatched catalog command is overkill;
  # assert runner mapping and that child is dead.
  pid_holder = []
  original = AgentMissionRunner.method(:capture_command)
  AgentMissionRunner.define_singleton_method(:capture_command) do |argv, timeout_seconds: 120|
    out, err, code, timed_out, pid = original.call(argv, timeout_seconds: timeout_seconds)
    pid_holder << pid
    [out, err, code, timed_out, pid]
  end
  begin
    cli_report = AgentMissionRunner.command_report('x', ['ruby', '-e', 'sleep 30'], true, timeout_seconds: 1)
    raise unless cli_report['timeout']
    pid = pid_holder.last
    raise 'missing pid' unless pid
    alive = begin
      Process.kill(0, pid)
      true
    rescue Errno::ESRCH
      false
    end
    raise 'child still alive after timeout' if alive
  ensure
    AgentMissionRunner.define_singleton_method(:capture_command, original)
  end
end

test('timeout via CLI retorna exit 3') do
  original_load = AgentMissionRunner.method(:load_catalog)
  original_validate = AgentMissionRunner.method(:validate_inputs!)
  original_report = AgentMissionRunner.method(:command_report)

  AgentMissionRunner.define_singleton_method(:load_catalog) do |*_args|
    { 'blocked-sleep' => { 'argv' => ['ruby', '-e', 'sleep 30'] } }
  end
  AgentMissionRunner.define_singleton_method(:validate_inputs!) do |_card, _plan, catalog|
    catalog.keys
  end
  AgentMissionRunner.define_singleton_method(:command_report) do |id, argv, execute, timeout_seconds: 120|
    original_report.call(id, argv, execute, timeout_seconds: 1)
  end

  card_path = write_json(card.call)
  plan_path = write_json(plan.call)
  begin
    previous = ENV['AGENT_ORCHESTRATION_EXECUTE']
    ENV['AGENT_ORCHESTRATION_EXECUTE'] = '1'
    exit_status = nil
    out = capture_stdout do
      exit_status = AgentMissionRunner.run(['--card', card_path, '--plan', plan_path, '--stdout', '--execute'])
    end
    report = JSON.parse(out)
    raise "status=#{report['status']} neg=#{report['negacoes'].inspect}" unless report['status'] == 'timeout'
    raise "exit=#{exit_status}" unless exit_status == 3
  ensure
    if previous.nil?
      ENV.delete('AGENT_ORCHESTRATION_EXECUTE')
    else
      ENV['AGENT_ORCHESTRATION_EXECUTE'] = previous
    end
    AgentMissionRunner.define_singleton_method(:load_catalog, original_load)
    AgentMissionRunner.define_singleton_method(:validate_inputs!, original_validate)
    AgentMissionRunner.define_singleton_method(:command_report, original_report)
  end
end

test('internal-error alcançável e exit 4') do
  original = AgentMissionRunner.method(:load_catalog)
  AgentMissionRunner.define_singleton_method(:load_catalog) do |*_args|
    raise Errno::EIO, 'simulated io failure'
  end
  card_path = write_json(card.call)
  plan_path = write_json(plan.call)
  begin
    exit_status = nil
    out = capture_stdout do
      exit_status = AgentMissionRunner.run(['--card', card_path, '--plan', plan_path, '--stdout'])
    end
    report = JSON.parse(out)
    raise "status=#{report['status']}" unless report['status'] == 'internal-error'
    raise "exit=#{exit_status}" unless exit_status == 4
    raise 'should not expose stack frames' if report.to_json.include?('run-agent-mission.rb:')
    validate_report_schema!(report)
  ensure
    AgentMissionRunner.define_singleton_method(:load_catalog, original)
  end
end

test('failure exit code é 1') do
  original_load = AgentMissionRunner.method(:load_catalog)
  original_validate = AgentMissionRunner.method(:validate_inputs!)
  AgentMissionRunner.define_singleton_method(:load_catalog) do |*_args|
    { 'failing' => { 'argv' => ['ruby', '-e', 'exit 7'] } }
  end
  AgentMissionRunner.define_singleton_method(:validate_inputs!) do |_card, _plan, catalog|
    catalog.keys
  end
  card_path = write_json(card.call)
  plan_path = write_json(plan.call)
  begin
    previous = ENV['AGENT_ORCHESTRATION_EXECUTE']
    ENV['AGENT_ORCHESTRATION_EXECUTE'] = '1'
    exit_status = nil
    out = capture_stdout do
      exit_status = AgentMissionRunner.run(['--card', card_path, '--plan', plan_path, '--stdout', '--execute'])
    end
    report = JSON.parse(out)
    raise "status=#{report['status']}" unless report['status'] == 'failure'
    raise "exit=#{exit_status}" unless exit_status == 1
  ensure
    if previous.nil?
      ENV.delete('AGENT_ORCHESTRATION_EXECUTE')
    else
      ENV['AGENT_ORCHESTRATION_EXECUTE'] = previous
    end
    AgentMissionRunner.define_singleton_method(:load_catalog, original_load)
    AgentMissionRunner.define_singleton_method(:validate_inputs!, original_validate)
  end
end

test('output em pasta inexistente dentro da raiz') do
  out_path = File.join(TMP_DIR, 'nested-missing', 'deeper', 'out.json')
  out, err, status = Open3.capture3(
    'ruby', RUNNER,
    '--card', write_json(card.call),
    '--plan', write_json(plan.call),
    '--output', out_path,
    chdir: ROOT
  )
  raise "err=#{err} out=#{out}" unless status.success?
  raise unless File.file?(out_path)
  raise unless JSON.parse(File.read(out_path))['status'] == 'dry-run'
end

test('output symlink rejeitado') do
  target = File.join(TMP_DIR, 'outside-target.json')
  link = File.join(ROOT, "symlink-out-#{Process.pid}.json")
  File.write(target, '{}')
  FileUtils.ln_s(target, link)
  begin
    out, _err, status = Open3.capture3(
      'ruby', RUNNER,
      '--card', write_json(card.call),
      '--plan', write_json(plan.call),
      '--output', link,
      '--stdout',
      chdir: ROOT
    )
    raise 'symlink output should fail' if status.success?
    report = JSON.parse(out)
    raise unless report['status'] == 'denied'
    raise unless negation_codes(report).include?('PATH_SYMLINK')
  ensure
    FileUtils.rm_f(link)
  end
end

test('parent symlink para fora de repo/tmp rejeitado') do
  link_dir = File.join(ROOT, "symlink-etc-#{Process.pid}")
  FileUtils.rm_f(link_dir)
  FileUtils.ln_s('/etc', link_dir)
  out_path = File.join(link_dir, "agent-out-#{Process.pid}.json")
  begin
    out, _err, status = Open3.capture3(
      'ruby', RUNNER,
      '--card', write_json(card.call),
      '--plan', write_json(plan.call),
      '--output', out_path,
      '--stdout',
      chdir: ROOT
    )
    raise 'etc symlink parent should be rejected' if status.success?
    report = JSON.parse(out)
    raise unless report['status'] == 'denied'
    raise unless negation_codes(report).any? { |c| c.start_with?('PATH_') }
  ensure
    FileUtils.rm_f(link_dir)
  end
end

test('output legítimo em tmp') do
  out_path = File.join(TMP_DIR, 'ok-out.json')
  out, err, status = Open3.capture3(
    'ruby', RUNNER,
    '--card', write_json(card.call),
    '--plan', write_json(plan.call),
    '--output', out_path,
    chdir: ROOT
  )
  raise "err=#{err} out=#{out}" unless status.success?
  raise unless File.file?(out_path)
  parsed = JSON.parse(File.read(out_path))
  raise unless parsed['status'] == 'dry-run'
end

test('UTF-8 truncado no meio de multibyte permanece JSON válido') do
  limit = AgentMissionRunner::MAX_OUTPUT_BYTES
  payload = ('a' * (limit - 1)) + 'ç'
  fixture = File.join(TMP_DIR, 'utf8-payload.bin')
  File.binwrite(fixture, payload)
  report = AgentMissionRunner.command_report(
    'utf8',
    ['ruby', '-e', 'STDOUT.write(File.binread(ARGV[0]))', fixture],
    true,
    timeout_seconds: 30
  )
  raise unless report['stdout_truncado']
  raw = payload.b.byteslice(0, limit)
  scrubbed = raw.dup.force_encoding(Encoding::UTF_8).scrub
  raise unless report['stdout_sha256'] == Digest::SHA256.hexdigest(scrubbed)
  envelope = {
    'versao' => 1,
    'missao_id' => 'missao-exec-1',
    'plan_hash' => Digest::SHA256.hexdigest('{}'),
    'modo' => 'execute',
    'status' => 'success',
    'inicio' => '1970-01-01T00:00:00Z',
    'fim' => '1970-01-01T00:00:00Z',
    'duracao_ms' => 0,
    'comandos' => [report],
    'negacoes' => [],
    'avisos' => [],
    'evidencias' => []
  }
  json = JSON.pretty_generate(envelope)
  raise unless JSON.parse(json)
  validate_report_schema!(envelope)
end

test('plano planejado sem comandos negado no schema path') do
  p = plan.call
  p['comandos'] = []
  assert_denied('empty cmds', card.call([]), p, code: 'PLANEJADO_REQUIRES_COMMANDS')
end

test('hook branch-health emite JSON e permite non-commit') do
  hook = File.join(ROOT, '.cursor/hooks/branch-health-json.sh')
  input = JSON.generate({ 'command' => 'git status' })
  out, err, status = Open3.capture3(hook, 'main', stdin_data: input)
  raise "hook failed err=#{err}" unless status.success?
  parsed = JSON.parse(out)
  raise unless parsed['permission'] == 'allow'
end

test('hook branch-health deny apenas em git commit acima do limite') do
  hook = File.join(ROOT, '.cursor/hooks/branch-health-json.sh')
  input = JSON.generate({ 'command' => 'echo hello' })
  out, _err2, status = Open3.capture3({ 'BRANCH_HEALTH_SKIP' => '0' }, hook, 'main', stdin_data: input)
  raise unless status.success?
  raise unless JSON.parse(out)['permission'] == 'allow'
end

test('hook branch-health usa raiz do repo mesmo com cwd externo') do
  # Fixture repo: health script denies only when cwd == REPO_ROOT.
  # Without `cd "$REPO_ROOT"` the old hook would exit 0 from outside and allow.
  fixture = Dir.mktmpdir('hook-cwd-fixture')
  outside = Dir.mktmpdir('hook-cwd-outside')
  begin
    FileUtils.mkdir_p(File.join(fixture, '.cursor/hooks'))
    FileUtils.mkdir_p(File.join(fixture, 'scripts'))
    hook = File.join(fixture, '.cursor/hooks/branch-health-json.sh')
    FileUtils.cp(File.join(ROOT, '.cursor/hooks/branch-health-json.sh'), hook)
    File.chmod(0o755, hook)

    health = File.join(fixture, 'scripts/check-branch-health.sh')
    File.write(health, <<~BASH)
      #!/bin/bash
      set -euo pipefail
      if [ "$(pwd)" = "#{fixture}" ]; then
        echo "OVER_LIMIT_FROM_ROOT"
        exit 1
      fi
      echo "WRONG_CWD=$(pwd)"
      exit 0
    BASH
    File.chmod(0o755, health)

    commit_input = JSON.generate({ 'command' => 'git commit -m test' })
    out, err, status = Open3.capture3(
      { 'BRANCH_HEALTH_SKIP' => '0' },
      hook,
      'main',
      stdin_data: commit_input,
      chdir: outside
    )
    raise "expected deny exit 2, got #{status.exitstatus} out=#{out} err=#{err}" unless status.exitstatus == 2
    parsed = JSON.parse(out)
    raise "permission=#{parsed['permission']}" unless parsed['permission'] == 'deny'
    raise 'missing over-limit evidence' unless (parsed['agent_message'] || '').include?('OVER_LIMIT_FROM_ROOT')

    other_input = JSON.generate({ 'command' => 'echo hello' })
    out2, err2, status2 = Open3.capture3(
      { 'BRANCH_HEALTH_SKIP' => '0' },
      hook,
      'main',
      stdin_data: other_input,
      chdir: outside
    )
    raise "non-commit should allow err=#{err2}" unless status2.success?
    raise unless JSON.parse(out2)['permission'] == 'allow'
  ensure
    FileUtils.remove_entry(fixture) if fixture && File.exist?(fixture)
    FileUtils.remove_entry(outside) if outside && File.exist?(outside)
  end
end

puts "OK #{@tests} tests"
