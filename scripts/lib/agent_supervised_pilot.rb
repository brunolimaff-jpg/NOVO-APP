# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'digest'
require 'time'

# Ativação e barreiras do piloto supervisionado (Fase 3B.3C).
# Não executa Codex real nesta PR — apenas valida pré-condições e estado.
module AgentSupervisedPilot
  ACK_VALUE = 'RUN_SUPERVISED_PILOT'
  PILOT_MAX_TIMEOUT = 180
  TEMPLATE_REL = '.agents/pilotos/primeiro-piloto.json'
  DEFAULT_STATE_REL = '.agents/pilotos/state'
  ALLOWED_WRITE_PREFIX = '.agents/pilotos/sandbox/'

  FORBIDDEN_WRITE_PATTERNS = [
    %r{\Apackage\.json\z},
    %r{\Apackage-lock\.json\z},
    %r{\Ayarn\.lock\z},
    %r{\Apnpm-lock\.yaml\z},
    %r{\A\.github/},
    %r{\A\.agents/seguranca/},
    %r{\Ascripts/},
    %r{\Acomponents/},
    %r{\Aservices/},
    %r{\Aapi/},
    %r{\Ahooks/},
    %r{\Autils/},
    %r{\Acontexts/},
    %r{\Aprompts/},
    %r{\AApp\.tsx\z},
    %r{\Atypes\.ts\z}
  ].freeze

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def pilot_requested?(opts)
    opts[:supervised_pilot] == true || !opts[:pilot_ack].to_s.empty? || ENV['AGENT_RUNTIME_PILOT'] == '1'
  end

  # Piloto: seis chaves. Runtime normal 3B.3B: ignorar (não exige piloto).
  def enforce_activation!(opts)
    return :not_pilot unless pilot_requested?(opts)

    unless opts[:supervised_pilot] == true
      raise Denial.new('SUPERVISED_PILOT_FLAG_REQUIRED', '--supervised-pilot obrigatório')
    end
    unless opts[:pilot_ack].to_s == ACK_VALUE
      raise Denial.new('SUPERVISED_PILOT_ACK_REQUIRED', "--pilot-ack #{ACK_VALUE} obrigatório")
    end
    unless ENV['AGENT_RUNTIME_PILOT'] == '1'
      raise Denial.new('SUPERVISED_PILOT_ENV_REQUIRED', 'AGENT_RUNTIME_PILOT=1 obrigatório')
    end

    :supervised_pilot
  end

  def load_template!(root)
    path = File.join(root, TEMPLATE_REL)
    raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "template ausente: #{TEMPLATE_REL}") unless File.file?(path)

    JSON.parse(File.read(path))
  rescue JSON::ParserError => error
    raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "template JSON inválido: #{error.message}")
  end

  def validate_mission!(card:, plan:, template:, root:)
    tmpl_id = template.dig('missao', 'id') || template['missao_id'] || template.dig('card', 'id')
    unless card['id'].to_s == tmpl_id.to_s && plan['missao_id'].to_s == tmpl_id.to_s
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', 'missão fora do template do primeiro piloto')
    end

    auth = (card.dig('autorizacao', 'nivel') || plan['autorizacao_fornecida']).to_s
    rank = { 'A0' => 0, 'A1' => 1, 'A2' => 2, 'A3' => 3, 'A4' => 4, 'A5' => 5, 'A6' => 6 }
    unless (rank[auth] || -1) >= 3
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "autorização abaixo de A3 (obtido=#{auth})")
    end

    timeout = plan.dig('limites', 'max_tempo_segundos').to_i
    if timeout < 1 || timeout > PILOT_MAX_TIMEOUT
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "timeout piloto > #{PILOT_MAX_TIMEOUT}s")
    end

    writes = []
    Array(plan['tarefas_planejadas']).each do |task|
      next unless task.is_a?(Hash)

      writes.concat(Array(task.dig('arquivos', 'escrita')))
    end
    writes = writes.map(&:to_s).reject(&:empty?).uniq
    if writes.size != 1
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "piloto exige exatamente 1 arquivo (obtido=#{writes.size})")
    end

    rel = writes.first
    unless rel.start_with?(ALLOWED_WRITE_PREFIX)
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "path fora do sandbox do piloto: #{rel}")
    end
    FORBIDDEN_WRITE_PATTERNS.each do |pat|
      if rel.match?(pat)
        raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "path funcional/proibido: #{rel}")
      end
    end

    true
  end

  def state_dir(root, override: nil)
    dir = override.to_s.strip.empty? ? File.join(root, DEFAULT_STATE_REL) : override
    FileUtils.mkdir_p(dir)
    dir
  end

  def state_path(dir, missao_id)
    safe = missao_id.to_s.gsub(/[^a-zA-Z0-9._-]/, '_')
    File.join(dir, "#{safe}.json")
  end

  # Criação atômica: O_EXCL. Colisão → SUPERVISED_PILOT_ALREADY_EXECUTED.
  def claim_mission!(state_dir:, missao_id:, report_hash:, dry_run: false)
    return nil if dry_run

    FileUtils.mkdir_p(state_dir)
    path = state_path(state_dir, missao_id)
    payload = JSON.generate(
      'missao_id' => missao_id.to_s,
      'timestamp' => Time.now.utc.iso8601,
      'report_hash' => report_hash.to_s
    )
    begin
      File.open(path, File::WRONLY | File::CREAT | File::EXCL) do |f|
        f.write(payload)
      end
    rescue Errno::EEXIST
      raise Denial.new('SUPERVISED_PILOT_ALREADY_EXECUTED', "piloto já registrado: #{missao_id}")
    end
    path
  end

  def already_executed?(state_dir:, missao_id:)
    File.file?(state_path(state_dir, missao_id))
  end
end
