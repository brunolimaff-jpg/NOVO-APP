# frozen_string_literal: true

require 'time'

# Task ledger mínimo (1 tarefa) + handoff humano (Fase 3B.3C).
module AgentTaskLedger
  STATUSES = %w[
    planned authorized running succeeded failed denied timeout unavailable
  ].freeze

  TERMINAL = %w[succeeded failed denied timeout unavailable].freeze

  ALLOWED_TRANSITIONS = {
    'planned' => %w[authorized denied unavailable],
    'authorized' => %w[running denied timeout unavailable],
    'running' => %w[succeeded failed denied timeout unavailable]
  }.freeze

  NEXT_ACTIONS = %w[
    revisar_diff corrigir_manualmente descartar_worktree
    autorizar_commit_manual investigar_violacao nenhuma_acao
  ].freeze

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def new_entry(missao_id:, agente_id: 'principal', papel: 'executor-escopo', at: Time.now.utc)
    iso = at.utc.iso8601
    {
      'task_id' => "#{missao_id}:task-01",
      'missao_id' => missao_id.to_s,
      'agente_id' => agente_id.to_s,
      'papel' => papel.to_s,
      'status' => 'planned',
      'inicio' => iso,
      'fim' => nil,
      'tentativa' => 1,
      'input_refs' => [],
      'output_refs' => [],
      'dependencia_ids' => [],
      'codigo_final' => nil,
      'evidencia_refs' => []
    }
  end

  def wrap(entry)
    ledger = [entry]
    validate!(ledger)
    ledger
  end

  def validate!(ledger)
    raise Denial.new('LEDGER_INVALID', 'ledger deve ser array') unless ledger.is_a?(Array)
    raise Denial.new('LEDGER_MULTI_TASK', 'exatamente uma tarefa permitida') unless ledger.size == 1

    task = ledger.first
    raise Denial.new('LEDGER_INVALID', 'tarefa inválida') unless task.is_a?(Hash)
    if task['tentativa'].to_i != 1
      raise Denial.new('LEDGER_ATTEMPT_DENIED', 'tentativa deve ser 1')
    end
    unless Array(task['dependencia_ids']).empty?
      raise Denial.new('LEDGER_INVALID', 'dependências não permitidas nesta fase')
    end
    unless STATUSES.include?(task['status'].to_s)
      raise Denial.new('LEDGER_INVALID', "status inválido: #{task['status']}")
    end
    true
  end

  def transition!(ledger, to:, at: Time.now.utc, codigo: nil, evidencia: nil)
    validate!(ledger)
    task = ledger.first
    from = task['status'].to_s
    to_s = to.to_s
    allowed = ALLOWED_TRANSITIONS.fetch(from, [])
    unless allowed.include?(to_s)
      raise Denial.new('LEDGER_TRANSITION_DENIED', "transição retroativa/inválida: #{from}→#{to_s}")
    end

    ts = at.utc
    begin
      inicio = Time.parse(task['inicio'].to_s)
    rescue ArgumentError, TypeError
      raise Denial.new('LEDGER_TIMESTAMP_INVALID', 'inicio inválido')
    end
    if ts < inicio
      raise Denial.new('LEDGER_TIMESTAMP_INVALID', 'timestamps não monotônicos')
    end

    if to_s == 'running' && task['status'] != 'authorized'
      raise Denial.new('LEDGER_TRANSITION_DENIED', 'running somente após authorized')
    end

    task['status'] = to_s
    if TERMINAL.include?(to_s)
      task['fim'] = ts.iso8601
      task['codigo_final'] = codigo
    end
    task['evidencia_refs'] << evidencia if evidencia
    validate!(ledger)
    ledger
  end

  def finalize_from_run!(ledger, comparison_status:, run_status:, spawn_started:, comparison_codes: [], run_exit_code: nil, at: Time.now.utc)
    validate!(ledger)
    task = ledger.first
    if task['status'] == 'planned'
      transition!(ledger, to: 'authorized', at: at)
    end

    unless spawn_started
      return transition!(ledger, to: 'denied', at: at, codigo: 'DENIED_BEFORE_SPAWN') if %w[denied].include?(run_status) || comparison_status == 'violacao'
      return transition!(ledger, to: 'unavailable', at: at, codigo: 'UNAVAILABLE') if run_status == 'unavailable' || comparison_status == 'indisponivel'
      return transition!(ledger, to: 'denied', at: at, codigo: 'DENIED_BEFORE_SPAWN')
    end

    if task['status'] == 'authorized'
      transition!(ledger, to: 'running', at: at)
    end

    case run_status
    when 'timeout'
      transition!(ledger, to: 'timeout', at: at, codigo: 'TIMEOUT')
    when 'denied'
      transition!(ledger, to: 'denied', at: at, codigo: comparison_status == 'violacao' ? 'VIOLATION' : 'DENIED')
    when 'unavailable'
      transition!(ledger, to: 'unavailable', at: at, codigo: 'UNAVAILABLE')
    when 'failure'
      if comparison_status == 'violacao'
        transition!(ledger, to: 'denied', at: at, codigo: 'VIOLATION')
      elsif comparison_codes.include?('OBSERVED_EXPECTED_FILE_UNCHANGED') && run_exit_code == 0
        transition!(ledger, to: 'failed', at: at, codigo: 'DELIVERY_FAILED')
      else
        transition!(ledger, to: 'failed', at: at, codigo: 'CODEX_FAILED')
      end
    when 'success'
      if comparison_status == 'violacao'
        transition!(ledger, to: 'denied', at: at, codigo: 'VIOLATION')
      elsif comparison_status == 'indisponivel'
        transition!(ledger, to: 'unavailable', at: at, codigo: 'EVIDENCE_UNAVAILABLE')
      else
        transition!(ledger, to: 'succeeded', at: at, codigo: 'OK')
      end
    else
      transition!(ledger, to: 'failed', at: at, codigo: 'UNKNOWN_STATUS')
    end
  end

  def build_handoff(missao_id:, task_id:, run_status:, comparison:, arquivos_modificados:, avisos:, violacoes:)
    cmp_status = comparison.is_a?(Hash) ? comparison['status'].to_s : 'indisponivel'
    next_action =
      case cmp_status
      when 'violacao' then 'investigar_violacao'
      when 'indisponivel' then 'investigar_violacao'
      else
        case run_status
        when 'success' then 'revisar_diff'
        when 'timeout' then 'corrigir_manualmente'
        when 'failure' then 'corrigir_manualmente'
        when 'denied' then 'investigar_violacao'
        else 'nenhuma_acao'
        end
      end
    next_action = 'investigar_violacao' if run_status == 'denied' && cmp_status != 'conforme'
    unless NEXT_ACTIONS.include?(next_action)
      next_action = 'nenhuma_acao'
    end

    {
      'origem' => 'runtime-codex',
      'destino' => 'revisor-humano',
      'missao_id' => missao_id.to_s,
      'task_id' => task_id.to_s,
      'estado_atual' => run_status.to_s,
      'resumo' => "Comparação=#{cmp_status}; status=#{run_status}",
      'arquivos_modificados' => Array(arquivos_modificados).map(&:to_s).uniq.sort,
      'evidencias' => %w[planned_snapshot observed_snapshot comparacao task_ledger],
      'comparacao_status' => cmp_status,
      'violacoes' => Array(violacoes),
      'avisos' => Array(avisos),
      'proxima_acao_recomendada' => next_action,
      'requer_aprovacao_humana' => true
    }
  end
end
