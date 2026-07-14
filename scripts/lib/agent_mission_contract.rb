# frozen_string_literal: true

require 'json'
require_relative './agent_command_guard'
require_relative '../plan-agent-mission'

# Contrato compartilhado cartão+plano para runner legado e runtime (3B.3B).
# Uma única implementação — não duplicar em AgentMissionRunner / AgentSingleRuntime.
module AgentMissionContract
  ROOT = File.expand_path('../..', __dir__)
  CARD_SCHEMA_PATH = File.join(ROOT, '.agents/orquestracao/cartao-missao.schema.json')
  PLAN_SCHEMA_PATH = File.join(ROOT, '.agents/orquestracao/contrato-plano.schema.json')
  AUTH_LEVELS = %w[A2 A3 A4 A5].freeze

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def load_schema(path)
    JSON.parse(File.read(path))
  end

  def normalize_commands(list)
    Array(list).map(&:to_s).uniq.sort
  end

  def card_commands(card)
    card.dig('executor', 'comandos') || []
  end

  def plan_commands(plan)
    commands = plan['comandos']
    raise Denial.new('MISSING_COMMANDS', 'plan has no comandos') unless commands.is_a?(Array) && !commands.empty?

    commands
  end

  def validate_command_alignment!(card, plan)
    card_norm = normalize_commands(card_commands(card))
    plan_norm = normalize_commands(plan_commands(plan))
    return plan_commands(plan) if card_norm == plan_norm

    raise Denial.new(
      'COMMAND_PLAN_MISMATCH',
      "card commands #{card_norm.inspect} differ from plan commands #{plan_norm.inspect}"
    )
  end

  def validate_executable_plan_commands!(plan)
    return unless plan.dig('resumo_operacional', 'executavel') == true
    return unless plan['status'] == 'planejado'

    cmds = plan['comandos']
    unless cmds.is_a?(Array) && !cmds.empty? && cmds.all? { |c| c.is_a?(String) }
      raise Denial.new(
        'PLANEJADO_REQUIRES_COMMANDS',
        'plano planejado exige comandos array não vazio'
      )
    end
  end

  def validate_schemas!(card, plan)
    card_schema = load_schema(CARD_SCHEMA_PATH)
    plan_schema = load_schema(PLAN_SCHEMA_PATH)
    MissionPlanner.send(:validate_against_schema!, card, card_schema)
    MissionPlanner.send(:validate_against_schema!, plan, plan_schema)
    validate_executable_plan_commands!(plan)
  rescue MissionPlanner::SchemaError => error
    raise Denial.new('SCHEMA_INVALID', error.message)
  end

  # Validação pública compartilhada. Códigos estáveis para runner + runtime.
  def validate_inputs!(card, plan, catalog)
    validate_schemas!(card, plan)
    raise Denial.new('MISSION_MISMATCH', 'mission id mismatch') unless plan['missao_id'] == card['id']
    raise Denial.new('PLAN_STATUS_INVALID', 'plan status must be planejado') unless plan['status'] == 'planejado'
    raise Denial.new('PLAN_NEGATIONS', 'plan has negacoes') unless Array(plan['negacoes']).empty?
    unless plan.dig('resumo_operacional', 'executavel') == true
      raise Denial.new('PLAN_NOT_EXECUTABLE', 'plan is not marked as executable')
    end
    unless AUTH_LEVELS.include?(card.dig('autorizacao', 'nivel'))
      raise Denial.new('AUTH_INSUFFICIENT', 'insufficient authorization')
    end

    commands = validate_command_alignment!(card, plan)
    commands.each do |id|
      AgentCommandGuard.resolve_argv!(catalog, id)
    rescue AgentCommandGuard::Denial => error
      raise Denial.new(error.code, error.message)
    end
    commands
  end
end
