# frozen_string_literal: true

require 'digest'

module AgentEvidenceSanitizer
  MAX_FIELD_BYTES = 16 * 1024
  SECRET_KEY_RE = /\A(?:authorization|bearer|token|(?:access|refresh|api|auth|id)[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key|secret(?:[_-].*)?|password(?:[_-].*)?|credential(?:[_-].*)?|cookie(?:[_-].*)?)\z/i
  SECRET_ASSIGNMENT_RE = /(?:authorization|bearer|token|(?:access|refresh|api|auth|id)[_-]?token|api[_-]?key|client[_-]?secret|private[_-]?key|secret(?:[_-]\w+)?|password(?:[_-]\w+)?|credential(?:[_-]\w+)?|cookie(?:[_-]\w+)?)[\s]*[=:]\s*/i
  PATH_RE = %r{/(?:Users|home)/[^/]+}

  module_function

  def sanitize(value, key = nil, context = {})
    if value.is_a?(Hash)
      value.each_with_object({}) do |(k, v), out|
        out[k.to_s] = SECRET_KEY_RE.match?(k.to_s) ? '[REDACTED]' : sanitize(v, k.to_s, context)
      end
    elsif value.is_a?(Array)
      value.map { |v| sanitize(v, key, context) }
    elsif value.is_a?(String)
      sanitize_string(value, key, context)
    else
      value
    end
  rescue StandardError
    { 'availability' => 'unavailable', 'reason' => 'sanitization_failed', 'sanitized' => true,
      'sanitization_failed' => true }
  end

  def sanitize_string(value, key = nil, context = {}, max_bytes: MAX_FIELD_BYTES)
    raw = value.to_s
    return '[REDACTED]' if key && SECRET_KEY_RE.match?(key.to_s)

    text = raw.gsub(/(authorization\s*:\s*(?:Bearer|Basic)\s+|authorization\s*:\s*|Bearer\s+|Basic\s+|#{SECRET_ASSIGNMENT_RE})[^\s,;]+/i) { "#{$1}[REDACTED]" }
    context.each { |name, path| text = text.gsub(path.to_s, "<#{name.to_s.upcase}>") unless path.to_s.empty? }
    text = text.gsub(PATH_RE, '<HOME>')
    text = text.gsub(%r{https?://([^?\s#]+)\?[^\s#]*}) { "https://#{$1}/[REDACTED_QUERY]" }
    text = text.encode('UTF-8', invalid: :replace, undef: :replace, replace: '�')
    text = text.byteslice(0, max_bytes).to_s
    text.force_encoding(Encoding::UTF_8).scrub
  rescue StandardError
    '[REDACTED]'
  end

  def invalid_jsonl_record(sequence, line, reason)
    raw = line.to_s.b
    {
      'sequence' => sequence,
      'type' => 'invalid_jsonl_line',
      'original_sha256' => Digest::SHA256.hexdigest(raw),
      'observed_bytes' => raw.bytesize,
      'original' => '[REDACTED]',
      'content_sanitized' => '[REDACTED]',
      'reason' => sanitize_string(reason.to_s),
      'sanitized' => true
    }
  end
end
