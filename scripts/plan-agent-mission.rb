#!/usr/bin/env ruby
# frozen_string_literal: true

# plan-agent-mission.rb — Planejador determinístico dry-run de missões de agente.
#
# Recebe um Cartão de Missão JSON, valida entrada, seleciona papel, skills,
# adaptador, aplica autorização, e produz um Plano de Execução determinístico.
#
# NÃO executa agentes, skills, shell, rede, ou Git.
# Escrita somente no arquivo --output.

require 'json'
require 'yaml'
require 'digest'
require 'optparse'
require 'fileutils'

module MissionPlanner
  REPO_ROOT  = File.expand_path('..', __dir__)
  ORCH_DIR   = File.join(REPO_ROOT, '.agents', 'orquestracao')

  AUTH_ORDER = %w[A0 A1 A2 A3 A4 A5 A6].freeze
  ACTION_MIN_AUTH = {
    'commit' => 'A3', 'push' => 'A4', 'pr' => 'A4',
    'merge' => 'A5', 'deploy' => 'A6'
  }.freeze

  REQUIRED_FIELDS = %w[
    versao id titulo objetivo contexto resultado_esperado
    autorizacao escopo restricoes verificacao
    evidencias_requeridas condicoes_parada
  ].freeze

  class ValidationError < StandardError; end
  class PathTraversalError < StandardError; end

  class << self
    def run(argv)
      input_path = nil
      output_path = nil
      stdout_mode = false

      parser = OptionParser.new do |opts|
        opts.banner = "Usage: ruby scripts/plan-agent-mission.rb --input <file> [--output <file> | --stdout]"
        opts.on('--input FILE', 'Caminho do Cartão de Missão JSON') { |v| input_path = v }
        opts.on('--output FILE', 'Caminho de saída do plano') { |v| output_path = v }
        opts.on('--stdout', 'Imprimir plano na stdout') { stdout_mode = true }
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

      validate_no_path_traversal(input_path)

      unless File.file?(input_path)
        warn "ERRO: arquivo de entrada não encontrado: #{input_path}"
        exit 1
      end

      raw = File.read(input_path)
      cartao = parse_json_safely(raw, input_path)

      plano = plan(cartao)
      json_out = serialize_plan(plano)

      if stdout_mode
        $stdout.write(json_out)
      elsif output_path
        validate_no_path_traversal(output_path)
        FileUtils.mkdir_p(File.dirname(output_path))
        File.write(output_path, json_out)
      else
        warn 'ERRO: use --output <file> ou --stdout'
        exit 1
      end
    rescue ValidationError => e
      warn "ERRO DE VALIDAÇÃO: #{e.message}"
      exit 2
    rescue PathTraversalError => e
      warn "ERRO DE SEGURANÇA: #{e.message}"
      exit 3
    rescue StandardError => e
      warn "ERRO INTERNO: #{e.class}: #{e.message}"
      exit 4
    end

    def plan(cartao)
      fontes = []
      fontes << '.agents/orquestracao/roteamento.yaml'

      # 1. Validate required fields
      validate_required_fields!(cartao)

      # Load canonical sources
      roteamento = load_yaml(File.join(ORCH_DIR, 'roteamento.yaml'))
      registry   = load_yaml(File.join(REPO_ROOT, '.agents', 'skills', 'registry.yaml'))
      comp       = load_yaml(File.join(REPO_ROOT, '.agents', 'skills', 'compatibilidade.yaml'))
      mapa       = load_yaml(File.join(REPO_ROOT, '.agents', 'adaptadores', 'mapa-adaptadores.yaml'))

      auth_nivel = cartao['autorizacao']['nivel']
      fontes << '.agents/governanca/contrato-comunicacao-bruno.md'
      fontes << '.agents/skills/registry.yaml'
      fontes << '.agents/skills/compatibilidade.yaml'
      fontes << '.agents/adaptadores/mapa-adaptadores.yaml'

      # 2. Select papel
      papel_info = select_papel(cartao, roteamento)
      papel = papel_info[:papel]
      fontes << '.agents/papeis/README.md'

      # 3. Check proibitions (merge, deploy, etc.)
      negacoes = []
      avisos = []
      nivel_idx = AUTH_ORDER.index(auth_nivel)

      # Check merge
      instrucao = cartao['instrucao_atual'] || ''
      if action_requested?(instrucao, cartao, 'merge')
        if nivel_idx < AUTH_ORDER.index('A5')
          negacoes << "merge negado: autorização #{auth_nivel} insuficiente (exige A5)"
        elsif !instrucao.upcase.include?('MERGE')
          negacoes << "merge negado: token MERGE ausente na instrução atual"
        end
      end

      # Check deploy
      if action_requested?(instrucao, cartao, 'deploy')
        if nivel_idx < AUTH_ORDER.index('A6')
          negacoes << "deploy negado: autorização #{auth_nivel} insuficiente (exige A6)"
        end
      end

      # Check commit
      if action_requested?(instrucao, cartao, 'commit') && nivel_idx < AUTH_ORDER.index('A3')
        negacoes << "commit negado: autorização #{auth_nivel} insuficiente (exige A3)"
      end

      # Check push/pr
      if action_requested?(instrucao, cartao, 'push') && nivel_idx < AUTH_ORDER.index('A4')
        negacoes << "push negado: autorização #{auth_nivel} insuficiente (exige A4)"
      end

      # Check acoes_proibidas
      (cartao['autorizacao']['acoes_proibidas'] || []).each do |acao|
        if action_requested?(instrucao, cartao, acao)
          negacoes << "ação proibida pelo cartão: #{acao}"
        end
      end

      # Check rede
      rede_permitida = cartao.key?('rede_permitida') ? cartao['rede_permitida'] : false
      if rede_permitida && papel_info[:classe] == 'leitor'
        negacoes << "rede proibida para papel leitor (#{papel})"
      end

      # Check shell
      shell_permitido = cartao.key?('shell_permitido') ? cartao['shell_permitido'] : false
      if shell_permitido && papel_info[:classe] == 'leitor'
        negacoes << "shell proibido para papel leitor (#{papel})"
      end

      # Check delegação
      delegacao = cartao.key?('delegacao_permitida') ? cartao['delegacao_permitida'] : false
      if delegacao
        negacoes << 'delegação negada: agentes filhos não podem delegar'
      end

      # Check escrita for non-executor
      escrita = cartao['escopo']['escrita'] || []
      if !escrita.empty? && papel != 'executor-escopo'
        negacoes << "escrita solicitada mas papel selecionado (#{papel}) não é executor-escopo"
      end

      # 4. Select adapter
      adapter_info = select_adapter(cartao, mapa, papel, roteamento, avisos, negacoes)

      # 5. Select skills
      skills_result = select_skills(cartao, registry, papel, auth_nivel, rede_permitida,
                                    shell_permitido, adapter_info[:ferramenta])

      skills_selecionadas = skills_result[:aprovadas]
      skills_negadas = skills_result[:negadas]
      negacoes.concat(skills_negadas.map { |s| s[:motivo] })

      # Handle delivery-loop
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

      # Determine status
      status = determine_status(negacoes, papel_info, adapter_info, skills_result)

      # Determine authorization necessary
      auth_necessaria = determine_auth_necessary(cartao, papel_info)

      # Build etapas
      etapas = build_etapas(cartao, papel, skills_selecionadas, adapter_info[:ferramenta])

      # Build plan
      plano = {
        'adaptador_selecionado' => adapter_info[:caminho],
        'autorizacao_fornecida' => auth_nivel,
        'autorizacao_necessaria' => auth_necessaria,
        'avisos' => avisos.sort.uniq,
        'condicoes_parada' => (cartao['condicoes_parada'] || []).sort,
        'delegacao_permitida' => false,
        'evidencias_requeridas' => (cartao['evidencias_requeridas'] || []).sort,
        'etapas' => etapas,
        'ferramenta_selecionada' => adapter_info[:ferramenta],
        'fluxo_selecionado' => fluxo_selecionado,
        'fontes_decisao' => fontes.sort.uniq,
        'leitura_permitida' => true,
        'missao_id' => cartao['id'],
        'negacoes' => negacoes.sort.uniq,
        'papeis_auxiliares' => [],
        'papel_principal' => status == 'incompleto' ? nil : papel,
        'rede_permitida' => rede_permitida && papel_info[:classe] == 'executor',
        'shell_permitido' => shell_permitido && papel_info[:classe] == 'executor',
        'skills_selecionadas' => skills_selecionadas.sort,
        'status' => status,
        'versao' => 1,
        'escrita_permitida' => papel == 'executor-escopo' && !escrita.empty?
      }

      plano
    end

    private

    def validate_no_path_traversal(path)
      if path.include?('..') || (path.include?('~') && path !~ /^~/)
        raise PathTraversalError, "path rejeitado por segurança: #{path}"
      end
    end

    def parse_json_safely(raw, label)
      JSON.parse(raw)
    rescue JSON::ParserError => e
      raise ValidationError, "JSON inválido em #{label}: #{e.message}"
    end

    def validate_required_fields!(cartao)
      missing = REQUIRED_FIELDS - cartao.keys
      return if missing.empty?

      raise ValidationError, "campos obrigatórios ausentes: #{missing.sort.join(', ')}"
    end

    def load_yaml(path)
      raise ValidationError, "arquivo canônico não encontrado: #{path}" unless File.file?(path)

      YAML.load_file(path)
    rescue ArgumentError => e
      raise ValidationError, "YAML inválido em #{path}: #{e.message}"
    end

    def select_papel(cartao, roteamento)
      preferred = cartao['papel_preferido']
      objetivo = (cartao['objetivo'] || '').downcase

      classes = roteamento['classes'] || {}

      # Check preferred first
      if preferred && classes.key?(preferred)
        return {
          papel: preferred,
          classe: classes[preferred]['classe'],
          metodo: 'preferido',
          intencao: "preferido pelo cartão"
        }
      end

      # Route by keywords
      intencoes = roteamento['intencoes'] || []
      scores = Hash.new(0)
      intencao_match = nil

      intencoes.each do |entry|
        papel = entry['papel']
        (entry['palavras_chave'] || []).each do |kw|
          if objetivo.include?(kw.downcase)
            scores[papel] += 1
            intencao_match ||= entry['intencao']
          end
        end
      end

      return { papel: nil, classe: nil, metodo: 'incompleto', intencao: nil } if scores.empty?

      max_score = scores.values.max
      top_papeis = scores.select { |_, v| v == max_score }.keys

      if top_papeis.size > 1
        return { papel: nil, classe: nil, metodo: 'ambiguo', intencao: intencao_match }
      end

      papel = top_papeis.first
      {
        papel: papel,
        classe: classes.dig(papel, 'classe'),
        metodo: 'roteamento',
        intencao: intencao_match
      }
    end

    def action_requested?(instrucao, cartao, action)
      il = instrucao.downcase
      return true if il.include?(action.downcase)
      return true if (cartao['autorizacao']['acoes_permitidas'] || []).any? { |a| a.downcase == action.downcase }
      false
    end

    def select_adapter(cartao, mapa, papel, roteamento, avisos, negacoes)
      ferramentas_permitidas = cartao['ferramentas_permitidas'] || []
      papeis_mapa = mapa['papeis'] || {}
      papel_entry = papeis_mapa[papel]

      return { ferramenta: nil, caminho: nil } unless papel_entry

      adaptadores = papel_entry['adaptadores'] || []

      # Find first compatible adapter
      selected = nil
      adaptadores.each do |adapter|
        ferramenta = adapter['ferramenta']
        next unless ferramentas_permitidas.include?(ferramenta)
        next if adapter['caminho'].nil? || adapter['caminho'].to_s.strip.empty?

        selected = adapter
        break
      end

      if selected.nil?
        # Try any permitted tool even without materialized adapter
        adaptadores.each do |adapter|
          ferramenta = adapter['ferramenta']
          next unless ferramentas_permitidas.include?(ferramenta)

          status = adapter['status'] || 'desconhecido'
          avisos << "adaptador #{ferramenta} para #{papel}: status=#{status}, sem caminho materializado"
          selected = adapter
          break
        end
      end

      return { ferramenta: nil, caminho: nil } unless selected

      # Record limitations
      (selected['limitacoes'] || []).each do |lim|
        avisos << "limitação #{selected['ferramenta']}/#{papel}: #{lim}"
      end

      # Record validation status if not fully validated
      descoberta = selected['descoberta_validada']
      permissao = selected['permissao_validada']
      if descoberta == false
        avisos << "descoberta não validada para #{selected['ferramenta']}/#{papel}"
      end
      if permissao == false || permissao == 'parcialmente'
        avisos << "permissão parcialmente validada para #{selected['ferramenta']}/#{papel}"
      end

      {
        ferramenta: selected['ferramenta'],
        caminho: selected['caminho']
      }
    end

    def select_skills(cartao, registry, papel, auth_nivel, rede, shell, ferramenta)
      aprovadas = []
      negadas = []
      auth_idx = AUTH_ORDER.index(auth_nivel)
      classes = load_classes

      (cartao['skills_solicitadas'] || []).each do |skill_id|
        entry = (registry['skills'] || []).find { |s| s['id'] == skill_id }

        unless entry
          negadas << { id: skill_id, motivo: "skill #{skill_id} não encontrada no registry (não auditada)" }
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

        # Filter 6: authorization
        # Skills with pode_escrever or pode_executar_shell require at least A2
        if entry['pode_escrever'] == true && auth_idx < AUTH_ORDER.index('A2')
          motivos << "skill #{skill_id} exige A2+ (pode_escrever), autorização=#{auth_nivel}"
        end

        # Filter 7: rede
        if entry['acesso_rede'] == true && !rede
          motivos << "skill #{skill_id} exige rede, mas cartão não permite"
        end

        # Filter 8: shell
        if entry['pode_executar_shell'] == true && !shell
          # Some skills can have shell but the papel must allow it
          classe = classes[papel]
          if classe && classe['pode_executar_shell'] != true
            motivos << "skill #{skill_id} exige shell, mas papel #{papel} não permite shell"
          end
        end

        # Filter 9: path exists
        caminho = entry['caminho']
        full_path = File.join(REPO_ROOT, caminho)
        unless File.file?(full_path)
          motivos << "skill #{skill_id}: caminho #{caminho} não existe"
        end

        # Filter 10: hash
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
        if entry['pode_escrever'] == true
          classe = classes[papel]
          if classe && classe['classe'] == 'leitor'
            motivos << "skill #{skill_id} é mutante (pode_escrever=true) mas papel #{papel} é leitor"
          end
        end

        if motivos.empty?
          aprovadas << skill_id
        else
          motivos.each { |m| negadas << { id: skill_id, motivo: m } }
        end
      end

      { aprovadas: aprovadas, negadas: negadas }
    end

    def load_classes
      roteamento = load_yaml(File.join(ORCH_DIR, 'roteamento.yaml'))
      roteamento['classes'] || {}
    end

    def determine_status(negacoes, papel_info, adapter_info, skills_result)
      return 'negado' unless negacoes.empty?

      return 'incompleto' if papel_info[:papel].nil?
      return 'incompleto' if adapter_info[:ferramenta].nil?

      # If requested skills were denied, still planejado-com-restricoes or incompleto
      unless skills_result[:negadas].empty?
        # If ALL requested skills were denied, it's incompleto
        total_requested = skills_result[:aprovadas].size + skills_result[:negadas].size
        if total_requested > 0 && skills_result[:aprovadas].empty?
          return 'incompleto'
        end
      end

      'planejado'
    end

    def determine_auth_necessary(cartao, papel_info)
      instrucao = cartao['instrucao_atual'] || ''
      if action_requested?(instrucao, cartao, 'deploy')
        'A6'
      elsif action_requested?(instrucao, cartao, 'merge')
        'A5'
      elsif action_requested?(instrucao, cartao, 'push') || action_requested?(instrucao, cartao, 'pr')
        'A4'
      elsif action_requested?(instrucao, cartao, 'commit')
        'A3'
      elsif papel_info[:classe] == 'executor'
        'A2'
      else
        'A0'
      end
    end

    def build_etapas(cartao, papel, skills, ferramenta)
      etapas = []
      etapa_base = {
        'acao' => cartao['objetivo'],
        'ferramenta' => ferramenta,
        'nome' => "executar-#{papel}",
        'papel' => papel,
        'skills' => skills.sort
      }
      etapas << etapa_base
      etapas
    end

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
