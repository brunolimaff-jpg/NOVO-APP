# frozen_string_literal: true

require 'json'
require 'digest'
require_relative './agent_path_guard'
require_relative '../runtime-safety-preflight'

# Snapshots canônicos + comparação planejado × observado (Fase 3B.3C).
# Não é motor genérico de regras — apenas campos do contrato de runtime.
module AgentRunComparator
  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def canonical_hash(obj)
    Digest::SHA256.hexdigest(JSON.generate(RuntimeSafetyPreflight.sort_keys_deep(obj)))
  end

  def build_planned_snapshot(card:, plan:, snap:, write_scope:, read_scope:)
    agente = Array(plan.dig('topologia', 'agentes')).first || {}
    commands = Array(plan['comandos']).map(&:to_s)
    stop = (Array(card['condicoes_parada']) + Array(plan['condicoes_parada'])).map(&:to_s).uniq.sort
    {
      'missao_id' => card['id'].to_s,
      'plan_hash' => Digest::SHA256.hexdigest(JSON.generate(plan)),
      'estrategia' => (plan.dig('resumo_operacional', 'estrategia') || plan.dig('decisao_execucao', 'estrategia')).to_s,
      'ferramenta_selecionada' => plan['ferramenta_selecionada'].to_s,
      'adapter' => plan['adaptador_selecionado'].to_s,
      'agentes_planejados' => plan.dig('resumo_operacional', 'agentes_planejados').to_i,
      'writers_planejados' => plan.dig('resumo_operacional', 'writers').to_i,
      'papel' => (agente['papel'] || plan['papel_principal']).to_s,
      'permissao' => agente['permissao'].to_s,
      'comandos_planejados' => commands, # ordem contratual
      'arquivos_leitura' => Array(read_scope).map(&:to_s).uniq.sort,
      'arquivos_escrita' => Array(write_scope).map(&:to_s).uniq.sort,
      'paths_protegidos' => AgentPathGuard::PROTECTED_PREFIXES.map(&:to_s).sort,
      'rede_permitida' => plan['rede_permitida'] == true,
      'delegacao_permitida' => plan['delegacao_permitida'] == true,
      'max_agentes' => plan.dig('topologia', 'max_agentes').to_i,
      'max_paralelo' => plan.dig('resumo_operacional', 'max_paralelo').to_i,
      'max_tempo_segundos' => plan.dig('limites', 'max_tempo_segundos').to_i,
      'branch_esperada' => snap['branch'].to_s,
      'worktree_esperada' => snap['worktree_realpath'].to_s,
      'git_head_esperado' => snap['head'].to_s,
      'resultado_esperado' => card['resultado_esperado'].to_s,
      'condicoes_parada' => stop
    }
  end

  def build_observed_snapshot(facts)
    {
      'ferramenta_observada' => facts['ferramenta_observada'],
      'versao_codex' => facts['versao_codex'],
      'versao_dcg' => facts['versao_dcg'],
      'adapter_observado' => facts['adapter_observado'],
      'agentes_observados' => facts['agentes_observados'],
      'writers_observados' => facts['writers_observados'],
      'processos_iniciados' => facts['processos_iniciados'],
      'comandos_catalogo_executados' => facts.fetch('comandos_catalogo_executados', false),
      'processo_codex_iniciado' => facts['processo_codex_iniciado'],
      'rede_observada' => facts.fetch('rede_observada', false),
      'subdelegacao_observada' => facts.fetch('subdelegacao_observada', false),
      'branch_observada' => facts['branch_observada'],
      'worktree_observada' => facts['worktree_observada'],
      'head_inicial' => facts['head_inicial'],
      'head_final' => facts['head_final'],
      'arquivos_modificados' => Array(facts['arquivos_modificados']).map(&:to_s).uniq.sort,
      'arquivos_untracked' => Array(facts['arquivos_untracked']).map(&:to_s).uniq.sort,
      'arquivos_fora_escopo' => Array(facts['arquivos_fora_escopo']).map(&:to_s).uniq.sort,
      'arquivos_protegidos_alterados' => Array(facts['arquivos_protegidos_alterados']).map(&:to_s).uniq.sort,
      'commit_criado' => facts.fetch('commit_criado', false),
      'refs_alteradas' => facts.fetch('refs_alteradas', false),
      'timeout_observado' => facts.fetch('timeout_observado', false),
      'exit_code' => facts['exit_code'],
      'sinal' => facts['sinal'],
      'duracao_ms' => facts['duracao_ms'],
      'stdout_sha256' => facts['stdout_sha256'],
      'stderr_sha256' => facts['stderr_sha256'],
      'stdout_truncado' => facts.fetch('stdout_truncado', false),
      'stderr_truncado' => facts.fetch('stderr_truncado', false),
      'status_final' => facts['status_final']
    }
  end

  def item(campo:, esperado:, observado:, resultado:, severidade:, codigo:, mensagem:)
    {
      'campo' => campo,
      'esperado' => esperado,
      'observado' => observado,
      'resultado' => resultado,
      'severidade' => severidade,
      'codigo' => codigo,
      'mensagem' => mensagem
    }
  end

  def compare(planned, observed)
    itens = []
    add = ->(entry) { itens << entry }

    # Evidence unavailable: nil observed for hard-required fields.
    required = %w[
      ferramenta_observada agentes_observados writers_observados processos_iniciados
      branch_observada worktree_observada head_inicial head_final status_final
    ]
    required.each do |field|
      next unless observed[field].nil?

      add.call(item(
        campo: field,
        esperado: planned[field] || planned['git_head_esperado'],
        observado: nil,
        resultado: 'indisponivel',
        severidade: 'alta',
        codigo: 'OBSERVED_EVIDENCE_UNAVAILABLE',
        mensagem: "evidência ausente: #{field}"
      ))
    end

    tool = observed['ferramenta_observada']
    unless tool.nil?
      if tool != planned['ferramenta_selecionada']
        add.call(item(
          campo: 'ferramenta',
          esperado: planned['ferramenta_selecionada'],
          observado: tool,
          resultado: 'violacao',
          severidade: 'critica',
          codigo: 'OBSERVED_TOOL_MISMATCH',
          mensagem: 'ferramenta observada diverge do planejado'
        ))
      else
        add.call(item(campo: 'ferramenta', esperado: planned['ferramenta_selecionada'], observado: tool,
                      resultado: 'conforme', severidade: 'info', codigo: nil, mensagem: 'ok'))
      end
    end

    adapter = observed['adapter_observado']
    unless adapter.nil?
      unless adapter.to_s.match?(/codex/i) && planned['adapter'].to_s.match?(/codex/i)
        add.call(item(
          campo: 'adapter',
          esperado: planned['adapter'],
          observado: adapter,
          resultado: 'violacao',
          severidade: 'alta',
          codigo: 'OBSERVED_ADAPTER_MISMATCH',
          mensagem: 'adapter observado incompatível'
        ))
      end
    end

    unless observed['agentes_observados'].nil?
      if observed['agentes_observados'].to_i != planned['agentes_planejados'].to_i
        add.call(item(
          campo: 'agentes',
          esperado: planned['agentes_planejados'],
          observado: observed['agentes_observados'],
          resultado: 'violacao',
          severidade: 'critica',
          codigo: 'OBSERVED_AGENT_COUNT_MISMATCH',
          mensagem: 'contagem de agentes diverge'
        ))
      end
    end

    unless observed['writers_observados'].nil?
      if observed['writers_observados'].to_i != planned['writers_planejados'].to_i
        add.call(item(
          campo: 'writers',
          esperado: planned['writers_planejados'],
          observado: observed['writers_observados'],
          resultado: 'violacao',
          severidade: 'critica',
          codigo: 'OBSERVED_WRITER_COUNT_MISMATCH',
          mensagem: 'contagem de writers diverge'
        ))
      end
    end

    unless observed['processos_iniciados'].nil?
      if observed['processos_iniciados'].to_i > 1 || (observed['processo_codex_iniciado'] && observed['processos_iniciados'].to_i != 1)
        if observed['processos_iniciados'].to_i != 1
          add.call(item(
            campo: 'processos',
            esperado: 1,
            observado: observed['processos_iniciados'],
            resultado: 'violacao',
            severidade: 'critica',
            codigo: 'OBSERVED_PROCESS_COUNT_MISMATCH',
            mensagem: 'processos Codex diferente de 1'
          ))
        end
      end
    end

    if observed['rede_observada'] == true
      add.call(item(
        campo: 'rede',
        esperado: false,
        observado: true,
        resultado: 'violacao',
        severidade: 'critica',
        codigo: 'OBSERVED_NETWORK_VIOLATION',
        mensagem: 'rede observada habilitada'
      ))
    end

    if observed['subdelegacao_observada'] == true
      add.call(item(
        campo: 'subdelegacao',
        esperado: false,
        observado: true,
        resultado: 'violacao',
        severidade: 'critica',
        codigo: 'OBSERVED_SUBDELEGATION_VIOLATION',
        mensagem: 'subdelegação observada'
      ))
    end

    fora = Array(observed['arquivos_fora_escopo'])
    unless fora.empty?
      add.call(item(
        campo: 'escopo',
        esperado: planned['arquivos_escrita'],
        observado: fora,
        resultado: 'violacao',
        severidade: 'critica',
        codigo: 'OBSERVED_SCOPE_VIOLATION',
        mensagem: "fora do escopo: #{fora.join(', ')}"
      ))
    end

    prot = Array(observed['arquivos_protegidos_alterados'])
    unless prot.empty?
      add.call(item(
        campo: 'protegidos',
        esperado: [],
        observado: prot,
        resultado: 'violacao',
        severidade: 'critica',
        codigo: 'OBSERVED_PROTECTED_PATH_MUTATED',
        mensagem: "protegidos alterados: #{prot.join(', ')}"
      ))
    end

    if observed['commit_criado'] == true || observed['refs_alteradas'] == true ||
       (!observed['head_final'].nil? && !observed['head_inicial'].nil? && observed['head_final'] != observed['head_inicial'])
      add.call(item(
        campo: 'git_state',
        esperado: observed['head_inicial'],
        observado: observed['head_final'],
        resultado: 'violacao',
        severidade: 'critica',
        codigo: 'OBSERVED_GIT_STATE_MUTATED',
        mensagem: 'HEAD/refs/commit alterados'
      ))
    end

    unless observed['branch_observada'].nil?
      if observed['branch_observada'] != planned['branch_esperada']
        add.call(item(
          campo: 'branch',
          esperado: planned['branch_esperada'],
          observado: observed['branch_observada'],
          resultado: 'violacao',
          severidade: 'alta',
          codigo: 'OBSERVED_GIT_STATE_MUTATED',
          mensagem: 'branch divergente'
        ))
      end
    end

    unless observed['worktree_observada'].nil?
      if observed['worktree_observada'] != planned['worktree_esperada']
        add.call(item(
          campo: 'worktree',
          esperado: planned['worktree_esperada'],
          observado: observed['worktree_observada'],
          resultado: 'violacao',
          severidade: 'alta',
          codigo: 'OBSERVED_GIT_STATE_MUTATED',
          mensagem: 'worktree divergente'
        ))
      end
    end

    max_t = planned['max_tempo_segundos'].to_i
    if observed['timeout_observado'] == true ||
       (!observed['duracao_ms'].nil? && max_t.positive? && observed['duracao_ms'].to_i > (max_t * 1000))
      add.call(item(
        campo: 'timeout',
        esperado: max_t,
        observado: observed['duracao_ms'],
        resultado: 'violacao',
        severidade: 'alta',
        codigo: 'OBSERVED_TIMEOUT_EXCEEDED',
        mensagem: 'timeout acima do limite'
      ))
    end

    # Desvios informativos
    escrita = Array(planned['arquivos_escrita'])
    mods = Array(observed['arquivos_modificados'])
    escrita.each do |path|
      dir_prefix = path.end_with?('/') ? path : "#{path}/"
      written = mods.include?(path) || mods.any? { |m| m.start_with?(dir_prefix) }
      next if written

      add.call(item(
        campo: 'arquivo_planejado',
        esperado: path,
        observado: nil,
        resultado: 'desvio',
        severidade: 'baixa',
        codigo: 'OBSERVED_EXPECTED_FILE_UNCHANGED',
        mensagem: "arquivo planejado não modificado: #{path}"
      ))
    end

    exit_code = observed['exit_code']
    if !exit_code.nil? && exit_code != 0 && observed['timeout_observado'] != true
      add.call(item(
        campo: 'exit_code',
        esperado: 0,
        observado: exit_code,
        resultado: 'desvio',
        severidade: 'media',
        codigo: 'OBSERVED_NONZERO_EXIT',
        mensagem: "exit code não zero: #{exit_code}"
      ))
    end

    if observed['stdout_truncado'] == true || observed['stderr_truncado'] == true
      add.call(item(
        campo: 'saida',
        esperado: false,
        observado: true,
        resultado: 'desvio',
        severidade: 'baixa',
        codigo: nil,
        mensagem: 'stdout/stderr truncado'
      ))
    end

    status =
      if itens.any? { |i| i['resultado'] == 'indisponivel' } && itens.none? { |i| i['resultado'] == 'violacao' }
        'indisponivel'
      elsif itens.any? { |i| i['resultado'] == 'violacao' }
        'violacao'
      elsif itens.any? { |i| i['resultado'] == 'desvio' }
        'desvio'
      else
        'conforme'
      end

    # Se só há indisponivel + violacao, violacao prevalece (já tratado).
    # Se há indisponivel sem violacao → indisponivel (nunca conforme).
    if itens.any? { |i| i['resultado'] == 'indisponivel' } && status == 'conforme'
      status = 'indisponivel'
    end

    { 'status' => status, 'itens' => itens }
  end
end
