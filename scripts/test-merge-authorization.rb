#!/usr/bin/env ruby
# frozen_string_literal: true

require_relative './lib/merge_authorization'

@tests = 0
@failed = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
rescue StandardError => e
  @failed += 1
  puts "FAIL #{name}: #{e.message}"
end

def assert(cond, msg = 'assertion failed')
  raise msg unless cond
end

def assert_not_authorized(msg, expected_pr: nil, expected_code: 'MERGE_NOT_AUTHORIZED')
  result = MergeAuthorization.authorized?(human_message: msg, expected_pr: expected_pr)
  assert !result.authorized?, "#{msg.inspect} deveria ser negado, código=#{result.code}"
  assert result.code == expected_code, "#{msg.inspect} código esperado #{expected_code}, obtido #{result.code}"
end

def assert_authorized(msg, expected_pr: nil)
  result = MergeAuthorization.authorized?(human_message: msg, expected_pr: expected_pr)
  assert result.authorized?, "#{msg.inspect} deveria ser autorizado, código=#{result.code}"
end

# ── Cenários que devem ser NEGADOS ──

test('"pode fazer squash merge" → negado') do
  assert_not_authorized('pode fazer squash merge')
end

test('"tecnicamente pode dar merge" → negado') do
  assert_not_authorized('tecnicamente pode dar merge')
end

test('"não faça MERGE" → negado') do
  assert_not_authorized('não faça MERGE')
end

test('"exemplo: MERGE" → negado') do
  assert_not_authorized('exemplo: MERGE')
end

test('mensagem anterior MERGE + atual "ve aí" → negado') do
  # A função só vê a mensagem atual, nunca o histórico
  assert_not_authorized('ve aí')
end

test('relatório contendo MERGE → negado') do
  assert_not_authorized('Relatório: o veredito é MERGE PR 435')
end

test('"merge" minúsculo → negado') do
  assert_not_authorized('merge')
end

test('"MERGE PR" sem número → negado') do
  assert_not_authorized('MERGE PR')
end

test('"MERGE PR abc" não numérico → negado') do
  assert_not_authorized('MERGE PR abc')
end

test('"MERGE PR 0" zero → negado') do
  assert_not_authorized('MERGE PR 0')
end

test('"MERGE PR 435 agora" com sufixo → negado') do
  assert_not_authorized('MERGE PR 435 agora')
end

test('"MERGE PR 435" tentando merge da PR 436 → MERGE_PR_MISMATCH') do
  result = MergeAuthorization.authorized?(human_message: 'MERGE PR 435', expected_pr: 436)
  assert !result.authorized?, 'deveria ser negado'
  assert result.code == 'MERGE_PR_MISMATCH', "código esperado MERGE_PR_MISMATCH, obtido #{result.code}"
end

test('nil → negado') do
  assert_not_authorized(nil)
end

test('string vazia → negado') do
  assert_not_authorized('')
end

# ── Cenários que devem ser AUTORIZADOS ──

test('"MERGE" → autorizado sem PR específica') do
  assert_authorized('MERGE')
end

test('"MERGE PR 435" → autorizado para PR 435') do
  assert_authorized('MERGE PR 435', expected_pr: 435)
end

# ── Teste de integração (sem merge real) ──

class FakeMergeExecutor
  attr_reader :calls
  def initialize
    @calls = []
  end

  def execute(pr_number)
    @calls << pr_number
    "merged #{pr_number}"
  end
end

test('integração: sem autorização, merge nunca chamado') do
  executor = FakeMergeExecutor.new
  msg = 'veja o relatório'
  result = MergeAuthorization.authorized?(human_message: msg, expected_pr: 435)
  if result.authorized?
    executor.execute(435)
  end
  assert executor.calls.empty?, "merge foi chamado sem autorização: #{executor.calls.inspect}"
end

test('integração: PR divergente, merge nunca chamado') do
  executor = FakeMergeExecutor.new
  result = MergeAuthorization.authorized?(human_message: 'MERGE PR 435', expected_pr: 436)
  if result.authorized?
    executor.execute(436)
  end
  assert executor.calls.empty?, "merge foi chamado com PR divergente: #{executor.calls.inspect}"
end

test('integração: autorização válida, merge chamado exatamente uma vez') do
  executor = FakeMergeExecutor.new
  result = MergeAuthorization.authorized?(human_message: 'MERGE PR 435', expected_pr: 435)
  if result.authorized?
    executor.execute(435)
  end
  assert executor.calls.size == 1, "merge deveria ser chamado 1 vez, chamado #{executor.calls.size}"
  assert executor.calls.first == 435, "merge deveria ser para PR 435, foi #{executor.calls.first}"
end

test('integração: MERGE sem PR, merge chamado sem PR') do
  executor = FakeMergeExecutor.new
  result = MergeAuthorization.authorized?(human_message: 'MERGE')
  if result.authorized?
    executor.execute(nil)
  end
  assert executor.calls.size == 1, "merge deveria ser chamado 1 vez, chamado #{executor.calls.size}"
end

# ── Nenhum teste acessa GitHub real ──
puts "\n#{@tests} passed, #{@failed} failed"
exit(@failed.zero? ? 0 : 1)
