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

def base_fixture(dir)
  write(File.join(dir, 'skills-lock.json'), JSON.pretty_generate({ 'version' => 1, 'skills' => {} }) + "\n")
  write(File.join(dir, '.agents/skills/README.md'), "skills readme\n")
  write(File.join(dir, '.agents/skills/politica-seguranca.md'), "policy\n")
  write(File.join(dir, '.agents/papeis/README.md'), "papeis\n")
  write(File.join(dir, 'AGENTS.md'), "agents\n")
  write(File.join(dir, 'docs/SKILLS-GOVERNANCE.md'), "skills governance\n")
  write(File.join(dir, '.github/workflows/ci.yml'), "name: CI\n")
  write(File.join(dir, '.agents/skills/foo/SKILL.md'), "---\nname: foo\ndescription: test\n---\nfoo\n")
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

def expect_fail(label)
  yield
  raise "expected failure for #{label}"
rescue RuntimeError
  true
end

tests = []

with_repo do |dir|
  SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main')
  tests << 'positive-pass'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  dup = reg['skills'].first.dup
  dup['caminho'] = '.agents/skills/foo2/SKILL.md'
  write(File.join(dir, '.agents/skills/foo2/SKILL.md'), File.read(File.join(dir, '.agents/skills/foo/SKILL.md')))
  dup['hash'] = Digest::SHA256.file(File.join(dir, '.agents/skills/foo2/SKILL.md')).hexdigest
  reg['skills'] << dup
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('duplicate id') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'duplicate-id'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  dup = reg['skills'].first.dup
  dup['id'] = 'bar'
  reg['skills'] << dup
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('duplicate path') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'duplicate-path'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['hash'] = '0' * 64
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('hash mismatch') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'hash-mismatch'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['tipo'] = 'fluxo'
  reg['skills'].first['selecionavel_por_missao'] = true
  reg['skills'].first['papeis_permitidos'] = []
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('flow selectable') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'flow-selectable'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['tipo'] = 'fluxo'
  reg['skills'].first['selecionavel_por_missao'] = false
  reg['skills'].first['papeis_permitidos'] = ['executor-escopo']
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('flow with role') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'flow-role'
end

%w[validador-entrega revisor-contratos].each do |role|
  with_repo do |dir|
    reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
    reg['skills'].first['pode_executar_shell'] = true
    reg['skills'].first['papeis_permitidos'] = [role]
    write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
    expect_fail("mutating role #{role}") { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
    tests << "mutating-#{role}"
  end
end

with_repo do |dir|
  write(File.join(dir, 'forbidden.txt'), 'oops')
  sh!('git add forbidden.txt', chdir: dir)
  expect_fail('forbidden changed file') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'forbidden-file'
end

with_repo do |dir|
  expect_fail('unresolvable base') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'missing-base') }
  tests << 'missing-base'
end

with_repo do |dir|
  reg = YAML.safe_load(File.read(File.join(dir, '.agents/skills/registry.yaml')), aliases: false)
  reg['skills'].first['status'] = 'INVALID'
  write(File.join(dir, '.agents/skills/registry.yaml'), reg.to_yaml)
  expect_fail('invalid status') { SkillsGovernanceValidator.validate!(root: dir, base_ref: 'main') }
  tests << 'invalid-status'
end

puts "OK #{tests.length} tests: #{tests.join(', ')}"
