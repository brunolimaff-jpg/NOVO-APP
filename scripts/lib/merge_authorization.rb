# frozen_string_literal: true

# Merge authorization — barreira fail-closed para merge.
# A autorização vem exclusivamente da mensagem humana atual, nos formatos:
#   MERGE
#   MERGE PR <numero>
# Nada mais é aceito como autorização.

module MergeAuthorization
  class Denial < StandardError
    attr_reader :code
    def initialize(code, message)
      @code = code
      super(message)
    end
  end

  Result = Struct.new(:authorized, :code, :pr_number, keyword_init: true) do
    def authorized?; authorized == true; end
  end

  module_function

  def authorized?(human_message:, expected_pr: nil)
    msg = human_message.to_s.strip
    return Result.new(authorized: false, code: 'MERGE_NOT_AUTHORIZED', pr_number: nil) if msg.empty?

    case msg
    when /\AMERGE\z/
      return Result.new(authorized: true, code: nil, pr_number: nil)
    when /\AMERGE PR ([1-9][0-9]*)\z/
      pr = Regexp.last_match(1).to_i
      if expected_pr && pr != expected_pr
        return Result.new(authorized: false, code: 'MERGE_PR_MISMATCH', pr_number: pr)
      end
      return Result.new(authorized: true, code: nil, pr_number: pr)
    else
      return Result.new(authorized: false, code: 'MERGE_NOT_AUTHORIZED', pr_number: nil)
    end
  end
end
