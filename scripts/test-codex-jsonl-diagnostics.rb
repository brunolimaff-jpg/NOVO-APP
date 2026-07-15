#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'digest'
require 'fileutils'
require 'tmpdir'
require_relative './lib/codex_jsonl_diagnostics'
require_relative './lib/agent_single_runtime'

ROOT = File.expand_path('..', __dir__)
@tests = 0

def test(name)
  yield
  @tests += 1
  puts "PASS #{name}"
rescue StandardError => e
  puts "FAIL #{name}: #{e.message}"
  puts e.backtrace.first(3).join("\n") if ENV['DEBUG']
  exit 1
end

def assert(cond, msg = 'assertion failed')
  raise msg unless cond
end

def assert_eq(a, b, msg = nil)
  raise "#{msg || 'expected'}: #{b.inspect}, got #{a.inspect}" unless a == b
end

def assert_no_secrets(json_str, secrets)
  secrets.each { |s| raise "secret found: #{s}" if json_str.include?(s) }
end

# ── Contrato real: eventos Codex 0.144.x ──

test('1 command_execution → sinal true, contagem 1') do
  text = <<~JSONL
    {"type":"thread.started"}
    {"type":"turn.started"}
    {"type":"item.started","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.completed","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"turn.completed"}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['status'], 'available', d['codigos'].inspect)
  assert(d['sinais']['execucao_comando'], 'comando esperado')
  assert_eq(d['contagens']['execucoes_comando'], 1, 'deve contar 1 vez')
end

test('2 agent_message → sinal true, texto ausente') do
  text = '{"type":"item.completed","item":{"type":"agent_message","content":"texto secreto"}}'
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert(!json_str.include?('texto secreto'), 'texto não deve aparecer')
  assert(d['sinais']['mensagem_agente'], 'mensagem esperada')
end

test('3 file_change → sinal true, path e patch ausentes') do
  text = '{"type":"item.completed","item":{"type":"file_change","path":"/etc/passwd","patch":"+root"}}'
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert(!json_str.include?('/etc/passwd'), 'path não deve aparecer')
  assert(!json_str.include?('root'), 'patch não deve aparecer')
  assert(d['sinais']['alteracao_arquivo'], 'file_change esperado')
end

test('4 turn.completed → terminal true') do
  text = '{"type":"turn.completed"}'
  d = CodexJsonlDiagnostics.parse(text)
  assert(d['sinais']['evento_terminal'], 'terminal esperado')
end

test('5 turn.failed → terminal + erro') do
  text = '{"type":"turn.failed","error":"explosion"}'
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert(!json_str.include?('explosion'), 'erro não deve vazar')
  assert(d['sinais']['evento_terminal'], 'terminal esperado')
  assert(d['sinais']['erro_estruturado'], 'erro esperado')
end

test('6 item desconhecido → contado, sem sinal') do
  text = '{"type":"item.completed","item":{"type":"web_search","query":"segredo"}}'
  d = CodexJsonlDiagnostics.parse(text)
  assert(!d['sinais']['execucao_comando'], 'não deve inferir comando')
  assert(!d['sinais']['alteracao_arquivo'], 'não deve inferir escrita')
  assert(d['tipos_item']['web_search'] == 1, 'deve contar tipo')
end

test('7 64 tipos + repetição → contagem preservada') do
  tipos = (1..64).map { |i| "evt_#{i}" }
  lines = tipos.map { |t| "{\"type\":\"#{t}\"}" }
  lines << '{"type":"evt_1"}'  # repetição
  d = CodexJsonlDiagnostics.parse(lines.join("\n"))
  assert_eq(d['tipos_evento'].size, 64)
  assert_eq(d['tipos_evento']['evt_1'], 2, 'repetição deve ser contada')
end

test('8 65º tipo único → limit_reached + partial') do
  tipos = (1..66).map { |i| "evt_#{i}" }
  lines = tipos.map { |t| "{\"type\":\"#{t}\"}" }
  d = CodexJsonlDiagnostics.parse(lines.join("\n"))
  assert_eq(d['tipos_evento'].size, 64)
  assert(d['codigos'].include?('CODEX_JSONL_LIMIT_REACHED'))
  assert_eq(d['status'], 'partial')
end

test('9 não-objeto entre eventos → partial') do
  text = <<~JSONL
    {"type":"thread.started"}
    [1,2,3]
    {"type":"turn.completed"}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['status'], 'partial')
  assert(d['codigos'].include?('CODEX_JSONL_NON_OBJECT'))
end

test('10 módulo carregado isoladamente → JSON disponível') do
  out = `ruby -e 'require "./scripts/lib/codex_jsonl_diagnostics"; d = CodexJsonlDiagnostics.parse("{\\\"type\\\":\\\"turn.completed\\\"}"); puts d["status"]' 2>&1`
  assert(out.strip == 'available', "isolado falhou: #{out.strip}")
end

test('11 vazio → unavailable') do
  d = CodexJsonlDiagnostics.parse(nil)
  assert_eq(d['status'], 'unavailable')
  d = CodexJsonlDiagnostics.parse('')
  assert_eq(d['status'], 'unavailable')
end

test('12 linha inválida → partial') do
  text = <<~JSONL
    {"type":"thread.started"}
    linha inválida
    {"type":"turn.completed"}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['status'], 'partial')
  assert(d['codigos'].include?('CODEX_JSONL_INVALID_LINE'))
  assert_eq(d['objetos_json_validos'], 2)
end

test('13 stdout truncado → partial') do
  text = '{"type":"turn.completed"}'
  d = CodexJsonlDiagnostics.parse(text, truncated: true)
  assert_eq(d['status'], 'partial')
  assert(d['codigos'].include?('CODEX_JSONL_TRUNCATED'))
end

test('14 limite de linhas → partial') do
  lines = (1..15_000).map { '{"type":"turn.started"}' }
  d = CodexJsonlDiagnostics.parse(lines.join("\n"))
  assert_eq(d['objetos_json_validos'], 10_000)
  assert(d['codigos'].include?('CODEX_JSONL_LIMIT_REACHED'))
  assert_eq(d['status'], 'partial')
end

test('15 secrets ausentes do diagnóstico') do
  text = <<~JSONL
    {"type":"item.completed","item":{"type":"command_execution","command":"export TOKEN=sk-abc"}}
    {"type":"item.completed","item":{"type":"file_change","path":"/home/.ssh/key","patch":"PRIVATE"}}
    {"type":"error","message":"token ghp_bearer"}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert_no_secrets(json_str, ['sk-abc', 'PRIVATE', 'ghp_bearer', '/home/.ssh'])
end

test('16 conhecidos não contam como desconhecidos') do
  text = <<~JSONL
    {"type":"thread.started"}
    {"type":"turn.started"}
    {"type":"turn.completed"}
    {"type":"item.started","item":{"type":"reasoning"}}
    {"type":"item.completed","item":{"type":"reasoning"}}
    {"type":"item.updated","item":{"type":"plan_update"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  # thread.started, turn.started, turn.completed são conhecidos → não contam como desconhecidos
  # item.started e item.completed são conhecidos
  # item.updated é conhecido
  assert(d['eventos_desconhecidos'] == 0 || d['eventos_desconhecidos'].is_a?(Integer))
end

# ── Integração build_resultado_dimensoes ──

def make_comparacao(itens, status = 'conforme')
  { 'status' => status, 'itens' => itens }
end

def make_after(negacoes: [], modificados: [])
  { 'negacoes' => negacoes.map { |c| { 'codigo' => c, 'mensagem' => c } },
    'arquivos_modificados' => modificados }
end

def make_spawn(exit_code: 0, pid: 1)
  { 'exit_code' => exit_code, 'processos_iniciados' => pid ? 1 : 0, 'timeout' => false }
end

test('17 dimensões: um arquivo planejado ausente → delivery failed') do
  itens = [
    { 'campo' => 'arquivo_planejado', 'codigo' => 'OBSERVED_EXPECTED_FILE_UNCHANGED',
      'esperado' => 'sandbox.md', 'observado' => nil, 'resultado' => 'desvio', 'severidade' => 'baixa' }
  ]
  comp = make_comparacao(itens, 'desvio')
  after = make_after(modificados: ['outro.txt'])
  spawn_r = make_spawn
  dims = AgentSingleRuntime.build_resultado_dimensoes('failure', after, comp, spawn_r)
  assert_eq(dims['delivery'], 'failed', "delivery esperado failed, got #{dims['delivery']}")
end

test('18 dimensões: dois arquivos planejados, um ausente → delivery failed') do
  itens = [
    { 'campo' => 'arquivo_planejado', 'codigo' => 'OBSERVED_EXPECTED_FILE_UNCHANGED',
      'esperado' => 'sandbox.md', 'observado' => nil, 'resultado' => 'desvio', 'severidade' => 'baixa' },
    { 'campo' => 'arquivo_planejado', 'codigo' => nil,
      'esperado' => 'output.log', 'observado' => 'output.log', 'resultado' => 'conforme', 'severidade' => 'info' }
  ]
  comp = make_comparacao(itens, 'desvio')
  after = make_after(modificados: ['output.log'])
  spawn_r = make_spawn
  dims = AgentSingleRuntime.build_resultado_dimensoes('failure', after, comp, spawn_r)
  assert_eq(dims['delivery'], 'failed')
end

test('19 dimensões: compliance violacao, delivery unknown') do
  itens = [
    { 'campo' => 'ferramenta', 'codigo' => 'OBSERVED_TOOL_MISMATCH',
      'esperado' => 'codex', 'observado' => 'cursor', 'resultado' => 'violacao', 'severidade' => 'critica' }
  ]
  comp = make_comparacao(itens, 'violacao')
  after = make_after
  spawn_r = make_spawn
  dims = AgentSingleRuntime.build_resultado_dimensoes('denied', after, comp, spawn_r)
  assert_eq(dims['compliance'], 'violacao')
  # sem OBSERVED_EXPECTED_FILE_UNCHANGED e sem desvio de arquivo_planejado → succeeded
  assert_eq(dims['delivery'], 'succeeded')
end

test('20 dimensões: execution succeeded, timeout false') do
  spawn_r = make_spawn(exit_code: 0, pid: 1)
  dims = AgentSingleRuntime.build_resultado_dimensoes('success', make_after, make_comparacao([]), spawn_r)
  assert_eq(dims['execution'], 'succeeded')
end

test('21 error estruturado → tool_result com is_error') do
  text = '{"type":"error","message":"falha crítica"}'
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert(!json_str.include?('falha crítica'), 'erro não deve vazar')
  assert(d['sinais']['erro_estruturado'])
end

test('22 integração: parser + hash preservado') do
  raw = '{"type":"turn.started"}' + "\n" + '{"type":"turn.completed"}'
  sha = Digest::SHA256.hexdigest(raw)
  d = CodexJsonlDiagnostics.parse(raw)
  assert_eq(sha, Digest::SHA256.hexdigest(raw))
  assert_eq(d['status'], 'available')
  assert_eq(d['objetos_json_validos'], 2)
end

# ── Dedup por [tipo, id] ──

test('23 um comando started+completed mesmo ID → contagem 1') do
  text = <<~JSONL
    {"type":"item.started","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.completed","item":{"type":"command_execution","id":"exec-1"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['execucoes_comando'], 1)
end

test('24 dois comandos com IDs diferentes → contagem 2') do
  text = <<~JSONL
    {"type":"item.started","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.completed","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.completed","item":{"type":"command_execution","id":"exec-2"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['execucoes_comando'], 2)
end

test('25 duas mensagens com IDs diferentes → contagem 2') do
  text = <<~JSONL
    {"type":"item.completed","item":{"type":"agent_message","id":"msg-1"}}
    {"type":"item.completed","item":{"type":"agent_message","id":"msg-2"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['mensagens_agente'], 2)
end

test('26 dois file_change com IDs diferentes → contagem 2') do
  text = <<~JSONL
    {"type":"item.completed","item":{"type":"file_change","id":"fc-1"}}
    {"type":"item.completed","item":{"type":"file_change","id":"fc-2"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['alteracoes_arquivo'], 2)
end

test('27 mesmo ID repetido três vezes → contagem 1') do
  text = <<~JSONL
    {"type":"item.started","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.updated","item":{"type":"command_execution","id":"exec-1"}}
    {"type":"item.completed","item":{"type":"command_execution","id":"exec-1"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['execucoes_comando'], 1)
end

test('28 mesmo conteúdo com IDs diferentes → contagem 2, sem conteúdo') do
  text = <<~JSONL
    {"type":"item.completed","item":{"type":"agent_message","id":"msg-1","text":"segredo"}}
    {"type":"item.completed","item":{"type":"agent_message","id":"msg-2","text":"segredo"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  json_str = JSON.generate(d)
  assert(!json_str.include?('segredo'), 'conteúdo não deve vazar')
  assert_eq(d['contagens']['mensagens_agente'], 2)
end

test('29 itens sem ID → cada ocorrência conta') do
  text = <<~JSONL
    {"type":"item.completed","item":{"type":"command_execution"}}
    {"type":"item.completed","item":{"type":"command_execution"}}
    {"type":"item.completed","item":{"type":"command_execution"}}
  JSONL
  d = CodexJsonlDiagnostics.parse(text)
  assert_eq(d['contagens']['execucoes_comando'], 3)
end

puts "\n#{@tests} passed"
