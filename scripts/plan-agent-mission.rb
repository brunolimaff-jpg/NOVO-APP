#!/usr/bin/env ruby
# frozen_string_literal: true

# plan-agent-mission.rb — Planejador determinístico dry-run de missões de agente.
#
# Recebe um Cartão de Missão JSON, valida entrada (incluindo schema JSON),
# seleciona papel, skills, adaptador, aplica autorização, e produz um
# Plano de Execução determinístico.
#
# NÃO executa agentes, skills, shell, rede, ou Git.
# Escrita somente no arquivo --output.

require 'json'
require 'yaml'
require 'digest'
require 'optparse'
require 'fileutils'
require 'tmpdir'

module MissionPlanner
  REPO_ROOT   = File.expand_path('..', __dir__)
  ORCH_DIR    = File.join(REPO_ROOT, '.agents', 'orquestracao')
  SCHEMA_PATH = File.join(ORCH_DIR, 'cartao-missao.schema.json')

  AUTH_ORDER = %w[A0 A1 A2 A3 A4 A5 A6].freeze
  ACTION_MIN_AUTH = {
    'commit' => 'A3', 'push' => 'A4', 'pr' => 'A4',
    'merge' => 'A5', 'deploy' => 'A6'
  }.freeze
  ACTION_ALIASES = {
    'pr' => %w[pr criar-pr pull-request pull request],
    'push' => %w[push subir],
    'commit' => %w[commit],
    'merge' => %w[merge mergear juntar],
    'deploy' => %w[deploy implantar]
  }.freeze
  SUPPORTED_SCHEMA_KEYS = %w[
    $schema $id title description type required properties additionalProperties
    enum const items minItems maxItems uniqueItems minLength pattern minimum maximum
    if then else allOf
  ].freeze

  DEFAULT_PERFIL_EXECUCAO = 'minimal-change'
  DEFAULT_GATE_QUALIDADE = 'evidence-first'
  DEFAULT_MAX_TEMPO_SEGUNDOS = 900
  MAX_TEMPO_SEGUNDOS_LIMIT = 3600
  MAX_RETENTATIVAS_LIMIT = 1
  MAX_RODADAS_REVISAO_LIMIT = 1
  MAX_PARALELO_LIMIT = 2
  MAX_AGENTES_LIMIT = 3

  REQUIRED_FIELDS = %w[
    versao id titulo objetivo contexto resultado_esperado
    autorizacao escopo restricoes verificacao
    evidencias_requeridas condicoes_parada
  ].freeze

  DEFAULT_STOP_CONDITIONS = %w[
    comandos_concluidos
    alteracao_fora_do_escopo
    tempo_excedido
    agente_nao_planejado
  ].freeze

  PLAN_SCHEMA_PATH = File.join(ORCH_DIR, 'contrato-plano.schema.json')
  CATALOG_PATH = File.join(ORCH_DIR, 'executor', 'catalogo-comandos.yaml')
  ROTEAMENTO_PATH = File.join(ORCH_DIR, 'roteamento.yaml')

  class ValidationError < StandardError; end
  class PathTraversalError < StandardError; end
  class SchemaError < StandardError; end

  class << self
    def run(argv)
      input_path  = nil
      output_path = nil
      stdout_mode = false
      resumo_mode = false

      parser = OptionParser.new do |opts|
        opts.banner = "Usage: ruby scripts/plan-agent-mission.rb --input <file> [--output <file> | --stdout] [--resumo]"
        opts.on('--input FILE', 'Caminho do Cartão de Missão JSON') { |v| input_path = v }
        opts.on('--output FILE', 'Caminho de saída do plano')       { |v| output_path = v }
        opts.on('--stdout', 'Imprimir plano na stdout')              { stdout_mode = true }
        opts.on('--resumo', 'Imprimir resumo operacional em stderr') { resumo_mode = true }
        opts.on('-h', '--help') do
          warn opts.help
          exit 0
        end
      end
      parser.parse!(argv)

      unless input_path
        warn 'ERRO: --input é obrigatório'
        warn parser.help
        exit 1
      end

      validate_path_safety(input_path, must_exist: true)

      unless File.file?(input_path)
        warn "ERRO: arquivo de entrada não encontrado: #{input_path}"
        exit 1
      end

      raw    = File.read(input_path)
      cartao = parse_json_safely(raw, input_path)

      plano    = plan(cartao)
      json_out = serialize_plan(plano)

      warn format_resumo(plano) if resumo_mode

      if stdout_mode
        $stdout.write(json_out)
      elsif output_path
        validate_path_safety(output_path, must_exist: false)
        FileUtils.mkdir_p(File.dirname(output_path))
        File.write(output_path, json_out)
      else
        warn 'ERRO: use --output <file> ou --stdout'
        exit 1
      end
    rescue ValidationError => e
      warn "ERRO DE VALIDAÇÃO: #{e.message}"
      exit 2
    rescue SchemaError => e
      warn "ERRO DE SCHEMA: #{e.message}"
      exit 2
    rescue PathTraversalError => e
      warn "ERRO DE SEGURANÇA: #{e.message}"
      exit 3
    rescue StandardError => e
      warn "ERRO INTERNO: #{e.class}: #{e.message}"
      exit 4
    end

    # ── Public planning entry point ──────────────────────────────────

    def plan(cartao)
      fontes = []
      fontes << '.agents/orquestracao/roteamento.yaml'

      # 1. Validate schema (structural conformance to JSON Schema)
      schema = load_json(SCHEMA_PATH)
      validate_against_schema!(cartao, schema)

      # 2. Validate required top-level fields
      validate_required_fields!(cartao)

      # 3. Load canonical sources (NO compatibilidade.yaml — unused)
      roteamento = load_yaml(File.join(ORCH_DIR, 'roteamento.yaml'))
      registry   = load_yaml(File.join(REPO_ROOT, '.agents', 'skills', 'registry.yaml'))
      mapa       = load_yaml(File.join(REPO_ROOT, '.agents', 'adaptadores', 'mapa-adaptadores.yaml'))

      fontes << '.agents/skills/registry.yaml'
      fontes << '.agents/adaptadores/mapa-adaptadores.yaml'
      fontes << '.agents/papeis/README.md'

      auth_nivel = cartao['autorizacao']['nivel']
      nivel_idx  = AUTH_ORDER.index(auth_nivel)
      classes    = roteamento['classes'] || {}

      # 4. Select papel
      papel_info = select_papel(cartao, roteamento)
      papel      = papel_info[:papel]

      # 5. Compute effective permissions
      rede_raw   = cartao.key?('rede_permitida')  ? cartao['rede_permitida']  : false
      shell_raw  = cartao.key?('shell_permitido') ? cartao['shell_permitido'] : false
      is_executor = papel_info[:classe] == 'executor'

      effective_rede  = rede_raw  && is_executor
      effective_shell = shell_raw && is_executor && nivel_idx >= AUTH_ORDER.index('A2')

      # 6. Check prohibitions
      negacoes = []
      avisos   = []

      instrucao   = cartao['instrucao_atual'] || ''
      acoes_perm  = cartao['autorizacao']['acoes_permitidas'] || []
      acoes_sol   = cartao['autorizacao']['acoes_solicitadas'] || []

      acoes_sol.each do |acao|
        next if action_allowed?(acoes_perm, acao)

        negacoes << neg('ACTION_NOT_ALLOWED',
                         "ação solicitada não permitida pelo cartão: #{acao}")
      end

      # 6a. Action authorization (loop-driven, uses acoes_solicitadas not acoes_permitidas)
      ACTION_MIN_AUTH.each do |action, min_auth|
        next unless action_requested?(acoes_sol, action)

        min_idx = AUTH_ORDER.index(min_auth)
        if nivel_idx < min_idx
          negacoes << neg('AUTH_INSUFFICIENT',
                           "#{action} negado: autorização #{auth_nivel} insuficiente (exige #{min_auth})")
        elsif action == 'merge' && !instrucao.upcase.include?('MERGE')
          negacoes << neg('MERGE_TOKEN_MISSING',
                           'merge negado: token MERGE ausente na instrução atual')
        end
      end

      # 6b. Ações proibidas
      (cartao['autorizacao']['acoes_proibidas'] || []).each do |acao|
        next unless action_requested?(acoes_sol, acao)

        negacoes << neg('ACTION_FORBIDDEN', "ação proibida pelo cartão: #{acao}")
      end

      # 6c. Write authorization gate (executor-escopo + A2+)
      escrita = cartao['escopo']['escrita'] || []
      if !escrita.empty?
        unless papel == 'executor-escopo' && nivel_idx >= AUTH_ORDER.index('A2')
          detalhe = "papel=#{papel || 'nenhum'}, autorização=#{auth_nivel}"
          negacoes << neg('AUTH_WRITE_REQUIRES_A2',
                           "escrita exige A2 e executor-escopo (#{detalhe})")
        end
      end

      # 6d. Rede for leitor
      if rede_raw && !is_executor
        negacoes << neg('NETWORK_FOR_READER',
                         "rede proibida para papel leitor (#{papel})")
      end

      # 6e. Shell for leitor
      if shell_raw && !is_executor
        negacoes << neg('SHELL_FOR_READER',
                         "shell proibido para papel leitor (#{papel})")
      end

      # 6f. Delegação
      delegacao = cartao.key?('delegacao_permitida') ? cartao['delegacao_permitida'] : false
      if delegacao
        negacoes << neg('DELEGATION_FORBIDDEN',
                         'delegação negada: agentes filhos não podem delegar')
      end

      # 7. Select adapter
      adapter_info = select_adapter(cartao, mapa, papel, avisos)

      # 8. Select skills (classes passed as arg, effective perms used)
      skills_result = select_skills(
        cartao, registry, papel, auth_nivel, nivel_idx,
        effective_rede, effective_shell, adapter_info[:ferramenta], classes
      )

      skills_selecionadas = skills_result[:aprovadas]
      negacoes.concat(skills_result[:negadas])

      # 9. Handle fluxo_solicitado (delivery-loop etc.)
      fluxo_selecionado = nil
      fluxo_sol = cartao['fluxo_solicitado']
      if fluxo_sol
        dl = (registry['skills'] || []).find { |s| s['id'] == fluxo_sol }
        if dl && dl['tipo'] == 'fluxo'
          fluxo_selecionado = fluxo_sol
          avisos << "fluxo #{fluxo_sol} referenciado — não executado em Fase 3A"
          avisos << 'fluxo para em REPORT_READY'
        end
      end

      # 10. Determine status
      status = determine_status(negacoes, papel_info, adapter_info, skills_result)

      # 11. Determine authorization necessary
      auth_necessaria = determine_auth_necessary(instrucao, acoes_sol, papel_info)

      # 12. Gate derived permissions by status
      gated = status == 'planejado'

      # 13. Build etapas
      etapas = gated ? build_etapas(cartao, papel, skills_selecionadas, adapter_info[:ferramenta]) : []

      # 14. Propagate authorized commands (order-preserving dedupe)
      command_result = propagate_commands(cartao, status, papel: papel)
      negacoes.concat(command_result[:negacoes])
      unless command_result[:negacoes].empty?
        status = determine_status(negacoes, papel_info, adapter_info, skills_result)
        gated = status == 'planejado'
        etapas = gated ? build_etapas(cartao, papel, skills_selecionadas, adapter_info[:ferramenta]) : []
      end
      comandos = gated ? command_result[:comandos] : []
      # Plano analítico: nunca carregar comandos (runner exige executavel=true → PLAN_NOT_EXECUTABLE)
      comandos = [] unless mission_requires_commands?(cartao, papel)

      escrita_permitida = gated && papel == 'executor-escopo' && !escrita.empty?
      permissao = escrita_permitida ? 'workspace-write' : 'read-only'
      papel_topo = gated ? papel : (papel || 'explorador')

      # União: cartão primeiro, depois defaults; dedupe preservando ordem
      stop = merge_stop_conditions(cartao['condicoes_parada'] || [])

      exec_result = resolve_planned_execution(
        cartao,
        papel_topo: papel_topo,
        permissao: permissao,
        escrita_permitida: escrita_permitida,
        escopo_leitura: cartao.dig('escopo', 'leitura') || [],
        escopo_escrita: cartao.dig('escopo', 'escrita') || []
      )
      negacoes.concat(exec_result[:negacoes])
      unless exec_result[:negacoes].empty?
        # Rebaixa permissões e recalcula topologia com o mesmo cartão
        status = determine_status(negacoes, papel_info, adapter_info, skills_result)
        gated = status == 'planejado'
        etapas = gated ? build_etapas(cartao, papel, skills_selecionadas, adapter_info[:ferramenta]) : []
        comandos = gated ? command_result[:comandos] : []
        comandos = [] unless mission_requires_commands?(cartao, papel)
        escrita_permitida = gated && papel == 'executor-escopo' && !escrita.empty?
        permissao = escrita_permitida ? 'workspace-write' : 'read-only'
        papel_topo = gated ? papel : (papel || 'explorador')
        exec_result = resolve_planned_execution(
          cartao,
          papel_topo: papel_topo,
          permissao: permissao,
          escrita_permitida: escrita_permitida,
          escopo_leitura: cartao.dig('escopo', 'leitura') || [],
          escopo_escrita: cartao.dig('escopo', 'escrita') || []
        )
        # Incorpora negações da 2ª resolução; topologia final = segundo exec_result
        negacoes.concat(exec_result[:negacoes])
        negacoes = dedupe_negacoes(negacoes)
        status = determine_status(negacoes, papel_info, adapter_info, skills_result)
        gated = status == 'planejado'
        etapas = gated ? build_etapas(cartao, papel, skills_selecionadas, adapter_info[:ferramenta]) : []
        comandos = gated ? command_result[:comandos] : []
        comandos = [] unless mission_requires_commands?(cartao, papel)
        escrita_permitida = gated && papel == 'executor-escopo' && !escrita.empty?
        permissao = escrita_permitida ? 'workspace-write' : 'read-only'
        papel_topo = gated ? papel : (papel || 'explorador')
      end
      negacoes = dedupe_negacoes(negacoes)

      decisao_execucao = exec_result[:decisao_execucao]
      topologia = exec_result[:topologia]
      tarefas_planejadas = exec_result[:tarefas_planejadas]
      limites = exec_result[:limites]
      simplicidade = exec_result[:simplicidade]

      writers = topologia['agentes'].count { |a| a['permissao'] == 'workspace-write' }
      executavel = gated &&
                   papel == 'executor-escopo' &&
                   !comandos.empty? &&
                   negacoes.empty?
      resumo = {
        'harness' => 'codex-cli',
        'estrategia' => decisao_execucao['estrategia'],
        'agentes_planejados' => topologia['agentes'].size,
        'max_paralelo' => exec_result[:max_paralelo],
        'writers' => writers,
        'risco' => escrita_permitida || executavel ? 'medio' : 'baixo',
        'requer_aprovacao' => true,
        'executavel' => executavel
      }

      avisos = apply_simplicity_warnings(avisos, resumo, simplicidade)

      # 15. Build plan
      plano = {
        'adaptador_selecionado'    => adapter_info[:caminho],
        'autorizacao_fornecida'    => auth_nivel,
        'autorizacao_necessaria'   => auth_necessaria,
        'avisos'                   => avisos.sort.uniq,
        'comandos'                 => comandos,
        'condicoes_parada'         => stop,
        'decisao_execucao'         => decisao_execucao,
        'delegacao_permitida'      => false,
        'evidencias_requeridas'    => (cartao['evidencias_requeridas'] || []).sort,
        'etapas'                   => etapas,
        'ferramenta_selecionada'   => adapter_info[:ferramenta],
        'fluxo_selecionado'        => fluxo_selecionado,
        'fontes_decisao'           => fontes.sort.uniq,
        'leitura_permitida'        => true,
        'limites'                  => limites,
        'missao_id'                => cartao['id'],
        'negacoes'                 => sort_negacoes(negacoes),
        'papeis_auxiliares'        => [],
        'papel_principal'          => gated ? papel : nil,
        'rede_permitida'           => gated ? effective_rede  : false,
        'resumo_operacional'       => resumo,
        'shell_permitido'          => gated ? effective_shell : false,
        'simplicidade'             => simplicidade,
        'skills_selecionadas'      => gated ? skills_selecionadas.sort : [],
        'status'                   => status,
        'tarefas_planejadas'       => tarefas_planejadas,
        'topologia'                => topologia,
        'versao'                   => 1,
        'escrita_permitida'        => escrita_permitida,
        'acoes_solicitadas'        => acoes_sol.sort,
        'acoes_permitidas'         => acoes_perm.sort,
      }

      require_comandos = mission_requires_commands?(cartao, papel)
      if status == 'planejado' && negacoes.empty?
        validate_operational_plan!(plano, require_comandos: require_comandos)
      end

      plan_schema = load_json(PLAN_SCHEMA_PATH)
      validate_against_schema!(plano, plan_schema)

      plano
    end

    # Public operational validator (used by tests for multi-agent cases).
    def validate_operational_plan!(plano, require_comandos: true)
      resumo = plano['resumo_operacional']
      topo = plano['topologia']
      fail_op!('resumo_operacional ausente ou invalido') unless resumo.is_a?(Hash)
      fail_op!('topologia ausente ou invalida') unless topo.is_a?(Hash)

      simp = plano['simplicidade'].is_a?(Hash) ? plano['simplicidade'] : {}
      status = plano['status']
      comandos = plano['comandos']
      fail_op!('comandos deve ser array') unless comandos.is_a?(Array)

      fail_op!('harness must be codex-cli') unless resumo['harness'] == 'codex-cli'
      unless %w[agente-unico multiagente].include?(resumo['estrategia'])
        fail_op!('estrategia must be agente-unico or multiagente')
      end
      unless [true, false].include?(resumo['executavel'])
        fail_op!('executavel deve ser boolean')
      end

      agentes_planejados = require_integer!(resumo, 'agentes_planejados', 'resumo_operacional.agentes_planejados')
      max_paralelo = require_integer!(resumo, 'max_paralelo', 'resumo_operacional.max_paralelo')
      writers_declared = require_integer!(resumo, 'writers', 'resumo_operacional.writers')
      max_agentes = require_integer!(topo, 'max_agentes', 'topologia.max_agentes')
      max_profundidade = require_integer!(topo, 'max_profundidade', 'topologia.max_profundidade')

      fail_op!('topologia.agentes ausente') unless topo.key?('agentes')
      agentes = topo['agentes']
      fail_op!('topologia.agentes deve ser array') unless agentes.is_a?(Array)

      fail_op!('zero agentes') if agentes.empty?
      if agentes_planejados != agentes.size
        fail_op!('agentes_planejados divergente da lista')
      end
      if max_agentes > MAX_AGENTES_LIMIT
        fail_op!('MAX_AGENTS_EXCEEDED')
      end
      if max_agentes < agentes.size
        fail_op!('MAX_AGENTS_TOO_LOW')
      end
      if max_paralelo > MAX_PARALELO_LIMIT
        fail_op!('MAX_PARALLEL_EXCEEDED')
      end
      if max_paralelo > agentes_planejados
        fail_op!('max_paralelo maior que agentes_planejados')
      end
      fail_op!('max_profundidade must be 1') unless max_profundidade == 1
      fail_op!('subdelegacao proibida') if topo['permite_subdelegacao'] == true

      limites = plano['limites'].is_a?(Hash) ? plano['limites'] : {}
      if limites.key?('max_tempo_segundos')
        tempo = limites['max_tempo_segundos']
        fail_op!('MAX_TEMPO_EXCEEDED') if tempo.is_a?(Integer) && tempo > MAX_TEMPO_SEGUNDOS_LIMIT
        fail_op!('MAX_TEMPO_TOO_LOW') if tempo.is_a?(Integer) && tempo < 1
      end
      if limites.key?('max_retentativas')
        retries = limites['max_retentativas']
        fail_op!('MAX_RETRIES_EXCEEDED') if retries.is_a?(Integer) && retries > MAX_RETENTATIVAS_LIMIT
      end
      if limites.key?('max_rodadas_revisao')
        rounds = limites['max_rodadas_revisao']
        fail_op!('MAX_REVIEW_ROUNDS_EXCEEDED') if rounds.is_a?(Integer) && rounds > MAX_RODADAS_REVISAO_LIMIT
      end

      ids = agentes.map { |a| a.is_a?(Hash) ? a['id'] : nil }
      fail_op!('agente com forma invalida') if ids.any?(&:nil?)
      fail_op!('ids de agentes duplicados') if ids.size != ids.uniq.size

      writers = agentes.select { |a| a['permissao'] == 'workspace-write' }
      fail_op!('mais de um writer') if writers.size > 1
      if writers_declared != writers.size
        fail_op!('writers divergente da topologia')
      end

      roles = canonical_role_ids
      agentes.each do |ag|
        fail_op!("papel desconhecido: #{ag['papel']}") unless roles.include?(ag['papel'])
        unless %w[read-only workspace-write].include?(ag['permissao'])
          fail_op!("permissao invalida: #{ag['permissao']}")
        end
        if ag['papel'] != 'executor-escopo' && ag['permissao'] == 'workspace-write'
          fail_op!("permissao workspace-write incompativel com papel #{ag['papel']}")
        end
        (ag['depende_de'] || []).each do |dep|
          fail_op!("dependencia inexistente: #{dep}") unless ids.include?(dep)
        end
      end
      fail_op!('dependencia circular') if circular_deps?(agentes)

      if resumo['estrategia'] == 'agente-unico'
        fail_op!('agente-unico exige exatamente 1 agente') unless agentes.size == 1
        fail_op!('SINGLE_AGENT_MAX_AGENTS_INVALID') unless max_agentes == 1
        fail_op!('agente-unico exige max_paralelo=1') unless max_paralelo == 1
        fail_op!('agente-unico exige multiagente_necessario=false') if simp['multiagente_necessario']
      end

      if resumo['estrategia'] == 'multiagente'
        fail_op!('multiagente exige multiagente_necessario=true') unless simp['multiagente_necessario'] == true
        just = simp['justificativa_multiagente']
        if just.nil? || !just.is_a?(String) || just.strip.empty?
          fail_op!('multiagente exige justificativa_multiagente')
        end
      end

      decisao = plano['decisao_execucao']
      fail_op!('decisao_execucao ausente') unless decisao.is_a?(Hash)
      if decisao['estrategia'] != resumo['estrategia']
        fail_op!('decisao_execucao.estrategia divergente do resumo')
      end

      tarefas = plano['tarefas_planejadas']
      fail_op!('tarefas_planejadas deve ser array') unless tarefas.is_a?(Array)
      fail_op!('nenhuma tarefa planejada') if tarefas.empty?

      task_ids = tarefas.map { |t| t.is_a?(Hash) ? t['id'] : nil }
      fail_op!('tarefa com forma invalida') if task_ids.any?(&:nil?)
      fail_op!('ids de tarefas duplicados') if task_ids.size != task_ids.uniq.size

      agent_ids = agentes.map { |a| a['id'] }
      tarefas.each do |task|
        fail_op!("tarefa #{task['id']} sem agente") unless agent_ids.include?(task['agente'])
        fail_op!("tarefa #{task['id']} sem objetivo") if task['objetivo'].to_s.strip.empty?
        fail_op!("tarefa #{task['id']} sem entrega_esperada") if task['entrega_esperada'].to_s.strip.empty?
        unless task['nao_fazer'].is_a?(Array)
          fail_op!("tarefa #{task['id']} nao_fazer deve ser array")
        end
        arquivos = task['arquivos']
        fail_op!("tarefa #{task['id']} arquivos invalidos") unless arquivos.is_a?(Hash)
        (task['depende_de'] || []).each do |dep|
          fail_op!("tarefa dependencia inexistente: #{dep}") unless task_ids.include?(dep)
        end
      end
      fail_op!('dependencia circular entre tarefas') if circular_deps?(tarefas, id_key: 'id', deps_key: 'depende_de')

      agents_with_tasks = tarefas.map { |t| t['agente'] }.uniq
      agentes.each do |ag|
        fail_op!("agente #{ag['id']} sem tarefa") unless agents_with_tasks.include?(ag['id'])
      end

      limites = plano['limites']
      fail_op!('limites ausentes') unless limites.is_a?(Hash)
      require_integer!(limites, 'max_tempo_segundos', 'limites.max_tempo_segundos')

      if %w[negado incompleto planejado-com-restricoes].include?(status) && !comandos.empty?
        fail_op!("status #{status} nao pode ter comandos executaveis")
      end

      if require_comandos && status == 'planejado' && comandos.empty?
        fail_op!('planejado exige ao menos um comando')
      end

      if resumo['executavel'] == true
        unless status == 'planejado' &&
               plano['papel_principal'] == 'executor-escopo' &&
               !comandos.empty? &&
               Array(plano['negacoes']).empty?
          fail_op!('executavel=true exige planejado, executor-escopo, comandos e sem negacoes')
        end
      end

      true
    end

    def format_resumo(plano)
      r = plano['resumo_operacional'] || {}
      t = plano['topologia'] || {}
      s = plano['simplicidade'] || {}
      d = plano['decisao_execucao'] || {}
      lim = plano['limites'] || {}
      tarefas = Array(plano['tarefas_planejadas'])
      avisos = Array(plano['avisos']).grep(/\A[A-Z0-9_]+\z/)
      warnings = avisos.empty? ? 'nenhum' : avisos.join(', ')
      simplicity = s['avaliada'] ? 'avaliada' : 'pendente de revisão'
      write_files = tarefas.sum { |task| Array(task.dig('arquivos', 'escrita')).size }
      lines = [
        "Harness: #{r['harness']}",
        "Estratégia: #{r['estrategia']}",
        "Origem: #{d['origem'] || 'default'}",
        "Agentes: #{r['agentes_planejados']} de #{t['max_agentes']}",
        "Paralelos: #{r['max_paralelo']}",
        "Writers: #{r['writers']}",
        "Subdelegação: #{t['permite_subdelegacao'] ? 'sim' : 'não'}",
        "Tarefas: #{tarefas.size}",
        "Perfil: #{d['perfil_execucao'] || DEFAULT_PERFIL_EXECUCAO}",
        "Gate: #{d['gate_qualidade'] || DEFAULT_GATE_QUALIDADE}",
        "Comandos: #{Array(plano['comandos']).size}",
        "Tempo máximo: #{lim['max_tempo_segundos'] || DEFAULT_MAX_TEMPO_SEGUNDOS}s",
        "Tentativas: #{lim['max_retentativas'] || 1}",
        "Executável: #{r['executavel'] ? 'sim' : 'não'}",
        "Simplicidade: #{simplicity}",
        "Aprovação humana: #{r['requer_aprovacao'] ? 'necessária' : 'não'}",
        "Warnings: #{warnings}"
      ]
      if r['estrategia'] == 'multiagente'
        just = d['justificativa_multiagente']
        lines.insert(4, "Justificativa: #{just}") if just && !just.to_s.strip.empty?
        ganho = d['ganho_esperado']
        lines.insert(5, "Ganho esperado: #{ganho}") if ganho && !ganho.to_s.strip.empty?
        lines << "Arquivos com escrita: #{write_files}"
        lines << 'Conflitos de propriedade: nenhum'
      end
      lines.join("\n")
    end

    private

    # ── Path safety ──────────────────────────────────────────────────

    def validate_path_safety(path, must_exist: false)
      expanded = File.expand_path(path)

      # Reject ~ expansion to unexpected home dirs
      if path.include?('~') && expanded != File.expand_path(path)
        raise PathTraversalError, "path rejeitado por segurança: #{path}"
      end

      # Verify path stays within allowed roots
      repo_root = File.expand_path(REPO_ROOT)
      tmp_dir   = File.expand_path(Dir.tmpdir)
      allowed_roots = [repo_root, tmp_dir]
      allowed_roots << File.realpath(tmp_dir) if File.exist?(tmp_dir)
      allowed_roots.uniq!

      within_allowed = allowed_roots.any? do |root|
        expanded == root || expanded.start_with?(root + File::SEPARATOR)
      end

      unless within_allowed
        raise PathTraversalError,
              "path fora do escopo permitido: #{path} (resolvido: #{expanded})"
      end

      # Check symlink targets if file/dir exists
      check_path = must_exist ? expanded : File.dirname(expanded)
      if File.exist?(check_path) || File.symlink?(check_path)
        real = File.realpath(check_path)
        real_safe = allowed_roots.any? do |root|
          real == root || real.start_with?(root + File::SEPARATOR)
        end
        unless real_safe
          raise PathTraversalError,
                "symlink ou path real aponta fora do escopo: #{path} (real: #{real})"
        end
      end
    rescue Errno::ENOENT
      # Parent dir doesn't exist — fail safe
      raise PathTraversalError, "path rejeitado (diretório pai inexistente): #{path}"
    end

    # ── JSON Schema validation (internal) ────────────────────────────

    def validate_against_schema!(data, schema, path = '$')
      validate_schema_keywords!(schema, path)

      unless data.is_a?(Hash)
        raise SchemaError, "#{path}: esperado object, obtido #{ruby_type_name(data)}"
      end

      # Check type
      if schema['type'] && !Array(schema['type']).include?('object')
        raise SchemaError, "#{path}: type '#{schema['type']}' não suportado no validador"
      end

      # Check required
      (schema['required'] || []).each do |field|
        next if data.key?(field)
        raise SchemaError, "#{path}: campo obrigatório '#{field}' ausente"
      end

      # Check additionalProperties
      known_props = (schema['properties'] || {}).keys
      if schema['additionalProperties'] == false
        extra = data.keys - known_props
        unless extra.empty?
          raise SchemaError, "#{path}: propriedades não permitidas: #{extra.sort.join(', ')}"
        end
      end

      # Validate each property
      (schema['properties'] || {}).each do |key, sub_schema|
        next unless data.key?(key)
        validate_value!(data[key], sub_schema, "#{path}.#{key}")
      end

      apply_conditional_schemas!(data, schema, path)
    end

    def apply_conditional_schemas!(data, schema, path)
      Array(schema['allOf']).each do |sub_schema|
        validate_schema_keywords!(sub_schema, "#{path}.allOf")
        apply_conditional_schemas!(data, sub_schema, path)
      end

      if_schema = schema['if']
      return unless if_schema.is_a?(Hash)

      validate_schema_keywords!(if_schema, "#{path}.if")
      if matches_schema_fragment?(data, if_schema, "#{path}.if")
        then_schema = schema['then']
        if then_schema.is_a?(Hash)
          validate_schema_keywords!(then_schema, "#{path}.then")
          apply_conditional_schemas!(data, then_schema, path)
        end
      elsif schema['else'].is_a?(Hash)
        validate_schema_keywords!(schema['else'], "#{path}.else")
        apply_conditional_schemas!(data, schema['else'], path)
      end
    end

    def matches_schema_fragment?(data, fragment, path)
      fragment = fragment.dup
      props = fragment['properties'] || {}
      required = fragment['required'] || []

      required.each do |field|
        return false unless data.is_a?(Hash) && data.key?(field)
      end

      props.each do |key, sub_schema|
        next unless data.is_a?(Hash) && data.key?(key)
        validate_value!(data[key], sub_schema, "#{path}.properties.#{key}")
      end

      true
    rescue SchemaError
      false
    end

    def validate_value!(value, schema, path)
      validate_schema_keywords!(schema, path)

      # type
      if schema['type']
        validate_type!(value, schema['type'], path)
      end

      # enum
      if schema['enum'] && !schema['enum'].include?(value)
        raise SchemaError, "#{path}: valor '#{value}' não está no enum #{schema['enum'].inspect}"
      end

      # const
      if schema.key?('const') && value != schema['const']
        raise SchemaError, "#{path}: esperado const #{schema['const'].inspect}, obtido #{value.inspect}"
      end

      # string constraints
      if value.is_a?(String)
        if schema['minLength'] && value.length < schema['minLength']
          raise SchemaError, "#{path}: minLength=#{schema['minLength']} violado (#{value.length})"
        end
        if schema['pattern'] && !Regexp.new(schema['pattern']).match?(value)
          raise SchemaError, "#{path}: pattern '#{schema['pattern']}' não corresponde a '#{value}'"
        end
      end

      # number constraints
      if value.is_a?(Numeric)
        if schema['minimum'] && value < schema['minimum']
          raise SchemaError, "#{path}: minimum=#{schema['minimum']} violado (#{value})"
        end
        if schema['maximum'] && value > schema['maximum']
          raise SchemaError, "#{path}: maximum=#{schema['maximum']} violado (#{value})"
        end
      end

      # array constraints
      if value.is_a?(Array)
        if schema['minItems'] && value.length < schema['minItems']
          raise SchemaError, "#{path}: minItems=#{schema['minItems']} violado (#{value.length})"
        end
        if schema['maxItems'] && value.length > schema['maxItems']
          raise SchemaError, "#{path}: maxItems=#{schema['maxItems']} violado (#{value.length})"
        end
        if schema['uniqueItems']
          unless value.length == value.uniq.length
            raise SchemaError, "#{path}: uniqueItems violado (duplicatas em #{value.inspect})"
          end
        end
        if schema['items']
          value.each_with_index do |elem, i|
            validate_value!(elem, schema['items'], "#{path}[#{i}]")
          end
        end
      end

      # object constraints
      if value.is_a?(Hash) && schema['properties']
        validate_against_schema!(value, schema, path)
      end
    end

    def validate_type!(value, expected_type, path)
      expected_types = Array(expected_type)
      unsupported = expected_types - %w[string integer boolean array object null]
      unless unsupported.empty?
        raise SchemaError, "#{path}: tipo '#{unsupported.first}' não suportado"
      end

      ok = expected_types.any? do |type|
        case type
        when 'string'  then value.is_a?(String)
        when 'integer' then value.is_a?(Integer)
        when 'boolean' then [true, false].include?(value)
        when 'array'   then value.is_a?(Array)
        when 'object'  then value.is_a?(Hash)
        when 'null'    then value.nil?
        end
      end
      raise SchemaError, "#{path}: esperado #{expected_type}, obtido #{ruby_type_name(value)}" unless ok
    end

    def validate_schema_keywords!(schema, path)
      unknown = schema.keys - SUPPORTED_SCHEMA_KEYS
      unless unknown.empty?
        raise SchemaError, "#{path}: schema usa keyword não suportada: #{unknown.sort.join(', ')}"
      end

      (schema['properties'] || {}).each do |key, sub_schema|
        validate_schema_keywords!(sub_schema, "#{path}.properties.#{key}")
      end
      validate_schema_keywords!(schema['items'], "#{path}.items") if schema['items'].is_a?(Hash)
      validate_schema_keywords!(schema['if'], "#{path}.if") if schema['if'].is_a?(Hash)
      validate_schema_keywords!(schema['then'], "#{path}.then") if schema['then'].is_a?(Hash)
      validate_schema_keywords!(schema['else'], "#{path}.else") if schema['else'].is_a?(Hash)
      Array(schema['allOf']).each_with_index do |sub_schema, i|
        validate_schema_keywords!(sub_schema, "#{path}.allOf[#{i}]") if sub_schema.is_a?(Hash)
      end
    end

    def ruby_type_name(value)
      case value
      when NilClass   then 'null'
      when String     then 'string'
      when Integer    then 'integer'
      when Float      then 'number'
      when TrueClass  then 'boolean'
      when FalseClass then 'boolean'
      when Array      then 'array'
      when Hash       then 'object'
      else value.class.to_s.downcase
      end
    end

    # ── Parsing / loading ────────────────────────────────────────────

    def parse_json_safely(raw, label)
      JSON.parse(raw)
    rescue JSON::ParserError => e
      raise ValidationError, "JSON inválido em #{label}: #{e.message}"
    end

    def load_json(path)
      raise ValidationError, "arquivo não encontrado: #{path}" unless File.file?(path)
      JSON.parse(File.read(path))
    rescue JSON::ParserError => e
      raise ValidationError, "JSON inválido em #{path}: #{e.message}"
    end

    def validate_required_fields!(cartao)
      missing = REQUIRED_FIELDS - cartao.keys
      return if missing.empty?

      raise ValidationError, "campos obrigatórios ausentes: #{missing.sort.join(', ')}"
    end

    def load_yaml(path)
      raise ValidationError, "arquivo canônico não encontrado: #{path}" unless File.file?(path)

      YAML.safe_load(File.read(path), aliases: false)
    rescue ArgumentError, Psych::SyntaxError => e
      raise ValidationError, "YAML inválido em #{path}: #{e.message}"
    end

    # ── Negation helpers ─────────────────────────────────────────────

    def neg(codigo, mensagem)
      { 'codigo' => codigo, 'mensagem' => mensagem }
    end

    def dedupe_negacoes(arr)
      seen = {}
      out = []
      Array(arr).each do |n|
        next unless n.is_a?(Hash)

        key = [n['codigo'], n['mensagem']]
        next if seen[key]

        seen[key] = true
        out << n
      end
      out
    end

    def sort_negacoes(arr)
      dedupe_negacoes(arr).sort_by { |n| [n['codigo'].to_s, n['mensagem'].to_s] }
    end

    # ── Papel selection ──────────────────────────────────────────────

    def select_papel(cartao, roteamento)
      preferred = cartao['papel_preferido']
      objetivo  = (cartao['objetivo'] || '').downcase
      classes   = roteamento['classes'] || {}

      # Check preferred first
      if preferred && classes.key?(preferred)
        return {
          papel:   preferred,
          classe:  classes[preferred]['classe'],
          metodo:  'preferido',
          intencao: 'preferido pelo cartão'
        }
      end

      # Route by keywords
      intencoes      = roteamento['intencoes'] || []
      scores         = Hash.new(0)
      intencao_match = nil

      intencoes.each do |entry|
        p = entry['papel']
        (entry['palavras_chave'] || []).each do |kw|
          if objetivo.include?(kw.downcase)
            scores[p] += 1
            intencao_match ||= entry['intencao']
          end
        end
      end

      return { papel: nil, classe: nil, metodo: 'incompleto', intencao: nil } if scores.empty?

      max_score  = scores.values.max
      top_papeis = scores.select { |_, v| v == max_score }.keys

      return { papel: nil, classe: nil, metodo: 'ambiguo', intencao: intencao_match } if top_papeis.size > 1

      p = top_papeis.first
      {
        papel:    p,
        classe:   classes.dig(p, 'classe'),
        metodo:   'roteamento',
        intencao: intencao_match
      }
    end

    # ── Action detection ─────────────────────────────────────────────

    def action_requested?(acoes_solicitadas, action)
      aliases = ACTION_ALIASES.fetch(action, [action])
      return true if acoes_solicitadas.any? { |a| aliases.include?(a.downcase) || a.downcase == action.downcase }
      false
    end

    def action_allowed?(acoes_permitidas, action)
      normalized = action.downcase
      aliases = ACTION_ALIASES.fetch(normalized, [normalized])
      acoes_permitidas.any? do |allowed|
        allowed_down = allowed.downcase
        allowed_down == normalized || aliases.include?(allowed_down)
      end
    end

    # ── Adapter selection ────────────────────────────────────────────

    def select_adapter(cartao, mapa, papel, avisos)
      ferramentas_permitidas = cartao['ferramentas_permitidas'] || []
      papeis_mapa            = mapa['papeis'] || {}
      papel_entry            = papeis_mapa[papel]

      return { ferramenta: nil, caminho: nil } unless papel_entry

      adaptadores = papel_entry['adaptadores'] || []
      selected    = nil

      # Find first compatible adapter with a path
      adaptadores.each do |adapter|
        ferramenta = adapter['ferramenta']
        next unless ferramentas_permitidas.include?(ferramenta)
        next if adapter['caminho'].nil? || adapter['caminho'].to_s.strip.empty?

        selected = adapter
        break
      end

      # Fallback: adapter without materialized path
      if selected.nil?
        adaptadores.each do |adapter|
          ferramenta = adapter['ferramenta']
          next unless ferramentas_permitidas.include?(ferramenta)

          status_str = adapter['status'] || 'desconhecido'
          avisos << "adaptador #{ferramenta} para #{papel}: status=#{status_str}, sem caminho materializado"
          selected = adapter
          break
        end
      end

      return { ferramenta: nil, caminho: nil } unless selected

      # Record limitations
      (selected['limitacoes'] || []).each do |lim|
        avisos << "limitação #{selected['ferramenta']}/#{papel}: #{lim}"
      end

      descoberta = selected['descoberta_validada']
      permissao  = selected['permissao_validada']
      avisos << "descoberta não validada para #{selected['ferramenta']}/#{papel}" if descoberta == false
      avisos << "permissão parcialmente validada para #{selected['ferramenta']}/#{papel}" if permissao == false || permissao == 'parcialmente'

      { ferramenta: selected['ferramenta'], caminho: selected['caminho'] }
    end

    # ── Skill selection ──────────────────────────────────────────────

    def select_skills(cartao, registry, papel, auth_nivel, auth_idx,
                      effective_rede, effective_shell, ferramenta, classes)
      aprovadas = []
      negadas   = []
      classe_info = classes[papel] || {}
      classe_name = classe_info['classe']

      (cartao['skills_solicitadas'] || []).each do |skill_id|
        entry = (registry['skills'] || []).find { |s| s['id'] == skill_id }

        unless entry
          negadas << neg('SKILL_NOT_FOUND', "skill #{skill_id} não encontrada no registry (não auditada)")
          next
        end

        motivos = []

        # Filter 1: tipo skill
        if entry['tipo'] != 'skill'
          motivos << "skill #{skill_id} tem tipo=#{entry['tipo']} (esperado: skill)"
        end

        # Filter 2: selecionavel_por_missao
        if entry['selecionavel_por_missao'] != true
          motivos << "skill #{skill_id} não é selecionável por missão"
        end

        # Filter 3: status
        unless %w[aprovada aprovada-com-restricoes].include?(entry['status'])
          motivos << "skill #{skill_id} tem status=#{entry['status']}"
        end

        # Filter 4: papel permitido
        papeis_perm = entry['papeis_permitidos'] || []
        unless papeis_perm.include?(papel)
          motivos << "skill #{skill_id} não permite papel #{papel}"
        end

        # Filter 5: ferramenta compatível
        ferramentas_comp = entry['ferramentas_compativeis'] || []
        unless ferramentas_comp.include?(ferramenta)
          motivos << "skill #{skill_id} incompatível com ferramenta #{ferramenta}"
        end

        # Filter 6: authorization (pode_escrever OR pode_executar_shell require A2+)
        if (entry['pode_escrever'] == true || entry['pode_executar_shell'] == true) &&
           auth_idx < AUTH_ORDER.index('A2')
          motivos << "skill #{skill_id} exige A2+ (pode_escrever/pode_executar_shell), autorização=#{auth_nivel}"
        end

        # Filter 7: rede
        if entry['acesso_rede'] == true && !effective_rede
          motivos << "skill #{skill_id} exige rede, mas permissão efetiva não permite"
        end

        # Filter 8: shell (uses effective perms)
        if entry['pode_executar_shell'] == true && !effective_shell
          if classe_info['pode_executar_shell'] != true
            motivos << "skill #{skill_id} exige shell, mas papel #{papel} não permite shell"
          else
            motivos << "skill #{skill_id} exige shell, mas autorização insuficiente (< A2)"
          end
        end

        # Filter 9: path exists
        caminho   = entry['caminho']
        full_path = File.join(REPO_ROOT, caminho)
        unless File.file?(full_path)
          motivos << "skill #{skill_id}: caminho #{caminho} não existe"
        end

        # Filter 10: hash verification
        if File.file?(full_path)
          actual_hash = Digest::SHA256.file(full_path).hexdigest
          if actual_hash != entry['hash']
            motivos << "skill #{skill_id}: hash divergente (esperado=#{entry['hash']&.[](0..15)}, atual=#{actual_hash[0..15]})"
          end
        end

        # Filter 11: no delegation
        if entry['pode_delegar'] == true
          motivos << "skill #{skill_id} permite delegação (proibido)"
        end

        # Filter 12: no mutating skill for reader
        if entry['pode_escrever'] == true && classe_name == 'leitor'
          motivos << "skill #{skill_id} é mutante (pode_escrever=true) mas papel #{papel} é leitor"
        end

        if motivos.empty?
          aprovadas << skill_id
        else
          motivos.each { |m| negadas << neg('SKILL_DENIED', m) }
        end
      end

      { aprovadas: aprovadas, negadas: negadas }
    end

    # ── Status / auth / etapas ───────────────────────────────────────

    def determine_status(negacoes, papel_info, adapter_info, skills_result)
      return 'negado'     unless negacoes.empty?
      return 'incompleto' if papel_info[:papel].nil?
      return 'incompleto' if adapter_info[:ferramenta].nil?

      unless skills_result[:negadas].empty?
        total_requested = skills_result[:aprovadas].size + skills_result[:negadas].size
        return 'incompleto' if total_requested > 0 && skills_result[:aprovadas].empty?
      end

      'planejado'
    end

    def determine_auth_necessary(instrucao, acoes_sol, papel_info)
      if action_requested?(acoes_sol, 'deploy')
        'A6'
      elsif action_requested?(acoes_sol, 'merge')
        'A5'
      elsif action_requested?(acoes_sol, 'push') || action_requested?(acoes_sol, 'pr')
        'A4'
      elsif action_requested?(acoes_sol, 'commit')
        'A3'
      elsif papel_info[:classe] == 'executor'
        'A2'
      else
        'A0'
      end
    end

    def build_etapas(cartao, papel, skills, ferramenta)
      [{
        'acao'      => cartao['objetivo'],
        'ferramenta' => ferramenta,
        'nome'      => "executar-#{papel}",
        'papel'     => papel,
        'skills'    => skills.sort
      }]
    end

    # ── Operational topology / commands (Fase 3B.2A) ─────────────────

    def fail_op!(message)
      raise ValidationError, "plano operacional inválido: #{message}"
    end

    def require_integer!(hash, key, label)
      fail_op!("#{label} ausente") unless hash.key?(key)
      value = hash[key]
      fail_op!("#{label} nulo") if value.nil?
      fail_op!("#{label} deve ser integer") unless value.is_a?(Integer)
      value
    end

    def canonical_role_ids
      @canonical_role_ids ||= begin
        roteamento = load_yaml(ROTEAMENTO_PATH)
        (roteamento['classes'] || {}).keys
      end
    end

    def mission_requires_commands?(cartao, papel = nil)
      papel ||= cartao['papel_preferido']
      papel == 'executor-escopo' || Array(cartao.dig('escopo', 'escrita')).any?
    end

    def merge_stop_conditions(card_stops)
      seen = {}
      out = []
      (Array(card_stops) + DEFAULT_STOP_CONDITIONS).each do |item|
        next if seen[item]

        seen[item] = true
        out << item
      end
      out
    end

    def catalog_command_ids
      @catalog_command_ids ||= begin
        catalog = load_yaml(CATALOG_PATH)
        (catalog['comandos'] || {}).keys
      end
    end

    def propagate_commands(cartao, status, papel: nil)
      return { comandos: [], negacoes: [] } unless mission_requires_commands?(cartao, papel)

      negacoes = []
      raw = Array(cartao.dig('executor', 'comandos'))
      known = catalog_command_ids
      seen = {}
      comandos = []

      raw.each do |id|
        id = id.to_s
        unless known.include?(id)
          negacoes << neg('COMMAND_UNKNOWN', "comando desconhecido no catálogo: #{id}")
          next
        end
        next if seen[id]

        seen[id] = true
        comandos << id
      end

      if status == 'planejado' && comandos.empty?
        negacoes << neg(
          'PLANEJADO_REQUIRES_COMMANDS',
          'missão executora exige ao menos um comando autorizado do catálogo'
        )
      end

      { comandos: comandos, negacoes: negacoes }
    end

    def build_default_topology(papel, permissao)
      {
        'max_agentes' => 1,
        'max_profundidade' => 1,
        'permite_subdelegacao' => false,
        'agentes' => [
          {
            'id' => 'principal',
            'papel' => papel,
            'permissao' => permissao,
            'depende_de' => []
          }
        ]
      }
    end

    def resolve_planned_execution(cartao, papel_topo:, permissao:, escrita_permitida:, escopo_leitura:, escopo_escrita:)
      negacoes = []
      declared = cartao['execucao_planejada']
      simplicidade = build_simplicidade(cartao, declared)

      if declared.nil? || declared.empty?
        return build_default_execution(
          cartao,
          papel_topo: papel_topo,
          permissao: permissao,
          escrita_permitida: escrita_permitida,
          escopo_leitura: escopo_leitura,
          escopo_escrita: escopo_escrita,
          simplicidade: simplicidade,
          negacoes: negacoes
        )
      end

      build_declared_execution(
        cartao,
        declared,
        simplicidade: simplicidade,
        negacoes: negacoes
      )
    end

    def build_simplicidade(cartao, declared)
      card_simp = cartao['simplicidade']
      explicit = card_simp.is_a?(Hash) &&
                 %w[reutiliza_existente nova_dependencia nova_abstracao].all? { |k| card_simp.key?(k) }
      estrategia = declared.is_a?(Hash) ? (declared['estrategia'] || 'agente-unico') : 'agente-unico'
      multi = estrategia == 'multiagente'
      just = multi ? declared&.dig('justificativa_multiagente') : nil

      if explicit
        {
          'avaliada' => true,
          'multiagente_necessario' => multi,
          'justificativa_multiagente' => just,
          'reutiliza_existente' => card_simp['reutiliza_existente'],
          'nova_dependencia' => card_simp['nova_dependencia'],
          'nova_abstracao' => card_simp['nova_abstracao']
        }
      else
        {
          'avaliada' => false,
          'multiagente_necessario' => multi,
          'justificativa_multiagente' => just,
          'reutiliza_existente' => true,
          'nova_dependencia' => false,
          'nova_abstracao' => false
        }
      end
    end

    def build_default_execution(cartao, papel_topo:, permissao:, escrita_permitida:, escopo_leitura:, escopo_escrita:, simplicidade:, negacoes:)
      agent_id = 'principal'
      decisao_execucao = {
        'estrategia' => 'agente-unico',
        'origem' => 'default',
        'motivo' => 'default determinístico',
        'justificativa_multiagente' => nil,
        'ganho_esperado' => nil,
        'perfil_execucao' => DEFAULT_PERFIL_EXECUCAO,
        'gate_qualidade' => DEFAULT_GATE_QUALIDADE
      }
      topologia = build_default_topology(papel_topo, permissao)
      leitura, leitura_negs = normalize_path_list(escopo_leitura)
      escrita, escrita_negs = normalize_path_list(escrita_permitida ? escopo_escrita : [])
      negacoes.concat(leitura_negs)
      negacoes.concat(escrita_negs)
      tarefas_planejadas = [
        build_default_task(
          agent_id,
          cartao,
          escopo_leitura: leitura,
          escopo_escrita: escrita
        )
      ]
      limites = default_limites
      {
        decisao_execucao: decisao_execucao,
        topologia: topologia,
        tarefas_planejadas: tarefas_planejadas,
        limites: limites,
        max_paralelo: 1,
        simplicidade: simplicidade,
        negacoes: negacoes
      }
    end

    def build_declared_execution(cartao, declared, simplicidade:, negacoes:)
      estrategia = declared['estrategia'] || 'agente-unico'
      perfil = declared['perfil_execucao'] || DEFAULT_PERFIL_EXECUCAO
      gate = declared['gate_qualidade'] || DEFAULT_GATE_QUALIDADE
      limites_decl = declared['limites'].is_a?(Hash) ? declared['limites'] : {}
      limites = {
        'max_retentativas' => limites_decl.fetch('max_retentativas', 1),
        'max_rodadas_revisao' => limites_decl.fetch('max_rodadas_revisao', 1),
        'max_tempo_segundos' => limites_decl.fetch('max_tempo_segundos', DEFAULT_MAX_TEMPO_SEGUNDOS)
      }
      max_paralelo = limites_decl.fetch('max_paralelo', 1)
      max_agentes_decl = limites_decl.key?('max_agentes') ? limites_decl['max_agentes'] : nil
      permite_subdelegacao = limites_decl.fetch('permite_subdelegacao', false)

      decisao_execucao = {
        'estrategia' => estrategia,
        'origem' => 'cartao',
        'motivo' => 'declarado no cartão',
        'justificativa_multiagente' => declared['justificativa_multiagente'],
        'ganho_esperado' => declared['ganho_esperado'],
        'perfil_execucao' => perfil,
        'gate_qualidade' => gate
      }

      if estrategia == 'agente-unico'
        just = declared['justificativa_multiagente']
        ganho = declared['ganho_esperado']
        if just.is_a?(String) && !just.strip.empty?
          negacoes << neg('SINGLE_AGENT_WITH_JUSTIFICATION', 'agente-unico não aceita justificativa_multiagente')
        end
        if ganho.is_a?(String) && !ganho.strip.empty?
          negacoes << neg('SINGLE_AGENT_WITH_GAIN', 'agente-unico não aceita ganho_esperado')
        end
      end

      if permite_subdelegacao
        negacoes << neg('SUBDELEGATION_DENIED', 'subdelegação proibida nesta fase')
      end

      append_budget_limit_denials!(limites, max_paralelo, negacoes)

      agentes_raw = declared['agentes']
      tarefas_raw = declared['tarefas']

      if estrategia == 'agente-unico'
        if agentes_raw.is_a?(Array) && agentes_raw.size > 1
          negacoes << neg('SINGLE_AGENT_TOO_MANY', 'agente-unico exige exatamente 1 agente')
        end
        max_paralelo = 1
      elsif estrategia == 'multiagente'
        just = declared['justificativa_multiagente']
        ganho = declared['ganho_esperado']
        if just.nil? || !just.is_a?(String) || just.strip.empty?
          negacoes << neg('MULTI_AGENT_NO_JUSTIFICATION', 'multiagente exige justificativa_multiagente')
        end
        if ganho.nil? || !ganho.is_a?(String) || ganho.strip.empty?
          negacoes << neg('MULTI_AGENT_NO_GAIN', 'multiagente exige ganho_esperado')
        end
        unless agentes_raw.is_a?(Array) && agentes_raw.size.between?(2, 3)
          negacoes << neg('MULTI_AGENT_COUNT_INVALID', 'multiagente exige 2 ou 3 agentes')
        end
        if max_paralelo < 1 || max_paralelo > MAX_PARALELO_LIMIT
          negacoes << neg('MAX_PARALLEL_INVALID', 'max_paralelo deve estar entre 1 e 2')
        end
      else
        negacoes << neg('STRATEGY_INVALID', "estratégia desconhecida: #{estrategia}")
      end

      agentes = normalize_declared_agents(agentes_raw, estrategia, negacoes)
      tarefas_planejadas = normalize_declared_tasks(tarefas_raw, agentes, negacoes)

      writers = agentes.count { |a| a['permissao'] == 'workspace-write' }
      if writers > 1
        negacoes << neg('MULTIPLE_WRITERS_DENIED', 'no máximo 1 agente pode ter workspace-write')
      end

      validate_agent_task_ownership!(agentes, tarefas_planejadas, negacoes)

      agent_count = agentes.size.positive? ? agentes.size : (agentes_raw.is_a?(Array) ? agentes_raw.size : 0)
      max_agentes = resolve_max_agentes(
        estrategia: estrategia,
        declared: max_agentes_decl,
        agent_count: agent_count,
        negacoes: negacoes
      )

      if estrategia == 'agente-unico' && agent_count != 1
        negacoes << neg('SINGLE_AGENT_COUNT', 'agente-unico exige exatamente 1 agente')
      end

      agents_with_tasks = tarefas_planejadas.map { |t| t['agente'] }.uniq
      agentes.each do |ag|
        unless agents_with_tasks.include?(ag['id'])
          negacoes << neg('AGENT_WITHOUT_TASK', "agente #{ag['id']} sem tarefa")
        end
      end

      if circular_deps?(agentes)
        negacoes << neg('AGENT_CIRCULAR_DEPENDENCY', 'dependência circular entre agentes')
      end
      if circular_deps?(tarefas_planejadas, id_key: 'id', deps_key: 'depende_de')
        negacoes << neg('TASK_CIRCULAR_DEPENDENCY', 'dependência circular entre tarefas')
      end

      topologia = {
        'max_agentes' => max_agentes,
        'max_profundidade' => 1,
        'permite_subdelegacao' => false,
        'agentes' => agentes
      }

      {
        decisao_execucao: decisao_execucao,
        topologia: topologia,
        tarefas_planejadas: tarefas_planejadas,
        limites: limites,
        max_paralelo: max_paralelo,
        simplicidade: simplicidade,
        negacoes: negacoes
      }
    end

    def append_budget_limit_denials!(limites, max_paralelo, negacoes)
      tempo = limites['max_tempo_segundos']
      if tempo.is_a?(Integer)
        if tempo < 1
          negacoes << neg('MAX_TEMPO_TOO_LOW', 'max_tempo_segundos mínimo é 1')
        elsif tempo > MAX_TEMPO_SEGUNDOS_LIMIT
          negacoes << neg('MAX_TEMPO_EXCEEDED', "max_tempo_segundos máximo é #{MAX_TEMPO_SEGUNDOS_LIMIT}")
        end
      end

      retries = limites['max_retentativas']
      if retries.is_a?(Integer)
        if retries < 0
          negacoes << neg('MAX_RETRIES_TOO_LOW', 'max_retentativas mínimo é 0')
        elsif retries > MAX_RETENTATIVAS_LIMIT
          negacoes << neg('MAX_RETRIES_EXCEEDED', "max_retentativas máximo é #{MAX_RETENTATIVAS_LIMIT}")
        end
      end

      rounds = limites['max_rodadas_revisao']
      if rounds.is_a?(Integer)
        if rounds < 0
          negacoes << neg('MAX_REVIEW_ROUNDS_TOO_LOW', 'max_rodadas_revisao mínimo é 0')
        elsif rounds > MAX_RODADAS_REVISAO_LIMIT
          negacoes << neg('MAX_REVIEW_ROUNDS_EXCEEDED', "max_rodadas_revisao máximo é #{MAX_RODADAS_REVISAO_LIMIT}")
        end
      end

      if max_paralelo.is_a?(Integer)
        if max_paralelo < 1
          negacoes << neg('MAX_PARALLEL_TOO_LOW', 'max_paralelo mínimo é 1')
        elsif max_paralelo > MAX_PARALELO_LIMIT
          negacoes << neg('MAX_PARALLEL_EXCEEDED', "max_paralelo máximo é #{MAX_PARALELO_LIMIT}")
        end
      end
    end

    def resolve_max_agentes(estrategia:, declared:, agent_count:, negacoes:)
      if estrategia == 'agente-unico'
        if declared.nil?
          return 1
        end
        unless declared.is_a?(Integer) && declared == 1
          negacoes << neg(
            'SINGLE_AGENT_MAX_AGENTS_INVALID',
            'agente-unico exige max_agentes exatamente 1'
          )
        end
        # Mantém o valor declarado para diagnóstico se inválido; schema limpia via teto.
        return declared.is_a?(Integer) ? [[declared, MAX_AGENTES_LIMIT].min, 1].max : 1
      end

      # multiagente / desconhecida
      if declared.nil?
        capped = [[agent_count, MAX_AGENTES_LIMIT].min, 0].max
        return capped.positive? ? capped : 1
      end

      unless declared.is_a?(Integer)
        negacoes << neg('MAX_AGENTS_INVALID', 'max_agentes deve ser integer')
        return [[agent_count, MAX_AGENTES_LIMIT].min, 1].max
      end

      if declared > MAX_AGENTES_LIMIT
        negacoes << neg('MAX_AGENTS_EXCEEDED', "max_agentes máximo é #{MAX_AGENTES_LIMIT}")
        return MAX_AGENTES_LIMIT
      end

      if agent_count.positive? && declared < agent_count
        negacoes << neg('MAX_AGENTS_TOO_LOW', 'max_agentes menor que agentes declarados')
        # Fail-closed: não eleva silenciosamente — preserva o valor declarado (já ≤ 3).
        return declared
      end

      declared
    end

    def normalize_declared_agents(agentes_raw, estrategia, negacoes)
      return [] unless agentes_raw.is_a?(Array)

      roles = canonical_role_ids
      ids = []
      out = []

      agentes_raw.each do |raw|
        unless raw.is_a?(Hash)
          negacoes << neg('AGENT_INVALID', 'agente com forma inválida')
          next
        end
        id = raw['id'].to_s
        papel = raw['papel'].to_s
        permissao = raw['permissao'].to_s
        if id.empty?
          negacoes << neg('AGENT_ID_MISSING', 'agente sem id')
          next
        end
        if ids.include?(id)
          negacoes << neg('AGENT_ID_DUPLICATE', "id de agente duplicado: #{id}")
          next
        end
        ids << id
        unless roles.include?(papel)
          negacoes << neg('AGENT_ROLE_UNKNOWN', "papel desconhecido: #{papel}")
        end
        unless %w[read-only workspace-write].include?(permissao)
          negacoes << neg('AGENT_PERMISSION_INVALID', "permissão inválida: #{permissao}")
        end
        if papel != 'executor-escopo' && permissao == 'workspace-write'
          negacoes << neg('AGENT_PERMISSION_ROLE_MISMATCH', "workspace-write incompatível com papel #{papel}")
        end
        deps = Array(raw['depende_de'])
        deps.each do |dep|
          negacoes << neg('AGENT_DEPENDENCY_UNKNOWN', "dependência inexistente: #{dep}") unless ids.include?(dep) || agentes_raw.any? { |a| a['id'] == dep }
        end
        out << {
          'id' => id,
          'papel' => papel,
          'permissao' => permissao,
          'depende_de' => deps
        }
      end

      if estrategia == 'multiagente' && out.size < 2
        negacoes << neg('MULTI_AGENT_TOO_FEW', 'multiagente exige pelo menos 2 agentes válidos')
      end
      out
    end

    def normalize_declared_tasks(tarefas_raw, agentes, negacoes)
      return [] unless tarefas_raw.is_a?(Array)

      agent_ids = agentes.map { |a| a['id'] }
      ids = []
      out = []

      tarefas_raw.each do |raw|
        unless raw.is_a?(Hash)
          negacoes << neg('TASK_INVALID', 'tarefa com forma inválida')
          next
        end
        id = raw['id'].to_s
        agente = raw['agente'].to_s
        if id.empty?
          negacoes << neg('TASK_ID_MISSING', 'tarefa sem id')
          next
        end
        if ids.include?(id)
          negacoes << neg('TASK_ID_DUPLICATE', "id de tarefa duplicado: #{id}")
          next
        end
        ids << id
        unless agent_ids.include?(agente)
          negacoes << neg('TASK_AGENT_UNKNOWN', "tarefa #{id} aponta agente inexistente: #{agente}")
        end
        if raw['objetivo'].to_s.strip.empty?
          negacoes << neg('TASK_OBJECTIVE_MISSING', "tarefa #{id} sem objetivo")
        end
        if raw['entrega_esperada'].to_s.strip.empty?
          negacoes << neg('TASK_DELIVERY_MISSING', "tarefa #{id} sem entrega_esperada")
        end
        unless raw['nao_fazer'].is_a?(Array)
          negacoes << neg('TASK_NAO_FAZER_INVALID', "tarefa #{id} nao_fazer deve ser array")
        end
        arquivos = raw['arquivos'].is_a?(Hash) ? raw['arquivos'] : {}
        leitura, leitura_negs = normalize_path_list(Array(arquivos['leitura']))
        escrita, escrita_negs = normalize_path_list(Array(arquivos['escrita']))
        negacoes.concat(leitura_negs)
        negacoes.concat(escrita_negs)
        deps = Array(raw['depende_de'])
        deps.each do |dep|
          negacoes << neg('TASK_DEPENDENCY_UNKNOWN', "dependência de tarefa inexistente: #{dep}") unless ids.include?(dep) || tarefas_raw.any? { |t| t['id'] == dep }
        end
        out << {
          'id' => id,
          'agente' => agente,
          'objetivo' => raw['objetivo'].to_s,
          'entrega_esperada' => raw['entrega_esperada'].to_s,
          'nao_fazer' => Array(raw['nao_fazer']),
          'arquivos' => { 'leitura' => leitura, 'escrita' => escrita },
          'depende_de' => deps
        }
      end
      out
    end

    def validate_agent_task_ownership!(agentes, tarefas, negacoes)
      agents_by_id = {}
      agentes.each { |a| agents_by_id[a['id']] = a }

      tarefas.each do |task|
        agent = agents_by_id[task['agente']]
        next unless agent

        escrita = Array(task.dig('arquivos', 'escrita'))
        next if escrita.empty?

        if agent['permissao'] != 'workspace-write'
          negacoes << neg(
            'FILE_OWNERSHIP_PERMISSION_MISMATCH',
            "agente #{agent['id']} read-only declarou escrita em #{escrita.join(', ')}"
          )
        end
      end
    end

    def build_default_task(agent_id, cartao, escopo_leitura:, escopo_escrita:)
      {
        'id' => 'task-01',
        'agente' => agent_id,
        'objetivo' => cartao['objetivo'],
        'entrega_esperada' => cartao['resultado_esperado'],
        'nao_fazer' => [],
        'arquivos' => {
          'leitura' => escopo_leitura,
          'escrita' => escopo_escrita
        },
        'depende_de' => []
      }
    end

    def default_limites
      {
        'max_retentativas' => 1,
        'max_rodadas_revisao' => 1,
        'max_tempo_segundos' => DEFAULT_MAX_TEMPO_SEGUNDOS
      }
    end

    def normalize_path_list(paths)
      negacoes = []
      seen = {}
      out = []
      Array(paths).each do |raw|
        path = raw.to_s.strip.gsub('\\', '/')
        next if path.empty?

        if path.start_with?('/') || path.match?(/\A[a-zA-Z]:/)
          negacoes << neg('PATH_ABSOLUTE_DENIED', "caminho absoluto proibido: #{path}")
          next
        end
        if path.include?('..')
          negacoes << neg('PATH_TRAVERSAL_DENIED', "caminho com .. proibido: #{path}")
          next
        end
        normalized = path.sub(%r{\A/+}, '')
        next if seen[normalized]

        seen[normalized] = true
        out << normalized
      end
      [out, negacoes]
    end

    def apply_simplicity_warnings(avisos, resumo, simplicidade)
      out = avisos.dup
      out << 'SIMPLICITY_REQUIRES_REVIEW' unless simplicidade['avaliada']
      if resumo['estrategia'] == 'multiagente' || simplicidade['multiagente_necessario']
        out << 'MULTI_AGENT_REQUIRES_APPROVAL'
      end
      out << 'NEW_DEPENDENCY_DECLARED' if simplicidade['nova_dependencia']
      out << 'NEW_ABSTRACTION_DECLARED' if simplicidade['nova_abstracao']
      out << 'DOES_NOT_REUSE_EXISTING' if simplicidade['reutiliza_existente'] == false
      out
    end

    def circular_deps?(items, id_key: 'id', deps_key: 'depende_de')
      graph = {}
      items.each { |item| graph[item[id_key]] = Array(item[deps_key]) }

      visiting = {}
      visited = {}

      visit = lambda do |node|
        return true if visiting[node]
        return false if visited[node]

        visiting[node] = true
        (graph[node] || []).each do |dep|
          return true if visit.call(dep)
        end
        visiting.delete(node)
        visited[node] = true
        false
      end

      graph.keys.any? { |id| visit.call(id) }
    end

    # ── Serialization ────────────────────────────────────────────────

    def serialize_plan(plano)
      JSON.pretty_generate(sort_keys_deep(plano)) + "\n"
    end

    def sort_keys_deep(obj)
      case obj
      when Hash
        result = {}
        obj.keys.sort.each { |k| result[k] = sort_keys_deep(obj[k]) }
        result
      when Array
        obj.map { |v| sort_keys_deep(v) }
      else
        obj
      end
    end
  end
end

MissionPlanner.run(ARGV) if $PROGRAM_NAME == __FILE__
