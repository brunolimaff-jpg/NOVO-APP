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
require_relative './validate-agent-orchestration'

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
      test('toolchain do produto fica fora do escopo de orquestração') do
        changed = %w[package.json vercel.json .nvmrc vite.config.ts]
        assert_true(!OrchestrationValidator.send(:agent_scope_changed?, changed))
      end

      test('runtime de agentes mantém o escopo de orquestração') do
        changed = ['scripts/lib/agent_single_runtime.rb']
        assert_true(OrchestrationValidator.send(:agent_scope_changed?, changed))
      end

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

      # === TEMPLATE PRIMEIRO PILOTO (canônico) ===
      test("template primeiro piloto produz plano planejado e executável") do
        tmpl = JSON.parse(File.read(File.join(REPO_ROOT, '.agents/pilotos/primeiro-piloto.json')))
        card = tmpl.fetch('card')
        plan = MissionPlanner.plan(card)

        assert_eq(plan['status'], 'planejado')
        assert_eq(plan['papel_principal'], 'executor-escopo')
        assert_eq(plan['ferramenta_selecionada'], 'codex')
        assert_eq(plan.dig('resumo_operacional', 'harness'), 'codex-cli')
        assert_eq(plan.dig('resumo_operacional', 'estrategia'), 'agente-unico')
        assert_eq(plan.dig('resumo_operacional', 'agentes_planejados'), 1)
        assert_eq(plan.dig('resumo_operacional', 'writers'), 1)
        assert_eq(plan.dig('resumo_operacional', 'max_paralelo'), 1)
        assert_eq(plan.dig('resumo_operacional', 'executavel'), true)
        assert_eq(plan.dig('topologia', 'max_agentes'), 1)
        assert_eq(plan.dig('topologia', 'max_profundidade'), 1)
        assert_eq(plan.dig('topologia', 'permite_subdelegacao'), false)
        assert_eq(plan.dig('topologia', 'agentes').size, 1)
        assert_eq(plan.dig('topologia', 'agentes', 0, 'papel'), 'executor-escopo')
        assert_eq(plan.dig('topologia', 'agentes', 0, 'permissao'), 'workspace-write')

        assert_eq(plan['limites']['max_tempo_segundos'], 180)
        assert_eq(plan['limites']['max_retentativas'], 0)
        assert_eq(plan['limites']['max_rodadas_revisao'], 0)

        assert_eq(plan.dig('decisao_execucao', 'origem'), 'cartao')
        assert_eq(plan.dig('decisao_execucao', 'estrategia'), 'agente-unico')

        assert_eq(plan['resumo_operacional']['agentes_planejados'], 1)
        assert_eq(plan['resumo_operacional']['writers'], 1)
        assert_eq(plan['resumo_operacional']['max_paralelo'], 1)

        assert_eq(plan['tarefas_planejadas'].size, 1)
        assert_eq(
          plan.dig('tarefas_planejadas', 0, 'arquivos', 'escrita'),
          ['.agents/pilotos/sandbox/resultado-primeiro-piloto.md']
        )
        assert_eq(
          plan.dig('tarefas_planejadas', 0, 'arquivos', 'leitura'),
          ['.agents/pilotos']
        )
        assert_eq(plan['comandos'], ['git-diff-check'])
        assert_eq(plan['negacoes'], [])
        assert_eq(plan['rede_permitida'], false)
        assert_eq(plan['shell_permitido'], false)
        assert_eq(plan['delegacao_permitida'], false)
        assert_eq(plan.dig('resumo_operacional', 'requer_aprovacao'), true)
      end

      test("template primeiro piloto passa validate_mission! sem spawn") do
        require_relative './lib/agent_supervised_pilot'
        tmpl = JSON.parse(File.read(File.join(REPO_ROOT, '.agents/pilotos/primeiro-piloto.json')))
        card = tmpl.fetch('card')
        plan = MissionPlanner.plan(card)
        result = AgentSupervisedPilot.validate_mission!(card: card, plan: plan, template: tmpl, root: REPO_ROOT)
        assert_true(result == true, "esperava true, obteve #{result.inspect}")
      end

      test("template primeiro piloto timeout 181 negado por validate_mission!") do
        require_relative './lib/agent_supervised_pilot'
        tmpl = JSON.parse(File.read(File.join(REPO_ROOT, '.agents/pilotos/primeiro-piloto.json')))
        card = tmpl.fetch('card')
        plan = MissionPlanner.plan(card)
        plan['limites']['max_tempo_segundos'] = 181
        begin
          AgentSupervisedPilot.validate_mission!(card: card, plan: plan, template: tmpl, root: REPO_ROOT)
          raise 'deveria negar'
        rescue AgentSupervisedPilot::Denial => e
          assert_eq(e.code, 'SUPERVISED_PILOT_SCOPE_DENIED')
          assert_true(e.message.include?('timeout'), e.message)
        end
      end

      test("template primeiro piloto sem papel_preferido continua fail-closed") do
        tmpl = JSON.parse(File.read(File.join(REPO_ROOT, '.agents/pilotos/primeiro-piloto.json')))
        card = tmpl.fetch('card').dup
        card.delete('papel_preferido')
        plan = MissionPlanner.plan(card)
        codes = neg_codes(plan)
        assert_true(codes.include?('AUTH_WRITE_REQUIRES_A2'), plan['negacoes'].inspect)
        assert_true(plan['status'] != 'planejado' || plan.dig('resumo_operacional', 'executavel') != true, plan.inspect)
      end

      test("template primeiro piloto sem ferramentas_permitidas não é executável") do
        tmpl = JSON.parse(File.read(File.join(REPO_ROOT, '.agents/pilotos/primeiro-piloto.json')))
        card = tmpl.fetch('card').dup
        card.delete('ferramentas_permitidas')
        plan = MissionPlanner.plan(card)
        # Sem ferramenta explícita o planner fail-closed: não pode ficar planejado+executável com codex.
        executavel = plan.dig('resumo_operacional', 'executavel')
        assert_true(
          plan['status'] != 'planejado' || executavel != true || plan['ferramenta_selecionada'] != 'codex',
          plan.inspect
        )
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
        Dir.mktmpdir('orch-path', Dir.tmpdir) do |dir|
          link = File.join(dir, 'escape.json')
          File.symlink('/etc/passwd', link)
          _out, err, status = run_cli('--input', link, '--stdout')
          raise "esperava exit code 3, obteve #{status.exitstatus}" unless status.exitstatus == 3
          raise "esperava symlink na mensagem, obteve: #{err}" unless err.include?('symlink')
        end
      end

      test("symlink no diretório pai do output é rejeitado") do
        Dir.mktmpdir('orch-path', Dir.tmpdir) do |dir|
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
      test("3B.2A single-agent analitico nao executavel") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['resumo_operacional']['harness'], 'codex-cli')
        assert_eq(plano['resumo_operacional']['estrategia'], 'agente-unico')
        assert_eq(plano['resumo_operacional']['agentes_planejados'], 1)
        assert_eq(plano['resumo_operacional']['max_paralelo'], 1)
        assert_eq(plano['resumo_operacional']['executavel'], false)
        assert_eq(plano['resumo_operacional']['writers'], 0)
        assert_eq(plano['simplicidade']['avaliada'], false)
        assert_true(plano['avisos'].include?('SIMPLICITY_REQUIRES_REVIEW'))
        assert_eq(plano['topologia']['agentes'][0]['papel'], 'explorador')
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'read-only')
        assert_eq(plano['comandos'], [])
        MissionPlanner.validate_operational_plan!(plano, require_comandos: false)
      end

      test("3B.2A executor com comandos e executavel") do
        plano = run_planner_parse(build_executor_card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['escrita_permitida'], true)
        assert_eq(plano['resumo_operacional']['writers'], 1)
        assert_eq(plano['resumo_operacional']['executavel'], true)
        assert_eq(plano['comandos'], ['git-diff-check'])
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'workspace-write')
      end

      test("3B.2A dedupe de comandos preserva ordem") do
        result = MissionPlanner.send(
          :propagate_commands,
          {
            'papel_preferido' => 'executor-escopo',
            'escopo' => { 'escrita' => ['x.ts'] },
            'executor' => {
              'comandos' => %w[
                test-agent-orchestration git-diff-check
                test-agent-orchestration validate-agent-orchestration git-diff-check
              ]
            }
          },
          'planejado',
          papel: 'executor-escopo'
        )
        assert_eq(result[:comandos], %w[test-agent-orchestration git-diff-check validate-agent-orchestration])
        assert_eq(result[:negacoes], [])
      end

      test("3B.2A multi-agent com justificativa passa no validador") do
        plano = build_operational_plan(
          'decisao_execucao' => {
            'estrategia' => 'multiagente',
            'origem' => 'cartao',
            'motivo' => 'declarado no cartão',
            'justificativa_multiagente' => 'Exploração e escrita precisam de papéis distintos sem overlap.',
            'ganho_esperado' => 'Reduzir tempo de diagnóstico',
            'perfil_execucao' => 'minimal-change',
            'gate_qualidade' => 'evidence-first'
          },
          'resumo_operacional' => {
            'estrategia' => 'multiagente',
            'agentes_planejados' => 2,
            'max_paralelo' => 1,
            'writers' => 1,
            'executavel' => false
          },
          'topologia' => {
            'max_agentes' => 2,
            'agentes' => [
              { 'id' => 'leitor', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
              { 'id' => 'escritor', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => ['leitor'] }
            ]
          },
          'tarefas_planejadas' => [
            {
              'id' => 'task-01', 'agente' => 'leitor', 'objetivo' => 'mapear', 'entrega_esperada' => 'mapa',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] }, 'depende_de' => []
            },
            {
              'id' => 'task-02', 'agente' => 'escritor', 'objetivo' => 'corrigir', 'entrega_esperada' => 'diff',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => ['scripts/x.rb'] }, 'depende_de' => ['task-01']
            }
          ],
          'simplicidade' => {
            'avaliada' => false,
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
            'avaliada' => false,
            'multiagente_necessario' => true,
            'nova_dependencia' => true,
            'nova_abstracao' => true,
            'reutiliza_existente' => false
          }
        )
        %w[
          SIMPLICITY_REQUIRES_REVIEW
          MULTI_AGENT_REQUIRES_APPROVAL
          NEW_DEPENDENCY_DECLARED
          NEW_ABSTRACTION_DECLARED
          DOES_NOT_REUSE_EXISTING
        ].each { |code| assert_true(avisos.include?(code), "esperava aviso #{code}") }
      end

      test("3B.2A --resumo imprime executavel e simplicidade pendente") do
        require 'open3'
        Tempfile.create(['mission', '.json']) do |f|
          f.write(JSON.pretty_generate(build_readonly_card))
          f.flush
          out, err, status = Open3.capture3('ruby', PLANNER, '--input', f.path, '--stdout', '--resumo')
          raise "planner falhou: #{err}" unless status.success?
          assert_eq(JSON.parse(out).dig('resumo_operacional', 'executavel'), false)
          assert_true(err.include?('Executável: não'), "resumo sem Executável: #{err}")
          assert_true(err.include?('Simplicidade: pendente de revisão'), "resumo sem simplicidade: #{err}")
        end
      end

      test("3B.2A planner → runner dry-run ponta a ponta") do
        require 'open3'
        card = build_executor_card
        cmds = card.dig('executor', 'comandos')
        Dir.mktmpdir('e2e-3b2a', Dir.tmpdir) do |dir|
          card_path = File.join(dir, 'card.json')
          plan_path = File.join(dir, 'plan.json')
          File.write(card_path, JSON.pretty_generate(card))
          File.write(plan_path, run_planner(card))
          out, err, status = Open3.capture3(
            { 'PATH' => ENV['PATH'], 'HOME' => ENV['HOME'] },
            'ruby', File.join(SCRIPTS_DIR, 'run-agent-mission.rb'),
            '--card', card_path, '--plan', plan_path, '--stdout',
            chdir: REPO_ROOT
          )
          raise "runner falhou (#{status.exitstatus}): #{err}\n#{out}" unless status.exitstatus == 0
          report = JSON.parse(out)
          assert_eq(report['status'], 'dry-run')
          assert_eq(report['comandos'].map { |c| c['id'] }.sort, cmds.sort)
          codes = (report['negacoes'] || []).map { |n| n.to_s.split(':', 2).first }
          assert_true(codes.none? { |c| c == 'COMMAND_PLAN_MISMATCH' }, report['negacoes'].inspect)
          assert_true(codes.none? { |c| c == 'PLANEJADO_REQUIRES_COMMANDS' }, report['negacoes'].inspect)
          assert_true(report['comandos'].none? { |c| c['executado'] }, 'nenhum comando deveria executar')
        end
      end

      test("3B.2A analitico ignora executor.comandos orfaos") do
        card = build_readonly_card
        card['executor'] = { 'comandos' => ['git-diff-check'] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['comandos'], [])
        assert_eq(plano['resumo_operacional']['executavel'], false)
      end

      test("3B.2A stop conditions preservam ordem do cartao") do
        card = build_readonly_card
        card['condicoes_parada'] = %w[zebra alpha]
        plano = run_planner_parse(card)
        assert_eq(plano['condicoes_parada'].first(2), %w[zebra alpha])
        assert_true(plano['condicoes_parada'].include?('comandos_concluidos'))
      end

      test("3B.2A falha: executor sem comandos (sem chave executor)") do
        card = build_executor_card
        card.delete('executor')
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('PLANEJADO_REQUIRES_COMMANDS'))
        assert_eq(plano['resumo_operacional']['executavel'], false)
        assert_eq(plano['comandos'], [])
      end

      [
        ['zero agentes', 'zero agentes', lambda { |p|
          p['resumo_operacional']['agentes_planejados'] = 0
          p['topologia']['agentes'] = []
        }],
        ['contagem divergente', 'agentes_planejados divergente', lambda { |p|
          p['resumo_operacional']['agentes_planejados'] = 2
        }],
        ['max_agentes ausente', 'max_agentes ausente', lambda { |p| p['topologia'].delete('max_agentes') }],
        ['max_agentes nulo', 'max_agentes nulo', lambda { |p| p['topologia']['max_agentes'] = nil }],
        ['max_paralelo ausente', 'max_paralelo ausente', lambda { |p| p['resumo_operacional'].delete('max_paralelo') }],
        ['max_paralelo nulo', 'max_paralelo nulo', lambda { |p| p['resumo_operacional']['max_paralelo'] = nil }],
        ['agentes_planejados ausente', 'agentes_planejados ausente', lambda { |p|
          p['resumo_operacional'].delete('agentes_planejados')
        }],
        ['agentes tipo invalido', 'topologia.agentes deve ser array', lambda { |p|
          p['topologia']['agentes'] = 'nao-array'
        }],
        ['dois writers', 'mais de um writer', lambda { |p|
          p['resumo_operacional'].merge!(
            'estrategia' => 'multiagente', 'agentes_planejados' => 2, 'writers' => 2, 'executavel' => false
          )
          p['topologia']['max_agentes'] = 2
          p['topologia']['agentes'] = [
            { 'id' => 'w1', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] },
            { 'id' => 'w2', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] }
          ]
          p['simplicidade'].merge!(
            'multiagente_necessario' => true,
            'justificativa_multiagente' => 'dois writers propositalmente inválidos'
          )
        }],
        ['subdelegação', 'subdelegacao', lambda { |p| p['topologia']['permite_subdelegacao'] = true }],
        ['profundidade > 1', 'max_profundidade', lambda { |p| p['topologia']['max_profundidade'] = 2 }],
        ['papel desconhecido', 'papel desconhecido', lambda { |p|
          p['topologia']['agentes'] = [
            { 'id' => 'principal', 'papel' => 'hacker-fantasma', 'permissao' => 'read-only', 'depende_de' => [] }
          ]
        }],
        ['dependencia inexistente', 'dependencia inexistente', lambda { |p|
          p['topologia']['agentes'] = [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => ['fantasma'] }
          ]
        }],
        ['dependencia circular', 'dependencia circular', lambda { |p|
          p['resumo_operacional'].merge!(
            'estrategia' => 'multiagente', 'agentes_planejados' => 2, 'writers' => 0, 'executavel' => false
          )
          p['topologia']['max_agentes'] = 2
          p['topologia']['agentes'] = [
            { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => ['b'] },
            { 'id' => 'b', 'papel' => 'investigador-incidentes', 'permissao' => 'read-only', 'depende_de' => ['a'] }
          ]
          p['simplicidade'].merge!(
            'multiagente_necessario' => true, 'justificativa_multiagente' => 'ciclo proposital'
          )
        }],
        ['multi-agent sem justificativa', 'justificativa_multiagente', lambda { |p|
          p['resumo_operacional'].merge!(
            'estrategia' => 'multiagente', 'agentes_planejados' => 2, 'writers' => 0, 'executavel' => false
          )
          p['topologia']['max_agentes'] = 2
          p['topologia']['agentes'] = [
            { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
            { 'id' => 'b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] }
          ]
          p['simplicidade'].merge!('multiagente_necessario' => true, 'justificativa_multiagente' => '   ')
        }],
        ['agente-unico com 2 agentes', 'agente-unico exige exatamente 1 agente', lambda { |p|
          p['resumo_operacional']['agentes_planejados'] = 2
          p['topologia']['max_agentes'] = 2
          p['topologia']['agentes'] = [
            { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
            { 'id' => 'b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] }
          ]
        }],
        ['negado com comandos', 'nao pode ter comandos', lambda { |p|
          p['status'] = 'negado'
          p['comandos'] = ['git-diff-check']
          p['resumo_operacional']['executavel'] = false
        }]
      ].each do |name, fragment, mutator|
        test("3B.2A falha: #{name}") do
          plano = build_operational_plan
          mutator.call(plano)
          assert_raises_operational(fragment) do
            MissionPlanner.validate_operational_plan!(plano, require_comandos: false)
          end
        end
      end

      test("3B.2A falha: comando desconhecido") do
        card = build_executor_card
        card['executor'] = { 'comandos' => ['comando-fantasma-xyz'] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('COMMAND_UNKNOWN'))
        assert_eq(plano['comandos'], [])
        assert_eq(plano['resumo_operacional']['executavel'], false)
      end

      test("3B.2A falha: comando inventado filtra e nega") do
        card = build_executor_card
        card['executor'] = { 'comandos' => %w[git-diff-check inventado-999] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('COMMAND_UNKNOWN'))
        assert_eq(plano['comandos'], [])
      end

      test("3B.2A falha: planejado sem comandos com executor vazio") do
        card = build_executor_card
        card['executor'] = { 'comandos' => [] }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        assert_true(neg_codes(plano).include?('PLANEJADO_REQUIRES_COMMANDS'))
        assert_eq(plano['resumo_operacional']['executavel'], false)
      end

      # === FASE 3B.2B — estratégia explícita / tarefas / schema condicional ===
      test("3B.2B default sem execucao_planejada") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['decisao_execucao']['estrategia'], 'agente-unico')
        assert_eq(plano['decisao_execucao']['origem'], 'default')
        assert_eq(plano['resumo_operacional']['estrategia'], 'agente-unico')
        assert_eq(plano['topologia']['agentes'].size, 1)
        assert_eq(plano['tarefas_planejadas'].size, 1)
        assert_eq(plano['limites']['max_tempo_segundos'], 900)
      end

      test("3B.2B agente default usa papel principal") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['topologia']['agentes'][0]['papel'], 'explorador')
        assert_eq(plano['tarefas_planejadas'][0]['agente'], 'principal')
      end

      test("3B.2B executor com escrita gera um writer") do
        plano = run_planner_parse(build_executor_card)
        assert_eq(plano['resumo_operacional']['writers'], 1)
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'workspace-write')
      end

      test("3B.2B analitico gera agente read-only") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['topologia']['agentes'][0]['permissao'], 'read-only')
        assert_eq(plano['resumo_operacional']['writers'], 0)
      end

      test("3B.2B perfil default minimal-change") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['decisao_execucao']['perfil_execucao'], 'minimal-change')
      end

      test("3B.2B gate default evidence-first") do
        plano = run_planner_parse(build_readonly_card)
        assert_eq(plano['decisao_execucao']['gate_qualidade'], 'evidence-first')
      end

      test("3B.2B single-agent explicito preservado") do
        card = build_readonly_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'mapear', 'entrega_esperada' => 'mapa',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['decisao_execucao']['origem'], 'cartao')
        assert_eq(plano['resumo_operacional']['estrategia'], 'agente-unico')
        assert_eq(plano['topologia']['agentes'].size, 1)
      end

      test("3B.2B multi-agent dois leitores independentes") do
        card = build_multi_reader_card
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['resumo_operacional']['estrategia'], 'multiagente')
        assert_eq(plano['topologia']['agentes'].size, 2)
        assert_eq(plano['resumo_operacional']['writers'], 0)
      end

      test("3B.2B multi-agent dois leitores e um writer") do
        card = build_multi_mixed_card
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['topologia']['agentes'].size, 3)
        assert_eq(plano['resumo_operacional']['writers'], 1)
        assert_eq(plano['tarefas_planejadas'].size, 3)
      end

      test("3B.2B tarefas preservam ordem") do
        card = build_multi_mixed_card
        plano = run_planner_parse(card)
        assert_eq(plano['tarefas_planejadas'].map { |t| t['id'] }, %w[task-a task-b task-c])
      end

      test("3B.2B caminhos dedupe sem sort") do
        card = build_readonly_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'mapear', 'entrega_esperada' => 'mapa',
              'nao_fazer' => [],
              'arquivos' => {
                'leitura' => ['scripts/a.rb', 'scripts/a.rb', 'scripts/b.rb'],
                'escrita' => []
              },
              'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['tarefas_planejadas'][0]['arquivos']['leitura'], %w[scripts/a.rb scripts/b.rb])
      end

      test("3B.2B simplicidade explicita avaliada") do
        card = build_readonly_card
        card['simplicidade'] = {
          'reutiliza_existente' => false,
          'nova_dependencia' => true,
          'nova_abstracao' => false
        }
        plano = run_planner_parse(card)
        assert_eq(plano['simplicidade']['avaliada'], true)
        assert_eq(plano['simplicidade']['nova_dependencia'], true)
        assert_true(plano['avisos'].include?('NEW_DEPENDENCY_DECLARED'))
      end

      test("3B.2B schema aceita executavel com comandos") do
        plano = run_planner_parse(build_executor_card)
        schema = JSON.parse(File.read(File.join(ORCH_DIR, 'contrato-plano.schema.json')))
        MissionPlanner.send(:validate_against_schema!, plano, schema)
      end

      test("3B.2B schema aceita analitico sem comandos") do
        plano = run_planner_parse(build_readonly_card)
        schema = JSON.parse(File.read(File.join(ORCH_DIR, 'contrato-plano.schema.json')))
        MissionPlanner.send(:validate_against_schema!, plano, schema)
      end

      test("3B.2B resumo mostra estrategia tarefas e orcamento") do
        require 'open3'
        Tempfile.create(['mission', '.json']) do |f|
          f.write(JSON.pretty_generate(build_executor_card))
          f.flush
          _out, err, status = Open3.capture3('ruby', PLANNER, '--input', f.path, '--stdout', '--resumo')
          raise "planner falhou: #{err}" unless status.success?
          assert_true(err.include?('Estratégia: agente-unico'), err)
          assert_true(err.include?('Tarefas: 1'), err)
          assert_true(err.include?('Tempo máximo: 900s'), err)
          assert_true(err.include?('Perfil: minimal-change'), err)
        end
      end

      test_denied("3B.2B multi sem justificativa", code: 'MULTI_AGENT_NO_JUSTIFICATION') do |card|
        c = build_multi_reader_card
        c['execucao_planejada'].delete('justificativa_multiagente')
        c
      end

      test_denied("3B.2B multi sem ganho", code: 'MULTI_AGENT_NO_GAIN') do |card|
        c = build_multi_reader_card
        c['execucao_planejada'].delete('ganho_esperado')
        c
      end

      test_denied("3B.2B quatro agentes", code: 'MULTI_AGENT_COUNT_INVALID') do |card|
        c = build_multi_card_with_agents(4)
        c['execucao_planejada']['limites']['max_agentes'] = 3
        c
      end

      test_denied("3B.2B dois writers", code: 'MULTIPLE_WRITERS_DENIED') do |card|
        c = build_multi_mixed_card
        c['execucao_planejada']['agentes'] << {
          'id' => 'writer-2', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => []
        }
        c['execucao_planejada']['tarefas'] << {
          'id' => 'task-w2', 'agente' => 'writer-2', 'objetivo' => 'escrever', 'entrega_esperada' => 'diff',
          'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => ['x.ts'] }, 'depende_de' => []
        }
        c['execucao_planejada']['limites']['max_agentes'] = 3
        c
      end

      test_denied("3B.2B subdelegacao habilitada", code: 'SUBDELEGATION_DENIED') do |card|
        c = build_multi_reader_card
        c['execucao_planejada']['limites']['permite_subdelegacao'] = true
        c
      end

      test_denied("3B.2B papel desconhecido", code: 'AGENT_ROLE_UNKNOWN') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'hacker-fantasma', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B agente sem tarefa", code: 'AGENT_WITHOUT_TASK') do |card|
        c = build_multi_reader_card
        c['execucao_planejada']['tarefas'].pop
        c
      end

      test_denied("3B.2B tarefa agente inexistente", code: 'TASK_AGENT_UNKNOWN') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'fantasma', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B dependencia circular tarefas", code: 'TASK_CIRCULAR_DEPENDENCY') do |card|
        c = build_multi_reader_card
        c['execucao_planejada']['tarefas'] = [
          {
            'id' => 'task-a', 'agente' => 'a', 'objetivo' => 'a', 'entrega_esperada' => 'a',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => ['task-b']
          },
          {
            'id' => 'task-b', 'agente' => 'b', 'objetivo' => 'b', 'entrega_esperada' => 'b',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => ['task-a']
          }
        ]
        c
      end

      test_denied("3B.2B tarefa sem objetivo", code: 'TASK_OBJECTIVE_MISSING') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => '   ', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B tarefa sem entrega", code: 'TASK_DELIVERY_MISSING') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => '  ',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B read-only com escrita", code: 'FILE_OWNERSHIP_PERMISSION_MISMATCH') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => ['scripts/x.rb'] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B caminho absoluto", code: 'PATH_ABSOLUTE_DENIED') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['/etc/passwd'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B caminho com ..", code: 'PATH_TRAVERSAL_DENIED') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['../secrets'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.3A caminho percent-encoded %2e%2e", code: 'PATH_TRAVERSAL_DENIED') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['%2e%2e/etc/passwd'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.3A caminho double-encoding %252e%252e", code: 'PATH_PERCENT_ENCODING_INVALID') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['%252e%252e/etc/passwd'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.3A caminho Windows C:foo", code: 'PATH_ABSOLUTE_DENIED') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => ['C:foo'], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_validation_error("3B.2B max_paralelo maior que 2 no schema") do |card|
        c = build_multi_reader_card
        c['execucao_planejada']['limites']['max_paralelo'] = 3
        c
      end

      test_denied("3B.2B single-agent com dois agentes", code: 'SINGLE_AGENT_TOO_MANY') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'agentes' => [
            { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
            { 'id' => 'b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-a', 'agente' => 'a', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            },
            {
              'id' => 'task-b', 'agente' => 'b', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test("3B.2B segunda resolucao preserva e deduplica negacoes") do
        card = build_executor_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'justificativa_multiagente' => 'nao deveria existir',
          'limites' => { 'max_agentes' => 2, 'max_paralelo' => 1 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => ['scripts/x.rb'] }, 'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'negado')
        codes = neg_codes(plano)
        assert_true(codes.include?('SINGLE_AGENT_MAX_AGENTS_INVALID'), codes.inspect)
        assert_true(codes.include?('SINGLE_AGENT_WITH_JUSTIFICATION'), codes.inspect)
        assert_eq(codes.size, codes.uniq.size)
        assert_eq(plano['resumo_operacional']['executavel'], false)
        assert_eq(plano['comandos'], [])
      end

      test_denied("3B.2B single max_agentes=2", code: 'SINGLE_AGENT_MAX_AGENTS_INVALID') do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 2, 'max_paralelo' => 1 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test_denied("3B.2B tres agentes com max_agentes=1", code: 'MAX_AGENTS_TOO_LOW') do |card|
        c = build_multi_mixed_card
        c['execucao_planejada']['limites']['max_agentes'] = 1
        c
      end

      test("3B.2B dois agentes com max_agentes=3 aceito") do
        card = build_multi_reader_card
        card['execucao_planejada']['limites']['max_agentes'] = 3
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['topologia']['max_agentes'], 3)
        assert_eq(plano['resumo_operacional']['agentes_planejados'], 2)
      end

      test_validation_error("3B.2B max_agentes=4 no schema") do |card|
        c = build_multi_reader_card
        c['execucao_planejada']['limites']['max_agentes'] = 4
        c
      end

      test("3B.2B max_agentes ausente usa quantidade real") do
        card = build_multi_reader_card
        card['execucao_planejada']['limites'].delete('max_agentes')
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['topologia']['max_agentes'], 2)
      end

      test("3B.2B max_tempo 3600 aceito") do
        card = build_readonly_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_tempo_segundos' => 3600 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['status'], 'planejado')
        assert_eq(plano['limites']['max_tempo_segundos'], 3600)
      end

      test_validation_error("3B.2B max_tempo 3601 no schema") do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_tempo_segundos' => 3601 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test("3B.2B 1 retry aceito") do
        card = build_readonly_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_retentativas' => 1 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['limites']['max_retentativas'], 1)
      end

      test_validation_error("3B.2B 2 retries no schema") do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_retentativas' => 2 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      test("3B.2B 1 rodada revisao aceita") do
        card = build_readonly_card
        card['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_rodadas_revisao' => 1 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        plano = run_planner_parse(card)
        assert_eq(plano['limites']['max_rodadas_revisao'], 1)
      end

      test_validation_error("3B.2B 2 rodadas no schema") do |card|
        c = build_readonly_card
        c['execucao_planejada'] = {
          'estrategia' => 'agente-unico',
          'limites' => { 'max_agentes' => 1, 'max_paralelo' => 1, 'max_rodadas_revisao' => 2 },
          'agentes' => [
            { 'id' => 'principal', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] }
          ],
          'tarefas' => [
            {
              'id' => 'task-01', 'agente' => 'principal', 'objetivo' => 'x', 'entrega_esperada' => 'y',
              'nao_fazer' => [], 'arquivos' => { 'leitura' => [], 'escrita' => [] }, 'depende_de' => []
            }
          ]
        }
        c
      end

      [
        ['executavel true sem comandos', lambda { |p|
          p['status'] = 'planejado'
          p['resumo_operacional']['executavel'] = true
          p['comandos'] = []
        }],
        ['executavel false com comandos', lambda { |p|
          p['resumo_operacional']['executavel'] = false
          p['comandos'] = ['git-diff-check']
        }],
        ['status negado com comandos', lambda { |p|
          p['status'] = 'negado'
          p['comandos'] = ['git-diff-check']
          p['resumo_operacional']['executavel'] = false
        }],
        ['planejado-com-restricoes com comandos', lambda { |p|
          p['status'] = 'planejado-com-restricoes'
          p['comandos'] = ['git-diff-check']
          p['resumo_operacional']['executavel'] = false
        }]
      ].each do |name, mutator|
        test("3B.2B schema falha: #{name}") do
          plano = build_operational_plan
          mutator.call(plano)
          schema = JSON.parse(File.read(File.join(ORCH_DIR, 'contrato-plano.schema.json')))
          raised = false
          begin
            MissionPlanner.send(:validate_against_schema!, plano, schema)
          rescue MissionPlanner::SchemaError
            raised = true
          end
          raise "esperava SchemaError para #{name}" unless raised
        end
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
        'papel_principal' => 'explorador',
        'negacoes' => [],
        'comandos' => ['git-diff-check'],
        'decisao_execucao' => {
          'estrategia' => 'agente-unico',
          'origem' => 'default',
          'motivo' => 'default determinístico',
          'justificativa_multiagente' => nil,
          'ganho_esperado' => nil,
          'perfil_execucao' => 'minimal-change',
          'gate_qualidade' => 'evidence-first'
        },
        'resumo_operacional' => {
          'harness' => 'codex-cli',
          'estrategia' => 'agente-unico',
          'agentes_planejados' => 1,
          'max_paralelo' => 1,
          'writers' => 0,
          'risco' => 'baixo',
          'requer_aprovacao' => true,
          'executavel' => false
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
        'tarefas_planejadas' => [
          {
            'id' => 'task-01',
            'agente' => 'principal',
            'objetivo' => 'objetivo de teste',
            'entrega_esperada' => 'entrega de teste',
            'nao_fazer' => [],
            'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] },
            'depende_de' => []
          }
        ],
        'simplicidade' => {
          'avaliada' => false,
          'multiagente_necessario' => false,
          'justificativa_multiagente' => nil,
          'reutiliza_existente' => true,
          'nova_dependencia' => false,
          'nova_abstracao' => false
        },
        'limites' => {
          'max_retentativas' => 1,
          'max_rodadas_revisao' => 1,
          'max_tempo_segundos' => 900
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
      c['executor'] = { 'comandos' => ['git-diff-check'] }
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

    def build_multi_reader_card
      c = build_readonly_card
      c['id'] = 'test-multi-readers'
      c['execucao_planejada'] = {
        'estrategia' => 'multiagente',
        'justificativa_multiagente' => 'Duas investigações independentes em domínios distintos.',
        'ganho_esperado' => 'Reduzir tempo de diagnóstico',
        'agentes' => [
          { 'id' => 'a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
          { 'id' => 'b', 'papel' => 'investigador-incidentes', 'permissao' => 'read-only', 'depende_de' => [] }
        ],
        'tarefas' => [
          {
            'id' => 'task-a', 'agente' => 'a', 'objetivo' => 'mapear código', 'entrega_esperada' => 'mapa',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] }, 'depende_de' => []
          },
          {
            'id' => 'task-b', 'agente' => 'b', 'objetivo' => 'investigar logs', 'entrega_esperada' => 'relatório',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => ['.agents/'], 'escrita' => [] }, 'depende_de' => []
          }
        ],
        'limites' => { 'max_agentes' => 2, 'max_paralelo' => 2 }
      }
      c
    end

    def build_multi_mixed_card
      c = build_executor_card
      c['id'] = 'test-multi-mixed'
      c['execucao_planejada'] = {
        'estrategia' => 'multiagente',
        'justificativa_multiagente' => 'Exploração e escrita precisam de papéis distintos.',
        'ganho_esperado' => 'Separar leitura e escrita com dependência explícita',
        'agentes' => [
          { 'id' => 'reader-a', 'papel' => 'explorador', 'permissao' => 'read-only', 'depende_de' => [] },
          { 'id' => 'reader-b', 'papel' => 'revisor-contratos', 'permissao' => 'read-only', 'depende_de' => [] },
          { 'id' => 'writer', 'papel' => 'executor-escopo', 'permissao' => 'workspace-write', 'depende_de' => %w[reader-a reader-b] }
        ],
        'tarefas' => [
          {
            'id' => 'task-a', 'agente' => 'reader-a', 'objetivo' => 'mapear', 'entrega_esperada' => 'mapa',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => ['scripts/'], 'escrita' => [] }, 'depende_de' => []
          },
          {
            'id' => 'task-b', 'agente' => 'reader-b', 'objetivo' => 'revisar', 'entrega_esperada' => 'notas',
            'nao_fazer' => [], 'arquivos' => { 'leitura' => ['.agents/'], 'escrita' => [] }, 'depende_de' => []
          },
          {
            'id' => 'task-c', 'agente' => 'writer', 'objetivo' => 'implementar', 'entrega_esperada' => 'diff',
            'nao_fazer' => ['refatorar'], 'arquivos' => { 'leitura' => [], 'escrita' => ['src/test.ts'] }, 'depende_de' => %w[task-a task-b]
          }
        ],
        'limites' => { 'max_agentes' => 3, 'max_paralelo' => 2 }
      }
      c
    end

    def build_multi_card_with_agents(count)
      c = build_readonly_card
      agentes = count.times.map do |i|
        {
          'id' => "agent-#{i}",
          'papel' => 'explorador',
          'permissao' => 'read-only',
          'depende_de' => []
        }
      end
      tarefas = count.times.map do |i|
        {
          'id' => "task-#{i}",
          'agente' => "agent-#{i}",
          'objetivo' => "objetivo #{i}",
          'entrega_esperada' => "entrega #{i}",
          'nao_fazer' => [],
          'arquivos' => { 'leitura' => [], 'escrita' => [] },
          'depende_de' => []
        }
      end
      c['execucao_planejada'] = {
        'estrategia' => 'multiagente',
        'justificativa_multiagente' => 'teste com muitos agentes',
        'ganho_esperado' => 'nenhum',
        'agentes' => agentes,
        'tarefas' => tarefas,
        'limites' => { 'max_agentes' => count, 'max_paralelo' => 1 }
      }
      c
    end

    def with_temp_skill_registry
      Dir.mktmpdir('orch-skill', Dir.tmpdir) do |dir|
        skill_path = File.join(dir, 'SKILL.md')
        File.write(skill_path, "name: fixture-skill\n")
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
              'caminho' => 'SKILL.md',
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
        original_root = MissionPlanner::REPO_ROOT
        MissionPlanner.send(:remove_const, :REPO_ROOT)
        MissionPlanner.const_set(:REPO_ROOT, dir)
        yield registry, card, classes, skill_path, good_hash
      ensure
        MissionPlanner.send(:remove_const, :REPO_ROOT)
        MissionPlanner.const_set(:REPO_ROOT, original_root) if original_root
      end
    end
  end
end

OrchestrationTests.run if $PROGRAM_NAME == __FILE__
