#!/usr/bin/env ruby
require 'json'
require 'yaml'
require 'open3'
require 'fileutils'
require 'tmpdir'
require_relative './run-agent-mission'
require_relative './plan-agent-mission'

module AgentExecutionValidator
  ROOT = File.expand_path('..', __dir__)
  ORCH_DIR = File.join(ROOT, '.agents/orquestracao')
  RUNNER = File.join(ROOT, 'scripts/run-agent-mission.rb')
  REPORT_SCHEMA_PATH = File.join(ORCH_DIR, 'executor/contrato-relatorio.schema.json')
  TMP_DIR = Dir.mktmpdir('agent-execution-validate')
  @write_counter = 0

  module_function

  def build_card(commands)
    {
      'versao' => 1,
      'id' => 'validate-exec-1',
      'titulo' => 'Validação do executor',
      'objetivo' => 'Gerar relatórios de execução controlada',
      'contexto' => 'Fixture de validação',
      'resultado_esperado' => 'Relatório válido',
      'autorizacao' => {
        'nivel' => 'A2',
        'acoes_permitidas' => %w[ler testar],
        'acoes_solicitadas' => [],
        'acoes_proibidas' => %w[merge deploy]
      },
      'escopo' => { 'leitura' => ['scripts/'], 'escrita' => [] },
      'restricoes' => [],
      'verificacao' => [],
      'evidencias_requeridas' => [],
      'condicoes_parada' => ['ok'],
      'executor' => { 'comandos' => commands }
    }
  end

  def build_plan(commands, status: 'planejado', missao_id: 'validate-exec-1')
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
      'negacoes' => [],
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
        'requer_aprovacao' => true
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

  def write_json(data)
    @write_counter += 1
    path = File.join(TMP_DIR, "validate-exec-#{@write_counter}.json")
    File.write(path, JSON.pretty_generate(data))
    path
  end

  def run_report(card, plan, execute: false, env: {})
    card_path = write_json(card)
    plan_path = write_json(plan)
    args = ['ruby', RUNNER, '--card', card_path, '--plan', plan_path, '--stdout']
    args << '--execute' if execute
    merged_env = {
      'PATH' => ENV['PATH'],
      'HOME' => ENV['HOME']
    }.merge(env)
    out, err, status = Open3.capture3(merged_env, *args, chdir: ROOT)
    raise "runner failed: #{err}" if out.empty?
    [JSON.parse(out), status.exitstatus]
  end

  def validate_report!(report)
    schema = JSON.parse(File.read(REPORT_SCHEMA_PATH))
    MissionPlanner.send(:validate_against_schema!, report, schema)
  end

  def run
    catalog = AgentMissionRunner.load_catalog
    expected = %w[validate-skills-governance test-skills-governance validate-agent-orchestration test-agent-orchestration git-diff-check]
    raise 'catalog mismatch' unless catalog.keys.sort == expected.sort

    runner = File.read(RUNNER)
    raise 'unsafe runner kernel-eval' if runner.match?(/\beval\s*[\('"\/]/)
    raise 'unsafe runner kernel-system' if runner.match?(/\bsystem\s*[\('"\/]/)
    raise 'unsafe runner backtick call' if runner.match?(/`[^`]+`/)
    raise 'unsafe Timeout.timeout usage' if runner.match?(/\bTimeout\.timeout\b/)
    raise 'unsafe capture3 without popen3 control' if runner.match?(/\bOpen3\.capture3\b/)

    dry_report, = run_report(build_card(['git-diff-check']), build_plan(['git-diff-check']))
    raise "dry-run status=#{dry_report['status']}" unless dry_report['status'] == 'dry-run'
    validate_report!(dry_report)

    denied_report, denied_exit = run_report(
      build_card(['missing-command']),
      build_plan(['missing-command'])
    )
    raise "denied status=#{denied_report['status']}" unless denied_report['status'] == 'denied'
    raise "denied exit=#{denied_exit}" unless denied_exit == 2
    validate_report!(denied_report)

    execute_report, execute_exit = run_report(
      build_card(['git-diff-check']),
      build_plan(['git-diff-check']),
      execute: true,
      env: { 'AGENT_ORCHESTRATION_EXECUTE' => '1' }
    )
    raise "execute status=#{execute_report['status']}" unless %w[success failure].include?(execute_report['status'])
    raise 'execute did not run command' unless execute_report['comandos'].first['executado']
    expected_exit = execute_report['status'] == 'success' ? 0 : 1
    raise "execute exit=#{execute_exit}" unless execute_exit == expected_exit
    validate_report!(execute_report)

    dry_report2, dry_exit = run_report(build_card(['git-diff-check']), build_plan(['git-diff-check']))
    raise "dry-run exit=#{dry_exit}" unless dry_exit == 0
    validate_report!(dry_report2)

    puts 'OK executor catalog'
    puts 'OK report schema'
    puts 'OK runner safety scan'
    puts 'OK dry-run report schema'
    puts 'OK denied report schema'
    puts 'OK controlled execution report schema'
    puts 'OK exit code mapping'
    0
  ensure
    FileUtils.remove_entry(TMP_DIR) if File.exist?(TMP_DIR)
  end
end

exit AgentExecutionValidator.run
