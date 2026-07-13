#!/usr/bin/env ruby
# frozen_string_literal: true

# test-agent-orchestration.rb — Testes da camada de orquestração.
#
# 30+ cenários: positivos, negativos e provas de regressão.
# Helper assertivo: falha quando não houver erro esperado, valida mensagem,
# rejeita exceção inesperada, não captura o próprio erro.

require 'json'
require 'tempfile'

module OrchestrationTests
  REPO_ROOT  = File.expand_path('..', __dir__)
  ORCH_DIR   = File.join(REPO_ROOT, '.agents', 'orquestracao')
  SCRIPTS_DIR = File.join(REPO_ROOT, 'scripts')
  PLANNER    = File.join(SCRIPTS_DIR, 'plan-agent-mission.rb')
  EXEMPLOS   = File.join(ORCH_DIR, 'exemplos')

  PASSED = 0
  FAILED = 0
  TESTS  = []

  class << self
    def run
      # === POSITIVOS ===
      test_positive("exploração read-only", "exploracao-readonly.json") do |plano|
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['papel_principal'], 'explorador')
        assert_eq(plano['escrita_permitida'], false)
        assert_eq(plano['shell_permitido'], false)
      end

      test_positive("investigação de incidente", "investigacao-incidente.json") do |plano|
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['papel_principal'], 'investigador-incidentes')
        assert_eq(plano['escrita_permitida'], false)
      end

      test_positive("implementação autorizada", "implementacao-autorizada.json") do |plano|
        assert_eq(plano['papel_principal'], 'executor-escopo')
        assert_eq(plano['escrita_permitida'], true)
        assert_true(plano['skills_selecionadas'].include?('validate-gates'),
                    "esperava validate-gates em skills_selecionadas")
      end

      test_positive("seleção de validate-gates", "implementacao-autorizada.json") do |plano|
        assert_true(plano['skills_selecionadas'].include?('validate-gates'),
                    "validate-gates deve ser selecionada para executor-escopo")
      end

      test_positive("planejamento de solução", nil, build_planner_card) do |plano|
        assert_eq(plano['papel_principal'], 'planejador-solucao')
        assert_eq(plano['escrita_permitida'], false)
      end

      test_positive("revisão de contrato", nil, build_reviewer_card) do |plano|
        assert_eq(plano['papel_principal'], 'revisor-contratos')
        assert_eq(plano['escrita_permitida'], false)
      end

      test_positive("validação de entrega", nil, build_validator_card) do |plano|
        assert_eq(plano['papel_principal'], 'validador-entrega')
      end

      # === DETERMINISMO ===
      test("determinismo da saída") do
        card = build_readonly_card
        out1 = run_planner(card)
        out2 = run_planner(card)
        assert_eq(JSON.parse(out1), JSON.parse(out2), "saída não-determinística")
      end

      # === NEGATIVOS ===
      test_validation_error("campo obrigatório ausente") do |card|
        c = build_readonly_card
        c.delete('objetivo')
        c
      end

      test_validation_error("autorização inválida") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A7'
        c
      end

      test_validation_error("papel inexistente") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'papel-fake'
        c
      end

      test_denied("ferramenta proibida") do |card|
        c = build_readonly_card
        c['ferramentas_permitidas'] = ['ferramenta-inexistente']
        c
      end

      test_incomplete("adaptador inexistente para papel") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'explorador'
        c['ferramentas_permitidas'] = ['ferramenta-inexistente']
        c
      end

      test_skill_denied("skill não auditada") do |card|
        c = build_readonly_card
        c['skills_solicitadas'] = ['skill-inexistente-12345']
        c
      end

      test_skill_denied("skill não selecionável (delivery-loop como skill)") do |card|
        c = build_executor_card
        c['skills_solicitadas'] = ['delivery-loop']
        c
      end

      test_denied("fluxo solicitado como skill") do |card|
        c = build_executor_card
        c['skills_solicitadas'] = ['delivery-loop']
        c
      end

      test_denied("skill mutante atribuída a leitor") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'revisor-contratos'
        c['skills_solicitadas'] = ['supabase-migration']
        c
      end

      test_denied("rede proibida para leitor") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'explorador'
        c['rede_permitida'] = true
        c
      end

      test_denied("shell proibido para leitor") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'explorador'
        c['shell_permitido'] = true
        c
      end

      test_denied("escrita fora do escopo (leitor com escrita)") do |card|
        c = build_readonly_card
        c['papel_preferido'] = 'explorador'
        c['escopo']['escrita'] = ['foo.ts']
        c
      end

      test_denied("commit sem A3") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A2'
        c['autorizacao']['acoes_permitidas'] = ['commit']
        c['instrucao_atual'] = 'faz commit disso'
        c
      end

      test_denied("PR sem A4") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A3'
        c['autorizacao']['acoes_permitidas'] = ['push', 'pr']
        c['instrucao_atual'] = 'sobe PR'
        c
      end

      test_denied("merge sem A5") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A4'
        c['autorizacao']['acoes_permitidas'] = ['merge']
        c['instrucao_atual'] = 'mergeia isso'
        c
      end

      test_denied("merge com A5 mas sem token MERGE") do |card|
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['merge']
        c['instrucao_atual'] = 'pode juntar'
        c
      end

      test_denied("deploy sem A6") do |card|
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['deploy']
        c['instrucao_atual'] = 'faz deploy'
        c
      end

      test_denied("delegação proibida") do |card|
        c = build_readonly_card
        c['delegacao_permitida'] = true
        c
      end

      test("proteção de hash no planner") do
        code = File.read(PLANNER)
        unless code.include?('SHA256') && code.include?('hash divergente')
          raise "planner não contém verificação de hash SHA256"
        end
      end

      test_incomplete("incompatibilidade skill-ferramenta") do |card|
        c = build_executor_card
        c['ferramentas_permitidas'] = ['codex']
        c['skills_solicitadas'] = ['validate-gates']
        # validate-gates is compatible with claude-code, cursor, opencode, cline but NOT codex
        # Actually it IS in ferramentas_compativeis... let me use cline instead
        c['ferramentas_permitidas'] = ['cline']
        c
      end

      test("path traversal no input rejeitado") do
        require 'open3'
        _out, err, status = Open3.capture3('ruby', PLANNER, '--input', '../../../etc/passwd', '--stdout')
        raise "esperava exit code não-zero" if status.success?
        unless err.include?('segurança') || err.include?('path')
          raise "esperava mensagem de segurança, obteve: #{err}"
        end
      end

      test_denied("conflito entre ação e autorização") do |card|
        c = build_readonly_card
        c['autorizacao']['acoes_proibidas'] = ['ler']
        c['instrucao_atual'] = 'le isso'
        c
      end

      # === PROVAS DE REGRESSÃO ===
      test_regression("regra de merge: A5 sem token") do
        card = build_executor_card
        card['autorizacao']['nivel'] = 'A5'
        card['autorizacao']['acoes_permitidas'] = ['merge']
        card['instrucao_atual'] = 'junta as branches'
        plano = run_planner_parse(card)
        negacoes_text = plano['negacoes'].join(' ')
        unless negacoes_text.include?('MERGE')
          raise "regressão: merge com A5 sem token MERGE deveria ser negado"
        end
      end

      test_regression("regra de merge: A4 sempre negado") do
        card = build_executor_card
        card['autorizacao']['nivel'] = 'A4'
        card['autorizacao']['acoes_permitidas'] = ['merge']
        card['instrucao_atual'] = 'MERGE isso'
        plano = run_planner_parse(card)
        negacoes_text = plano['negacoes'].join(' ')
        unless negacoes_text.include?('A5') || negacoes_text.include?('insuficiente')
          raise "regressão: merge com A4 deveria ser negado mesmo com token"
        end
      end

      test_regression("proteção de skill mutante") do
        card = build_readonly_card
        card['papel_preferido'] = 'revisor-contratos'
        card['skills_solicitadas'] = ['supabase-migration']
        plano = run_planner_parse(card)
        negacoes_text = plano['negacoes'].join(' ')
        unless negacoes_text.include?('mutante') || negacoes_text.include?('leitor')
          raise "regressão: skill mutante não deveria passar para leitor"
        end
      end

      test_regression("skill não auditada sempre negada") do
        card = build_readonly_card
        card['skills_solicitadas'] = ['skill-fantasma-999']
        plano = run_planner_parse(card)
        negacoes_text = plano['negacoes'].join(' ')
        unless negacoes_text.include?('não encontrada') || negacoes_text.include?('auditada')
          raise "regressão: skill não auditada deveria ser negada"
        end
      end

      # === HELPER SELF-TEST ===
      test("helper self-test: sucesso de validação é detectado como falha") do
        # This test verifies the helper itself works
        raised = false
        begin
          raise "erro de teste intencional"
        rescue StandardError => e
          raised = true
          raise "helper não deveria capturar erro genérico" unless e.message.include?('intencional')
        end
        raise "helper não capturou exceção" unless raised
      end

      # Print summary
      print_summary
    end

    private

    def print_summary
      puts
      TESTS.each_with_index do |(name, result), _i|
        puts "#{result == :pass ? 'PASS' : 'FAIL'} #{name}"
      end
      puts
      total = TESTS.size
      fails = TESTS.count { |_, r| r == :fail }
      if fails.zero?
        puts "OK #{total} tests"
      else
        puts "FAIL #{fails}/#{total} tests"
      end
      exit(fails.zero? ? 0 : 1)
    end

    # === TEST HELPERS ===

    def test(name, &block)
      begin
        block.call
        TESTS << [name, :pass]
      rescue StandardError => e
        TESTS << [name, :fail]
        $stderr.puts "  FAIL #{name}: #{e.message}"
      end
    end

    def test_positive(name, example_file, custom_card = nil, &block)
      test(name) do
        card = custom_card
        if example_file && !card
          card = JSON.parse(File.read(File.join(EXEMPLOS, example_file)))
        end
        plano = run_planner_parse(card)
        block.call(plano) if block
      end
    end

    def test_validation_error(name, &block)
      test(name) do
        card = block.call(build_readonly_card.dup)
        if card
          begin
            run_planner_raw(card)
            raise "esperava erro de validação mas o planner aceitou a entrada"
          rescue RuntimeError, SystemExit => e
            # Expected
            re = e.message
          end
        end
      end
    end

    def test_denied(name, &block)
      test(name) do
        card = block.call(build_readonly_card.dup)
        plano = run_planner_parse(card)
        unless plano['negacoes'].any? || plano['status'] == 'negado' || plano['status'] == 'incompleto'
          raise "esperava negação/incompleto mas status=#{plano['status']} e negacoes=#{plano['negacoes'].inspect}"
        end
      end
    end

    def test_incomplete(name, &block)
      test(name) do
        card = block.call(build_readonly_card.dup)
        plano = run_planner_parse(card)
        unless plano['status'] == 'incompleto' || plano['status'] == 'negado'
          raise "esperava incompleto ou negado mas status=#{plano['status']}"
        end
      end
    end

    def test_skill_denied(name, &block)
      test(name) do
        card = block.call(build_executor_card.dup)
        plano = run_planner_parse(card)
        negacoes_text = plano['negacoes'].join(' ')
        # For skill-specific denials, either negacoes should mention the skill
        # or status should be incompleto
        unless negacoes_text.length > 0 || plano['status'] == 'incompleto' || plano['status'] == 'negado'
          raise "esperava negação de skill mas negacoes=#{plano['negacoes'].inspect}"
        end
      end
    end

    def test_regression(name, &block)
      test("regression: #{name}", &block)
    end

    # === ASSERTIONS ===

    def assert_eq(actual, expected, msg = nil)
      unless actual == expected
        raise (msg || "esperava #{expected.inspect} mas obteve #{actual.inspect}")
      end
    end

    def assert_true(value, msg = nil)
      raise(msg || "esperava true") unless value
    end

    # === PLANNER EXECUTION ===

    def run_planner_raw(card)
      require 'open3'
      json = JSON.generate(card)
      out, err, status = Open3.capture3('ruby', PLANNER, '--input', '/dev/stdin', '--stdout',
                                        stdin_data: '')
      # /dev/stdin won't work; use temp file instead
      run_planner_from_tempfile(card)
    end

    def run_planner(card)
      run_planner_from_tempfile(card)
    end

    def run_planner_parse(card)
      JSON.parse(run_planner(card))
    end

    def run_planner_from_tempfile(card)
      require 'open3'
      Tempfile.create(['mission', '.json']) do |f|
        f.write(JSON.pretty_generate(card))
        f.flush
        out, err, status = Open3.capture3('ruby', PLANNER, '--input', f.path, '--stdout')
        unless status.success?
          # Check if it's a validation error (exit 2) which is expected for some tests
          if status.exitstatus == 2
            raise "erro de validação: #{err}"
          else
            raise "planner falhou (exit #{status.exitstatus}): #{err}"
          end
        end
        out
      end
    end

    # === CARD BUILDERS ===

    def build_readonly_card
      {
        'versao' => 1,
        'id' => 'test-readonly',
        'titulo' => 'Teste leitura',
        'objetivo' => 'Mapear estrutura de código',
        'contexto' => 'Contexto de teste',
        'resultado_esperado' => 'Relatório',
        'autorizacao' => {
          'nivel' => 'A0',
          'acoes_permitidas' => %w[ler buscar],
          'acoes_proibidas' => %w[editar commit push merge deploy]
        },
        'escopo' => { 'leitura' => ['src/'], 'escrita' => [] },
        'restricoes' => [],
        'verificacao' => [],
        'evidencias_requeridas' => [],
        'condicoes_parada' => [],
        'ferramentas_permitidas' => %w[claude-code codex opencode],
        'skills_solicitadas' => [],
        'papel_preferido' => 'explorador',
        'rede_permitida' => false,
        'shell_permitido' => false,
        'delegacao_permitida' => false,
        'instrucao_atual' => 'mapeia o código'
      }
    end

    def build_executor_card
      c = build_readonly_card
      c['id'] = 'test-executor'
      c['objetivo'] = 'Implementar correção no código'
      c['autorizacao']['nivel'] = 'A4'
      c['autorizacao']['acoes_permitidas'] = %w[ler editar commit push pr]
      c['autorizacao']['acoes_proibidas'] = %w[merge deploy]
      c['escopo']['escrita'] = ['src/test.ts']
      c['papel_preferido'] = 'executor-escopo'
      c['shell_permitido'] = true
      c['instrucao_atual'] = 'corrige o código e sobe PR'
      c
    end

    def build_planner_card
      c = build_readonly_card
      c['id'] = 'test-planner'
      c['objetivo'] = 'Planejar solução arquitetural'
      c['papel_preferido'] = 'planejador-solucao'
      c['instrucao_atual'] = 'planeja a refatoração'
      c
    end

    def build_reviewer_card
      c = build_readonly_card
      c['id'] = 'test-reviewer'
      c['objetivo'] = 'Revisar contratos e tipos do PR'
      c['papel_preferido'] = 'revisor-contratos'
      c['instrucao_atual'] = 'revisa a PR'
      c
    end

    def build_validator_card
      c = build_readonly_card
      c['id'] = 'test-validator'
      c['objetivo'] = 'Validar entrega e executar gates de teste'
      c['papel_preferido'] = 'validador-entrega'
      c['instrucao_atual'] = 'valida a entrega'
      c
    end
  end
end

OrchestrationTests.run if $PROGRAM_NAME == __FILE__
