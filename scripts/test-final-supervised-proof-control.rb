#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'tmpdir'
require 'fileutils'
require 'digest'
require 'open3'
require 'rbconfig'
require_relative './final-supervised-proof-control'

module FinalSupervisedProofControlTest
  include FinalSupervisedProofControl
  module_function

  def assert(condition, message)
    raise "ASSERTION_FAILED: #{message}" unless condition
  end

  def raises(code)
    yield
    raise "EXPECTED_BLOCK: #{code}"
  rescue FinalSupervisedProofControl::Blocked => e
    assert(e.code == code, "expected #{code}, got #{e.code}")
  end

  def write_json(path, object)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, JSON.pretty_generate(object) + "\n")
  end

  def make_fixture
    repo = File.expand_path('..', __dir__)
    root = File.realpath(Dir.mktmpdir('final-proof-control-'))
    runner = File.join(root, 'runner')
    target = File.join(root, 'target')
    FileUtils.mkdir_p([runner, target])
    FileUtils.cp_r(File.join(repo, 'scripts'), runner)
    FileUtils.cp_r(File.join(repo, '.agents'), runner)
    template_dir = File.join(runner, '.agents/pilotos/templates')
    source = File.join(repo, '.agents/pilotos/templates')
    %w[quarto-piloto-supervisionado-20260717t-final.json quarto-piloto-supervisionado-20260717t-final.card.json quarto-piloto-supervisionado-20260717t-final.plan.json].each do |name|
      FileUtils.cp(File.join(source, name), File.join(template_dir, name))
    end
    bin = File.join(root, 'bin')
    FileUtils.mkdir_p(bin)
    File.write(File.join(bin, 'git'), <<~RUBY)
      #!/usr/bin/env ruby
      args = ARGV
      path = args[args.index('-C') + 1] if args.include?('-C')
      if args.include?('rev-parse')
        puts(path.to_s.end_with?('/runner') ? '#{runner_head}' : '#{target_baseline}')
      elsif args.any? { |arg| arg.start_with?('--porcelain') }
        entries = []
        entries << ' M dirty.txt' if File.exist?(File.join(path.to_s, 'dirty.txt'))
        delivery = File.join(path.to_s, '#{FinalSupervisedProofControl::DELIVERY_REL}')
        entries << '?? #{FinalSupervisedProofControl::DELIVERY_REL}' if File.file?(delivery)
        entries << '?? extra.txt' if File.file?(File.join(path.to_s, 'extra.txt'))
        print(entries.join("\\0"))
      else
        exit 1
      end
    RUBY
    FileUtils.chmod(0o755, File.join(bin, 'git'))
    readiness = File.join(root, 'readiness.json')
    write_json(readiness, 'status' => 'ready', 'resultado' => 'PILOT_READY_ENVIRONMENT', 'codex' => {'versao' => '0.144.0'}, 'dcg' => {'versao' => 'v0.6.6'})
    report_root = File.realpath(Dir.pwd)
    state_root = File.realpath(Dir.mktmpdir('final-proof-state-'))
    evidence_root = File.realpath(Dir.mktmpdir('final-proof-evidence-'))
    {
      root: root, runner: runner, target: target, readiness: readiness,
      report_root: report_root, state_root: state_root, evidence_root: evidence_root,
      output: File.join(Dir.tmpdir, "final-proof-#{Process.pid}.json"),
      runner_head: runner_head, target_baseline: target_baseline,
      old_path: ENV['PATH']
    }
  end

  def runner_head
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  end

  def target_baseline
    FinalSupervisedProofControl::TARGET_BASELINE
  end

  def prepare_opts(f)
    {
      runner_root: f[:runner], target_worktree: f[:target], runner_head: f[:runner_head],
      target_baseline: f[:target_baseline], output: f[:output], report_root: f[:report_root],
      persistent_report: File.join(f[:report_root], 'future.json'), evidence_root: f[:evidence_root],
      state_dir: f[:state_root], readiness_report: f[:readiness], live_preflight: false, stdout: false
    }
  end

  def inspect_opts(f, report_path, persistent = nil)
    {
      runner_root: f[:runner], target_worktree: f[:target], output: report_path,
      persistent_report: persistent || File.join(f[:report_root], "inspect-#{Process.pid}.json"),
      report_root: f[:report_root], evidence_root: f[:evidence_root], state_dir: f[:state_root], stdout: false
    }
  end

  def build_manifest(f)
    dir = File.join(f[:evidence_root], FinalSupervisedProofControl::MISSION_ID, 'attempt-001')
    FileUtils.mkdir_p(dir)
    contents = {
      'execution-stream.sanitized.jsonl' => "{}\n",
      'execution-evidence.json' => "{}\n",
      'stderr.sanitized.log' => ""
    }
    artifacts = contents.map do |name, content|
      path = File.join(dir, name)
      File.binwrite(path, content)
      {'name' => name, 'sha256' => Digest::SHA256.hexdigest(content), 'bytes' => content.bytesize,
       'encoding' => 'UTF-8', 'truncated' => false, 'sanitized' => true}
    end
    manifest = {
      'schema_version' => 1, 'mission_id' => FinalSupervisedProofControl::MISSION_ID, 'attempt' => 1,
      'evidence_status' => 'complete', 'retention_days' => 30, 'truncated' => false,
      'discarded_bytes' => 0, 'discarded_records' => 0,
      'limits' => {'stream_bytes' => 1_048_576, 'stream_records' => 10_000},
      'artifacts' => artifacts,
      'sanitization' => {'sanitized' => true, 'fail_closed' => true, 'sanitization_failed' => false},
      'integrity' => {'manifest_hash_excludes_self' => true}
    }
    path = File.join(dir, 'evidence-manifest.json')
    write_json(path, manifest)
    [path, Digest::SHA256.file(path).hexdigest]
  end

  def run
    f = make_fixture
    old_path = ENV['PATH']
    ENV['PATH'] = File.join(f[:root], 'bin') + File::PATH_SEPARATOR + old_path
    begin
      runbook = File.read(File.join(File.expand_path('..', __dir__), '.agents/planos/executar-prova-final-supervisionada.md'))
      assert(runbook.include?('--report-root "$REPORT_ROOT" \\'), 'runbook passa report root no inspect')
      script = File.join(File.expand_path('..', __dir__), 'scripts/final-supervised-proof-control.rb')
      prepare_out, = Open3.capture3(RbConfig.ruby, script, 'prepare', '--stdout', '--runner-root', '/path/does/not/exist')
      prepare_result = JSON.parse(prepare_out)
      assert(prepare_result['status'] == 'BLOCKED_BEFORE_RESERVATION' && prepare_result['runtime_executed'] == false, 'prepare blocked preserva classificação pré-reserva')
      inspect_out, = Open3.capture3(RbConfig.ruby, script, 'inspect', '--stdout', '--runner-root', '/path/does/not/exist')
      inspect_result = JSON.parse(inspect_out)
      assert(inspect_result['status'] == 'PROVA_FINAL_FAILURE_NO_RETRY' && inspect_result['runtime_executed'] == true && inspect_result['state_reserved'] == true, 'inspect blocked é no-retry')
      json_error = FinalSupervisedProofControl.error_result('inspect', 'JSON_INVALID')
      assert(json_error['runtime_executed'] == true && json_error['state_reserved'] == true && !json_error['failures'].empty?, 'JSON inspect nunca informa execução falsa')

      ready = FinalSupervisedProofControl.prepare(prepare_opts(f))
      assert(ready['status'] == 'READY_FOR_FINAL_PROOF', 'happy path ready')
      assert(ready['runtime_executed'] == false && ready['state_reserved'] == false, 'prepare is read-only')

      bad = prepare_opts(f).merge(runner_head: target_baseline)
      raises('RUNNER_HEAD_MISMATCH') { FinalSupervisedProofControl.prepare(bad) }
      raises('TARGET_BASELINE_NOT_FROZEN') { FinalSupervisedProofControl.prepare(prepare_opts(f).merge(target_baseline: 'b' * 40)) }
      raises('OUTPUT_PATH_REJECTED') { FinalSupervisedProofControl.prepare(prepare_opts(f).merge(output: '/etc/final-proof-output.json')) }

      File.write(File.join(f[:runner], 'dirty.txt'), 'dirty')
      raises('RUNNER_WORKTREE_DIRTY') { FinalSupervisedProofControl.prepare(prepare_opts(f)) }
      File.delete(File.join(f[:runner], 'dirty.txt'))

      state = File.join(f[:state_root], "#{FinalSupervisedProofControl::MISSION_ID}.json")
      File.write(state, '{}')
      raises('STATE_ALREADY_EXISTS') { FinalSupervisedProofControl.prepare(prepare_opts(f)) }
      File.delete(state)
      attempt = File.join(f[:evidence_root], FinalSupervisedProofControl::MISSION_ID, 'attempt-001')
      FileUtils.mkdir_p(attempt)
      raises('FORENSIC_ATTEMPT_ALREADY_EXISTS') { FinalSupervisedProofControl.prepare(prepare_opts(f)) }
      FileUtils.rm_rf(attempt)

      raises('FORENSIC_EVIDENCE_ROOT_INVALID') { FinalSupervisedProofControl.prepare(prepare_opts(f).merge(evidence_root: File.join(f[:target], 'evidence'))) }
      raises('PILOT_STATE_ROOT_INVALID') { FinalSupervisedProofControl.prepare(prepare_opts(f).merge(state_dir: File.join(f[:runner], 'state'))) }

      missing = File.join(f[:runner], '.agents/pilotos/templates', "#{FinalSupervisedProofControl::MISSION_ID}.plan.json")
      FileUtils.mv(missing, "#{missing}.missing")
      raises('TEMPLATE_MISSING') { FinalSupervisedProofControl.prepare(prepare_opts(f)) }
      FileUtils.mv("#{missing}.missing", missing)

      card = JSON.parse(File.read(File.join(f[:runner], '.agents/pilotos/templates', "#{FinalSupervisedProofControl::MISSION_ID}.card.json")))
      card['execucao_planejada']['tarefas'][0]['arquivos']['escrita'] << 'outro.txt'
      write_json(File.join(f[:runner], '.agents/pilotos/templates', "#{FinalSupervisedProofControl::MISSION_ID}.card.json"), card)
      raises('TEMPLATE_CARD_DIVERGENCE') { FinalSupervisedProofControl.prepare(prepare_opts(f)) }
      FileUtils.cp(File.join(File.expand_path('..', __dir__), '.agents/pilotos/templates', "#{FinalSupervisedProofControl::MISSION_ID}.card.json"), File.join(f[:runner], '.agents/pilotos/templates', "#{FinalSupervisedProofControl::MISSION_ID}.card.json"))

      assert(FinalSupervisedProofControl.validate_diff(f[:target]) == ['OUT_OF_SCOPE_DIFF'], 'diff vazio rejeitado')
      delivery = File.join(f[:target], FinalSupervisedProofControl::DELIVERY_REL)
      FileUtils.mkdir_p(File.dirname(delivery))
      File.write(delivery, "delivery\\n")
      assert(FinalSupervisedProofControl.validate_diff(f[:target]).empty?, 'somente delivery aceito')
      File.write(File.join(f[:target], 'extra.txt'), 'extra')
      assert(FinalSupervisedProofControl.validate_diff(f[:target]) == ['OUT_OF_SCOPE_DIFF'], 'arquivo adicional rejeitado')
      File.delete(File.join(f[:target], 'extra.txt'))

      manifest_path, manifest_hash = build_manifest(f)
      assert(FinalSupervisedProofControl.validate_manifest(manifest_path, f[:runner], manifest_hash).empty?, 'manifesto válido')
      non_object_report = File.join(f[:root], 'non-object-report.json')
      non_object_state = File.join(f[:state_root], 'non-object-state.json')
      non_object_manifest = File.join(f[:root], 'non-object-manifest.json')
      File.write(non_object_report, '[]')
      File.write(non_object_state, '[]')
      File.write(non_object_manifest, '[]')
      report_failures = []
      state_failures = []
      manifest_failures = []
      FinalSupervisedProofControl.parse_json_post_run(non_object_report, report_failures, 'REPORT_JSON_INVALID')
      FinalSupervisedProofControl.parse_json_post_run(non_object_state, state_failures, 'STATE_JSON_INVALID')
      FinalSupervisedProofControl.parse_json_post_run(non_object_manifest, manifest_failures, 'MANIFEST_JSON_INVALID')
      assert(report_failures == ['REPORT_JSON_INVALID'], 'Run Report não-objeto rejeitado')
      assert(state_failures == ['STATE_JSON_INVALID'], 'state não-objeto rejeitado')
      assert(manifest_failures == ['MANIFEST_JSON_INVALID'], 'manifesto não-objeto rejeitado')
      File.delete(File.join(File.dirname(manifest_path), 'stderr.sanitized.log'))
      assert(FinalSupervisedProofControl.validate_manifest(manifest_path, f[:runner], manifest_hash).include?('MANIFEST_ARTIFACT_MISSING'), 'artefato ausente rejeitado')
      File.write(File.join(File.dirname(manifest_path), 'stderr.sanitized.log'), '')
      assert(FinalSupervisedProofControl.validate_manifest(manifest_path, f[:runner], '0' * 64).include?('MANIFEST_HASH_MISMATCH'), 'hash de manifesto divergente rejeitado')
      report_hash = 'a' * 64
      File.write(state_path = File.join(f[:state_root], "#{FinalSupervisedProofControl::MISSION_ID}.json"), '{invalid')
      assert(FinalSupervisedProofControl.validate_state(state_path, report_hash).include?('STATE_JSON_INVALID'), 'state JSON inválido é failure sem retry')
      File.write(manifest_path, '{invalid')
      assert(FinalSupervisedProofControl.validate_manifest(manifest_path, f[:runner], manifest_hash).include?('MANIFEST_JSON_INVALID'), 'manifesto JSON inválido é failure sem retry')

      write_json(state_path, 'missao_id' => FinalSupervisedProofControl::MISSION_ID, 'attempt' => 1, 'status' => 'report_finalized', 'report_hash' => report_hash)
      File.chmod(0o600, state_path)
      assert(!FinalSupervisedProofControl.validate_state(state_path, report_hash).include?('STATE_REPORT_HASH_MISMATCH'), 'state usa hash canônico do report')

      invalid_report = File.join(f[:root], 'invalid-run-report.json')
      File.write(invalid_report, '{invalid')
      inspect_result = FinalSupervisedProofControl.inspect_result(inspect_opts(f, invalid_report))
      assert(inspect_result['status'] == 'PROVA_FINAL_FAILURE_NO_RETRY', 'JSON pós-execução inválido é failure sem retry')
      assert(inspect_result['failures'].include?('REPORT_JSON_INVALID'), 'código de JSON inválido preservado')
      assert(File.file?(File.join(f[:report_root], "inspect-#{Process.pid}.json")), 'report persistido')
      assert(File.file?(invalid_report), 'report temporário preservado')
      raises('PERSISTENT_REPORT_OUTSIDE_ROOT') { FinalSupervisedProofControl.inspect_result(inspect_opts(f, invalid_report, File.join(f[:state_root], 'outside.json'))) }
      raises('STATE_ROOT_INVALID') { FinalSupervisedProofControl.inspect_result(inspect_opts(f, invalid_report).merge(state_dir: File.join(f[:target], 'state'))) }
      raises('EVIDENCE_ROOT_INVALID') { FinalSupervisedProofControl.inspect_result(inspect_opts(f, invalid_report).merge(evidence_root: File.join(f[:target], 'evidence'))) }

      copied = File.join(f[:report_root], 'copy.json')
      write_json(File.join(f[:root], 'source.json'), 'ok' => true)
      FinalSupervisedProofControl.atomic_copy(File.join(f[:root], 'source.json'), copied)
      assert(JSON.parse(File.read(copied))['ok'] == true, 'persistent report copy')

      puts 'final-supervised-proof-control: 36 scenarios passed'
    ensure
      ENV['PATH'] = old_path
      FileUtils.remove_entry(f[:root]) if f && File.exist?(f[:root])
      [f && f[:state_root], f && f[:evidence_root]].compact.each { |p| FileUtils.remove_entry(p) if File.exist?(p) }
      Dir.glob(File.join(f[:report_root], 'inspect-*.json')).each { |p| File.delete(p) }
      File.delete(File.join(f[:report_root], 'copy.json')) if File.exist?(File.join(f[:report_root], 'copy.json'))
      File.delete(f[:output]) if f && File.exist?(f[:output])
    end
  end
end

FinalSupervisedProofControlTest.run
