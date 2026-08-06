#!/usr/bin/env ruby
# frozen_string_literal: true

# validate-no-gemini — gate permanente contra qualquer termo Gemini no código ativo.
#
# Baseado em caminhos e categorias (não em grep indiscriminado no repositório
# inteiro): escaneia código de produção, APIs, serviços, componentes, config,
# testes, E2E, scripts e manifests. Documentação histórica (docs/, *.md fora
# dos diretórios escaneados) está fora do alcance — não é runtime.
#
# Exceções explícitas e justificadas:
#   - services/apiConfig.ts: 'generativelanguage.googleapis.com' na lista
#     FAKE_DOMAINS (anti-alucinação de URLs — NÃO é destino de runtime).
#   - scripts/ingestPdfDocs.ts: 'GEMINI_OCR_MODEL' apenas como nota documental
#     do OCR descontinuado (fail-closed; o script nunca mais chama provedor).
#   - utils/seniorLinks.ts e tests/utils/seniorLinks.test.ts: 'googleSearch'
#     refere-se à correção de URLs de busca do Google (google.com/search),
#     não à ferramenta de grounding Gemini.

require 'find'

ROOT = File.expand_path('..', __dir__)
SCAN_DIRS = %w[api services utils features components config lib prompts tests tests-e2e scripts].freeze
SCAN_FILES = %w[App.tsx index.tsx types.ts constants.ts vercel.json .env.example package.json].freeze

BLOCKED_TERMS = [
  '@google/genai',
  '@langchain/google-genai',
  'GoogleGenAI',
  '/api/gemini',
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_FALLBACK',
  'VITE_GEMINI_PROXY_URL',
  'createCachedContent',
  'deleteCachedContent',
  'googleSearch',
  'generativelanguage.googleapis.com',
  'gemini-embedding-001',
  'gemini_grounding',
  'performGeminiSearch',
  'GEMINI_OCR_MODEL',
  'gemini',
].freeze

EXCEPTIONS = {
  'services/apiConfig.ts' => ['generativelanguage.googleapis.com'],
  'scripts/ingestPdfDocs.ts' => ['GEMINI_OCR_MODEL', 'gemini'],
  'utils/seniorLinks.ts' => ['googleSearch'],
  'tests/utils/seniorLinks.test.ts' => ['googleSearch'],
  # Auto-referenciais: o gate lista os termos que bloqueia; o nome do npm
  # script contém a palavra; resolve-pr-threads.py menciona o bot de review
  # externo 'gemini-code-assist' (não é runtime do app).
  # tests/architecture/bru7-ownership-contract.test.ts é um teste estrutural
  # que PROVA a ausência do termo no código ativo (a substring aparece na
  # própria verificação, não em runtime).
  'scripts/validate-no-gemini.rb' => BLOCKED_TERMS,
  'package.json' => ['gemini'],
  'scripts/resolve-pr-threads.py' => ['gemini'],
  'tests/architecture/bru7-ownership-contract.test.ts' => ['gemini'],
}.freeze

violations = []

SCAN_DIRS.each do |dir|
  full = File.join(ROOT, dir)
  next unless File.directory?(full)

  Find.find(full) do |path|
    next unless File.file?(path)

    rel = path.delete_prefix("#{ROOT}/")
    allowed = EXCEPTIONS.fetch(rel, [])
    content = File.read(path, encoding: 'utf-8', invalid: :replace)
    BLOCKED_TERMS.each do |term|
      next if allowed.include?(term)

      violations << "#{rel}: termo bloqueado '#{term}'" if content.downcase.include?(term.downcase)
    end
  end
end

SCAN_FILES.each do |file|
  path = File.join(ROOT, file)
  next unless File.file?(path)

  allowed = EXCEPTIONS.fetch(file, [])
  content = File.read(path, encoding: 'utf-8', invalid: :replace)
  BLOCKED_TERMS.each do |term|
    next if allowed.include?(term)

    violations << "#{file}: termo bloqueado '#{term}'" if content.downcase.include?(term.downcase)
  end
end

if violations.empty?
  puts 'validate-no-gemini: PASS — nenhum termo Gemini no código ativo.'
  exit 0
end

puts 'validate-no-gemini: FAIL'
violations.uniq.each { |v| puts "  - #{v}" }
puts 'Exceções permitidas: services/apiConfig.ts (FAKE_DOMAINS), scripts/ingestPdfDocs.ts (nota OCR), utils/seniorLinks.* (links de busca Google).'
exit 1
