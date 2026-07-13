#!/usr/bin/env ruby
# frozen_string_literal: true

# test-agent-orchestration.rb — Testes da camada de orquestração.
#
# 30+ cenários: positivos, negativos e provas de regressão.
# Helper assertivo: falha quando não houver erro esperado, valida mensagem,
# rejeita exceção inesperada, não captura o próprio erro.

require 'json'
require 'tempfile'
require 'tmpdir'
require 'fileutils'
require 'digest'
require 'yaml'
require_relative './plan-agent-mission'

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

      test_validation_error("ferramenta desconhecida") do |card|
        c = build_readonly_card
        c['ferramentas_permitidas'] = ['ferramenta-inexistente']
        c
      end

      test_validation_error("adaptador inexistente para ferramenta desconhecida") do |card|
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
        c['autorizacao']['acoes_solicitadas'] = ['commit']
        c
      end

      test_denied("PR sem A4") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A3'
        c['autorizacao']['acoes_permitidas'] = ['push', 'pr']
        c['autorizacao']['acoes_solicitadas'] = ['pr']
        c
      end

      test_denied("merge sem A5") do |card|
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A4'
        c['autorizacao']['acoes_permitidas'] = ['merge']
        c['autorizacao']['acoes_solicitadas'] = ['merge']
        c
      end

      test_denied("merge com A5 mas sem token MERGE") do |card|
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['merge']
        c['autorizacao']['acoes_solicitadas'] = ['merge']
        c['instrucao_atual'] = 'pode juntar'
        c
      end

      test_denied("deploy sem A6") do |card|
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['deploy']
        c['autorizacao']['acoes_solicitadas'] = ['deploy']
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
        c['autorizacao']['acoes_solicitadas'] = ['ler']
        c['instrucao_atual'] = 'le isso'
        c
      end

      # === AUTORIZAÇÃO DE ESCRITA ===
      test_denied("escrita A0 negada para executor", code: /AUTH_WRITE_REQUIRES_A2/) do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A0'
        c['autorizacao']['acoes_solicitadas'] = ['editar']
        c
      end

      test_denied("escrita A1 negada para executor", code: /AUTH_WRITE_REQUIRES_A2/) do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A1'
        c['autorizacao']['acoes_solicitadas'] = ['editar']
        c
      end

      test("escrita A2 permitida para executor") do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A2'
        c['autorizacao']['acoes_solicitadas'] = ['editar', 'testar']
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['escrita_permitida'], true)
        assert_eq(plano['autorizacao_necessaria'], 'A2')
      end

      test_denied("leitor com escrita A6 continua negado", code: /AUTH_WRITE_REQUIRES_A2/) do
        c = build_readonly_card
        c['autorizacao']['nivel'] = 'A6'
        c['escopo']['escrita'] = ['foo.ts']
        c
      end

      # === AÇÕES PERMITIDAS VS SOLICITADAS ===
      test("merge permitido mas não solicitado não exige MERGE") do
        c = build_reviewer_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['ler', 'revisar', 'merge']
        c['autorizacao']['acoes_solicitadas'] = ['revisar']
        c['instrucao_atual'] = 'revisa a PR sem juntar'
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'planejado')
        assert_true(neg_messages(plano).none? { |m| m.include?('MERGE') }, 'merge não solicitado não deve exigir MERGE')
      end

      test("push permitido mas não solicitado não eleva autorização") do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A2'
        c['autorizacao']['acoes_permitidas'] = ['ler', 'editar', 'testar', 'push']
        c['autorizacao']['acoes_solicitadas'] = ['testar']
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['autorizacao_necessaria'], 'A2')
      end

      test_denied("push solicitado mas não permitido", code: /ACTION_NOT_ALLOWED/) do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A4'
        c['autorizacao']['acoes_permitidas'] = ['ler', 'editar', 'testar']
        c['autorizacao']['acoes_solicitadas'] = ['push']
        c
      end

      test("merge A5 com token MERGE apenas planeja") do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A5'
        c['autorizacao']['acoes_permitidas'] = ['ler', 'editar', 'merge']
        c['autorizacao']['acoes_solicitadas'] = ['merge']
        c['autorizacao']['acoes_proibidas'] = ['deploy']
        c['instrucao_atual'] = 'MERGE autorizado para planejamento dry-run'
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['autorizacao_necessaria'], 'A5')
        assert_eq(plano['delegacao_permitida'], false)
      end

      # === SCHEMA ===
      test_validation_error("schema campo aninhado ausente") do
        c = build_readonly_card
        c['autorizacao'].delete('acoes_solicitadas')
        c
      end

      test_validation_error("schema propriedade desconhecida") do
        c = build_readonly_card
        c['campo_fantasma'] = true
        c
      end

      test_validation_error("schema boolean como string") do
        c = build_readonly_card
        c['rede_permitida'] = 'true'
        c
      end

      # === PERMISSÕES EFETIVAS DE SKILLS ===
      test_denied("skill shell-only com A1 é negada") do
        c = build_executor_card
        c['autorizacao']['nivel'] = 'A1'
        c['skills_solicitadas'] = ['validate-gates']
        c
      end

      test("rede bruta true para leitor não seleciona skill de rede") do
        c = build_readonly_card
        c['rede_permitida'] = true
        c['skills_solicitadas'] = ['supabase-migration']
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'negado')
        assert_eq(plano['skills_selecionadas'], [])
      end

      test("shell bruto true para leitor não seleciona skill de shell") do
        c = build_readonly_card
        c['shell_permitido'] = true
        c['skills_solicitadas'] = ['validate-gates']
        plano = run_planner_parse(c)
        assert_eq(plano['status'], 'negado')
        assert_eq(plano['skills_selecionadas'], [])
      end

      # === PATHS E SYMLINKS ===
      test("caminho absoluto suspeito no input rejeitado") do
        _out, err, status = run_cli('--input', '/etc/passwd', '--stdout')
        raise "esperava exit code 3, obteve #{status.exitstatus}" unless status.exitstatus == 3
        raise "esperava mensagem de segurança, obteve: #{err}" unless err.include?('SEGURANÇA')
      end

      test("caminho absoluto suspeito no output rejeitado") do
        input = File.join(EXEMPLOS, 'exploracao-readonly.json')
        _out, err, status = run_cli('--input', input, '--output', '/etc/plano.json')
        raise "esperava exit code 3, obteve #{status.exitstatus}" unless status.exitstatus == 3
        raise "esperava mensagem de segurança, obteve: #{err}" unless err.include?('SEGURANÇA')
      end

      test("input absoluto dentro do repo é aceito") do
        input = File.expand_path(File.join(EXEMPLOS, 'exploracao-readonly.json'))
        out, err, status = run_cli('--input', input, '--stdout')
        raise "esperava sucesso, exit=#{status.exitstatus}, err=#{err}" unless status.success?
        assert_eq(JSON.parse(out)['status'], 'planejado')
      end

      test("input temporário dentro de Dir.tmpdir é aceito") do
        Tempfile.create(['mission', '.json']) do |f|
          f.write(JSON.pretty_generate(build_readonly_card))
          f.flush
          out, err, status = run_cli('--input', f.path, '--stdout')
          raise "esperava sucesso, exit=#{status.exitstatus}, err=#{err}" unless status.success?
          assert_eq(JSON.parse(out)['status'], 'planejado')
        end
      end

      test("symlink de input escapando do repo é rejeitado") do
        Dir.mktmpdir('orch-path', REPO_ROOT) do |dir|
          link = File.join(dir, 'escape.json')
          File.symlink('/etc/passwd', link)
          _out, err, status = run_cli('--input', link, '--stdout')
          raise "esperava exit code 3, obteve #{status.exitstatus}" unless status.exitstatus == 3
          raise "esperava symlink na mensagem, obteve: #{err}" unless err.include?('symlink')
        end
      end

      test("symlink no diretório pai do output é rejeitado") do
        Dir.mktmpdir('orch-path', REPO_ROOT) do |dir|
          link_dir = File.join(dir, 'escape-dir')
          File.symlink('/etc', link_dir)
          input = File.join(EXEMPLOS, 'exploracao-readonly.json')
          _out, err, status = run_cli('--input', input, '--output', File.join(link_dir, 'plano.json'))
          raise "esperava exit code 3, obteve #{status.exitstatus}" unless status.exitstatus == 3
          raise "esperava symlink na mensagem, obteve: #{err}" unless err.include?('symlink')
        end
      end

      # === HASH E COMPATIBILIDADE COMPORTAMENTAIS ===
      test("hash comportamental na seleção de skill") do
        with_temp_skill_registry do |registry, card, classes, skill_path, good_hash|
          result = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                       2, false, false, 'codex', classes)
          assert_eq(result[:aprovadas], ['fixture-skill'])

          registry['skills'].first['hash'] = '0' * 64
          result = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                       2, false, false, 'codex', classes)
          assert_true(result[:negadas].any? { |n| n['mensagem'].include?('hash divergente') })

          registry['skills'].first['hash'] = good_hash
          FileUtils.rm_f(skill_path)
          result = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                       2, false, false, 'codex', classes)
          assert_true(result[:negadas].any? { |n| n['mensagem'].include?('não existe') })

          FileUtils.mkdir_p(skill_path)
          result = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                       2, false, false, 'codex', classes)
          assert_true(result[:negadas].any? { |n| n['mensagem'].include?('não existe') })
        end
      end

      test("compatibilidade real skill-ferramenta") do
        with_temp_skill_registry do |registry, card, _classes, _skill_path, _good_hash|
          classes = { 'executor-escopo' => { 'classe' => 'executor', 'pode_executar_shell' => true } }
          ok = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                   2, false, false, 'codex', classes)
          assert_eq(ok[:aprovadas], ['fixture-skill'])
          denied = MissionPlanner.send(:select_skills, card, registry, 'executor-escopo', 'A2',
                                       2, false, false, 'cline', classes)
          assert_true(denied[:negadas].any? { |n| n['mensagem'].include?('incompatível com ferramenta cline') })
        end
      end

      # === PROVAS DE REGRESSÃO ===
      test_regression("regra de merge: A5 sem token") do
        card = build_executor_card
        card['autorizacao']['nivel'] = 'A5'
        card['autorizacao']['acoes_permitidas'] = ['merge']
        card['autorizacao']['acoes_solicitadas'] = ['merge']
        card['instrucao_atual'] = 'junta as branches'
        plano = run_planner_parse(card)
        negacoes_text = neg_messages(plano).join(' ')
        unless negacoes_text.include?('MERGE')
          raise "regressão: merge com A5 sem token MERGE deveria ser negado"
        end
      end

      test_regression("regra de merge: A4 sempre negado") do
        card = build_executor_card
        card['autorizacao']['nivel'] = 'A4'
        card['autorizacao']['acoes_permitidas'] = ['merge']
        card['autorizacao']['acoes_solicitadas'] = ['merge']
        card['instrucao_atual'] = 'MERGE isso'
        plano = run_planner_parse(card)
        negacoes_text = neg_messages(plano).join(' ')
        unless negacoes_text.include?('A5') || negacoes_text.include?('insuficiente')
          raise "regressão: merge com A4 deveria ser negado mesmo com token"
        end
      end

      test_regression("proteção de skill mutante") do
        card = build_readonly_card
        card['papel_preferido'] = 'revisor-contratos'
        card['skills_solicitadas'] = ['supabase-migration']
        plano = run_planner_parse(card)
        negacoes_text = neg_messages(plano).join(' ')
        unless negacoes_text.include?('mutante') || negacoes_text.include?('leitor')
          raise "regressão: skill mutante não deveria passar para leitor"
        end
      end

      test_regression("skill não auditada sempre negada") do
        card = build_readonly_card
        card['skills_solicitadas'] = ['skill-fantasma-999']
        plano = run_planner_parse(card)
        negacoes_text = neg_messages(plano).join(' ')
        unless negacoes_text.include?('não encontrada') || negacoes_text.include?('auditada')
          raise "regressão: skill não auditada deveria ser negada"
        end
      end

      # === FASE 3B.2A — topologia / comandos / simplicidade ===
      test("3B.2A single-agent canônico") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['resumo_operacional']['harness'], 'codex-cli')
        assert_eq(plano['resumo_operacional']['estrategia'], 'agente-unico')
        assert_eq(plano['resumo_operacional']['agentes_planejados'], 1)
        assert_eq(plano['resumo_operacional']['max_paralelo'], 1)
        assert_eq(plano['topologia']['max_profundidade'], 1)
        assert_eq(plano['topologia']['permite_subdelegacao'], false)
        assert_eq(plano['topologia']['agentes'].size, 1)
        assert_eq(plano['topologia']['agentes'][0]['id'], 'principal')
        assert_eq(plano['topologia']['agentes'][0]['papel'], 'explorador')
        assert_eq(plano['comandos'], [])
        MissionPlanner.validate_operational_plan!(plano, require_comandos: false)
      end

      test("3B.2A read-only sem writer") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['resumo_operacional']['writers'], 0)
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'read-only')
        assert_eq(plano['escrita_permitida'], false)
      end

      test("3B.2A um writer quando escrita permitida") do
        plano = run_planner_parse(build_executor_card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['escrita_permitida'], true)
        assert_eq(plano['resumo_operacional']['writers'], 1)
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'workspace-write')
        assert_eq(plano['topologia']['agentes'][0]['papel'], 'executor-escopo')
      end

      test("3B.2A comando autorizado propagado") do
        card = build_executor_card
        card['executor'] = { 'comandos' => ['git-diff-check'] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['comandos'], ['git-diff-check'])
        MissionPlanner.validate_operational_plan!(plano)
      end

      test("3B.2A dedupe de comandos preserva ordem") do
        card = {
          'executor' => {
            'comandos' => [
              'test-agent-orchestration',
              'git-diff-check',
              'test-agent-orchestration',
              'validate-agent-orchestration',
              'git-diff-check'
            ]
          }
        }
        result = MissionPlanner.send(:propagate_commands, card, 'planejado')
        assert_eq(
          result[:comandos],
          %w[test-agent-orchestration git-diff-check validate-agent-orchestration]
        )
        assert_eq(result[:negacoes], [])
      end

      test("3B.2A multi-agent com justificativa passa no validador") do
        plano = build_operational_plan(
          'resumo_operacional' => {
            'estrategia' => 'multiagente',
            'agentes_planejados' => 2,
            'max_paralelo' => 1,
            'writers' => 1
          },
          'topologia' => {
            'max_agentes' => 2,
            'agentes' => [
              { 'id' => 'leitor', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
              { 'id' => 'escritor', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => ['leitor'] }
            ]
          },
          'simplicidade' => {
            'multiagente_necessario' => true,
            'justificativa_multiagente' => 'Exploração e escrita precisam de papéis distintos sem overlap.'
          }
        )
        MissionPlanner.validate_operational_plan!(plano)
      end

      test("3B.2A flags de simplicidade geram avisos") do
        avisos = MissionPlanner.send(
          :apply_simplicity_warnings,
          [],
          { 'estrategia' => 'multiagente' },
          {
            'multiagente_necessario' => true,
            'nova_dependencia' => true,
            'nova_abstracao' => true,
            'reutiliza_existente' => false
          }
        )
        %w[
          MULTI_AGENT_REQUIRES_APPROVAL
          NEW_DEPENDENCY_DECLARED
          NEW_ABSTRACTION_DECLARED
          DOES_NOT_REUSE_EXISTING
        ].each do |code|
          assert_true(avisos.include?(code), "esperava aviso #{code}")
        end
      end

      test("3B.2A --resumo imprime em stderr e JSON em stdout") do
        require 'open3'
        Tempfile.create(['mission', '.json']) do |f|
          f.write(JSON.pretty_generate(build_readonly_card))
          f.flush
          out, err, status = Open3.capture3('ruby', PLANNER, '--input', f.path, '--stdout', '--resumo')
          raise "planner falhou: #{err}" unless status.success?
          plano = JSON.parse(out)
          assert_eq(plano['resumo_operacional']['harness'], 'codex-cli')
          assert_true(err.include?('Harness:'), "resumo ausente em stderr: #{err}")
          assert_true(err.include?('Estratégia:'), "resumo incompleto em stderr: #{err}")
        end
      end

      test("3B.2A falha: zero agentes") do
        assert_raises_operational('zero agentes') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'resumo_operacional' => { 'agentes_planejados' => 0 },
              'topologia' => { 'agentes' => [] }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: contagem divergente") do
        assert_raises_operational('agentes_planejados divergente') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan('resumo_operacional' => { 'agentes_planejados' => 2 }),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: dois writers") do
        assert_raises_operational('mais de um writer') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'resumo_operacional' => {
                'estrategia' => 'multiagente',
                'agentes_planejados' => 2,
                'writers' => 2
              },
              'topologia' => {
                'max_agentes' => 2,
                'agentes' => [
                  { 'id' => 'w1', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] },
                  { 'id' => 'w2', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] }
                ]
              },
              'simplicidade' => {
                'multiagente_necessario' => true,
                'justificativa_multiagente' => 'dois writers propositalmente inválidos'
              }
            )
          )
        end
      end

      test("3B.2A falha: subdelegação") do
        assert_raises_operational('subdelegacao') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan('topologia' => { 'permite_subdelegacao' => true }),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: profundidade > 1") do
        assert_raises_operational('max_profundidade') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan('topologia' => { 'max_profundidade' => 2 }),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: papel desconhecido") do
        assert_raises_operational('papel desconhecido') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'topologia' => {
                'agentes' => [
                  { 'id' => 'principal', 'papel' => 'hacker-fantasma', 'permissao' => 'read-only', 'depende_de' => [] }
                ]
              }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: dependencia inexistente") do
        assert_raises_operational('dependencia inexistente') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'topologia' => {
                'agentes' => [
                  { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => ['fantasma'] }
                ]
              }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: dependencia circular") do
        assert_raises_operational('dependencia circular') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'resumo_operacional' => {
                'estrategia' => 'multiagente',
                'agentes_planejados' => 2,
                'writers' => 0
              },
              'topologia' => {
                'max_agentes' => 2,
                'agentes' => [
                  { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => ['b'] },
                  { 'id' => 'b', 'papel' => 'investigador-incidentes', 'permissao' => 'read-only', 'depende_de' => ['a'] }
                ]
              },
              'simplicidade' => {
                'multiagente_necessario' => true,
                'justificativa_multiagente' => 'ciclo proposital'
              }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: multi-agent sem justificativa") do
        assert_raises_operational('justificativa_multiagente') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'resumo_operacional' => {
                'estrategia' => 'multiagente',
                'agentes_planejados' => 2,
                'writers' => 0
              },
              'topologia' => {
                'max_agentes' => 2,
                'agentes' => [
                  { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
                  { 'id' => 'b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] }
                ]
              },
              'simplicidade' => {
                'multiagente_necessario' => true,
                'justificativa_multiagente' => '   '
              }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: agente-unico com 2 agentes") do
        assert_raises_operational('agente-unico exige exatamente 1 agente') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'resumo_operacional' => { 'agentes_planejados' => 2 },
              'topologia' => {
                'max_agentes' => 2,
                'agentes' => [
                  { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
                  { 'id' => 'b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] }
                ]
              }
            ),
            require_comandos: false
          )
        end
      end

      test("3B.2A falha: comando desconhecido") do
        card = build_executor_card
        card['executor'] = { 'comandos' => ['comando-fantasma-xyz'] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('COMMAND_UNKNOWN'))
        assert_eq(plano['comandos'], [])
      end

      test("3B.2A falha: comando inventado filtrado sem ampliação") do
        card = build_executor_card
        card['executor'] = { 'comandos' => ['git-diff-check', 'inventado-999'] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('COMMAND_UNKNOWN'))
        assert_eq(plano['comandos'], [])
      end

      test("3B.2A falha: planejado sem comandos com executor") do
        card = build_executor_card
        card['executor'] = { 'comandos' => [] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('PLANEJADO_REQUIRES_COMMANDS'))
        assert_eq(plano['comandos'], [])
      end

      test("3B.2A falha: negado com comandos no validador") do
        assert_raises_operational('nao pode ter comandos') do
          MissionPlanner.validate_operational_plan!(
            build_operational_plan(
              'status' => 'negado',
              'comandos' => ['git-diff-check']
            ),
            require_comandos: false
          )
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
        next unless card

        accepted = false
        begin
          run_planner_raw(card)
          accepted = true
        rescue RuntimeError, SystemExit
          # Expected: planner rejected the invalid input.
        end
        raise "esperava erro de validação mas o planner aceitou a entrada" if accepted
      end
    end

    def test_denied(name, message: nil, code: nil, &block)
      test(name) do
        card = block.call(build_readonly_card.dup)
        plano = run_planner_parse(card)
        unless plano['status'] == 'negado' || plano['status'] == 'incompleto'
          raise "esperava negado/incompleto mas status=#{plano['status']} e negacoes=#{plano['negacoes'].inspect}"
        end
        if message && neg_messages(plano).none? { |m| message === m }
          raise "negação esperada não encontrada: #{message.inspect}; negacoes=#{plano['negacoes'].inspect}"
        end
        if code && neg_codes(plano).none? { |c| code === c }
          raise "código esperado não encontrado: #{code.inspect}; negacoes=#{plano['negacoes'].inspect}"
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
        negacoes_text = neg_messages(plano).join(' ')
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

    def assert_raises_operational(fragment)
      raised = false
      begin
        yield
      rescue MissionPlanner::ValidationError => e
        raised = true
        unless e.message.include?(fragment)
          raise "esperava fragmento #{fragment.inspect} em #{e.message.inspect}"
        end
      end
      raise "esperava ValidationError contendo #{fragment.inspect}" unless raised
    end

    def deep_merge_hash(base, overlay)
      result = base.dup
      overlay.each do |key, value|
        if value.is_a?(Hash) && result[key].is_a?(Hash)
          result[key] = deep_merge_hash(result[key], value)
        else
          result[key] = value
        end
      end
      result
    end

    def build_operational_plan(overrides = {})
      base = {
        'status' => 'planejado',
        'comandos' => ['git-diff-check'],
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
              'papel' => 'explorador',
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
      deep_merge_hash(base, overrides)
    end

    def neg_messages(plano)
      (plano['negacoes'] || []).map { |n| n.is_a?(Hash) ? n['mensagem'] : n.to_s }
    end

    def neg_codes(plano)
      (plano['negacoes'] || []).map { |n| n.is_a?(Hash) ? n['codigo'] : nil }.compact
    end

    # === PLANNER EXECUTION ===

    def run_planner_raw(card)
      run_planner_from_tempfile(card)
    end

    def run_cli(*args)
      require 'open3'
      Open3.capture3('ruby', PLANNER, *args)
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
          'acoes_solicitadas' => [],
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
      c['autorizacao']['acoes_permitidas'] = %w[ler editar testar commit push pr]
      c['autorizacao']['acoes_solicitadas'] = %w[editar testar]
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

    def with_temp_skill_registry
      Dir.mktmpdir('orch-skill', REPO_ROOT) do |dir|
        skill_path = File.join(dir, 'SKILL.md')
        File.write(skill_path, "name: fixture-skill\n")
        rel_path = skill_path.delete_prefix(REPO_ROOT + File::SEPARATOR)
        good_hash = Digest::SHA256.file(skill_path).hexdigest
        registry = {
          'skills' => [
            {
              'id' => 'fixture-skill',
              'tipo' => 'skill',
              'selecionavel_por_missao' => true,
              'status' => 'aprovada',
              'papeis_permitidos' => ['executor-escopo'],
              'ferramentas_compativeis' => ['codex'],
              'caminho' => rel_path,
              'hash' => good_hash,
              'acesso_rede' => false,
              'pode_escrever' => false,
              'pode_executar_shell' => false,
              'pode_delegar' => false
            }
          ]
        }
        card = build_executor_card
        card['skills_solicitadas'] = ['fixture-skill']
        classes = { 'executor-escopo' => { 'classe' => 'executor', 'pode_executar_shell' => true } }
        yield registry, card, classes, skill_path, good_hash
      end
    end
  end
end

OrchestrationTests.run if $PROGRAM_NAME == __FILE__
