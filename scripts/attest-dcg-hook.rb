#!/usr/bin/env ruby
# frozen_string_literal: true

# Atestação humana do hook DCG — NÃO altera hooks.json.
# Uso:
#   ruby scripts/attest-dcg-hook.rb \
#     --ack TRUST_DCG_HOOK \
#     --hooks ~/.codex/hooks.json \
#     --dcg "$(command -v dcg)"

require 'optparse'
require_relative './lib/dcg_hook_attestation'
require_relative './runtime-safety-preflight'

opts = {
  ack: nil,
  hooks: File.expand_path('~/.codex/hooks.json'),
  dcg: nil,
  output: nil
}
OptionParser.new do |p|
  p.on('--ack VALUE') { |v| opts[:ack] = v }
  p.on('--hooks PATH') { |v| opts[:hooks] = v }
  p.on('--dcg PATH') { |v| opts[:dcg] = v }
  p.on('--output PATH') { |v| opts[:output] = v }
end.parse!

begin
  raise 'missing --ack TRUST_DCG_HOOK' if opts[:ack].to_s.empty?
  raise 'missing --dcg' if opts[:dcg].to_s.empty?

  policy = RuntimeSafetyPreflight.load_policy
  dcg = File.expand_path(opts[:dcg])
  hooks = File.expand_path(opts[:hooks])
  probe = RuntimeSafetyPreflight.run_probe(dcg, policy.dig('probe', 'comando_amostra') || 'git reset --hard')
  probe_ok = probe['resultado'] == 'blocked'

  payload = DcgHookAttestation.build_payload(
    hooks_path: hooks,
    dcg_path: dcg,
    policy: policy,
    probe_ok: probe_ok,
    ack: opts[:ack]
  )
  path = DcgHookAttestation.attestation_path(override: opts[:output])
  # Recusar gravar dentro do repositório
  root = File.realpath(RuntimeSafetyPreflight::ROOT)
  begin
    real_parent = File.realpath(File.dirname(path)) rescue File.expand_path(File.dirname(path))
    if real_parent == root || real_parent.start_with?(root + File::SEPARATOR)
      raise "atestação não pode ficar dentro da worktree: #{path}"
    end
  rescue SystemCallError
    # parent may not exist yet — check expand path prefix
    exp = File.expand_path(path)
    if exp.start_with?(root + File::SEPARATOR)
      raise "atestação não pode ficar dentro da worktree: #{path}"
    end
  end

  DcgHookAttestation.write_atomic!(path, payload)
  puts JSON.pretty_generate('status' => 'ok', 'path' => path, 'expira_em' => payload['expira_em'])
  exit 0
rescue DcgHookAttestation::Denial => e
  warn JSON.pretty_generate('status' => 'denied', 'codigo' => e.code, 'mensagem' => e.message)
  exit 2
rescue StandardError => e
  warn JSON.pretty_generate('status' => 'error', 'mensagem' => e.message)
  exit 1
end
