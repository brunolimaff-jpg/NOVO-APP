# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'digest'
require 'time'

# Ativação e barreiras do piloto supervisionado (Fase 3B.3C+).
# Não executa Codex real — apenas valida pré-condições e estado.
module AgentSupervisedPilot
  ACK_VALUE = 'RUN_SUPERVISED_PILOT'
  PILOT_MAX_TIMEOUT = 180
  TEMPLATE_REL = '.agents/pilotos/primeiro-piloto.json'
  TEMPLATES_DIR = '.agents/pilotos/templates'
  DEFAULT_STATE_REL = '.agents/pilotos/state'
  ALLOWED_WRITE_PREFIX = '.agents/pilotos/sandbox/'
  SAFE_ID_RE = /\A[a-z0-9][a-zA-Z0-9_.-]*\z/

  FORBIDDEN_WRITE_PATTERNS = [
    %r{\Apackage\.json\z},
    %r{\Apackage-lock\.json\z},
    %r{\Ayarn\.lock\z},
    %r{\Apnpm-lock\.yaml\z},
    %r{\A\.github/},
    %r{\Aapi/},
    %r{\A\.agents/seguranca/},
    %r{\Ascripts/},
    %r{\Acomponents/},
    %r{\Aservices/},
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

  def validate_delivery_contract!(contract)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'contract deve ser Hash') unless contract.is_a?(Hash)
    path = contract['path']
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path deve ser string não vazia') unless path.is_a?(String) && !path.empty?
    content = contract['conteudo_obrigatorio']
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'conteudo_obrigatorio deve ser Array') unless content.is_a?(Array)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'conteudo_obrigatorio vazio') if content.empty?
    content.each_with_index do |line, i|
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "linha #{i} não é String") unless line.is_a?(String)
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "linha #{i} vazia") if line.empty?
    end
    serialized = JSON.generate(contract)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "contrato excede 4096 bytes") if serialized.bytesize > 4096
    true
  end

  CONTRACT_MAX_BYTES = 4096

  def extract_delivery_contract(template)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'template deve ser Hash') unless template.is_a?(Hash)
    fmt = template['formato_arquivo']
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'template sem formato_arquivo') unless fmt.is_a?(Hash)
    raw_path = fmt['path']
    raw_content = fmt['conteudo_obrigatorio']

    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path deve ser String') unless raw_path.is_a?(String)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path não pode ser vazio') if raw_path.empty?
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'conteudo_obrigatorio deve ser Array') unless raw_content.is_a?(Array)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'conteudo_obrigatorio não pode ser vazio') if raw_content.empty?

    raw_content.each_with_index do |item, i|
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "item #{i} deve ser String") unless item.is_a?(String)
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "item #{i} não pode ser vazio") if item.empty?
    end

    contracted_content = raw_content.dup
    contracted_content.each_with_index do |line, i|
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "item #{i} contém newline") if line.include?("\n") || line.include?("\r")
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "item #{i} contém BEGIN_DELIVERY_CONTENT") if line.include?('BEGIN_DELIVERY_CONTENT')
      raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "item #{i} contém END_DELIVERY_CONTENT") if line.include?('END_DELIVERY_CONTENT')
    end

    deep_copy = {
      'path' => raw_path.dup.freeze,
      'conteudo_obrigatorio' => contracted_content.freeze
    }

    serialized = JSON.generate(deep_copy)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "contrato excede #{CONTRACT_MAX_BYTES} bytes") if serialized.bytesize > CONTRACT_MAX_BYTES

    deep_copy.freeze
    deep_copy.each_value { |v| v.freeze if v.is_a?(Array) }

    deep_copy
  end

  def validate_contract_against_outputs!(contract, template)
    authorized = plan2writes(template)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'nenhum output autorizado no template') unless authorized.size == 1

    authorized_path = authorized.first
    contract_path = contract['path']

    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'exatamente um output esperado') if authorized.size != 1
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "contract.path (#{contract_path}) != output autorizado (#{authorized_path})") unless contract_path == authorized_path

    segments = contract_path.split('/')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path com segmento vazio') if segments.any?(&:empty?)
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path com traversal') if segments.include?('.') || segments.include?('..')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path absoluto não permitido') if contract_path.start_with?('/')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', 'path com backslash') if contract_path.include?('\\')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "path difere da normalização: #{contract_path} vs #{segments.join('/')}") unless contract_path == segments.join('/')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "path fora do sandbox: #{contract_path}") unless contract_path.start_with?(ALLOWED_WRITE_PREFIX)

    protected = contract_path.start_with?('.agents/seguranca') || contract_path.start_with?('.agents/orquestracao') ||
               contract_path.start_with?('scripts/') || contract_path.start_with?('.github/')
    raise Denial.new('SUPERVISED_PILOT_DELIVERY_CONTRACT_INVALID', "path protegido: #{contract_path}") if protected

    true
  end

  def pilot_requested?(opts)
    opts[:supervised_pilot] == true || !opts[:pilot_ack].to_s.empty? || ENV['AGENT_RUNTIME_PILOT'] == '1'
  end

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

  def template_id!(template, requested_id:)
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'template deve ser objeto') unless template.is_a?(Hash)

    ids = []
    if template.key?('missao_id')
      v = template['missao_id']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'missao_id deve ser string') unless v.is_a?(String) && !v.empty?
      ids << v
    end
    if template.key?('missao')
      v = template['missao']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'missao deve ser Hash') unless v.is_a?(Hash)
      vid = v['id']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'missao.id deve ser string não vazia') unless vid.is_a?(String) && !vid.empty?
      ids << vid
    end
    if template.key?('card')
      v = template['card']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'card deve ser Hash') unless v.is_a?(Hash)
      vid = v['id']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'card.id deve ser string não vazia') unless vid.is_a?(String) && !vid.empty?
      ids << vid
    end

    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'template sem ID interno') if ids.empty?
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH', "IDs internos divergentes: #{ids.uniq.inspect}") unless ids.uniq.size == 1
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_ID_MISMATCH', "ID interno (#{ids.first}) != solicitado (#{requested_id})") unless ids.first == requested_id.to_s

    ids.first
  end

  def contain_path!(root_real, path_real, label)
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "#{label} não está sob #{root_real}") unless path_real.start_with?(root_real + '/') || path_real == root_real
  end

  def safe_template_path(root, missao_id:)
    safe_id = missao_id.to_s
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "mission_id inválido: #{missao_id.inspect}") unless safe_id.match?(SAFE_ID_RE)
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "mission_id contém caracteres proibidos") if safe_id.include?('/') || safe_id.include?('\\') || safe_id.include?('..')
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "mission_id não normalizado") unless safe_id == safe_id.strip

    root_real = File.realpath(root)

    if safe_id == 'primeiro-piloto-supervisionado'
      legado = File.expand_path(File.join(root, TEMPLATE_REL))
      legado_real = File.realpath(legado)
      contain_path!(root_real, legado_real, 'template legado')
      # Verificar que está dentro de .agents/pilotos/
      pilotos_real = File.realpath(File.join(root, '.agents', 'pilotos'))
      contain_path!(pilotos_real, legado_real, 'template legado sob pilotos')
      [legado, legado_real]
    else
      dir_raw = File.expand_path(File.join(root, TEMPLATES_DIR))
      dir_real = File.realpath(dir_raw)
      contain_path!(root_real, dir_real, 'diretório de templates')
      cand = File.expand_path(File.join(dir_raw, "#{safe_id}.json"))
      cand_real = File.realpath(cand)
      contain_path!(dir_real, cand_real, 'template')
      [cand, cand_real]
    end
  rescue SystemCallError => e
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "erro ao acessar template: #{e.message}")
  end

  def load_template!(root, missao_id:)
    raw_id = missao_id.to_s
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "mission_id inválido") unless raw_id.match?(SAFE_ID_RE)

    _cand, real = safe_template_path(root, missao_id: raw_id)
    template = JSON.parse(File.read(real))
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'template JSON inválido: raiz deve ser objeto') unless template.is_a?(Hash)

    template_id!(template, requested_id: raw_id)
    validate_template_outputs!(template)

    contract = extract_delivery_contract(template)
    validate_contract_against_outputs!(contract, template)

    template
  rescue JSON::ParserError => error
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', "template JSON inválido: #{error.message}")
  end

  def validate_template_outputs!(template)
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'template deve ser Hash') unless template.is_a?(Hash)

    card = template['card']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_NOT_APPROVED', 'card deve ser Hash') unless card.is_a?(Hash)

    # A. outputs de execucao_planejada.tarefas[].arquivos.escrita
    a_paths = []
    ep = card['execucao_planejada']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'execucao_planejada deve ser Hash') unless ep.is_a?(Hash)

    tasks = ep['tarefas']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'tarefas deve ser Array') unless tasks.is_a?(Array)

    tasks.each do |t|
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'cada tarefa deve ser Hash') unless t.is_a?(Hash)

      arquivos = t['arquivos']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'tarefa.arquivos deve ser Hash') unless arquivos.is_a?(Hash)

      escrita = arquivos['escrita']
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'tarefa.arquivos.escrita deve ser Array') unless escrita.is_a?(Array)

      escrita.each { |p| a_paths << p.to_s if p.is_a?(String) && !p.to_s.empty? }
    end
    a_paths = a_paths.uniq
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', "execucao_planejada com #{a_paths.size} output(s), esperado 1") unless a_paths.size == 1

    # B. outputs de card.escopo.escrita
    escopo = card['escopo']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'card.escopo deve ser Hash') unless escopo.is_a?(Hash)

    b_writes = escopo['escrita']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'card.escopo.escrita deve ser Array') unless b_writes.is_a?(Array)

    b_paths = b_writes.map(&:to_s).reject(&:empty?).uniq
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', "card.escopo.escrita com #{b_paths.size} path(s), esperado 1") unless b_paths.size == 1

    # C. formato_arquivo.path
    fmt = template['formato_arquivo']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'formato_arquivo deve ser Hash') unless fmt.is_a?(Hash)

    c_path = fmt['path']
    raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', 'formato_arquivo.path deve ser string não vazia') unless c_path.is_a?(String) && !c_path.empty?

    unless a_paths.first == b_paths.first && b_paths.first == c_path
      raise Denial.new('SUPERVISED_PILOT_TEMPLATE_OUTPUT_INVALID', "outputs divergentes: A=#{a_paths.first} B=#{b_paths.first} C=#{c_path}")
    end
  end

  def plan2writes(plan_or_template)
    return [] unless plan_or_template.is_a?(Hash)

    writes = []
    card = plan_or_template['card']
    if card.is_a?(Hash)
      ep = card['execucao_planejada']
      if ep.is_a?(Hash)
        tasks = ep['tarefas']
        if tasks.is_a?(Array)
          tasks.each do |t|
            next unless t.is_a?(Hash)

            arquivos = t['arquivos']
            next unless arquivos.is_a?(Hash)

            escrita = arquivos['escrita']
            next unless escrita.is_a?(Array)

            escrita.each { |p| writes << p.to_s if p.is_a?(String) && !p.to_s.empty? }
          end
        end
      end
      escopo = card['escopo']
      if escopo.is_a?(Hash)
        ew = escopo['escrita']
        writes.concat(ew.map(&:to_s)) if ew.is_a?(Array)
      end
    end

    writes.reject(&:empty?).uniq
  end

  def validate_mission!(card:, plan:, template:, root:)
    tmpl_id = template_id!(template, requested_id: card['id'].to_s)
    unless card['id'].to_s == tmpl_id && plan['missao_id'].to_s == tmpl_id
      raise Denial.new('SUPERVISED_PILOT_SCOPE_DENIED', "missão fora do template autorizado (esperado=#{tmpl_id})")
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

    tmpl_writes = plan2writes(template)
    if tmpl_writes.size != 1 || rel != tmpl_writes.first
      raise Denial.new('SUPERVISED_PILOT_OUTPUT_MISMATCH', "arquivo planejado (#{rel}) difere do autorizado no template (#{tmpl_writes.first})")
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

  def claim_mission!(state_dir:, missao_id:, report_hash:, dry_run: false)
    return nil if dry_run

    FileUtils.mkdir_p(state_dir)
    path = state_path(state_dir, missao_id)
    payload = JSON.generate(
      'missao_id' => missao_id.to_s,
      'timestamp' => Time.now.utc.iso8601,
      'report_hash' => report_hash.to_s,
      'attempt' => 1,
      'status' => 'report_finalized'
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

  def reserve_mission!(state_dir:, missao_id:, report_hash: nil)
    FileUtils.mkdir_p(state_dir)
    path = state_path(state_dir, missao_id)
    payload = JSON.generate(
      'missao_id' => missao_id.to_s,
      'timestamp' => Time.now.utc.iso8601,
      'report_hash' => report_hash,
      'attempt' => 1,
      'status' => 'reserved'
    )
    begin
      File.open(path, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write(payload); f.flush; f.fsync }
    rescue Errno::EEXIST
      raise Denial.new('SUPERVISED_PILOT_ALREADY_EXECUTED', "piloto já registrado: #{missao_id}")
    end
    path
  end

  def update_state!(path, status:, report_hash: nil)
    current = JSON.parse(File.read(path))
    current['status'] = status.to_s
    current['report_hash'] = report_hash.to_s if report_hash
    tmp = "#{path}.tmp-#{Process.pid}"
    File.open(tmp, File::WRONLY | File::CREAT | File::EXCL, 0o600) { |f| f.write(JSON.generate(current)); f.flush; f.fsync }
    File.rename(tmp, path)
  ensure
    File.delete(tmp) if tmp && File.exist?(tmp)
  end

  def already_executed?(state_dir:, missao_id:)
    File.file?(state_path(state_dir, missao_id))
  end
end
