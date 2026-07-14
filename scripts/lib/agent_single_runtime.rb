# frozen_string_literal: true

require 'json'
require 'digest'
require 'open3'
require 'time'
require 'fileutils'
require_relative './agent_path_guard'
require_relative './agent_command_guard'
require_relative './agent_mission_contract'
require_relative './codex_single_agent_runtime'
require_relative './agent_run_comparator'
require_relative './agent_task_ledger'
require_relative '../runtime-safety-preflight'

# Orquestração do runtime single-agent (Fase 3B.3B).
module AgentSingleRuntime
  ACK_VALUE = 'RUN_SINGLE_AGENT'
  MAX_TIMEOUT = 900
  MIN_TIMEOUT = 1

  class Denial < StandardError
    attr_reader :code

    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  module_function

  def enforce_activation!(opts)
    flag = opts[:agent_runtime] == true
    ack = opts[:runtime_ack].to_s
    env_ok = ENV['AGENT_RUNTIME_EXECUTE'] == '1'

    unless flag
      raise Denial.new('AGENT_RUNTIME_FLAG_REQUIRED', '--agent-runtime obrigatório') if !ack.empty? || env_ok

      return :legacy
    end
    unless ack == ACK_VALUE
      raise Denial.new('AGENT_RUNTIME_ACK_REQUIRED', "--runtime-ack #{ACK_VALUE} obrigatório")
    end
    unless env_ok
      raise Denial.new('AGENT_RUNTIME_ENV_REQUIRED', 'AGENT_RUNTIME_EXECUTE=1 obrigatório')
    end

    :agent_runtime
  end

  def write_scope_from_plan(plan)
    scopes = []
    Array(plan['tarefas_planejadas']).each do |task|
      next unless task.is_a?(Hash)

      escrita = task.dig('arquivos', 'escrita')
      scopes.concat(Array(escrita))
    end
    scopes.map(&:to_s).reject(&:empty?)
  end

  def read_scope_from_plan(plan)
    scopes = []
    Array(plan['tarefas_planejadas']).each do |task|
      next unless task.is_a?(Hash)

      leitura = task.dig('arquivos', 'leitura')
      scopes.concat(Array(leitura))
    end
    scopes.map(&:to_s).reject(&:empty?).uniq
  end

  CODEX_TOOL = 'codex'
  CODEX_ADAPTER_HINT = /codex/i

  def validate_codex_harness!(plan)
    tool = plan['ferramenta_selecionada']
    tool_s = tool.nil? ? '' : tool.to_s.strip
    unless tool_s == CODEX_TOOL
      raise Denial.new(
        'RUNTIME_HARNESS_MISMATCH',
        "ferramenta_selecionada deve ser 'codex' (obtido=#{tool.inspect})"
      )
    end

    adapter = plan['adaptador_selecionado']
    adapter_s = adapter.nil? ? '' : adapter.to_s.strip
    if adapter_s.empty? || !adapter_s.match?(CODEX_ADAPTER_HINT)
      raise Denial.new(
        'RUNTIME_HARNESS_MISMATCH',
        "adaptador_selecionado incompatível com Codex (obtido=#{adapter.inspect})"
      )
    end

    harness = plan.dig('resumo_operacional', 'harness')
    return if harness.nil?

    unless harness.to_s.match?(CODEX_ADAPTER_HINT)
      raise Denial.new(
        'RUNTIME_HARNESS_MISMATCH',
        "resumo_operacional.harness incompatível com Codex (obtido=#{harness.inspect})"
      )
    end
  end

  def validate_single_agent_plan!(card, plan, catalog)
    unless plan['status'] == 'planejado' && Array(plan['negacoes']).empty? && plan.dig('resumo_operacional', 'executavel') == true
      raise Denial.new('RUNTIME_PLAN_NOT_EXECUTABLE', 'plano não executável para runtime')
    end

    validate_codex_harness!(plan)

    estrategia = plan.dig('resumo_operacional', 'estrategia') || plan.dig('decisao_execucao', 'estrategia')
    agentes = plan.dig('resumo_operacional', 'agentes_planejados').to_i
    writers = plan.dig('resumo_operacional', 'writers').to_i
    topologia = plan['topologia'] || {}
    agentes_list = Array(topologia['agentes'])

    if estrategia != 'agente-unico' || agentes != 1 || agentes_list.size != 1
      raise Denial.new('RUNTIME_SINGLE_AGENT_REQUIRED', 'runtime exige exatamente um agente (agente-unico)')
    end
    if writers != 1
      raise Denial.new('RUNTIME_SINGLE_WRITER_REQUIRED', 'runtime exige exatamente um writer')
    end

    agente = agentes_list.first
    papel = (agente.is_a?(Hash) ? agente['papel'] : nil) || plan['papel_principal']
    permissao = agente.is_a?(Hash) ? agente['permissao'] : nil
    unless papel == 'executor-escopo' && permissao == 'workspace-write'
      raise Denial.new('RUNTIME_ROLE_DENIED', 'somente executor-escopo + workspace-write')
    end

    max_agentes = topologia['max_agentes'].to_i
    max_paralelo = plan.dig('resumo_operacional', 'max_paralelo').to_i
    if max_agentes != 1 || max_paralelo != 1
      raise Denial.new('RUNTIME_SINGLE_AGENT_REQUIRED', 'max_agentes/max_paralelo devem ser 1')
    end
    if topologia['permite_subdelegacao'] != false || plan['delegacao_permitida'] != false
      raise Denial.new('RUNTIME_SUBDELEGATION_DENIED', 'subdelegação/delegação proibida')
    end
    unless plan['escrita_permitida'] == true
      raise Denial.new('RUNTIME_PLAN_NOT_EXECUTABLE', 'escrita_permitida deve ser true')
    end
    if plan['rede_permitida'] == true
      raise Denial.new('RUNTIME_NETWORK_DENIED', 'rede_permitida proibida no runtime')
    end

    scope_raw = write_scope_from_plan(plan)
    if scope_raw.empty?
      raise Denial.new('RUNTIME_WRITE_SCOPE_REQUIRED', 'escopo de escrita vazio')
    end

    timeout = plan.dig('limites', 'max_tempo_segundos').to_i
    if timeout < MIN_TIMEOUT || timeout > MAX_TIMEOUT
      raise Denial.new('RUNTIME_TIMEOUT_INVALID', "timeout inválido=#{timeout} (1..#{MAX_TIMEOUT})")
    end

    commands = Array(plan['comandos'])
    raise Denial.new('RUNTIME_PLAN_NOT_EXECUTABLE', 'comandos canônicos ausentes') if commands.empty?

    commands.each do |id|
      AgentCommandGuard.resolve_argv!(catalog, id)
    rescue AgentCommandGuard::Denial => error
      raise Denial.new(error.code, error.message)
    end

    {
      'timeout' => timeout,
      'write_scope_raw' => scope_raw,
      'read_scope' => read_scope_from_plan(plan),
      'commands' => commands,
      'card' => card,
      'plan' => plan
    }
  end

  def git(worktree, *args)
    out, err, status = Open3.capture3('git', '-C', worktree, '-c', 'core.quotepath=false', *args)
    [out, err, status]
  end

  def primary_worktree?(worktree)
    File.directory?(File.join(worktree, '.git'))
  end

  def snapshot_worktree!(worktree, repo_root:)
    begin
      wt_real = File.realpath(worktree)
      repo_real = File.realpath(repo_root)
    rescue SystemCallError => error
      raise Denial.new('RUNTIME_WORKTREE_DIRTY', "realpath inválido: #{error.message}")
    end

    if primary_worktree?(wt_real)
      raise Denial.new('RUNTIME_PRIMARY_WORKTREE_DENIED', 'worktree principal proibida')
    end

    branch_out, _, branch_st = git(wt_real, 'rev-parse', '--abbrev-ref', 'HEAD')
    raise Denial.new('RUNTIME_WORKTREE_DIRTY', 'falha ao ler branch') unless branch_st.success?

    branch = branch_out.strip
    if %w[main master].include?(branch)
      raise Denial.new('RUNTIME_MAIN_BRANCH_DENIED', "branch #{branch} proibida")
    end

    head_out, _, head_st = git(wt_real, 'rev-parse', 'HEAD')
    raise Denial.new('RUNTIME_WORKTREE_DIRTY', 'falha ao ler HEAD') unless head_st.success?

    head = head_out.strip

    status_out, _, status_st = git(wt_real, 'status', '--porcelain')
    raise Denial.new('RUNTIME_WORKTREE_DIRTY', 'falha ao ler status') unless status_st.success?
    raise Denial.new('RUNTIME_WORKTREE_DIRTY', 'worktree suja') unless status_out.strip.empty?

    refs_out, _, refs_st = git(wt_real, 'show-ref')
    refs_digest = Digest::SHA256.hexdigest(refs_st.success? ? refs_out : '')

    {
      'repo_realpath' => repo_real,
      'worktree_realpath' => wt_real,
      'branch' => branch,
      'head' => head,
      'status_clean' => true,
      'refs_sha256' => refs_digest
    }
  end

  def normalize_scope!(paths, worktree:)
    normalized, negacoes = AgentPathGuard.normalize_path_list(paths, worktree_root: worktree)
    unless negacoes.empty?
      code = negacoes.first['codigo'] || 'RUNTIME_PROTECTED_PATH_DENIED'
      raise Denial.new(code, negacoes.first['mensagem'] || 'path inválido no escopo')
    end
    normalized.each do |rel|
      if rel == '.' || rel.empty?
        raise Denial.new('RUNTIME_WRITE_SCOPE_REQUIRED', 'escopo de escrita não pode ser a raiz')
      end
      if AgentPathGuard.protected_mutation?(rel)
        raise Denial.new('RUNTIME_PROTECTED_PATH_DENIED', "escopo inclui path protegido: #{rel}")
      end
    end
    normalized
  end

  def protected_hashes(worktree)
    hashes = {}
    AgentPathGuard::PROTECTED_PREFIXES.each do |prefix|
      path = File.join(worktree, prefix)
      next unless File.file?(path)

      begin
        hashes[prefix] = Digest::SHA256.hexdigest(File.binread(path))
      rescue SystemCallError
        next
      end
    end
    hashes
  end

  def assert_live_preflight!(worktree:)
    opts = {
      mode: 'live',
      worktree: worktree
    }
    if ENV['AGENT_RUNTIME_TEST_PREFLIGHT'] == '1'
      dcg = ENV['AGENT_RUNTIME_TEST_DCG_BIN'].to_s.strip
      raise Denial.new('RUNTIME_LIVE_PREFLIGHT_REQUIRED', 'AGENT_RUNTIME_TEST_DCG_BIN obrigatório no teste') if dcg.empty?

      begin
        real = File.realpath(dcg)
      rescue SystemCallError
        raise Denial.new('RUNTIME_LIVE_PREFLIGHT_REQUIRED', 'DCG de teste inválido')
      end
      fixtures = File.realpath(File.join(File.expand_path('../..', __dir__), '.agents/seguranca/fixtures'))
      unless real.start_with?(fixtures + File::SEPARATOR)
        raise Denial.new('RUNTIME_LIVE_PREFLIGHT_REQUIRED', 'DCG de teste fora de fixtures/')
      end

      opts[:dcg_path] = real
      opts[:allow_test_hook] = true
      opts[:checksum_esperado_override] = Digest::SHA256.hexdigest(File.binread(real))
    end

    report = RuntimeSafetyPreflight.build_report(opts)
    assert_live_report_ready!(report, worktree: worktree)
    report
  rescue RuntimeSafetyPreflight::Denied => error
    raise Denial.new(error.code, error.message)
  end

  def assert_live_report_ready!(report, worktree:)
    raise Denial.new('RUNTIME_LIVE_PREFLIGHT_REQUIRED', 'preflight ausente') unless report.is_a?(Hash)
    unless report['modo'] == 'live'
      raise Denial.new('RUNTIME_LIVE_PREFLIGHT_REQUIRED', 'preflight deve ser modo live')
    end
    unless report['status'] == 'ready'
      codes = Array(report['negacoes']).map { |n| n['codigo'] }
      mapped =
        if codes.include?('DCG_MISSING') || !report.dig('dcg', 'presente')
          'DCG_REQUIRED_FOR_WRITE_RUNTIME'
        elsif codes.any? { |c| c.to_s.start_with?('DCG_HOOK') } || report.dig('dcg', 'hook_confiado') == 'unknown'
          'DCG_HOOK_NOT_VERIFIED'
        elsif codes.include?('DCG_BINARY_CHECKSUM_MISMATCH') || codes.include?('DCG_ASSET_CHECKSUM_MISMATCH') ||
              codes.include?('DCG_BINARY_CHECKSUM_PLATFORM_UNKNOWN') || codes.include?('DCG_CHECKSUM_MISMATCH')
          'DCG_CHECKSUM_MISMATCH'
        elsif codes.include?('DCG_VERSION_MISMATCH')
          'DCG_VERSION_MISMATCH'
        elsif codes.any? { |c| c.to_s.start_with?('DCG_BYPASS') }
          'RUNTIME_LIVE_PREFLIGHT_FAILED'
        else
          'RUNTIME_LIVE_PREFLIGHT_FAILED'
        end
      raise Denial.new(mapped, "preflight live não ready (#{codes.join(',')})")
    end

    begin
      wt = File.realpath(worktree)
      report_wt = File.realpath(report.fetch('worktree_realpath'))
      report_root = File.realpath(report.fetch('repo_root'))
    rescue SystemCallError => error
      raise Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', error.message)
    end
    unless report_wt == wt
      raise Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', 'worktree do preflight diverge')
    end

    dcg = report['dcg'] || {}
    raise Denial.new('DCG_REQUIRED_FOR_WRITE_RUNTIME', 'DCG ausente') unless dcg['presente']
    unless %w[verified-local-human verified-test fixture].include?(dcg['hook_confiado'].to_s)
      raise Denial.new('DCG_HOOK_NOT_VERIFIED', 'hook Codex não verificado')
    end
    raise Denial.new('DCG_VERSION_MISMATCH', 'versão DCG divergente') if dcg['versao_observada'] != dcg['versao_esperada']
    binary_ok =
      if dcg.key?('binary_checksum_status')
        dcg['binary_checksum_status'] == 'match'
      else
        dcg['checksum_observado'] == dcg['checksum_esperado']
      end
    raise Denial.new('DCG_CHECKSUM_MISMATCH', 'checksum DCG divergente') unless binary_ok
    unless dcg.dig('probe', 'resultado') == 'blocked'
      raise Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', 'probe seguro não suportado/bloqueante')
    end
    bypass = Array(report['bypass_env_detectado'])
    raise Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', "bypass env: #{bypass}") unless bypass.empty?

    head_now, _, st = git(wt, 'rev-parse', 'HEAD')
    raise Denial.new('RUNTIME_LIVE_PREFLIGHT_FAILED', 'HEAD ilegível') unless st.success?
    if report['git_head'] != head_now.strip
      raise Denial.new('RUNTIME_HEAD_CHANGED', 'git_head do preflight diverge do atual')
    end

    true
  end

  def build_prompt(card, plan, write_scope:, read_scope:)
    lines = []
    lines << '# Missão single-agent (executor-escopo)'
    lines << "ID: #{card['id']}"
    lines << "Título: #{card['titulo']}"
    lines << "Objetivo: #{card['objetivo']}"
    lines << "Contexto: #{card['contexto']}"
    lines << "Resultado esperado: #{card['resultado_esperado']}"
    lines << ''
    lines << '## Leitura permitida'
    read_scope.each { |p| lines << "- #{p}" }
    lines << ''
    lines << '## Escrita permitida'
    write_scope.each { |p| lines << "- #{p}" }
    lines << ''
    lines << '## Ações proibidas'
    lines << '- não delegar / não criar subagentes'
    lines << '- não alterar arquivos fora do escopo'
    lines << '- não instalar dependências'
    lines << '- não acessar rede por ferramentas'
    lines << '- não fazer commit / push / PR / merge / deploy'
    lines << '- parar diante de ambiguidade material'
    lines << '- produzir evidências verificáveis'
    lines << ''
    lines << '## Testes solicitados'
    Array(card['verificacao']).each { |v| lines << "- #{v}" }
    lines << ''
    lines << '## Condições de parada'
    Array(card['condicoes_parada']).each { |c| lines << "- #{c}" }
    Array(plan['condicoes_parada']).each { |c| lines << "- #{c}" }
    lines << ''
    lines << '## Formato da entrega'
    lines << '- alterações somente no escopo de escrita'
    lines << '- evidências listadas sem secrets'
    lines.join("\n")
  end

  def porcelain_entries(worktree)
    out, _, st = git(worktree, 'status', '--porcelain', '-uall')
    raise Denial.new('RUNTIME_SCOPE_VIOLATION', 'falha ao listar mudanças') unless st.success?

    entries = []
    out.each_line do |line|
      line = line.rstrip
      next if line.empty?

      untracked = line.start_with?('??')
      path =
        if line.start_with?('R') || line.start_with?('C')
          line.split(' -> ', 2).last
        else
          line[3..]
        end
      next if path.nil? || path.empty?

      entries << { 'path' => path.delete_prefix('"').delete_suffix('"'), 'untracked' => untracked }
    end
    entries
  end

  def porcelain_paths(worktree)
    porcelain_entries(worktree).map { |e| e['path'] }.uniq
  end

  def verify_after!(snap:, write_scope:, protected_before:)
    negacoes = []
    wt = snap['worktree_realpath']
    commit_criado = false
    refs_alteradas = false

    head_out, _, head_st = git(wt, 'rev-parse', 'HEAD')
    head_final = head_st.success? ? head_out.strip : nil
    if head_final.nil? || head_final != snap['head']
      negacoes << { 'codigo' => 'RUNTIME_HEAD_CHANGED', 'mensagem' => 'HEAD alterado após execução' }
      # Distinguish new commit objects on the branch tip.
      rev, _, rev_st = git(wt, 'rev-list', '--count', "#{snap['head']}..#{head_final}")
      if rev_st.success? && rev.strip.to_i.positive?
        commit_criado = true
        negacoes << { 'codigo' => 'RUNTIME_COMMIT_CREATED', 'mensagem' => 'commit criado durante runtime' }
      end
    end

    refs_out, _, refs_st = git(wt, 'show-ref')
    refs_digest = Digest::SHA256.hexdigest(refs_st.success? ? refs_out : '')
    if refs_digest != snap['refs_sha256']
      refs_alteradas = true
      negacoes << { 'codigo' => 'RUNTIME_GIT_STATE_MUTATED', 'mensagem' => 'refs git alteradas' }
    end

    entries = porcelain_entries(wt)
    normalized_modified = []
    untracked = []
    scope_violations = []
    protected_mutated = []
    entries.each do |entry|
      raw = entry['path']
      begin
        rel = AgentPathGuard.validate_path!(raw, worktree_root: wt)
        normalized_modified << rel
        untracked << rel if entry['untracked']
        unless write_scope.include?(rel) || write_scope.any? { |s| rel == s || rel.start_with?(s.delete_suffix('/') + '/') }
          scope_violations << rel
        end
        if AgentPathGuard.protected_mutation?(rel)
          protected_mutated << rel
          negacoes << { 'codigo' => 'RUNTIME_PROTECTED_PATH_MUTATED', 'mensagem' => "protegido alterado: #{rel}" }
        end
      rescue AgentPathGuard::Denial => error
        scope_violations << raw
        negacoes << { 'codigo' => error.code, 'mensagem' => error.message }
      end
    end

    unless scope_violations.empty?
      negacoes << {
        'codigo' => 'RUNTIME_SCOPE_VIOLATION',
        'mensagem' => "fora do escopo: #{scope_violations.uniq.join(', ')}"
      }
    end

    protected_after = protected_hashes(wt)
    protected_before.each do |path, hash|
      next unless protected_after[path]
      next if protected_after[path] == hash

      protected_mutated << path
      negacoes << { 'codigo' => 'RUNTIME_PROTECTED_PATH_MUTATED', 'mensagem' => "hash protegido mudou: #{path}" }
    end

    {
      'head_final' => head_final,
      'arquivos_modificados' => normalized_modified.uniq.sort,
      'arquivos_untracked' => untracked.uniq.sort,
      'violacoes_escopo' => scope_violations.uniq.sort,
      'arquivos_protegidos_alterados' => protected_mutated.uniq.sort,
      'commit_criado' => commit_criado,
      'refs_alteradas' => refs_alteradas,
      'negacoes' => negacoes
    }
  end

  def compute_report_hash(report)
    canonical = JSON.generate(RuntimeSafetyPreflight.sort_keys_deep(report.reject { |k, _| k == 'relatorio_sha256' }))
    Digest::SHA256.hexdigest(canonical)
  end

  def build_observed_report(base:)
    report = RuntimeSafetyPreflight.sort_keys_deep(base)
    report['relatorio_sha256'] = compute_report_hash(report)
    report
  end

  def assert_head_unchanged!(snap)
    wt = snap.fetch('worktree_realpath')
    expected = snap.fetch('head')
    head_check, _, st = git(wt, 'rev-parse', 'HEAD')
    unless st.success? && head_check.strip == expected
      raise Denial.new('RUNTIME_HEAD_CHANGED', 'HEAD mudou entre snapshot/preflight e spawn')
    end
    true
  end

  def run!(card:, plan:, catalog:, worktree:, safety_report_path: nil, repo_root:)
    # Defesa pública: não confiar que o CLI já validou.
    begin
      AgentMissionContract.validate_inputs!(card, plan, catalog)
    rescue AgentMissionContract::Denial => error
      raise Denial.new(error.code, error.message)
    end

    t0 = Time.now.utc
    ledger = AgentTaskLedger.wrap(AgentTaskLedger.new_entry(
      missao_id: card['id'],
      at: t0
    ))
    AgentTaskLedger.transition!(ledger, to: 'authorized', at: t0 + 1)

    validated = validate_single_agent_plan!(card, plan, catalog)
    snap = snapshot_worktree!(worktree, repo_root: repo_root)
    write_scope = normalize_scope!(validated['write_scope_raw'], worktree: snap['worktree_realpath'])
    read_scope = normalize_scope!(validated['read_scope'], worktree: snap['worktree_realpath'])

    planned = AgentRunComparator.build_planned_snapshot(
      card: card,
      plan: plan,
      snap: snap,
      write_scope: write_scope,
      read_scope: Array(read_scope)
    )
    planned_sha = AgentRunComparator.canonical_hash(planned)

    # External report is audit-only: never authorizes.
    external_hash = nil
    if safety_report_path && !safety_report_path.to_s.strip.empty?
      begin
        external = JSON.parse(File.read(safety_report_path))
        external_hash = external['relatorio_sha256']
        RuntimeSafetyPreflight.validate_report!(external) rescue nil
      rescue StandardError
        external_hash = nil
      end
    end

    live = assert_live_preflight!(worktree: snap['worktree_realpath'])
    assert_head_unchanged!(snap)

    protected_before = protected_hashes(snap['worktree_realpath'])
    prompt = build_prompt(card, plan, write_scope: write_scope, read_scope: Array(read_scope))
    prompt_sha = Digest::SHA256.hexdigest(prompt)

    prepared = CodexSingleAgentRuntime.prepare!(worktree: snap['worktree_realpath'])
    spawn_result = CodexSingleAgentRuntime.spawn!(
      argv: prepared['argv'],
      prompt: prompt,
      chdir: snap['worktree_realpath'],
      timeout_seconds: validated['timeout']
    )
    spawn_started = spawn_result['processos_iniciados'].to_i.positive?

    after = verify_after!(snap: snap, write_scope: write_scope, protected_before: protected_before)

    status =
      if spawn_result['timeout']
        'timeout'
      elsif after['negacoes'].any?
        'denied'
      elsif spawn_result['exit_code'] == 0
        'success'
      elsif spawn_result['exit_code'].nil?
        'failure'
      else
        'failure'
      end

    observed = AgentRunComparator.build_observed_snapshot(
      'ferramenta_observada' => 'codex',
      'versao_codex' => prepared['version'],
      'versao_dcg' => live.dig('dcg', 'versao_observada'),
      'adapter_observado' => plan['adaptador_selecionado'].to_s,
      'agentes_observados' => spawn_result['processos_iniciados'].to_i > 1 ? spawn_result['processos_iniciados'] : spawn_result['processos_iniciados'].to_i.clamp(0, 1),
      'writers_observados' => 1,
      'processos_iniciados' => spawn_result['processos_iniciados'],
      'comandos_catalogo_executados' => false,
      'processo_codex_iniciado' => spawn_started,
      'rede_observada' => false,
      'subdelegacao_observada' => false,
      'branch_observada' => snap['branch'],
      'worktree_observada' => snap['worktree_realpath'],
      'head_inicial' => snap['head'],
      'head_final' => after['head_final'],
      'arquivos_modificados' => after['arquivos_modificados'],
      'arquivos_untracked' => after['arquivos_untracked'],
      'arquivos_fora_escopo' => after['violacoes_escopo'],
      'arquivos_protegidos_alterados' => after['arquivos_protegidos_alterados'],
      'commit_criado' => after['commit_criado'],
      'refs_alteradas' => after['refs_alteradas'],
      'timeout_observado' => spawn_result['timeout'],
      'exit_code' => spawn_result['exit_code'],
      'sinal' => spawn_result['sinal'],
      'duracao_ms' => spawn_result['duracao_ms'],
      'stdout_sha256' => spawn_result['stdout_sha256'],
      'stderr_sha256' => spawn_result['stderr_sha256'],
      'stdout_truncado' => spawn_result['stdout_truncado'],
      'stderr_truncado' => spawn_result['stderr_truncado'],
      'status_final' => status
    )
    observed_sha = AgentRunComparator.canonical_hash(observed)
    comparacao = AgentRunComparator.compare(planned, observed)

    if comparacao['status'] == 'violacao' && status == 'success'
      status = 'denied'
    end

    t_end = begin
      Time.parse(spawn_result['fim'].to_s)
    rescue StandardError
      Time.now.utc
    end
    AgentTaskLedger.finalize_from_run!(
      ledger,
      comparison_status: comparacao['status'],
      run_status: status,
      spawn_started: spawn_started,
      at: t_end
    )

    negacoes = after['negacoes'].map { |n| "#{n['codigo']}: #{n['mensagem']}" }
    comparacao['itens'].select { |i| i['resultado'] == 'violacao' }.each do |i|
      code = i['codigo'] || 'OBSERVED_VIOLATION'
      line = "#{code}: #{i['mensagem']}"
      negacoes << line unless negacoes.include?(line)
    end

    avisos = [
      'REPORT_IS_NOT_CREDENTIAL',
      'EXTERNAL_SAFETY_REPORT_NOT_AUTHORIZATION',
      'NO_MERGE_PUSH_DEPLOY',
      'CODEX_SUBSTITUI_EXECUCAO_DOS_COMANDOS'
    ]
    comparacao['itens'].select { |i| i['resultado'] == 'desvio' }.each do |i|
      avisos << (i['codigo'] || 'DESVIO')
    end

    handoff = AgentTaskLedger.build_handoff(
      missao_id: card['id'],
      task_id: ledger.first['task_id'],
      run_status: status,
      comparison: comparacao,
      arquivos_modificados: after['arquivos_modificados'],
      avisos: avisos,
      violacoes: negacoes
    )

    build_observed_report(
      base: {
        'versao' => 1,
        'missao_id' => card['id'],
        'plan_hash' => planned['plan_hash'],
        'safety_report_hash' => external_hash || live['relatorio_sha256'],
        'prompt_sha256' => prompt_sha,
        'planned_snapshot' => planned,
        'planned_snapshot_sha256' => planned_sha,
        'observed_snapshot' => observed,
        'observed_snapshot_sha256' => observed_sha,
        'comparacao' => comparacao,
        'task_ledger' => ledger,
        'handoff' => handoff,
        'modo' => 'agent-runtime',
        'status' => status,
        'inicio' => spawn_result['inicio'],
        'fim' => spawn_result['fim'],
        'duracao_ms' => spawn_result['duracao_ms'],
        'comandos' => validated['commands'].map do |id|
          {
            'id' => id,
            'argv' => (begin
                        AgentCommandGuard.resolve_argv!(catalog, id)
                      rescue StandardError
                        [id]
                      end),
            'executado' => false,
            'exit_code' => nil,
            'timeout' => false,
            'stdout_sha256' => Digest::SHA256.hexdigest(''),
            'stderr_sha256' => Digest::SHA256.hexdigest(''),
            'stdout_truncado' => false,
            'stderr_truncado' => false
          }
        end,
        'negacoes' => negacoes,
        'avisos' => avisos.uniq,
        'evidencias' => [
          'three-key activation',
          'live preflight',
          'argv sem shell',
          'ambiente sanitizado',
          'escopo observado',
          'codex substitui execução direta dos comandos do catálogo',
          'planejado-versus-observado',
          'task-ledger-1',
          'handoff-humano'
        ],
        'runtime' => {
          'motor' => 'codex',
          'codex_version' => prepared['version'],
          'dcg_version' => live.dig('dcg', 'versao_observada'),
          'worktree' => snap['worktree_realpath'],
          'branch' => snap['branch'],
          'head_inicial' => snap['head'],
          'head_final' => after['head_final'],
          'agente_planejado' => 1,
          'agente_observado' => spawn_result['processos_iniciados'],
          'writers_planejados' => 1,
          'processos_iniciados' => spawn_result['processos_iniciados'],
          'processo_codex_iniciado' => spawn_started,
          'comandos_catalogo_executados' => false,
          'timeout' => spawn_result['timeout'],
          'exit_code' => spawn_result['exit_code'],
          'sinal' => spawn_result['sinal'],
          'stdout_sha256' => spawn_result['stdout_sha256'],
          'stderr_sha256' => spawn_result['stderr_sha256'],
          'stdout_truncado' => spawn_result['stdout_truncado'],
          'stderr_truncado' => spawn_result['stderr_truncado'],
          'arquivos_permitidos' => write_scope,
          'arquivos_modificados' => after['arquivos_modificados'],
          'violacoes_escopo' => after['violacoes_escopo'],
          'arquivos_protegidos_alterados' => after['arquivos_protegidos_alterados'],
          'argv' => spawn_result['argv']
        }
      }
    )
  end
end
