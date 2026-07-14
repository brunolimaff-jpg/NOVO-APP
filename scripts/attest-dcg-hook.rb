#!/usr/bin/env ruby
# frozen_string_literal: true

# Atestação humana do hook DCG — NÃO altera hooks.json.
# Uso:
#   ruby scripts/attest-dcg-hook.rb \
#     --ack TRUST_DCG_HOOK \
#     --hooks ~/.codex/hooks.json \
#     --dcg "$(command -v dcg)"

require 'optparse'
require 'fileutils'
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

def resolve_existing_ancestor(path)
  exp = File.expand_path(path)
  return File.realpath(exp) if File.exist?(exp) || File.symlink?(exp)

  dir = File.dirname(exp)
  while dir != File.dirname(dir) && !File.exist?(dir) && !File.symlink?(dir)
    dir = File.dirname(dir)
  end
  begin
    File.realpath(dir)
  rescue SystemCallError
    File.expand_path(dir)
  end
end

def path_inside_repo?(candidate, root)
  root_real = File.realpath(root)
  root_exp = File.expand_path(root)
  path_exp = File.expand_path(candidate)
  path_real =
    begin
      if File.exist?(path_exp) || File.symlink?(path_exp)
        File.realpath(path_exp)
      else
        resolve_existing_ancestor(path_exp)
      end
    rescue SystemCallError
      path_exp
    end

  [path_exp, path_real].any? do |p|
    p == root_exp || p == root_real ||
      p.start_with?(root_exp + File::SEPARATOR) ||
      p.start_with?(root_real + File::SEPARATOR)
  end
end

begin
  raise 'missing --ack TRUST_DCG_HOOK' if opts[:ack].to_s.empty?
  raise 'missing --dcg' if opts[:dcg].to_s.empty?

  policy = RuntimeSafetyPreflight.load_policy
  dcg = File.expand_path(opts[:dcg])
  hooks = File.expand_path(opts[:hooks])
  sample = policy.dig('probe', 'comando_amostra') || ('git ' + 'reset' + ' --' + 'hard')
  probe = RuntimeSafetyPreflight.run_probe(dcg, sample)
  probe_ok = probe['resultado'] == 'blocked'

  payload = DcgHookAttestation.build_payload(
    hooks_path: hooks,
    dcg_path: dcg,
    policy: policy,
    probe_ok: probe_ok,
    ack: opts[:ack]
  )
  path = DcgHookAttestation.attestation_path(override: opts[:output])
  root = RuntimeSafetyPreflight::ROOT
  if path_inside_repo?(path, root)
    raise "atestação não pode ficar dentro da worktree: #{path}"
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
