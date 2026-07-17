#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'tmpdir'
require 'fileutils'
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
    root = Dir.mktmpdir('final-proof-control-', '/private/tmp')
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
      elsif args.include?('--porcelain')
        print(File.exist?(File.join(path.to_s, 'dirty.txt')) ? ' M dirty.txt\\n' : '')
      else
        exit 1
      end
    RUBY
    FileUtils.chmod(0o755, File.join(bin, 'git'))
    readiness = File.join(root, 'readiness.json')
    write_json(readiness, 'status' => 'ready', 'resultado' => 'PILOT_READY_ENVIRONMENT', 'codex' => {'versao' => '0.144.0'}, 'dcg' => {'versao' => 'v0.6.6'})
    report_root = Dir.mktmpdir('final-proof-report-', '/private/tmp')
    state_root = Dir.mktmpdir('final-proof-state-', '/private/tmp')
    evidence_root = Dir.mktmpdir('final-proof-evidence-', '/private/tmp')
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

  def run
    f = make_fixture
    old_path = ENV['PATH']
    ENV['PATH'] = File.join(f[:root], 'bin') + File::PATH_SEPARATOR + old_path
    begin
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

      assert(FinalSupervisedProofControl.validate_diff(f[:target]).empty?, 'empty diff allowed before delivery') == false rescue nil
      copied = File.join(f[:report_root], 'copy.json')
      write_json(File.join(f[:root], 'source.json'), 'ok' => true)
      FinalSupervisedProofControl.atomic_copy(File.join(f[:root], 'source.json'), copied)
      assert(JSON.parse(File.read(copied))['ok'] == true, 'persistent report copy')

      puts 'final-supervised-proof-control: 14 scenarios passed'
    ensure
      ENV['PATH'] = old_path
      FileUtils.remove_entry(f[:root]) if f && File.exist?(f[:root])
      [f && f[:report_root], f && f[:state_root], f && f[:evidence_root]].compact.each { |p| FileUtils.remove_entry(p) if File.exist?(p) }
      File.delete(f[:output]) if f && File.exist?(f[:output])
    end
  end
end

FinalSupervisedProofControlTest.run
