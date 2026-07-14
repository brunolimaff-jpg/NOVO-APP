#!/usr/bin/env ruby
# frozen_string_literal: true

# Static validation of runtime-safety policy + schema (no network, no DCG install).

require 'json'
require 'yaml'
require 'fileutils'
require_relative './runtime-safety-preflight'
require_relative './plan-agent-mission'

module RuntimeSafetyValidator
  ROOT = File.expand_path('..', __dir__)
  POLICY = File.join(ROOT, '.agents/seguranca/runtime-safety.yaml')
  SCHEMA = File.join(ROOT, '.agents/seguranca/contrato-runtime-safety.schema.json')
  CONFIG = File.join(ROOT, '.agents/seguranca/.dcg.toml')
  FIXTURE_DCG = File.join(ROOT, '.agents/seguranca/fixtures/fake-dcg')

  module_function

  def assert!(cond, msg)
    raise msg unless cond
  end

  def run!
    policy = YAML.safe_load(File.read(POLICY), aliases: false)
    assert!(policy['ferramenta'] == 'destructive-command-guard', 'ferramenta != destructive-command-guard')
    assert!(policy['versao_esperada'] == '0.6.6', 'versão pinada deve ser 0.6.6')
    assert!(policy['fail_closed'] == true, 'fail_closed obrigatório')
    assert!(Array(policy['bypass_env_proibidas']).include?('DCG_BYPASS'), 'DCG_BYPASS obrigatório')
    assert!(Array(policy['bypass_env_proibidas']).include?('DCG_DISABLE'), 'DCG_DISABLE obrigatório')
    assert!(policy['origem_oficial'].include?('Dicklesworthstone/destructive_command_guard'), 'origem oficial')
    assert!(policy['asset_checksums_esperados'].is_a?(Hash) && !policy['asset_checksums_esperados'].empty?, 'asset checksums')
    assert!(policy['binary_checksums_esperados'].is_a?(Hash) && !policy['binary_checksums_esperados'].empty?, 'binary checksums')
    arm = 'aarch64-apple-darwin'
    assert!(policy['asset_checksums_esperados'][arm] != policy['binary_checksums_esperados'][arm], 'asset≠binary')
    assert!(policy.dig('proveniencia_binary_checksum', 'binary_sha256') == policy['binary_checksums_esperados'][arm], 'proveniência')
    assert!(File.file?(CONFIG), 'config project-local ausente')
    assert!(File.file?(FIXTURE_DCG), 'fixture fake-dcg ausente')
    FileUtils.chmod('+x', FIXTURE_DCG)

    schema = JSON.parse(File.read(SCHEMA))
    assert!(schema['additionalProperties'] == false, 'schema deve ter additionalProperties:false')
    assert!(schema.dig('properties', 'status', 'enum') == %w[ready denied unavailable], 'status enum')

    # Validate schema keywords against MissionPlanner subset
    MissionPlanner.send(:validate_schema_keywords!, schema, '$')

    # Fixture ready report must validate
    report = RuntimeSafetyPreflight.build_report(mode: 'fixture', timestamp: Time.now.utc)
    assert!(report['status'] == 'ready', "fixture deve ser ready, got #{report['status']} neg=#{report['negacoes']}")
    RuntimeSafetyPreflight.validate_report!(report)

    puts 'PASS validate-runtime-safety'
  end
end

RuntimeSafetyValidator.run! if $PROGRAM_NAME == __FILE__
