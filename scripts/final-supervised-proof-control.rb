#!/usr/bin/env ruby
# frozen_string_literal: true

# Control plane da prova final. Prepare não reserva nem cria artefatos; inspect
# somente arquiva e valida o resultado de uma execução já autorizada.
require 'json'
require 'optparse'
require 'open3'
require 'digest'
require 'fileutils'
require 'tmpdir'

require_relative './plan-agent-mission'
require_relative './run-agent-mission'
require_relative './lib/agent_supervised_pilot'
require_relative './lib/agent_single_runtime'

module FinalSupervisedProofControl
  MISSION_ID = 'quarto-piloto-supervisionado-20260717t-final'
  TARGET_BASELINE = '95c415da2311cfceaf1e00c616e9eefe7638714f'
  DELIVERY_REL = '.agents/pilotos/sandbox/quarto-piloto-supervisionado-20260717t-final.txt'
  TEMPLATE_NAMES = [
    "#{MISSION_ID}.json",
    "#{MISSION_ID}.card.json",
    "#{MISSION_ID}.plan.json"
  ].freeze
  MANIFEST_ARTIFACTS = %w[
    execution-stream.sanitized.jsonl
    execution-evidence.json
    stderr.sanitized.log
  ].freeze
  BYPASS_ENV = %w[AGENT_RUNTIME_TEST_PREFLIGHT AGENT_RUNTIME_PILOT_DRY DCG_BYPASS DCG_DISABLE].freeze

  class Blocked < StandardError
    attr_reader :code

    def initialize(code, message = code)
      @code = code
      super(message)
    end
  end

  module_function

  def run(argv)
    mode = argv.shift
    return help unless %w[prepare inspect].include?(mode)

    opts = parse_options(argv, mode)
    result = mode == 'prepare' ? prepare(opts) : inspect_result(opts)
    puts JSON.pretty_generate(result) if opts[:stdout]
    result
  rescue Blocked => e
    result = error_result(mode, e.code, e.message)
    puts JSON.pretty_generate(result) if opts && opts[:stdout]
    exit 1
  rescue JSON::ParserError => e
    result = error_result(mode, 'JSON_INVALID', e.message)
    puts JSON.pretty_generate(result) if opts && opts[:stdout]
    exit 1
  end

  def error_result(mode, code, message = nil)
    if mode == 'inspect'
      {
        'status' => 'PROVA_FINAL_FAILURE_NO_RETRY',
        'failures' => [code.to_s],
        'runtime_executed' => true,
        'state_reserved' => true
      }
    else
      {
        'status' => 'BLOCKED_BEFORE_RESERVATION',
        'code' => code,
        'message' => message || code,
        'runtime_executed' => false,
        'state_reserved' => false
      }
    end
  end

  def help
    puts <<~TEXT
      Usage:
        ruby scripts/final-supervised-proof-control.rb prepare [options]
        ruby scripts/final-supervised-proof-control.rb inspect [options]

      Options:
        --runner-root PATH       worktree do runner
        --target-worktree PATH   worktree da prova
        --runner-head SHA        SHA congelado do runner
        --target-baseline SHA    SHA congelado do target
        --output PATH            Run Report temporário
        --persistent-report PATH Run Report persistente
        --report-root PATH       raiz persistente do relatório
        --evidence-root PATH     raiz externa de evidências
        --state-dir PATH         raiz externa do state
        --readiness-report PATH  fixture JSON de readiness estático
        --preflight-report PATH  fixture JSON de preflight
        --live-preflight         executa somente o preflight live futuro
        --stdout                 imprime JSON do resultado
    TEXT
    0
  end

  def parse_options(argv, mode)
    opts = {mode: mode, stdout: false, live_preflight: false}
    parser = OptionParser.new do |p|
      p.on('--runner-root PATH') { |v| opts[:runner_root] = v }
      p.on('--target-worktree PATH') { |v| opts[:target_worktree] = v }
      p.on('--runner-head SHA') { |v| opts[:runner_head] = v }
      p.on('--target-baseline SHA') { |v| opts[:target_baseline] = v }
      p.on('--output PATH') { |v| opts[:output] = v }
      p.on('--persistent-report PATH') { |v| opts[:persistent_report] = v }
      p.on('--report-root PATH') { |v| opts[:report_root] = v }
      p.on('--evidence-root PATH') { |v| opts[:evidence_root] = v }
      p.on('--state-dir PATH') { |v| opts[:state_dir] = v }
      p.on('--readiness-report PATH') { |v| opts[:readiness_report] = v }
      p.on('--preflight-report PATH') { |v| opts[:preflight_report] = v }
      p.on('--live-preflight') { opts[:live_preflight] = true }
      p.on('--stdout') { opts[:stdout] = true }
      p.on('-h', '--help') { puts p; exit 0 }
    end
    parser.parse!(argv)
    opts
  end

  def prepare(opts)
    runner = require_absolute_dir!(opts[:runner_root], 'RUNNER_ROOT_INVALID')
    target = require_absolute_dir!(opts[:target_worktree], 'TARGET_WORKTREE_INVALID')
    block!('RUNNER_TARGET_SAME', 'runner e target devem ser distintos') if runner == target
    ensure_clean!(runner, 'RUNNER_WORKTREE_DIRTY')
    ensure_clean!(target, 'TARGET_WORKTREE_DIRTY')

    runner_head = git_output!(runner, 'rev-parse', 'HEAD')
    target_head = git_output!(target, 'rev-parse', 'HEAD')
    expected_runner = require_sha!(opts[:runner_head], 'RUNNER_HEAD_NOT_FROZEN')
    expected_target = opts[:target_baseline].to_s
    block!('TARGET_BASELINE_NOT_FROZEN') unless expected_target == TARGET_BASELINE
    block!('RUNNER_HEAD_MISMATCH') unless runner_head == expected_runner
    block!('RUNNER_EQUALS_TARGET') if runner_head == expected_target
    block!('TARGET_HEAD_MISMATCH') unless target_head == expected_target

    card, plan, template = validate_templates!(runner)
    validate_mission_contract!(card, plan, template, runner)
    ensure_external_root!(opts[:state_dir], runner, target, 'PILOT_STATE_ROOT_INVALID')
    ensure_external_root!(opts[:evidence_root], runner, target, 'FORENSIC_EVIDENCE_ROOT_INVALID')
    report_root = ensure_external_root!(opts[:report_root], runner, target, 'REPORT_ROOT_INVALID', reject_tmp: true)

    state_file = File.join(opts[:state_dir], "#{MISSION_ID}.json")
    attempt_dir = File.join(opts[:evidence_root], MISSION_ID, 'attempt-001')
    block!('STATE_ALREADY_EXISTS') if pending?(state_file)
    block!('FORENSIC_ATTEMPT_ALREADY_EXISTS') if pending?(attempt_dir)

    staging_report = require_absolute_path!(opts[:output], 'OUTPUT_REQUIRED')
    block!('OUTPUT_ALREADY_EXISTS') if pending?(staging_report)
    block!('OUTPUT_SYMLINK') if File.symlink?(staging_report)
    begin
      AgentMissionRunner.safe_path(staging_report)
    rescue AgentMissionRunner::DeniedError => e
      block!('OUTPUT_PATH_REJECTED', e.message)
    end
    block!('OUTPUT_INSIDE_WORKTREE') if within?(staging_report, runner) || within?(staging_report, target)

    persistent = opts[:persistent_report] || File.join(report_root, "#{MISSION_ID}.run-report.json")
    persistent = require_absolute_path!(persistent, 'PERSISTENT_REPORT_INVALID')
    block!('PERSISTENT_REPORT_ALREADY_EXISTS') if pending?(persistent)
    block!('PERSISTENT_REPORT_IN_TMP') if within?(persistent, File.realpath(Dir.tmpdir))

    readiness = validate_readiness!(opts, runner, target)
    {
      'status' => 'READY_FOR_FINAL_PROOF',
      'mission_id' => MISSION_ID,
      'runner_head' => runner_head,
      'target_head' => target_head,
      'template_sha256' => sha256(File.join(runner, '.agents/pilotos/templates', TEMPLATE_NAMES[0])),
      'card_sha256' => sha256(File.join(runner, '.agents/pilotos/templates', TEMPLATE_NAMES[1])),
      'plan_sha256' => sha256(File.join(runner, '.agents/pilotos/templates', TEMPLATE_NAMES[2])),
      'staging_report' => staging_report,
      'persistent_report' => persistent,
      'readiness' => readiness,
      'runtime_executed' => false,
      'state_reserved' => false
    }
  end

  def inspect_result(opts)
    runner = require_absolute_dir!(opts[:runner_root], 'RUNNER_ROOT_INVALID')
    target = require_absolute_dir!(opts[:target_worktree], 'TARGET_WORKTREE_INVALID')
    report_path = require_absolute_path!(opts[:output], 'REPORT_REQUIRED')
    report_root = ensure_external_root!(opts[:report_root], runner, target, 'REPORT_ROOT_INVALID', reject_tmp: true)
    state_dir = ensure_external_root!(opts[:state_dir], runner, target, 'STATE_ROOT_INVALID')
    evidence_root = ensure_external_root!(opts[:evidence_root], runner, target, 'EVIDENCE_ROOT_INVALID')
    persistent = require_absolute_path!(opts[:persistent_report], 'PERSISTENT_REPORT_REQUIRED')
    persistent_canonical = canonical_path(persistent, 'PERSISTENT_REPORT_INVALID')
    report_root_canonical = canonical_path(report_root, 'REPORT_ROOT_INVALID')
    block!('PERSISTENT_REPORT_OUTSIDE_ROOT') unless within?(persistent_canonical, report_root_canonical)
    require_file!(report_path, 'REPORT_MISSING')
    block!('PERSISTENT_REPORT_EXISTS') if pending?(persistent)
    block!('PERSISTENT_REPORT_IN_TMP') if within?(persistent, File.realpath(Dir.tmpdir))
    atomic_copy(report_path, persistent)

    failures = []
    report = parse_json_post_run(report_path, failures, 'REPORT_JSON_INVALID')
    canonical_report_hash = nil
    if report.is_a?(Hash)
      canonical_report_hash = AgentSingleRuntime.compute_report_hash(report)
      failures << 'REPORT_HASH_MISMATCH' unless report.fetch('relatorio_sha256', '') == canonical_report_hash
      begin
        schema = JSON.parse(File.read(File.join(runner, '.agents/orquestracao/executor/contrato-relatorio.schema.json')))
        MissionPlanner.send(:validate_against_schema!, report, schema)
      rescue StandardError => e
        failures << "REPORT_SCHEMA_INVALID:#{e.class}"
      end
      failures << 'MISSION_ID_MISMATCH' unless report['missao_id'] == MISSION_ID
      failures << 'COMPARISON_NOT_CONFORME' unless report.dig('comparacao', 'status') == 'conforme'
      failures << 'DIMENSIONS_INVALID' unless report.dig('resultado_dimensoes', 'execution') == 'succeeded' && report.dig('resultado_dimensoes', 'delivery') == 'succeeded' && report.dig('resultado_dimensoes', 'compliance') == 'conforme'
      failures << 'REPORT_NOT_SUCCESS' unless report['status'] == 'success'
      failures << 'DELIVERY_INVALID' unless report.dig('delivery_verification', 'status') == 'succeeded'
      failures << 'FORENSIC_EVIDENCE_NOT_COMPLETE' unless report.dig('forensic_evidence', 'evidence_status') == 'complete'
      failures << 'MANIFEST_PATH_INVALID' unless report.dig('forensic_evidence', 'manifest_relpath') == "#{MISSION_ID}/attempt-001/evidence-manifest.json"
      failures << 'LEDGER_INVALID' unless report['task_ledger'].is_a?(Array) && report['task_ledger'].size == 1 && report.dig('task_ledger', 0, 'tentativa') == 1 && report.dig('task_ledger', 0, 'status') == 'succeeded'
      failures << 'HANDOFF_INVALID' unless report.dig('handoff', 'requer_aprovacao_humana') == true
    end

    state_file = File.join(state_dir, "#{MISSION_ID}.json")
    failures.concat(validate_state(state_file, canonical_report_hash))
    manifest = File.join(evidence_root, MISSION_ID, 'attempt-001', 'evidence-manifest.json')
    expected_manifest_hash = report&.dig('forensic_evidence', 'manifest_sha256')
    failures.concat(validate_manifest(manifest, runner, expected_manifest_hash))
    failures.concat(validate_diff(target))

    classification = failures.empty? ? 'PROVA_FINAL_SUCCESS' : 'PROVA_FINAL_FAILURE_NO_RETRY'
    {'status' => classification, 'mission_id' => MISSION_ID, 'persistent_report' => persistent,
     'failures' => failures.uniq, 'runtime_executed' => true, 'state_reserved' => true}
  end

  def validate_templates!(root)
    dir = File.join(root, '.agents/pilotos/templates')
    require_file!(File.join(root, '.agents/planos/prova-final-supervisionada-v1.md'), 'SPEC_MISSING')
    paths = TEMPLATE_NAMES.map { |name| File.join(dir, name) }
    paths.each { |path| require_file!(path, 'TEMPLATE_MISSING') }
    card = parse_json(paths[1], [], 'CARD_INVALID')
    plan = parse_json(paths[2], [], 'PLAN_INVALID')
    template = AgentSupervisedPilot.load_template!(root, missao_id: MISSION_ID)
    schema_card = JSON.parse(File.read(File.join(root, '.agents/orquestracao/cartao-missao.schema.json')))
    schema_plan = JSON.parse(File.read(File.join(root, '.agents/orquestracao/contrato-plano.schema.json')))
    MissionPlanner.send(:validate_against_schema!, card, schema_card)
    MissionPlanner.send(:validate_against_schema!, plan, schema_plan)
    block!('TEMPLATE_CARD_DIVERGENCE') unless template['card'] == card
    [card, plan, template]
  rescue AgentSupervisedPilot::Denial => e
    block!(e.code, e.message)
  rescue MissionPlanner::SchemaError => e
    block!('TEMPLATE_SCHEMA_INVALID', e.message)
  end

  def validate_mission_contract!(card, plan, template, root = File.expand_path('..', __dir__))
    AgentSupervisedPilot.validate_mission!(card: card, plan: plan, template: template, root: root)
    block!('MISSION_ID_MISMATCH') unless card['id'] == MISSION_ID && plan['missao_id'] == MISSION_ID
    block!('PLAN_NOT_SINGLE_AGENT') unless plan.dig('topologia', 'agentes')&.size == 1 && plan.dig('resumo_operacional', 'agentes_planejados') == 1
    block!('PLAN_WRITER_INVALID') unless plan.dig('topologia', 'agentes').count { |a| a['permissao'] == 'workspace-write' } == 1
    block!('PLAN_TASK_INVALID') unless plan['tarefas_planejadas']&.size == 1
    block!('PLAN_RETRY_INVALID') unless plan.dig('limites', 'max_retentativas') == 0
    block!('PLAN_NETWORK_INVALID') if plan['rede_permitida'] == true
    block!('PLAN_SHELL_INVALID') if plan['shell_permitido'] == true
    block!('PLAN_DELEGATION_INVALID') if plan['delegacao_permitida'] == true || plan.dig('topologia', 'permite_subdelegacao') == true
    writes = Array(plan.dig('tarefas_planejadas', 0, 'arquivos', 'escrita')).uniq
    block!('WRITE_SCOPE_INVALID') unless writes == [DELIVERY_REL]
    block!('DELIVERY_PATH_INVALID') unless template.dig('formato_arquivo', 'path') == DELIVERY_REL
    true
  rescue AgentSupervisedPilot::Denial => e
    block!(e.code, e.message)
  end

  def validate_readiness!(opts, runner, target)
    block!('BYPASS_ENV_ACTIVE') if BYPASS_ENV.any? { |name| !ENV[name].to_s.empty? }
    block!('RUNTIME_ENV_ACTIVE') if %w[AGENT_RUNTIME_EXECUTE AGENT_RUNTIME_PILOT].any? { |name| !ENV[name].to_s.empty? }
    report = if opts[:readiness_report]
               parse_json(opts[:readiness_report], [], 'READINESS_JSON_INVALID')
             else
               stdout, stderr, status = Open3.capture3(RbConfig.ruby, File.join(runner, 'scripts/check-pilot-readiness.rb'), '--stdout')
               block!('READINESS_COMMAND_FAILED') unless status.success?
               parse_json_text(stdout, 'READINESS_JSON_INVALID')
             end
    block!('READINESS_NOT_READY') unless report.is_a?(Hash) && report['status'] == 'ready'
    block!('CODEX_VERSION_MISMATCH') unless report.dig('codex', 'versao').to_s == '0.144.0'
    dcg_version = report.dig('dcg', 'versao').to_s.sub(/\Av/, '')
    block!('DCG_VERSION_MISMATCH') unless dcg_version == '0.6.6'
    if opts[:live_preflight]
      stdout, stderr, status = Open3.capture3(RbConfig.ruby, File.join(runner, 'scripts/runtime-safety-preflight.rb'), '--mode', 'live', '--worktree', target, '--stdout')
      block!('PREFLIGHT_COMMAND_FAILED') unless status.success?
      preflight = parse_json_text(stdout, 'PREFLIGHT_JSON_INVALID')
      block!('PREFLIGHT_NOT_READY') unless preflight.is_a?(Hash) && preflight['status'] == 'ready'
      return {'readiness' => report, 'preflight' => preflight}
    end
    {'readiness' => report}
  end

  def validate_state(path, report_hash)
    failures = []
    failures << 'STATE_MISSING' unless File.file?(path)
    return failures unless File.file?(path)
    failures << 'STATE_SYMLINK' if File.symlink?(path)
    failures << 'STATE_MODE_INVALID' unless (File.stat(path).mode & 0o777) == 0o600
    state = parse_json_post_run(path, failures, 'STATE_JSON_INVALID')
    if state.is_a?(Hash)
      failures << 'STATE_MISSION_MISMATCH' unless state['missao_id'] == MISSION_ID
      failures << 'STATE_ATTEMPT_INVALID' unless state['attempt'] == 1
      failures << 'STATE_STATUS_INVALID' unless state['status'] == 'report_finalized'
      failures << 'STATE_REPORT_HASH_MISMATCH' unless report_hash && state['report_hash'] == report_hash
    end
    failures
  end

  def validate_manifest(path, runner, expected_manifest_hash = nil)
    failures = []
    failures << 'MANIFEST_MISSING' unless File.file?(path)
    return failures unless File.file?(path)
    manifest = parse_json_post_run(path, failures, 'MANIFEST_JSON_INVALID')
    return failures unless manifest.is_a?(Hash)
    schema = JSON.parse(File.read(File.join(runner, '.agents/orquestracao/executor/contrato-evidencia-forense.schema.json')))
    begin
      MissionPlanner.send(:validate_against_schema!, manifest, schema)
    rescue StandardError
      failures << 'MANIFEST_SCHEMA_INVALID'
    end
    failures << 'MANIFEST_ID_INVALID' unless manifest['mission_id'] == MISSION_ID && manifest['attempt'] == 1
    failures << 'MANIFEST_STATUS_INVALID' unless manifest['evidence_status'] == 'complete' && manifest['schema_version'] == 1
    failures << 'MANIFEST_HASH_MISMATCH' unless expected_manifest_hash && Digest::SHA256.file(path).hexdigest == expected_manifest_hash
    failures << 'MANIFEST_SANITIZATION_INVALID' unless manifest.dig('sanitization', 'sanitized') == true && manifest.dig('sanitization', 'fail_closed') == true && manifest.dig('sanitization', 'sanitization_failed') != true
    entries = Array(manifest['artifacts'])
    failures << 'MANIFEST_ARTIFACT_SET_INVALID' unless entries.map { |e| e['name'] }.sort == MANIFEST_ARTIFACTS.sort
    dir = File.dirname(path)
    entries.each do |entry|
      name = entry['name'].to_s
      if name.empty? || name.start_with?('/') || name.split('/').include?('..') || name.split('/').include?('.')
        failures << 'MANIFEST_ARTIFACT_PATH_INVALID'
        next
      end
      artifact = File.expand_path(name, dir)
      failures << 'MANIFEST_ARTIFACT_ESCAPE' unless within?(artifact, dir)
      unless File.file?(artifact)
        failures << 'MANIFEST_ARTIFACT_MISSING'
        next
      end
      failures << 'MANIFEST_ARTIFACT_BYTES_INVALID' unless entry['bytes'] == File.size(artifact)
      failures << 'MANIFEST_ARTIFACT_HASH_INVALID' unless entry['sha256'] == sha256(artifact)
      failures << 'MANIFEST_ARTIFACT_UNSANITIZED' unless entry['sanitized'] == true
      failures << 'MANIFEST_ARTIFACT_TRUNCATED' unless entry['truncated'] == false
    end
    failures
  end

  def validate_diff(target)
    out, status = Open3.capture2('git', '-C', target, 'status', '--porcelain=v1', '--untracked-files=all', '-z')
    return ['GIT_STATUS_FAILED'] unless status.success?
    entries = out.split("\0").reject(&:empty?)
    return [] if entries.size == 1 && entries.first.byteslice(3..) == DELIVERY_REL
    ['OUT_OF_SCOPE_DIFF']
  end

  def atomic_copy(source, destination)
    dir = File.dirname(destination)
    block!('REPORT_ROOT_MISSING') unless File.directory?(dir)
    tmp = File.join(dir, ".#{File.basename(destination)}.tmp-#{Process.pid}")
    File.open(tmp, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write(File.binread(source)); f.flush; f.fsync }
    File.rename(tmp, destination)
  ensure
    File.delete(tmp) if tmp && File.exist?(tmp)
  end

  def require_absolute_dir!(path, code)
    value = require_absolute_path!(path, code)
    block!(code, 'diretório ausente') unless File.directory?(value)
    ensure_no_symlink_chain!(value, code)
    File.realpath(value)
  end

  def require_absolute_dir_path!(path, code)
    value = require_absolute_path!(path, code)
    ensure_no_symlink_chain!(value, code)
    block!(code, 'ancestor inexistente') unless File.directory?(File.dirname(value)) || File.directory?(value)
    value
  end

  def ensure_external_root!(path, runner, target, code, reject_tmp: false)
    value = require_absolute_dir_path!(path, code)
    canonical = canonical_path(value, code)
    block!(code, 'raiz dentro de worktree') if within?(canonical, runner) || within?(canonical, target)
    block!(code, 'raiz temporária') if reject_tmp && within?(canonical, File.realpath(Dir.tmpdir))
    value
  end

  def canonical_path(path, code)
    absolute = require_absolute_path!(path, code)
    ancestor = absolute
    ancestor = File.dirname(ancestor) until File.exist?(ancestor) || File.symlink?(ancestor) || ancestor == '/'
    ensure_no_symlink_chain!(ancestor, code)
    real = File.realpath(ancestor)
    suffix = absolute.delete_prefix(ancestor)
    real + suffix
  rescue SystemCallError => e
    block!(code, e.message)
  end

  def ensure_no_symlink_chain!(path, code)
    candidate = path
    loop do
      block!(code, "symlink: #{candidate}") if File.symlink?(candidate)
      break if candidate == '/'
      candidate = File.dirname(candidate)
    end
  end

  def require_absolute_path!(path, code)
    value = path.to_s
    block!(code, 'caminho absoluto obrigatório') if value.empty? || value != File.expand_path(value)
    value
  end

  def require_sha!(value, code)
    block!(code) unless value.to_s.match?(/\A[0-9a-f]{40}\z/)
    value
  end

  def ensure_clean!(root, code)
    out, status = Open3.capture2('git', '-C', root, 'status', '--porcelain')
    block!(code) unless status.success? && out.empty?
  end

  def git_output!(root, *args)
    out, status = Open3.capture2('git', '-C', root, *args)
    block!('GIT_QUERY_FAILED') unless status.success?
    out.strip
  end

  def require_file!(path, code)
    block!(code, path) unless File.file?(path) && !File.symlink?(path)
    path
  end

  def pending?(path)
    File.exist?(path) || File.symlink?(path)
  end

  def within?(path, root)
    target = File.expand_path(path)
    base = File.expand_path(root)
    target == base || target.start_with?(base + File::SEPARATOR)
  end

  def parse_json(path, failures, code)
    parse_json_text(File.read(path), code)
  rescue SystemCallError, JSON::ParserError => e
    failures << code
    nil
  end

  def parse_json_post_run(path, failures, code)
    JSON.parse(File.read(path))
  rescue SystemCallError, JSON::ParserError
    failures << code
    nil
  end

  def parse_json_text(text, code)
    JSON.parse(text)
  rescue JSON::ParserError => e
    block!(code, e.message)
  end

  def sha256(path)
    Digest::SHA256.file(path).hexdigest
  end

  def block!(code, message = code)
    raise Blocked.new(code, message)
  end
end

if $PROGRAM_NAME == __FILE__
  require 'rbconfig'
  FinalSupervisedProofControl.run(ARGV)
end
