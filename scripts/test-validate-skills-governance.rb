#!/usr/bin/env ruby
require 'tmpdir'
require 'fileutils'
require 'yaml'
require 'json'
require 'digest'
require_relative './validate-skills-governance'

ROOT = File.expand_path('..', __dir__)

def sh!(cmd, chdir: nil)
  ok = system(cmd, chdir: chdir, out: File::NULL, err: File::NULL)
  raise "command failed: #{cmd}" unless ok
end

def write(path, content)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, content)
end

def deep_copy(value)
  Marshal.load(Marshal.dump(value))
end

def base_fixture(dir)
  write(File.join(dir, 'skills-lock.json'), JSON.pretty_generate({ 'version' => 1, 'skills' => {} }) + "\n")
  write(File.join(dir, '.agents/skills/README.md'), "skills readme\n")
  write(File.join(dir, '.agents/skills/politica-seguranca.md'), "policy\n")
  write(File.join(dir, '.agents/papeis/README.md'), "papeis\n")
  write(File.join(dir, 'AGENTS.md'), "agents\n")
  write(File.join(dir, 'docs/SKILLS-GOVERNANCE.md'), "skills governance\n")
  write(File.join(dir, '.ruby-version'), "3.3.7\n")
  write(File.join(dir, '.github/workflows/ci.yml'), <<~YAML)
    name: CI
    jobs:
      skills-governance:
        steps:
          - uses: ruby/setup-ruby@v1
            with:
              ruby-version: '3.3.7'
      agent-orchestration:
        steps:
          - uses: ruby/setup-ruby@v1
            with:
              ruby-version: '3.3.7'
  YAML
  write(File.join(dir, '.agents/skills/foo/SKILL.md'), "---\nname: foo\ndescription: test\n---\nfoo\n")
  write(File.join(dir, 'scripts/run-agent-mission.rb'), "runner\n")
  write(File.join(dir, 'scripts/validate-agent-execution.rb'), "validator\n")
  write(File.join(dir, 'scripts/test-agent-execution.rb'), "tests\n")
  hash = Digest::SHA256.file(File.join(dir, '.agents/skills/foo/SKILL.md')).hexdigest
  registry = {
    'versao' => 1,
    'skills' => [
      {
        'id' => 'foo', 'nome' => 'foo', 'descricao' => 'desc', 'tipo' => 'skill', 'selecionavel_por_missao' => true,
        'status' => 'aprovada-com-restricoes', 'origem' => 'repo-local', 'escopo' => 'local', 'caminho' => '.agents/skills/foo/SKILL.md',
        'ferramentas_compativeis' => ['codex'], 'papeis_permitidos' => ['executor-escopo'], 'tecnologias' => ['git'], 'versao' => '1',
        'hash' => hash, 'possui_scripts' => false, 'acesso_rede' => false, 'pode_escrever' => false, 'pode_executar_shell' => false,
        'pode_delegar' => false, 'riscos' => [], 'restricoes' => [], 'validacao' => 'ok', 'rollback' => 'revert'
      }
    ]
  }
  write(File.join(dir, '.agents/skills/registry.yaml'), registry.to_yaml)
  compat = { 'ferramentas' => { 'codex' => {}, 'claude-code' => {}, 'cursor' => {}, 'opencode' => {}, 'cline' => {} } }
  write(File.join(dir, '.agents/skills/compatibilidade.yaml'), compat.to_yaml)
end

def with_repo
  Dir.mktmpdir('skills-gov-test') do |dir|
    base_fixture(dir)
    sh!('git init -b main', chdir: dir)
    sh!('git config user.email test@example.com', chdir: dir)
    sh!('git config user.name test', chdir: dir)
    sh!('git add .', chdir: dir)
    sh!('git commit -m init', chdir: dir)
    sh!('git remote add origin .', chdir: dir)
    yield dir
  end
end

def pass!(label)
  puts "PASS #{label}"
end

def expect_validation_error(label, expected_message)
  begin
    yield
  rescue RuntimeError => error
    unless expected_message === error.message
      raise "#{label}: unexpected error: #{error.message.inspect}"
    end

    puts "PASS #{label} rejected with expected message"
    return
  rescue StandardError => error
    raise "#{label}: unexpected exception #{error.class}: #{error.message}"
  end

  raise "#{label}: expected validation error, but validation succeeded"
end

tests = []

with_repo do |dir|
  SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main')
  pass!('positive validation')
  tests << 'positive-pass'
end

begin
  expect_validation_error('helper-self-test', /expected validation error/) do
    # no-op on purpose
  end
  raise 'helper-self-test: helper accepted validation success'
rescue RuntimeError => error
  raise unless error.message.include?('expected validation error')
  pass!('helper self-test detects validation success as failure')
  tests << 'helper-self-test'
end

with_repo do |dir|
  FileUtils.rm_f(File.join(dir, '.ruby-version'))
  expect_validation_error('missing-ruby-version', /missing \.ruby-version/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'missing-ruby-version'
end

with_repo do |dir|
  write(File.join(dir, '.ruby-version'), "2.6.10\n")
  expect_validation_error('ruby-26-rejected', /Ruby 3\.3\.x/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'ruby-26-rejected'
end

with_repo do |dir|
  write(File.join(dir, '.ruby-version'), "3.3.7\n")
  ci = YAML.safe_load(File.read(File.join(dir, '.github/workflows/ci.yml')), aliases: false)
  ci['jobs']['skills-governance']['steps'].last['with']['ruby-version'] = '3.3.6'
  write(File.join(dir, '.github/workflows/ci.yml'), ci.to_yaml)
  expect_validation_error('skills-governance-ruby-divergence', /Skills Governance must use Ruby 3\.3\.7/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'skills-governance-ruby-divergence'
end

with_repo do |dir|
  ci = YAML.safe_load(File.read(File.join(dir, '.github/workflows/ci.yml')), aliases: false)
  ci['jobs']['agent-orchestration']['steps'].last['with']['ruby-version'] = '2.6.10'
  write(File.join(dir, '.github/workflows/ci.yml'), ci.to_yaml)
  expect_validation_error('agent-orchestration-ruby-divergence', /Agent Orchestration must use Ruby 3\.3\.7/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'agent-orchestration-ruby-divergence'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  dup = deep_copy(reg['skills'].first)
  dup['caminho'] = '.agents/skills/foo2/SKILL.md'
  write(File.join(dir, '.agents/skills/foo2/SKILL.md'), File.read(File.join(dir, '.agents/skills/foo/SKILL.md')))
  dup['hash'] = Digest::SHA256.file(File.join(dir, '.agents/skills/foo2/SKILL.md')).hexdigest
  reg['skills'] << dup
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('duplicate-id', /duplicate skill id/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'duplicate-id'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  dup = deep_copy(reg['skills'].first)
  dup['id'] = 'bar'
  reg['skills'] << dup
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('duplicate-path', /duplicate skill path/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'duplicate-path'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['hash'] = '0' * 64
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('hash-mismatch', /hash mismatch/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'hash-mismatch'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['tipo'] = 'fluxo'
  reg['skills'].first['selecionavel_por_missao'] = true
  reg['skills'].first['papeis_permitidos'] = []
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('flow-selectable', /flow cannot be selectable/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'flow-selectable'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['tipo'] = 'fluxo'
  reg['skills'].first['selecionavel_por_missao'] = false
  reg['skills'].first['papeis_permitidos'] = ['executor-escopo']
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('flow-role', /flow cannot have allowed roles/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'flow-role'
end

%w[validador-entrega revisor-contratos].each do |role|
  with_repo do |dir|
    reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
    reg['skills'].first['pode_executar_shell'] = true
    reg['skills'].first['papeis_permitidos'] = [role]
    write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
    expect_validation_error("mutating-#{role}", /mutating or shell-capable skill mapped to forbidden role/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
    tests << "mutating-#{role}"
  end
end

with_repo do |dir|
  sh!('git checkout -b feature/test-forbidden-file', chdir: dir)
  write(File.join(dir, 'forbidden.txt'), 'oops')
  sh!('git add forbidden.txt', chdir: dir)
  sh!('git commit -m forbidden', chdir: dir)
  expect_validation_error('forbidden-file', /forbidden changed files/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'forbidden-file'
end

{
  'generic-scripts-blocked' => 'scripts/evil.rb',
  'generic-docs-blocked' => 'docs/evil.md',
  'generic-github-blocked' => '.github/evil.yml',
  'generic-agents-blocked' => '.agents/evil.md'
}.each do |label, path|
  with_repo do |dir|
    sh!("git checkout -b feature/#{label}", chdir: dir)
    write(File.join(dir, path), 'oops')
    sh!("git add #{path}", chdir: dir)
    sh!("git commit -m #{label}", chdir: dir)
    expect_validation_error(label, /forbidden changed files/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
    tests << label
  end
end

with_repo do |dir|
  sh!('git branch -m main trunk', chdir: dir)
  sh!('git remote remove origin', chdir: dir)
  expect_validation_error('missing-base', /git diff failed — cannot verify changed-file policy/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'missing-base') }
  tests << 'missing-base'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['status'] = 'INVALID'
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('invalid-status', /invalid status/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'invalid-status'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['caminho'] = nil
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('nil-path', /skill caminho must be a non-empty string/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'nil-path'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['caminho'] = ''
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('empty-path', /skill caminho must be a non-empty string/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'empty-path'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['caminho'] = '.agents/skills/missing/SKILL.md'
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('missing-path', /missing path/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'missing-path'
end

with_repo do |dir|
  FileUtils.mkdir_p(File.join(dir, '.agents/skills/foo-dir'))
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['caminho'] = '.agents/skills/foo-dir'
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('directory-path', /path is not a regular file/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'directory-path'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['pode_delegar'] = true
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_validation_error('delegation-true', /skill cannot permit delegation/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'delegation-true'
end

%w[selecionavel_por_missao possui_scripts acesso_rede pode_escrever pode_executar_shell pode_delegar].each do |field|
  with_repo do |dir|
    reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
    reg['skills'].first[field] = 'true'
    write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
    expect_validation_error("#{field}-string", /#{Regexp.escape(field)} must be boolean/) { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
    tests << "#{field}-string"
  end
end

with_repo do |dir|
  validator_copy = File.join(dir, 'validate-copy.rb')
  original = File.read(File.join(ROOT, 'scripts/validate-skills-governance.rb'))
  weakened = original.sub('fail!("duplicate skill path #{caminho}") unless paths.add?(caminho)', 'paths.add?(caminho)')
  write(validator_copy, weakened)
  helper = <<~RUBY
    require_relative #{validator_copy.inspect}
    begin
      reg = YAML.safe_load(File.read(File.join(#{dir.inspect}, '.agents/skills/registry.yaml')), aliases: false)
      dup = Marshal.load(Marshal.dump(reg['skills'].first))
      dup['id'] = 'bar'
      reg['skills'] << dup
      File.write(File.join(#{dir.inspect}, '.agents/skills/registry.yaml'), reg.to_yaml)
      expect_validation_error = lambda do |label, expected_message, &block|
        begin
          block.call
        rescue RuntimeError => error
          unless expected_message === error.message
            raise "unexpected: \#{error.message}"
          end
          exit 0
        end
        raise "\#{label}: expected validation error, but validation succeeded"
      end
      expect_validation_error.call('regression-proof', /duplicate skill path/) do
        SkillsGovernanceValidator.validate!(root: #{dir.inspect}, base_ref: 'main')
      end
    rescue => e
      warn e.message
      exit 1
    end
  RUBY
  regression = File.join(dir, 'regression-proof.rb')
  write(regression, helper)
  ok = system('ruby', regression, out: File::NULL, err: File::NULL)
  raise 'regression-proof: helper failed to detect weakened validator' if ok
  pass!('regression-proof detects weakened duplicate-path rule')
  tests << 'regression-proof'
end

puts "OK #{tests.length} tests"
