# frozen_string_literal: true

require 'json'

# Diagnóstico seguro do JSONL do Codex — audit-only, sem conteúdo bruto.
# Contrato: Codex CLI 0.144.x — codex exec --json
# Eventos: thread.started, turn.started/completed/failed, item.started/completed, error
# Itens: command_execution, agent_message, file_change (via item.type)
module CodexJsonlDiagnostics
  MAX_LINES = 10_000
  MAX_TYPES = 64
  MAX_TYPE_LENGTH = 64
  SAFE_TYPE_RE = /\A[a-zA-Z_][a-zA-Z0-9_.-]*\z/

  # Tipos de item estruturados que ativam sinais
  EXEC_ITEM_TYPES = %w[command_execution].freeze
  MSG_ITEM_TYPES = %w[agent_message].freeze
  FILE_ITEM_TYPES = %w[file_change].freeze

  module_function

  def parse(text, truncated: false)
    return unavailable('CODEX_JSONL_UNAVAILABLE', 'entrada vazia') if text.nil? || text.to_s.strip.empty?

    lines = text.to_s.each_line.to_a
    original_size = lines.size
    limit_reached_lines = original_size > MAX_LINES
    if limit_reached_lines
      lines = lines.first(MAX_LINES)
    end

    tipos_evento = Hash.new(0)
    tipos_item = Hash.new(0)
    sinais = default_signals
    contagens = default_counts
    obj_validos = 0
    linhas_invalidas = 0
    nao_objetos = 0
    eventos_desconhecidos = 0
    itens_desconhecidos = 0
    ultimo_tipo = nil
    codigos = []
    limit_reached_events = false
    limit_reached_items = false

    # Rastrear IDs de item vistos para evitar contagem dupla (item.started + item.completed)
    itens_contados = {}

    lines.each do |line|
      linha = line.to_s.strip
      next if linha.empty?

      parsed = parse_line(linha)
      if parsed[:status] == :invalid
        linhas_invalidas += 1
        next
      end
      unless parsed[:status] == :object
        nao_objetos += 1
        next
      end

      obj_validos += 1
      evento = parsed[:data]
      event_type = evento['type'].to_s

      if evento.key?('type')
        t = event_type
        if t.size <= MAX_TYPE_LENGTH && t.match?(SAFE_TYPE_RE)
          if tipos_evento.key?(t) || tipos_evento.size < MAX_TYPES
            tipos_evento[t] += 1
          else
            limit_reached_events = true
          end
          ultimo_tipo = t unless t.empty?

          case t
          when 'turn.completed'
            sinais['evento_terminal'] = true
            contagens['eventos_terminais'] += 1
          when 'turn.failed'
            sinais['evento_terminal'] = true
            contagens['eventos_terminais'] += 1
            sinais['erro_estruturado'] = true
            contagens['erros_estruturados'] += 1
          when 'error'
            sinais['erro_estruturado'] = true
            contagens['erros_estruturados'] += 1
          else
            eventos_desconhecidos += 1 unless %w[thread.started turn.started item.started item.updated item.completed].include?(t)
          end
        else
          eventos_desconhecidos += 1
        end
      else
        eventos_desconhecidos += 1
      end

      # Processar item aninhado
      if evento.key?('item') && evento['item'].is_a?(Hash)
        item = evento['item']
        item_type = item['type'].to_s
        item_id = item['id'].to_s

        if item_type.size <= MAX_TYPE_LENGTH && item_type.match?(SAFE_TYPE_RE)
          if tipos_item.key?(item_type) || tipos_item.size < MAX_TYPES
            tipos_item[item_type] += 1
          else
            limit_reached_items = true
          end
        else
          itens_desconhecidos += 1
        end

        next unless item_type.match?(SAFE_TYPE_RE) && !item_type.empty?

        # Dedup key = [tipo, id]. Itens COM id são contados uma vez por par único.
        # Itens SEM id são contados a cada ocorrência (conservador, sem inventar identidade).
        dedupe_key = item_id.empty? ? nil : [item_type, item_id]
        if item_id.empty? || !itens_contados.key?(dedupe_key)
          contar_item(item_type, sinais, contagens)
          itens_contados[dedupe_key] = true unless item_id.empty?
        end
      end
    end

    limit_reached = limit_reached_lines || limit_reached_events || limit_reached_items
    has_issues = truncated || linhas_invalidas > 0 || nao_objetos > 0 || limit_reached

    status =
      if obj_validos > 0 && !has_issues
        'available'
      elsif obj_validos > 0
        'partial'
      else
        return unavailable('CODEX_JSONL_UNAVAILABLE', 'nenhum objeto JSON válido')
      end

    codigos << 'CODEX_JSONL_TRUNCATED' if truncated
    codigos << 'CODEX_JSONL_INVALID_LINE' if linhas_invalidas > 0
    codigos << 'CODEX_JSONL_NON_OBJECT' if nao_objetos > 0
    codigos << 'CODEX_JSONL_LIMIT_REACHED' if limit_reached_lines
    codigos << 'CODEX_JSONL_LIMIT_REACHED' if limit_reached_events
    codigos << 'CODEX_JSONL_LIMIT_REACHED' if limit_reached_items
    codigos << 'CODEX_JSONL_PARTIAL' if status == 'partial' && codigos.empty?

    {
      'versao' => 1,
      'status' => status,
      'fonte' => 'codex-jsonl',
      'linhas_total' => original_size,
      'objetos_json_validos' => obj_validos,
      'linhas_invalidas' => linhas_invalidas,
      'linhas_nao_objeto' => nao_objetos,
      'tipos_evento' => tipos_evento,
      'tipos_item' => tipos_item,
      'eventos_desconhecidos' => eventos_desconhecidos,
      'itens_desconhecidos' => itens_desconhecidos,
      'sinais' => sinais,
      'contagens' => contagens,
      'ultimo_tipo_evento' => ultimo_tipo,
      'codigos' => codigos.uniq,
      'saida_bruta_persistida' => false
    }
  end

  def contar_item(item_type, sinais, contagens)
    if EXEC_ITEM_TYPES.include?(item_type)
      sinais['execucao_comando'] = true
      contagens['execucoes_comando'] += 1
    elsif MSG_ITEM_TYPES.include?(item_type)
      sinais['mensagem_agente'] = true
      contagens['mensagens_agente'] += 1
    elsif FILE_ITEM_TYPES.include?(item_type)
      sinais['alteracao_arquivo'] = true
      contagens['alteracoes_arquivo'] += 1
    end
  end

  def unavailable(code, reason)
    {
      'versao' => 1,
      'status' => 'unavailable',
      'fonte' => 'codex-jsonl',
      'linhas_total' => 0,
      'objetos_json_validos' => 0,
      'linhas_invalidas' => 0,
      'linhas_nao_objeto' => 0,
      'tipos_evento' => {},
      'tipos_item' => {},
      'eventos_desconhecidos' => 0,
      'itens_desconhecidos' => 0,
      'sinais' => default_signals,
      'contagens' => default_counts,
      'ultimo_tipo_evento' => nil,
      'codigos' => [code],
      'saida_bruta_persistida' => false
    }
  end

  def parse_line(line)
    parsed = JSON.parse(line)
    return { status: :object, data: parsed } if parsed.is_a?(Hash)

    { status: :non_object }
  rescue JSON::ParserError
    { status: :invalid }
  end

  def default_signals
    {
      'execucao_comando' => false,
      'alteracao_arquivo' => false,
      'mensagem_agente' => false,
      'evento_terminal' => false,
      'erro_estruturado' => false
    }
  end

  def default_counts
    {
      'execucoes_comando' => 0,
      'alteracoes_arquivo' => 0,
      'mensagens_agente' => 0,
      'eventos_terminais' => 0,
      'erros_estruturados' => 0
    }
  end
end
