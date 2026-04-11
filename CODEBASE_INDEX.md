# Codebase Index
> 2026-04-10 · 5271 files · ~13.3M tokens total
>
> **How to use:** Read this file first. Navigate to the exact file you need,
> then read only that file. Do not read entire directories.

## Source

**(root)/**
- `App.tsx` — resolveModuleNamesForMissingDimensions, buildPortaReconciliationPrompt
- `constants.ts` — APP_NAME, APP_VERSION, DEFAULT_MODE, NOME_VENDEDOR_PLACEHOLDER, MODE_LABELS, BASE_SYSTEM_PROMPT, ChatMode
- `eslint.config.js`
- `index.tsx`
- `playwright.config.ts`
- `postcss.config.js`
- `tailwind.config.js`
- `test-extract.js`
- `types.ts` — PORTA_WEIGHTS, PORTA_FLAG_PENALTIES, DEEP_DIVE_SOURCES, CRM_STAGE_LABELS, RADAR_CATEGORY_LABELS, RADAR_CATEGORY_ICONS, RADAR_CATEGORY_COLORS, BRASIL_UFS +2
- `vite.config.ts`
- `vitest.config.ts`

**.agent\skills\algorithmic-art\templates/**
- `generator_template.js` — ═══════════════════════════════════════════════════════════════════════════

**.agent\skills\api-design-principles\assets/**
- `rest-api-template.py` — http_exception_handler, list_users, create_user, get_user, update_user, delete_user, UserStatus, UserBase +2

**.agent\skills\api-patterns\scripts/**
- `api_validator.py` — find_api_files, check_openapi_spec, check_api_code, main

**.agent\skills\app-store-optimization/**
- `ab_test_planner.py` — plan_ab_test, ABTestPlanner
- `aso_scorer.py` — calculate_aso_score, ASOScorer
- `competitor_analyzer.py` — analyze_competitor_set, CompetitorAnalyzer
- `keyword_analyzer.py` — analyze_keyword_set, KeywordAnalyzer
- `launch_checklist.py` — generate_launch_checklist, LaunchChecklistGenerator
- `localization_helper.py` — plan_localization_strategy, LocalizationHelper
- `metadata_optimizer.py` — optimize_app_metadata, MetadataOptimizer
- `review_analyzer.py` — analyze_reviews, ReviewAnalyzer

**.agent\skills\audio-transcriber\scripts/**
- `transcribe.py` — detect_cli_tool, invoke_prompt_engineer, handle_prompt_workflow, process_with_llm, transcribe_audio, save_outputs, main

**.agent\skills\bin/**
- `install.js`

**.agent\skills\claude-d3js-skill\assets/**
- `chart-template.jsx` — default:App
- `interactive-template.jsx` — default:App

**.agent\skills\content-creator\scripts/**
- `brand_voice_analyzer.py` — analyze_content, BrandVoiceAnalyzer
- `seo_optimizer.py` — optimize_content, SEOOptimizer

**.agent\skills\database-design\scripts/**
- `schema_validator.py` — find_schema_files, validate_prisma_schema, main

**.agent\skills\docx-official\ooxml\scripts/**
- `pack.py` — main, pack_document, validate_document, condense_xml
- `unpack.py`
- `validate.py` — main

**.agent\skills\docx-official\ooxml\scripts\validation/**
- `__init__.py`
- `base.py` — BaseSchemaValidator
- `docx.py` — DOCXSchemaValidator
- `pptx.py` — PPTXSchemaValidator
- `redlining.py` — RedliningValidator

**.agent\skills\docx-official\scripts/**
- `__init__.py`
- `document.py` — DocxXMLEditor, Document
- `utilities.py` — XMLEditor

**.agent\skills\dotnet-backend-patterns\assets/**
- `repository-template.cs`
- `service-template.cs`

**.agent\skills\geo-fundamentals\scripts/**
- `geo_checker.py` — is_page_file, find_web_pages, check_page, main

**.agent\skills\go-rod-master\examples/**
- `basic_scrape.go`
- `concurrent_pages.go`
- `request_hijacking.go`
- `stealth_page.go`

**.agent\skills\i18n-localization\scripts/**
- `i18n_checker.py` — find_locale_files, check_locale_completeness, flatten_keys, check_hardcoded_strings, main

**.agent\skills\last30days\scripts/**
- `last30days.py` — load_fixture, run_research, main, output_result

**.agent\skills\last30days\scripts\lib/**
- `__init__.py`
- `cache.py` — Caching utilities for last30days skill. · ensure_cache_dir, get_cache_key, get_cache_path, is_cache_valid, load_cache, get_cache_age_hours, load_cache_with_age, save_cache +2
- `dates.py` — Date utilities for last30days skill. · get_date_range, parse_date, timestamp_to_date, get_date_confidence, days_ago, recency_score
- `dedupe.py` — Near-duplicate detection for last30days skill. · normalize_text, get_ngrams, jaccard_similarity, get_item_text, find_duplicates, dedupe_items, dedupe_reddit, dedupe_x
- `env.py` — Environment and API key management for last30days skill. · load_env_file, get_config, config_exists, get_available_sources, get_missing_keys, validate_sources
- `http.py` — HTTP utilities for last30days skill (stdlib only). · log, request, get, post, get_reddit_json, HTTPError
- `models.py` — Model auto-selection for last30days skill. · parse_version, is_mainline_openai_model, select_openai_model, select_xai_model, get_models
- `normalize.py` — Normalization of raw API data to canonical schema. · filter_by_date_range, normalize_reddit_items, normalize_x_items, items_to_dicts
- `openai_reddit.py` — OpenAI Responses API client for Reddit discovery. · search_reddit, parse_reddit_response
- `reddit_enrich.py` — Reddit thread enrichment with real engagement metrics. · extract_reddit_path, fetch_thread_data, parse_thread_data, get_top_comments, extract_comment_insights, enrich_reddit_item
- `render.py` — Output rendering for last30days skill. · ensure_output_dir, render_compact, render_context_snippet, render_full_report, write_outputs, get_context_path
- `schema.py` — Data schemas for last30days skill. · create_report, Engagement, Comment, SubScores, RedditItem, XItem, WebSearchItem, Report
- `score.py` — Popularity-aware scoring for last30days skill. · log1p_safe, compute_reddit_engagement_raw, compute_x_engagement_raw, normalize_to_100, score_reddit_items, score_x_items, score_websearch_items, sort_items
- `ui.py` — Terminal UI utilities for last30days skill. · print_phase, Colors, Spinner, ProgressDisplay
- `websearch.py` — WebSearch module for last30days skill. · extract_date_from_url, extract_date_from_snippet, extract_date_signals, extract_domain, is_excluded_domain, parse_websearch_results, normalize_websearch_items, dedupe_websearch
- `xai_x.py` — xAI API client for X (Twitter) discovery. · search_x, parse_x_response

**.agent\skills\last30days\tests/**
- `__init__.py`
- `test_cache.py` — Tests for cache module. · TestGetCacheKey, TestCachePath, TestCacheValidity, TestModelCache
- `test_dates.py` — Tests for dates module. · TestGetDateRange, TestParseDate, TestTimestampToDate, TestGetDateConfidence, TestDaysAgo, TestRecencyScore
- `test_dedupe.py` — Tests for dedupe module. · TestNormalizeText, TestGetNgrams, TestJaccardSimilarity, TestFindDuplicates, TestDedupeItems
- `test_models.py` — Tests for models module. · TestParseVersion, TestIsMainlineOpenAIModel, TestSelectOpenAIModel, TestSelectXAIModel, TestGetModels
- `test_normalize.py` — Tests for normalize module. · TestNormalizeRedditItems, TestNormalizeXItems, TestItemsToDicts
- `test_render.py` — Tests for render module. · TestRenderCompact, TestRenderContextSnippet, TestRenderFullReport, TestGetContextPath
- `test_score.py` — Tests for score module. · TestLog1pSafe, TestComputeRedditEngagementRaw, TestComputeXEngagementRaw, TestNormalizeTo100, TestScoreRedditItems, TestScoreXItems, TestSortItems

**.agent\skills\lib/**
- `skill-utils.js`

**.agent\skills\lint-and-validate\scripts/**
- `lint_runner.py` — detect_project_type, run_linter, main
- `type_coverage.py` — check_typescript_coverage, check_python_coverage, main

**.agent\skills\loki-mode\benchmarks\results\2026-01-05-00-49-17\humaneval-solutions/**
- `0.py` — has_close_elements
- `1.py` — separate_paren_groups
- `10.py` — is_palindrome, make_palindrome
- `100.py` — make_a_pile
- `101.py` — words_string
- `102.py` — choose_num
- `103.py` — rounded_avg
- `104.py` — unique_digits
- `105.py` — by_length
- `106.py` — f
- `107.py` — even_odd_palindrome
- `108.py` — count_nums
- `109.py` — move_one_ball
- `11.py` — string_xor
- `110.py` — exchange
- `111.py` — histogram
- `112.py` — reverse_delete
- `113.py` — odd_count
- `114.py` — minSubArraySum
- `115.py` — max_fill
- `116.py` — sort_array
- `117.py` — select_words
- `118.py` — get_closest_vowel
- `119.py` — match_parens
- `12.py` — longest
- `120.py` — maximum
- `121.py` — solution
- `122.py` — add_elements
- `123.py` — get_odd_collatz
- `124.py` — valid_date
- `125.py` — split_words
- `126.py` — is_sorted
- `127.py` — intersection
- `128.py` — prod_signs
- `129.py` — minPath
- `13.py` — greatest_common_divisor
- `130.py` — tri
- `131.py` — digits
- `132.py` — is_nested
- `133.py` — sum_squares
- `134.py` — check_if_last_char_is_a_letter
- `135.py` — can_arrange
- `136.py` — largest_smallest_integers
- `137.py` — compare_one
- `138.py` — is_equal_to_sum_even
- `139.py` — special_factorial
- `14.py` — all_prefixes
- `140.py` — fix_spaces
- `141.py` — file_name_check
- `142.py` — sum_squares
- `143.py` — words_in_sentence
- `144.py` — simplify
- `145.py` — order_by_points
- `146.py` — specialFilter
- `147.py` — get_max_triples
- `148.py` — bf
- `149.py` — sorted_list_sum
- `15.py` — string_sequence
- `150.py` — x_or_y
- `151.py` — double_the_difference
- `152.py` — compare
- `153.py` — Strongest_Extension
- `154.py` — cycpattern_check
- `155.py` — even_odd_count
- `156.py` — int_to_mini_roman
- `157.py` — right_angle_triangle
- `158.py` — find_max
- `159.py` — eat
- `16.py` — count_distinct_characters
- `160.py` — do_algebra
- `161.py` — solve
- `162.py` — string_to_md5
- `163.py` — generate_integers
- `17.py` — parse_music
- `18.py` — how_many_times
- `19.py` — sort_numbers
- `2.py` — truncate_number
- `20.py` — find_closest_elements
- `21.py` — rescale_to_unit
- `22.py` — filter_integers
- `23.py` — strlen
- `24.py` — largest_divisor
- `25.py` — factorize
- `26.py` — remove_duplicates
- `27.py` — flip_case
- `28.py` — concatenate
- `29.py` — filter_by_prefix
- `3.py` — below_zero
- `30.py` — get_positive
- `31.py` — is_prime
- `32.py` — poly, find_zero
- `33.py` — sort_third
- `34.py` — unique
- `35.py` — max_element
- `36.py` — fizz_buzz
- `37.py` — sort_even
- `38.py` — decode_cyclic
- `39.py` — prime_fib
- `4.py` — mean_absolute_deviation
- `40.py` — triples_sum_to_zero
- `41.py` — car_race_collision
- `42.py` — incr_list
- `43.py` — pairs_sum_to_zero
- `44.py` — change_base
- `45.py` — triangle_area
- `46.py` — fib4
- `47.py` — median
- `48.py` — is_palindrome
- `49.py` — modp
- `5.py` — intersperse
- `50.py` — encode_shift, decode_shift
- `51.py` — remove_vowels
- `52.py` — below_threshold
- `53.py` — add
- `54.py` — same_chars
- `55.py` — fib
- `56.py` — correct_bracketing
- `57.py` — monotonic
- `58.py` — common
- `59.py` — largest_prime_factor
- `6.py` — parse_nested_parens
- `60.py` — sum_to_n
- `61.py` — correct_bracketing
- `62.py` — derivative
- `63.py` — fibfib
- `64.py` — vowels_count
- `65.py` — circular_shift
- `66.py` — digitSum
- `67.py` — fruit_distribution
- `68.py` — pluck
- `69.py` — search
- `7.py` — filter_by_substring
- `70.py` — strange_sort_list
- `71.py` — triangle_area
- `72.py` — will_it_fly
- `73.py` — smallest_change
- `74.py` — total_match
- `75.py` — is_multiply_prime
- `76.py` — is_simple_power
- `77.py` — iscube
- `78.py` — hex_key
- `79.py` — decimal_to_binary
- `8.py` — sum_product
- `80.py` — is_happy
- `81.py` — numerical_letter_grade
- `82.py` — prime_length
- `83.py` — starts_one_ends
- `84.py` — solve
- `85.py` — add
- `86.py` — anti_shuffle
- `87.py` — get_row
- `88.py` — sort_array
- `89.py` — encrypt
- `9.py` — rolling_max
- `90.py` — next_smallest
- `91.py` — is_bored
- `92.py` — any_int
- `93.py` — encode
- `94.py` — skjkasdkd
- `95.py` — check_dict_case
- `96.py` — count_up_to
- `97.py` — multiply
- `98.py` — count_upper
- `99.py` — closest_integer

**.agent\skills\loki-mode\benchmarks\results\humaneval-loki-solutions/**
- `0.py` — has_close_elements
- `1.py` — separate_paren_groups
- `10.py` — is_palindrome, make_palindrome
- `100.py` — make_a_pile
- `101.py` — words_string
- `102.py` — choose_num
- `103.py` — rounded_avg
- `104.py` — unique_digits
- `105.py` — by_length
- `106.py` — f
- `107.py` — even_odd_palindrome
- `108.py` — count_nums
- `109.py` — move_one_ball
- `11.py` — string_xor
- `110.py` — exchange
- `111.py` — histogram
- `112.py` — reverse_delete
- `113.py` — odd_count
- `114.py` — minSubArraySum
- `115.py` — max_fill
- `116.py` — sort_array
- `117.py` — select_words
- `118.py` — get_closest_vowel
- `119.py` — match_parens
- `12.py` — longest
- `120.py` — maximum
- `121.py` — solution
- `122.py` — add_elements
- `123.py` — get_odd_collatz
- `124.py` — valid_date
- `125.py` — split_words
- `126.py` — is_sorted
- `127.py` — intersection
- `128.py` — prod_signs
- `129.py` — minPath
- `13.py` — greatest_common_divisor
- `130.py` — tri
- `131.py` — digits
- `132.py` — is_nested
- `133.py` — sum_squares
- `134.py` — check_if_last_char_is_a_letter
- `135.py` — can_arrange
- `136.py` — largest_smallest_integers
- `137.py` — compare_one
- `138.py` — is_equal_to_sum_even
- `139.py` — special_factorial
- `14.py` — all_prefixes
- `140.py` — fix_spaces
- `141.py` — file_name_check
- `142.py` — sum_squares
- `143.py` — words_in_sentence
- `144.py` — simplify
- `145.py` — order_by_points
- `146.py` — specialFilter
- `147.py` — get_max_triples
- `148.py` — bf
- `149.py` — sorted_list_sum
- `15.py` — string_sequence
- `150.py` — x_or_y
- `151.py` — double_the_difference
- `152.py` — compare
- `153.py` — Strongest_Extension
- `154.py` — cycpattern_check
- `155.py` — even_odd_count
- `156.py` — int_to_mini_roman
- `157.py` — right_angle_triangle
- `158.py` — find_max
- `159.py` — eat
- `16.py` — count_distinct_characters
- `160.py` — do_algebra
- `161.py` — solve
- `162.py` — string_to_md5
- `163.py` — generate_integers
- `17.py` — parse_music
- `18.py` — how_many_times
- `19.py` — sort_numbers
- `2.py` — truncate_number
- `20.py` — find_closest_elements
- `21.py` — rescale_to_unit
- `22.py` — filter_integers
- `23.py` — strlen
- `24.py` — largest_divisor
- `25.py` — factorize
- `26.py` — remove_duplicates
- `27.py` — flip_case
- `28.py` — concatenate
- `29.py` — filter_by_prefix
- `3.py` — below_zero
- `30.py` — get_positive
- `31.py` — is_prime
- `32.py` — find_zero
- `33.py` — sort_third
- `34.py` — unique
- `35.py` — max_element
- `36.py` — fizz_buzz
- `37.py` — sort_even
- `38.py` — encode_cyclic, decode_cyclic
- `39.py` — prime_fib
- `4.py` — mean_absolute_deviation
- `40.py` — triples_sum_to_zero
- `41.py` — car_race_collision
- `42.py` — incr_list
- `43.py` — pairs_sum_to_zero
- `44.py` — change_base
- `45.py` — triangle_area
- `46.py` — fib4
- `47.py` — median
- `48.py` — is_palindrome
- `49.py` — modp
- `5.py` — intersperse
- `50.py` — decode_shift
- `51.py` — remove_vowels
- `52.py` — below_threshold
- `53.py` — add
- `54.py` — same_chars
- `55.py` — fib
- `56.py` — correct_bracketing
- `57.py` — monotonic
- `58.py` — common
- `59.py` — largest_prime_factor
- `6.py` — parse_nested_parens
- `60.py` — sum_to_n
- `61.py` — correct_bracketing
- `62.py` — derivative
- `63.py` — fibfib
- `64.py` — vowels_count
- `65.py` — circular_shift
- `66.py` — digitSum
- `67.py` — fruit_distribution
- `68.py` — pluck
- `69.py` — search
- `7.py` — filter_by_substring
- `70.py` — strange_sort_list
- `71.py` — triangle_area
- `72.py` — will_it_fly
- `73.py` — smallest_change
- `74.py` — total_match
- `75.py` — is_multiply_prime
- `76.py` — is_simple_power
- `77.py` — iscube
- `78.py` — hex_key
- `79.py` — decimal_to_binary
- `8.py` — sum_product
- `80.py` — is_happy
- `81.py` — numerical_letter_grade
- `82.py` — prime_length
- `83.py` — starts_one_ends
- `84.py` — solve
- `85.py` — add
- `86.py` — anti_shuffle
- `87.py` — get_row
- `88.py` — sort_array
- `89.py` — encrypt
- `9.py` — rolling_max
- `90.py` — next_smallest
- `91.py` — is_bored
- `92.py` — any_int
- `93.py` — encode
- `94.py` — skjkasdkd
- `95.py` — check_dict_case
- `96.py` — count_up_to
- `97.py` — multiply
- `98.py` — count_upper
- `99.py` — closest_integer

**.agent\skills\loki-mode\examples\todo-app-generated\backend\src/**
- `index.ts`

**.agent\skills\loki-mode\examples\todo-app-generated\backend\src\db/**
- `database.ts` — getDatabase, closeDatabase
- `db.ts` — initDatabase
- `index.ts`
- `migrations.ts` — runMigrations, initializeDatabase

**.agent\skills\loki-mode\examples\todo-app-generated\backend\src\routes/**
- `todos.ts`

**.agent\skills\loki-mode\examples\todo-app-generated\backend\src\types/**
- `index.ts` — Todo item types · Todo, ApiResponse, CreateTodoRequest, UpdateTodoRequest, DatabaseConfig

**.agent\skills\loki-mode\examples\todo-app-generated\frontend/**
- `vite.config.ts`

**.agent\skills\loki-mode\examples\todo-app-generated\frontend\src/**
- `App.tsx`
- `main.tsx`
- `vite-env.d.ts`

**.agent\skills\loki-mode\examples\todo-app-generated\frontend\src\api/**
- `todos.ts` — fetchTodos, createTodo, updateTodo, deleteTodo, Todo, CreateTodoRequest

**.agent\skills\loki-mode\examples\todo-app-generated\frontend\src\components/**
- `ConfirmDialog.tsx` — ConfirmDialog
- `EmptyState.tsx` — EmptyState
- `TodoForm.tsx` — TodoForm
- `TodoItem.tsx` — TodoItem
- `TodoList.tsx` — TodoList

**.agent\skills\loki-mode\examples\todo-app-generated\frontend\src\hooks/**
- `useTodos.ts` — useTodos

**.agent\skills\loki-mode\scripts/**
- `take-screenshots.js`

**.agent\skills\mcp-builder\scripts/**
- `connections.py` — Lightweight connection handling for MCP servers. · create_connection, MCPConnection, MCPConnectionStdio, MCPConnectionSSE, MCPConnectionHTTP
- `evaluation.py` — MCP Server Evaluation Harness · parse_evaluation_file, extract_xml_content, agent_loop, evaluate_single_task, run_evaluation, parse_headers, parse_env_vars, main

**.agent\skills\mobile-design\scripts/**
- `mobile_audit.py` — MobileAuditor

**.agent\skills\notebooklm\scripts/**
- `__init__.py` — ensure_venv_and_run
- `ask_question.py` — ask_notebooklm, main
- `auth_manager.py` — main, AuthManager
- `browser_session.py` — BrowserSession
- `browser_utils.py` — BrowserFactory, StealthUtils
- `cleanup_manager.py` — main, CleanupManager
- `config.py`
- `notebook_manager.py` — main, NotebookLibrary
- `run.py` — get_venv_python, ensure_venv, main
- `setup_environment.py` — main, SkillEnvironment

**.agent\skills\oss-hunter\bin/**
- `hunter.py` — run_gh_command, hunt

**.agent\skills\pdf-official\scripts/**
- `check_bounding_boxes_test.py` — TestGetBoundingBoxMessages
- `check_bounding_boxes.py` — get_bounding_box_messages, RectAndField
- `check_fillable_fields.py`
- `convert_pdf_to_images.py` — convert
- `create_validation_image.py` — create_validation_image
- `extract_form_field_info.py` — get_full_annotation_field_id, make_field_dict, get_field_info, write_field_info
- `fill_fillable_fields.py` — fill_pdf_fields, validation_error_for_field_value, monkeypatch_pydpf_method
- `fill_pdf_form_with_annotations.py` — transform_coordinates, fill_pdf_form

**.agent\skills\performance-profiling\scripts/**
- `lighthouse_audit.py` — run_lighthouse, get_summary

**.agent\skills\playwright-skill/**
- `run.js`

**.agent\skills\playwright-skill\lib/**
- `helpers.js` — playwright-helpers.js

**.agent\skills\pptx-official\ooxml\scripts/**
- `pack.py` — main, pack_document, validate_document, condense_xml
- `unpack.py`
- `validate.py` — main

**.agent\skills\pptx-official\ooxml\scripts\validation/**
- `__init__.py`
- `base.py` — BaseSchemaValidator
- `docx.py` — DOCXSchemaValidator
- `pptx.py` — PPTXSchemaValidator
- `redlining.py` — RedliningValidator

**.agent\skills\pptx-official\scripts/**
- `html2pptx.js` — html2pptx - Convert HTML slide to pptxgenjs slide with positioned elements
- `inventory.py` — main, is_valid_shape, collect_shapes_with_absolute_positions, sort_shapes_by_position, calculate_overlap, ShapeWithPosition, ParagraphData, ShapeData
- `rearrange.py` — main, duplicate_slide, delete_slide, reorder_slides, rearrange_presentation
- `replace.py` — clear_paragraph_bullets, apply_paragraph_properties, apply_font_properties, detect_frame_overflow, validate_replacements, check_duplicate_keys, apply_replacements, main
- `thumbnail.py` — main, create_hidden_slide_placeholder, get_placeholder_regions, convert_to_images, create_grids, create_grid

**.agent\skills\product-manager-toolkit\scripts/**
- `customer_interview_analyzer.py` — aggregate_interviews, format_single_interview, main, InterviewAnalyzer
- `rice_prioritizer.py` — format_output, load_features_from_csv, create_sample_csv, main, RICECalculator

**.agent\skills\prompt-engineering-patterns\scripts/**
- `optimize-prompt.py` — main, TestCase, PromptOptimizer

**.agent\skills\radix-ui-design-system\examples/**
- `dialog-example.tsx` — BasicDialog, ControlledDialog
- `dropdown-example.tsx` — CompleteDropdown, ActionsMenu

**.agent\skills\radix-ui-design-system\templates/**
- `component-template.tsx` — Radix UI Component Template

**.agent\skills\remotion-best-practices\rules\assets/**
- `charts-bar-chart.tsx` — MyAnimation
- `text-animations-typewriter.tsx` — MyAnimation
- `text-animations-word-highlight.tsx` — MyAnimation

**.agent\skills\scripts/**
- `auto_categorize_skills.py` — categorize_skill, auto_categorize, main
- `build-catalog.js`
- `fix_dangling_links.py` — fix_dangling_links
- `fix_skills_metadata.py` — fix_skills
- `fix_yaml_quotes.py` — fix_yaml_quotes
- `fix_year_2025_to_2026.py` — update_dates
- `generate_index.py` — parse_frontmatter, generate_index
- `generate_skills_report.py` — get_project_root, parse_frontmatter, generate_skills_report, main
- `manage_skill_dates.py` — get_project_root, parse_frontmatter, reconstruct_frontmatter, update_skill_frontmatter, list_skills, add_missing_dates, add_all_dates, update_skill_date +1
- `normalize-frontmatter.js`
- `setup_web.js`
- `skills_manager.py` — list_active, list_disabled, enable_skill, disable_skill, main
- `sync_microsoft_skills.py` — clone_repo, cleanup_previous_sync, extract_skill_name, generate_fallback_name, find_skills_in_directory, find_plugin_skills, find_github_skills, sync_skills_flat +2
- `update_readme.py` — update_readme
- `validate_references.py` — collect_skill_ids, main
- `validate_skills.py` — has_when_to_use_section, parse_frontmatter, validate_skills
- `validate-skills.js` — Legacy / alternative validator. For CI and PR checks, use scripts/validate_skills.py.

**.agent\skills\scripts\tests/**
- `inspect_microsoft_repo.py` — extract_skill_name, inspect_repo
- `test_comprehensive_coverage.py` — extract_skill_name, analyze_skill_locations
- `test_validate_skills_headings.py`
- `validate_skills_headings.test.js`

**.agent\skills\senior-architect\scripts/**
- `architecture_diagram_generator.py` — main, ArchitectureDiagramGenerator
- `dependency_analyzer.py` — main, DependencyAnalyzer
- `project_architect.py` — main, ProjectArchitect

**.agent\skills\senior-fullstack\scripts/**
- `code_quality_analyzer.py` — main, CodeQualityAnalyzer
- `fullstack_scaffolder.py` — main, FullstackScaffolder
- `project_scaffolder.py` — main, ProjectScaffolder

**.agent\skills\seo-fundamentals\scripts/**
- `seo_checker.py` — is_page_file, find_pages, check_page, main

**.agent\skills\shopify-development\scripts/**
- `shopify_graphql.py` — extract_id, build_gid, main, GraphQLResponse, ShopifyGraphQL
- `shopify_init.py` — main, EnvConfig, EnvLoader, ShopifyInitializer

**.agent\skills\shopify-development\scripts\tests/**
- `test_shopify_init.py` — TestEnvLoader, TestShopifyInitializer, TestMain, TestEnvConfig

**.agent\skills\skill-creator\scripts/**
- `init_skill.py` — main, title_case_skill_name, init_skill
- `package_skill.py` — package_skill, main
- `quick_validate.py` — validate_skill

**.agent\skills\slack-gif-creator\core/**
- `easing.py` — linear, ease_in_quad, ease_out_quad, ease_in_out_quad, ease_in_cubic, ease_out_cubic, ease_in_out_cubic, ease_in_bounce +2
- `frame_composer.py` — create_blank_frame, draw_circle, draw_text, create_gradient_background, draw_star
- `gif_builder.py` — GIFBuilder
- `validators.py` — validate_gif, is_slack_ready

**.agent\skills\systematic-debugging/**
- `condition-based-waiting-example.ts` — Complete implementation of condition-based waiting utilities · waitForEvent, waitForEventCount, waitForEventMatch

**.agent\skills\typescript-expert\references/**
- `utility-types.ts` — TypeScript Utility Types Library · assertNever, exhaustiveCheck, ok, err, some, none, Brand, UserId +2

**.agent\skills\typescript-expert\scripts/**
- `ts_diagnostic.py` — run_cmd, check_versions, check_tsconfig, check_tooling, check_monorepo, check_type_errors, check_any_usage, check_type_assertions +2

**.agent\skills\ui-ux-pro-max\scripts/**
- `core.py` — detect_domain, search, search_stack, BM25
- `design_system.py` — format_ascii_box, format_markdown, generate_design_system, DesignSystemGenerator
- `search.py` — format_output

**.agent\skills\unreal-engine-cpp-pro\examples/**
- `ExampleActor.cpp`
- `ExampleActor.h`

**.agent\skills\voice-ai-engine-development\examples/**
- `complete_voice_engine.py` — conversation_endpoint, Transcription, AgentResponse, SynthesisResult, BaseWorker, DeepgramTranscriber, GeminiAgent, ElevenLabsSynthesizer +2
- `gemini_agent_example.py` — example_usage, Message, GeneratedResponse, GeminiAgent
- `interrupt_system_example.py` — example_interrupt_scenario, InterruptibleEvent, ConversationWithInterrupts, SynthesisWorkerWithInterrupts, TranscriptionWorkerWithInterrupts, MockTranscription, MockSynthesisResult

**.agent\skills\voice-ai-engine-development\templates/**
- `base_worker_template.py` — example_usage, BaseWorker, ExampleWorker
- `multi_provider_factory_template.py` — example_usage, TranscriberProvider, LLMProvider, TTSProvider, VoiceComponentFactory

**.agent\skills\vulnerability-scanner\scripts/**
- `security_scan.py` — scan_dependencies, scan_secrets, scan_code_patterns, scan_configuration, run_full_scan, main

**.agent\skills\web-app/**
- `eslint.config.js`
- `postcss.config.js`
- `vite.config.js` — https://vite.dev/config/

**.agent\skills\web-app\public\skills\algorithmic-art\templates/**
- `generator_template.js` — ═══════════════════════════════════════════════════════════════════════════

**.agent\skills\web-app\public\skills\api-design-principles\assets/**
- `rest-api-template.py` — http_exception_handler, list_users, create_user, get_user, update_user, delete_user, UserStatus, UserBase +2

**.agent\skills\web-app\public\skills\api-patterns\scripts/**
- `api_validator.py` — find_api_files, check_openapi_spec, check_api_code, main

**.agent\skills\web-app\public\skills\app-store-optimization/**
- `ab_test_planner.py` — plan_ab_test, ABTestPlanner
- `aso_scorer.py` — calculate_aso_score, ASOScorer
- `competitor_analyzer.py` — analyze_competitor_set, CompetitorAnalyzer
- `keyword_analyzer.py` — analyze_keyword_set, KeywordAnalyzer
- `launch_checklist.py` — generate_launch_checklist, LaunchChecklistGenerator
- `localization_helper.py` — plan_localization_strategy, LocalizationHelper
- `metadata_optimizer.py` — optimize_app_metadata, MetadataOptimizer
- `review_analyzer.py` — analyze_reviews, ReviewAnalyzer

**.agent\skills\web-app\public\skills\audio-transcriber\scripts/**
- `transcribe.py` — detect_cli_tool, invoke_prompt_engineer, handle_prompt_workflow, process_with_llm, transcribe_audio, save_outputs, main

**.agent\skills\web-app\public\skills\claude-d3js-skill\assets/**
- `chart-template.jsx` — default:App
- `interactive-template.jsx` — default:App

**.agent\skills\web-app\public\skills\content-creator\scripts/**
- `brand_voice_analyzer.py` — analyze_content, BrandVoiceAnalyzer
- `seo_optimizer.py` — optimize_content, SEOOptimizer

**.agent\skills\web-app\public\skills\database-design\scripts/**
- `schema_validator.py` — find_schema_files, validate_prisma_schema, main

**.agent\skills\web-app\public\skills\docx-official\ooxml\scripts/**
- `pack.py` — main, pack_document, validate_document, condense_xml
- `unpack.py`
- `validate.py` — main

**.agent\skills\web-app\public\skills\docx-official\ooxml\scripts\validation/**
- `__init__.py`
- `base.py` — BaseSchemaValidator
- `docx.py` — DOCXSchemaValidator
- `pptx.py` — PPTXSchemaValidator
- `redlining.py` — RedliningValidator

**.agent\skills\web-app\public\skills\docx-official\scripts/**
- `__init__.py`
- `document.py` — DocxXMLEditor, Document
- `utilities.py` — XMLEditor

**.agent\skills\web-app\public\skills\dotnet-backend-patterns\assets/**
- `repository-template.cs`
- `service-template.cs`

**.agent\skills\web-app\public\skills\geo-fundamentals\scripts/**
- `geo_checker.py` — is_page_file, find_web_pages, check_page, main

**.agent\skills\web-app\public\skills\go-rod-master\examples/**
- `basic_scrape.go`
- `concurrent_pages.go`
- `request_hijacking.go`
- `stealth_page.go`

**.agent\skills\web-app\public\skills\i18n-localization\scripts/**
- `i18n_checker.py` — find_locale_files, check_locale_completeness, flatten_keys, check_hardcoded_strings, main

**.agent\skills\web-app\public\skills\last30days\scripts/**
- `last30days.py` — load_fixture, run_research, main, output_result

**.agent\skills\web-app\public\skills\last30days\scripts\lib/**
- `__init__.py`
- `cache.py` — Caching utilities for last30days skill. · ensure_cache_dir, get_cache_key, get_cache_path, is_cache_valid, load_cache, get_cache_age_hours, load_cache_with_age, save_cache +2
- `dates.py` — Date utilities for last30days skill. · get_date_range, parse_date, timestamp_to_date, get_date_confidence, days_ago, recency_score
- `dedupe.py` — Near-duplicate detection for last30days skill. · normalize_text, get_ngrams, jaccard_similarity, get_item_text, find_duplicates, dedupe_items, dedupe_reddit, dedupe_x
- `env.py` — Environment and API key management for last30days skill. · load_env_file, get_config, config_exists, get_available_sources, get_missing_keys, validate_sources
- `http.py` — HTTP utilities for last30days skill (stdlib only). · log, request, get, post, get_reddit_json, HTTPError
- `models.py` — Model auto-selection for last30days skill. · parse_version, is_mainline_openai_model, select_openai_model, select_xai_model, get_models
- `normalize.py` — Normalization of raw API data to canonical schema. · filter_by_date_range, normalize_reddit_items, normalize_x_items, items_to_dicts
- `openai_reddit.py` — OpenAI Responses API client for Reddit discovery. · search_reddit, parse_reddit_response
- `reddit_enrich.py` — Reddit thread enrichment with real engagement metrics. · extract_reddit_path, fetch_thread_data, parse_thread_data, get_top_comments, extract_comment_insights, enrich_reddit_item
- `render.py` — Output rendering for last30days skill. · ensure_output_dir, render_compact, render_context_snippet, render_full_report, write_outputs, get_context_path
- `schema.py` — Data schemas for last30days skill. · create_report, Engagement, Comment, SubScores, RedditItem, XItem, WebSearchItem, Report
- `score.py` — Popularity-aware scoring for last30days skill. · log1p_safe, compute_reddit_engagement_raw, compute_x_engagement_raw, normalize_to_100, score_reddit_items, score_x_items, score_websearch_items, sort_items
- `ui.py` — Terminal UI utilities for last30days skill. · print_phase, Colors, Spinner, ProgressDisplay
- `websearch.py` — WebSearch module for last30days skill. · extract_date_from_url, extract_date_from_snippet, extract_date_signals, extract_domain, is_excluded_domain, parse_websearch_results, normalize_websearch_items, dedupe_websearch
- `xai_x.py` — xAI API client for X (Twitter) discovery. · search_x, parse_x_response

**.agent\skills\web-app\public\skills\last30days\tests/**
- `__init__.py`
- `test_cache.py` — Tests for cache module. · TestGetCacheKey, TestCachePath, TestCacheValidity, TestModelCache
- `test_dates.py` — Tests for dates module. · TestGetDateRange, TestParseDate, TestTimestampToDate, TestGetDateConfidence, TestDaysAgo, TestRecencyScore
- `test_dedupe.py` — Tests for dedupe module. · TestNormalizeText, TestGetNgrams, TestJaccardSimilarity, TestFindDuplicates, TestDedupeItems
- `test_models.py` — Tests for models module. · TestParseVersion, TestIsMainlineOpenAIModel, TestSelectOpenAIModel, TestSelectXAIModel, TestGetModels
- `test_normalize.py` — Tests for normalize module. · TestNormalizeRedditItems, TestNormalizeXItems, TestItemsToDicts
- `test_render.py` — Tests for render module. · TestRenderCompact, TestRenderContextSnippet, TestRenderFullReport, TestGetContextPath
- `test_score.py` — Tests for score module. · TestLog1pSafe, TestComputeRedditEngagementRaw, TestComputeXEngagementRaw, TestNormalizeTo100, TestScoreRedditItems, TestScoreXItems, TestSortItems

**.agent\skills\web-app\public\skills\lint-and-validate\scripts/**
- `lint_runner.py` — detect_project_type, run_linter, main
- `type_coverage.py` — check_typescript_coverage, check_python_coverage, main

**.agent\skills\web-app\public\skills\loki-mode\benchmarks\results\2026-01-05-00-49-17\humaneval-solutions/**
- `0.py` — has_close_elements
- `1.py` — separate_paren_groups
- `10.py` — is_palindrome, make_palindrome
- `100.py` — make_a_pile
- `101.py` — words_string
- `102.py` — choose_num
- `103.py` — rounded_avg
- `104.py` — unique_digits
- `105.py` — by_length
- `106.py` — f
- `107.py` — even_odd_palindrome
- `108.py` — count_nums
- `109.py` — move_one_ball
- `11.py` — string_xor
- `110.py` — exchange
- `111.py` — histogram
- `112.py` — reverse_delete
- `113.py` — odd_count
- `114.py` — minSubArraySum
- `115.py` — max_fill
- `116.py` — sort_array
- `117.py` — select_words
- `118.py` — get_closest_vowel
- `119.py` — match_parens
- `12.py` — longest
- `120.py` — maximum
- `121.py` — solution
- `122.py` — add_elements
- `123.py` — get_odd_collatz
- `124.py` — valid_date
- `125.py` — split_words
- `126.py` — is_sorted
- `127.py` — intersection
- `128.py` — prod_signs
- `129.py` — minPath
- `13.py` — greatest_common_divisor
- `130.py` — tri
- `131.py` — digits
- `132.py` — is_nested
- `133.py` — sum_squares
- `134.py` — check_if_last_char_is_a_letter
- `135.py` — can_arrange
- `136.py` — largest_smallest_integers
- `137.py` — compare_one
- `138.py` — is_equal_to_sum_even
- `139.py` — special_factorial
- `14.py` — all_prefixes
- `140.py` — fix_spaces
- `141.py` — file_name_check
- `142.py` — sum_squares
- `143.py` — words_in_sentence
- `144.py` — simplify
- `145.py` — order_by_points
- `146.py` — specialFilter
- `147.py` — get_max_triples
- `148.py` — bf
- `149.py` — sorted_list_sum
- `15.py` — string_sequence
- `150.py` — x_or_y
- `151.py` — double_the_difference
- `152.py` — compare
- `153.py` — Strongest_Extension
- `154.py` — cycpattern_check
- `155.py` — even_odd_count
- `156.py` — int_to_mini_roman
- `157.py` — right_angle_triangle
- `158.py` — find_max
- `159.py` — eat
- `16.py` — count_distinct_characters
- `160.py` — do_algebra
- `161.py` — solve
- `162.py` — string_to_md5
- `163.py` — generate_integers
- `17.py` — parse_music
- `18.py` — how_many_times
- `19.py` — sort_numbers
- `2.py` — truncate_number
- `20.py` — find_closest_elements
- `21.py` — rescale_to_unit
- `22.py` — filter_integers
- `23.py` — strlen
- `24.py` — largest_divisor
- `25.py` — factorize
- `26.py` — remove_duplicates
- `27.py` — flip_case
- `28.py` — concatenate
- `29.py` — filter_by_prefix
- `3.py` — below_zero
- `30.py` — get_positive
- `31.py` — is_prime
- `32.py` — poly, find_zero
- `33.py` — sort_third
- `34.py` — unique
- `35.py` — max_element
- `36.py` — fizz_buzz
- `37.py` — sort_even
- `38.py` — decode_cyclic
- `39.py` — prime_fib
- `4.py` — mean_absolute_deviation
- `40.py` — triples_sum_to_zero
- `41.py` — car_race_collision
- `42.py` — incr_list
- `43.py` — pairs_sum_to_zero
- `44.py` — change_base
- `45.py` — triangle_area
- `46.py` — fib4
- `47.py` — median
- `48.py` — is_palindrome
- `49.py` — modp
- `5.py` — intersperse
- `50.py` — encode_shift, decode_shift
- `51.py` — remove_vowels
- `52.py` — below_threshold
- `53.py` — add
- `54.py` — same_chars
- `55.py` — fib
- `56.py` — correct_bracketing
- `57.py` — monotonic
- `58.py` — common
- `59.py` — largest_prime_factor
- `6.py` — parse_nested_parens
- `60.py` — sum_to_n
- `61.py` — correct_bracketing
- `62.py` — derivative
- `63.py` — fibfib
- `64.py` — vowels_count
- `65.py` — circular_shift
- `66.py` — digitSum
- `67.py` — fruit_distribution
- `68.py` — pluck
- `69.py` — search
- `7.py` — filter_by_substring
- `70.py` — strange_sort_list
- `71.py` — triangle_area
- `72.py` — will_it_fly
- `73.py` — smallest_change
- `74.py` — total_match
- `75.py` — is_multiply_prime
- `76.py` — is_simple_power
- `77.py` — iscube
- `78.py` — hex_key
- `79.py` — decimal_to_binary
- `8.py` — sum_product
- `80.py` — is_happy
- `81.py` — numerical_letter_grade
- `82.py` — prime_length
- `83.py` — starts_one_ends
- `84.py` — solve
- `85.py` — add
- `86.py` — anti_shuffle
- `87.py` — get_row
- `88.py` — sort_array
- `89.py` — encrypt
- `9.py` — rolling_max
- `90.py` — next_smallest
- `91.py` — is_bored
- `92.py` — any_int
- `93.py` — encode
- `94.py` — skjkasdkd
- `95.py` — check_dict_case
- `96.py` — count_up_to
- `97.py` — multiply
- `98.py` — count_upper
- `99.py` — closest_integer

**.agent\skills\web-app\public\skills\loki-mode\benchmarks\results\humaneval-loki-solutions/**
- `0.py` — has_close_elements
- `1.py` — separate_paren_groups
- `10.py` — is_palindrome, make_palindrome
- `100.py` — make_a_pile
- `101.py` — words_string
- `102.py` — choose_num
- `103.py` — rounded_avg
- `104.py` — unique_digits
- `105.py` — by_length
- `106.py` — f
- `107.py` — even_odd_palindrome
- `108.py` — count_nums
- `109.py` — move_one_ball
- `11.py` — string_xor
- `110.py` — exchange
- `111.py` — histogram
- `112.py` — reverse_delete
- `113.py` — odd_count
- `114.py` — minSubArraySum
- `115.py` — max_fill
- `116.py` — sort_array
- `117.py` — select_words
- `118.py` — get_closest_vowel
- `119.py` — match_parens
- `12.py` — longest
- `120.py` — maximum
- `121.py` — solution
- `122.py` — add_elements
- `123.py` — get_odd_collatz
- `124.py` — valid_date
- `125.py` — split_words
- `126.py` — is_sorted
- `127.py` — intersection
- `128.py` — prod_signs
- `129.py` — minPath
- `13.py` — greatest_common_divisor
- `130.py` — tri
- `131.py` — digits
- `132.py` — is_nested
- `133.py` — sum_squares
- `134.py` — check_if_last_char_is_a_letter
- `135.py` — can_arrange
- `136.py` — largest_smallest_integers
- `137.py` — compare_one
- `138.py` — is_equal_to_sum_even
- `139.py` — special_factorial
- `14.py` — all_prefixes
- `140.py` — fix_spaces
- `141.py` — file_name_check
- `142.py` — sum_squares
- `143.py` — words_in_sentence
- `144.py` — simplify
- `145.py` — order_by_points
- `146.py` — specialFilter
- `147.py` — get_max_triples
- `148.py` — bf
- `149.py` — sorted_list_sum
- `15.py` — string_sequence
- `150.py` — x_or_y
- `151.py` — double_the_difference
- `152.py` — compare
- `153.py` — Strongest_Extension
- `154.py` — cycpattern_check
- `155.py` — even_odd_count
- `156.py` — int_to_mini_roman
- `157.py` — right_angle_triangle
- `158.py` — find_max
- `159.py` — eat
- `16.py` — count_distinct_characters
- `160.py` — do_algebra
- `161.py` — solve
- `162.py` — string_to_md5
- `163.py` — generate_integers
- `17.py` — parse_music
- `18.py` — how_many_times
- `19.py` — sort_numbers
- `2.py` — truncate_number
- `20.py` — find_closest_elements
- `21.py` — rescale_to_unit
- `22.py` — filter_integers
- `23.py` — strlen
- `24.py` — largest_divisor
- `25.py` — factorize
- `26.py` — remove_duplicates
- `27.py` — flip_case
- `28.py` — concatenate
- `29.py` — filter_by_prefix
- `3.py` — below_zero
- `30.py` — get_positive
- `31.py` — is_prime
- `32.py` — find_zero
- `33.py` — sort_third
- `34.py` — unique
- `35.py` — max_element
- `36.py` — fizz_buzz
- `37.py` — sort_even
- `38.py` — encode_cyclic, decode_cyclic
- `39.py` — prime_fib
- `4.py` — mean_absolute_deviation
- `40.py` — triples_sum_to_zero
- `41.py` — car_race_collision
- `42.py` — incr_list
- `43.py` — pairs_sum_to_zero
- `44.py` — change_base
- `45.py` — triangle_area
- `46.py` — fib4
- `47.py` — median
- `48.py` — is_palindrome
- `49.py` — modp
- `5.py` — intersperse
- `50.py` — decode_shift
- `51.py` — remove_vowels
- `52.py` — below_threshold
- `53.py` — add
- `54.py` — same_chars
- `55.py` — fib
- `56.py` — correct_bracketing
- `57.py` — monotonic
- `58.py` — common
- `59.py` — largest_prime_factor
- `6.py` — parse_nested_parens
- `60.py` — sum_to_n
- `61.py` — correct_bracketing
- `62.py` — derivative
- `63.py` — fibfib
- `64.py` — vowels_count
- `65.py` — circular_shift
- `66.py` — digitSum
- `67.py` — fruit_distribution
- `68.py` — pluck
- `69.py` — search
- `7.py` — filter_by_substring
- `70.py` — strange_sort_list
- `71.py` — triangle_area
- `72.py` — will_it_fly
- `73.py` — smallest_change
- `74.py` — total_match
- `75.py` — is_multiply_prime
- `76.py` — is_simple_power
- `77.py` — iscube
- `78.py` — hex_key
- `79.py` — decimal_to_binary
- `8.py` — sum_product
- `80.py` — is_happy
- `81.py` — numerical_letter_grade
- `82.py` — prime_length
- `83.py` — starts_one_ends
- `84.py` — solve
- `85.py` — add
- `86.py` — anti_shuffle
- `87.py` — get_row
- `88.py` — sort_array
- `89.py` — encrypt
- `9.py` — rolling_max
- `90.py` — next_smallest
- `91.py` — is_bored
- `92.py` — any_int
- `93.py` — encode
- `94.py` — skjkasdkd
- `95.py` — check_dict_case
- `96.py` — count_up_to
- `97.py` — multiply
- `98.py` — count_upper
- `99.py` — closest_integer

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\backend\src/**
- `index.ts`

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\backend\src\db/**
- `database.ts` — getDatabase, closeDatabase
- `db.ts` — initDatabase
- `index.ts`
- `migrations.ts` — runMigrations, initializeDatabase

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\backend\src\routes/**
- `todos.ts`

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\backend\src\types/**
- `index.ts` — Todo item types · Todo, ApiResponse, CreateTodoRequest, UpdateTodoRequest, DatabaseConfig

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\frontend/**
- `vite.config.ts`

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\frontend\src/**
- `App.tsx`
- `main.tsx`
- `vite-env.d.ts`

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\frontend\src\api/**
- `todos.ts` — fetchTodos, createTodo, updateTodo, deleteTodo, Todo, CreateTodoRequest

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\frontend\src\components/**
- `ConfirmDialog.tsx` — ConfirmDialog
- `EmptyState.tsx` — EmptyState
- `TodoForm.tsx` — TodoForm
- `TodoItem.tsx` — TodoItem
- `TodoList.tsx` — TodoList

**.agent\skills\web-app\public\skills\loki-mode\examples\todo-app-generated\frontend\src\hooks/**
- `useTodos.ts` — useTodos

**.agent\skills\web-app\public\skills\loki-mode\scripts/**
- `take-screenshots.js`

**.agent\skills\web-app\public\skills\mcp-builder\scripts/**
- `connections.py` — Lightweight connection handling for MCP servers. · create_connection, MCPConnection, MCPConnectionStdio, MCPConnectionSSE, MCPConnectionHTTP
- `evaluation.py` — MCP Server Evaluation Harness · parse_evaluation_file, extract_xml_content, agent_loop, evaluate_single_task, run_evaluation, parse_headers, parse_env_vars, main

**.agent\skills\web-app\public\skills\mobile-design\scripts/**
- `mobile_audit.py` — MobileAuditor

**.agent\skills\web-app\public\skills\notebooklm\scripts/**
- `__init__.py` — ensure_venv_and_run
- `ask_question.py` — ask_notebooklm, main
- `auth_manager.py` — main, AuthManager
- `browser_session.py` — BrowserSession
- `browser_utils.py` — BrowserFactory, StealthUtils
- `cleanup_manager.py` — main, CleanupManager
- `config.py`
- `notebook_manager.py` — main, NotebookLibrary
- `run.py` — get_venv_python, ensure_venv, main
- `setup_environment.py` — main, SkillEnvironment

**.agent\skills\web-app\public\skills\oss-hunter\bin/**
- `hunter.py` — run_gh_command, hunt

**.agent\skills\web-app\public\skills\pdf-official\scripts/**
- `check_bounding_boxes_test.py` — TestGetBoundingBoxMessages
- `check_bounding_boxes.py` — get_bounding_box_messages, RectAndField
- `check_fillable_fields.py`
- `convert_pdf_to_images.py` — convert
- `create_validation_image.py` — create_validation_image
- `extract_form_field_info.py` — get_full_annotation_field_id, make_field_dict, get_field_info, write_field_info
- `fill_fillable_fields.py` — fill_pdf_fields, validation_error_for_field_value, monkeypatch_pydpf_method
- `fill_pdf_form_with_annotations.py` — transform_coordinates, fill_pdf_form

**.agent\skills\web-app\public\skills\performance-profiling\scripts/**
- `lighthouse_audit.py` — run_lighthouse, get_summary

**.agent\skills\web-app\public\skills\playwright-skill/**
- `run.js`

**.agent\skills\web-app\public\skills\playwright-skill\lib/**
- `helpers.js` — playwright-helpers.js

**.agent\skills\web-app\public\skills\pptx-official\ooxml\scripts/**
- `pack.py` — main, pack_document, validate_document, condense_xml
- `unpack.py`
- `validate.py` — main

**.agent\skills\web-app\public\skills\pptx-official\ooxml\scripts\validation/**
- `__init__.py`
- `base.py` — BaseSchemaValidator
- `docx.py` — DOCXSchemaValidator
- `pptx.py` — PPTXSchemaValidator
- `redlining.py` — RedliningValidator

**.agent\skills\web-app\public\skills\pptx-official\scripts/**
- `html2pptx.js` — html2pptx - Convert HTML slide to pptxgenjs slide with positioned elements
- `inventory.py` — main, is_valid_shape, collect_shapes_with_absolute_positions, sort_shapes_by_position, calculate_overlap, ShapeWithPosition, ParagraphData, ShapeData
- `rearrange.py` — main, duplicate_slide, delete_slide, reorder_slides, rearrange_presentation
- `replace.py` — clear_paragraph_bullets, apply_paragraph_properties, apply_font_properties, detect_frame_overflow, validate_replacements, check_duplicate_keys, apply_replacements, main
- `thumbnail.py` — main, create_hidden_slide_placeholder, get_placeholder_regions, convert_to_images, create_grids, create_grid

**.agent\skills\web-app\public\skills\product-manager-toolkit\scripts/**
- `customer_interview_analyzer.py` — aggregate_interviews, format_single_interview, main, InterviewAnalyzer
- `rice_prioritizer.py` — format_output, load_features_from_csv, create_sample_csv, main, RICECalculator

**.agent\skills\web-app\public\skills\prompt-engineering-patterns\scripts/**
- `optimize-prompt.py` — main, TestCase, PromptOptimizer

**.agent\skills\web-app\public\skills\radix-ui-design-system\examples/**
- `dialog-example.tsx` — BasicDialog, ControlledDialog
- `dropdown-example.tsx` — CompleteDropdown, ActionsMenu

**.agent\skills\web-app\public\skills\radix-ui-design-system\templates/**
- `component-template.tsx` — Radix UI Component Template

**.agent\skills\web-app\public\skills\remotion-best-practices\rules\assets/**
- `charts-bar-chart.tsx` — MyAnimation
- `text-animations-typewriter.tsx` — MyAnimation
- `text-animations-word-highlight.tsx` — MyAnimation

**.agent\skills\web-app\public\skills\senior-architect\scripts/**
- `architecture_diagram_generator.py` — main, ArchitectureDiagramGenerator
- `dependency_analyzer.py` — main, DependencyAnalyzer
- `project_architect.py` — main, ProjectArchitect

**.agent\skills\web-app\public\skills\senior-fullstack\scripts/**
- `code_quality_analyzer.py` — main, CodeQualityAnalyzer
- `fullstack_scaffolder.py` — main, FullstackScaffolder
- `project_scaffolder.py` — main, ProjectScaffolder

**.agent\skills\web-app\public\skills\seo-fundamentals\scripts/**
- `seo_checker.py` — is_page_file, find_pages, check_page, main

**.agent\skills\web-app\public\skills\shopify-development\scripts/**
- `shopify_graphql.py` — extract_id, build_gid, main, GraphQLResponse, ShopifyGraphQL
- `shopify_init.py` — main, EnvConfig, EnvLoader, ShopifyInitializer

**.agent\skills\web-app\public\skills\shopify-development\scripts\tests/**
- `test_shopify_init.py` — TestEnvLoader, TestShopifyInitializer, TestMain, TestEnvConfig

**.agent\skills\web-app\public\skills\skill-creator\scripts/**
- `init_skill.py` — main, title_case_skill_name, init_skill
- `package_skill.py` — package_skill, main
- `quick_validate.py` — validate_skill

**.agent\skills\web-app\public\skills\slack-gif-creator\core/**
- `easing.py` — linear, ease_in_quad, ease_out_quad, ease_in_out_quad, ease_in_cubic, ease_out_cubic, ease_in_out_cubic, ease_in_bounce +2
- `frame_composer.py` — create_blank_frame, draw_circle, draw_text, create_gradient_background, draw_star
- `gif_builder.py` — GIFBuilder
- `validators.py` — validate_gif, is_slack_ready

**.agent\skills\web-app\public\skills\systematic-debugging/**
- `condition-based-waiting-example.ts` — Complete implementation of condition-based waiting utilities · waitForEvent, waitForEventCount, waitForEventMatch

**.agent\skills\web-app\public\skills\typescript-expert\references/**
- `utility-types.ts` — TypeScript Utility Types Library · assertNever, exhaustiveCheck, ok, err, some, none, Brand, UserId +2

**.agent\skills\web-app\public\skills\typescript-expert\scripts/**
- `ts_diagnostic.py` — run_cmd, check_versions, check_tsconfig, check_tooling, check_monorepo, check_type_errors, check_any_usage, check_type_assertions +2

**.agent\skills\web-app\public\skills\ui-ux-pro-max\scripts/**
- `core.py` — detect_domain, search, search_stack, BM25
- `design_system.py` — format_ascii_box, format_markdown, generate_design_system, DesignSystemGenerator
- `search.py` — format_output

**.agent\skills\web-app\public\skills\unreal-engine-cpp-pro\examples/**
- `ExampleActor.cpp`
- `ExampleActor.h`

**.agent\skills\web-app\public\skills\voice-ai-engine-development\examples/**
- `complete_voice_engine.py` — conversation_endpoint, Transcription, AgentResponse, SynthesisResult, BaseWorker, DeepgramTranscriber, GeminiAgent, ElevenLabsSynthesizer +2
- `gemini_agent_example.py` — example_usage, Message, GeneratedResponse, GeminiAgent
- `interrupt_system_example.py` — example_interrupt_scenario, InterruptibleEvent, ConversationWithInterrupts, SynthesisWorkerWithInterrupts, TranscriptionWorkerWithInterrupts, MockTranscription, MockSynthesisResult

**.agent\skills\web-app\public\skills\voice-ai-engine-development\templates/**
- `base_worker_template.py` — example_usage, BaseWorker, ExampleWorker
- `multi_provider_factory_template.py` — example_usage, TranscriberProvider, LLMProvider, TTSProvider, VoiceComponentFactory

**.agent\skills\web-app\public\skills\vulnerability-scanner\scripts/**
- `security_scan.py` — scan_dependencies, scan_secrets, scan_code_patterns, scan_configuration, run_full_scan, main

**.agent\skills\web-app\public\skills\webapp-testing\scripts/**
- `with_server.py` — is_server_ready, main

**.agent\skills\web-app\public\skills\writing-skills/**
- `render-graphs.js`

**.agent\skills\web-app\public\skills\xlsx-official/**
- `recalc.py` — setup_libreoffice_macro, recalc, main

**.agent\skills\web-app\public\skills\youtube-summarizer\scripts/**
- `extract-transcript.py` — extract_transcript, list_available_transcripts

**.agent\skills\web-app\src/**
- `App.jsx`
- `main.jsx`

**.agent\skills\web-app\src\lib/**
- `supabase.js` — supabase

**.agent\skills\web-app\src\pages/**
- `Home.jsx` — Home
- `SkillDetail.jsx` — SkillDetail

**.agent\skills\webapp-testing\scripts/**
- `with_server.py` — is_server_ready, main

**.agent\skills\writing-skills/**
- `render-graphs.js`

**.agent\skills\xlsx-official/**
- `recalc.py` — setup_libreoffice_macro, recalc, main

**.agent\skills\youtube-summarizer\scripts/**
- `extract-transcript.py` — extract_transcript, list_available_transcripts

**.agents\skills\skill-audit\scripts/**
- `audit.py` — parse_frontmatter, collect_text_files, scan_skill, scan_registry, main

**api/**
- `comex.ts` — Exemplo de faixas de valor segundo MDIC/Serpro · default:handler
- `docs-rag.ts` — config, maxDuration, default:handler
- `extract-content.ts` — config, maxDuration, default:handler
- `gemini.ts` — config, maxDuration, default:handler
- `gerar-dossie.ts` — config, maxDuration, default:handler
- `link-status.ts` — config, default:handler
- `open-web-search.ts` — config, maxDuration, default:handler
- `pulse-news.ts` — config, default:handler
- `radar-scan.ts` — =================================================================== · config, maxDuration, default:handler
- `rag.ts` — config, maxDuration, default:handler

**components/**
- `AdminDash.tsx` — AdminDash
- `AuthModal.tsx` — AuthModal
- `ChatInterface.tsx` — RadarProps
- `ClienteSeniorScore.tsx`
- `ConfirmPopover.tsx` — ConfirmPopover — substitui window.confirm() por confirmação inline.
- `CRMDetail.tsx` — CRMDetail
- `CRMPipeline.tsx` — CRMPipeline
- `CRMView.tsx` — CRMView
- `DeepDiveTopics.tsx` — DeepDiveTopics
- `DossieSkeletonLoader.tsx` — QW-1 — Skeleton Loader do Dossiê
- `EmailModal.tsx` — EmailModal
- `EmptyStateHome.tsx`
- `ErrorBoundary.tsx`
- `ErrorMessageCard.tsx`
- `ErrorToast.tsx` — QW-2 — ErrorToast · ErrorToast, ErrorToastProps
- `FeedbackSection.tsx` — FeedbackSection
- `FollowUpModal.tsx` — FollowUpModal
- `FooterCredits.tsx` — default:FooterCredits
- `GhostMessageBlock.tsx`
- `GreetingWelcomeScreen.tsx`
- `HeaderSessionSearch.tsx` — HeaderSessionSearchProps
- `InlineTypingResponse.tsx`
- `InstallPrompt.tsx` — components/InstallPrompt.tsx · default:InstallPrompt
- `InvestigationDashboard.tsx` — ScoreFilter, ClienteFilter, default:InvestigationDashboard
- `LoadingSmart.tsx`
- `LoginPage.tsx` — LoginPage
- `MarkdownRenderer.tsx` — GroundingSource
- `MessageActionsBar.tsx`
- `MessageRow.tsx` — MessageRowData
- `RadarBell.tsx`
- `RadarPanel.tsx`
- `RadarSettings.tsx`
- `RevenueIntelligence.tsx` — Revenue Intelligence Component
- `ScorePorta.tsx`
- `SectionalBotMessage.tsx`
- `SessionsSidebar.tsx`
- `SettingsDrawer.tsx`
- `SmartOptions.tsx` — parseSmartOptions
- `StatusIndicator.tsx` — InvestigationProgress
- `SuspenseWithError.tsx`
- `SystemHealthCheck.tsx`
- `ToastContainer.tsx` — ToastContainer — exibe a fila de toasts no canto inferior direito.
- `UpdateNotificationModal.tsx` — UpdateNotificationModal
- `UserMenu.tsx` — UserMenuProps
- `UserMenuClerkBridge.tsx` — UserMenuClerkBridgeProps
- `WarRoom.tsx` — default:WarRoom
- `WelcomeScreen.tsx`

**config/**
- `models.ts` — MODEL_IDS

**constants/**
- `loadingStages.ts` — Centralização dos marcos (milestones) e etapas de carregamento · MODULAR_DOSSIER_STAGES, STAGE_DISPLAY_LABELS, ModularDossierStage

**contexts/**
- `AuthContext.tsx` — AuthProvider, useAuth, AuthUser
- `CRMContext.tsx` — CRMProvider, useCRM
- `ModeContext.tsx` — ModeProvider, useMode

**hooks/**
- `useAdminMetrics.ts` — useAdminMetrics, VendorMetric, AdminMetrics
- `useAppInitialization.ts` — useAppInitialization
- `useChat.ts` — useChat
- `useClickBypass.ts` — useClickBypass
- `useOffline.ts` — useOffline
- `usePWA.ts` — usePWA
- `useRadar.ts` — hooks/useRadar.ts · useRadar, UseRadarReturn
- `useSessionManager.ts` — useSessionManager
- `useSessionStorage.ts` — useSessionStorage
- `useTheme.ts` — useTheme
- `useToast.ts` — useToast — sistema de notificações global leve (sem dependência externa). · useToast, ToastType, Toast
- `useUpdateNotification.ts` — useUpdateNotification, UpdateAvailableEvent

**mcp-server\src/**
- `index.ts` — getCommitContext

**prompts/**
- `megaPrompts.ts` — @ts-nocheck · SHARED_FOUNDATION_BLOCK_V5, SHARED_ENTITY_RESOLUTION_BLOCK, SHARED_EVIDENCE_HIERARCHY_BLOCK, SHARED_ABSENCE_SEMANTICS_BLOCK, SHARED_RECENCY_POLICY_BLOCK, SHARED_CROSS_PROMPT_ARBITRATION_BLOCK, SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK, InvestigationPayload +1
- `systemPrompts.ts` — prompts/systemPrompts.ts

**public/**
- `sw.js` — Service Worker para PWA

**scripts/**
- `ingestCanonicalBanking.ts`
- `ingestErpDocs.ts`
- `ingestExtraDocs.ts`
- `ingestPdfDocs.ts`
- `poc-agent.ts` — Importa a chave de API do ambiente, garantindo a segurança.
- `smoke-preview.mjs`
- `test-radar.ts`

**services/**
- `apiConfig.ts` — services/apiConfig.ts · findSeniorProductUrl, isFakeUrl, BACKEND_URL, LOOKUP_URL, SENIOR_PRODUCT_URLS, FAKE_DOMAINS, OPEN_WEB_SEARCH_ENDPOINT
- `brasilApiService.ts` — normalizeCnpj, formatCnpj, isValidCnpj, fetchCompanyByCnpj, validateCityInState, BrasilApiCompanyData, CityValidationResult
- `clientLookupService.ts` — services/clientLookupService.ts · isConcorrenteOuPropria, lookupCliente, formatarParaPrompt, benchmarkClientes, formatarBenchmarkParaPrompt, formatarComexParaPrompt, ClienteResult, LookupResponse +1
- `competitors.ts` — data/competitors.ts · getConcorrente, getConcorrentesPorRegiao, getRevendasPorEstado, getConcorrentesPorSegmento, listarConcorrentesParaPrompt, CONCORRENTES, NivelAmeaca, TierERP +2
- `competitorService.ts` — services/competitorService.ts · detectCompetitorFromContext, pullCompetitorProfile, generatePricingIntel, formatarDeteccaoParaPrompt, formatarProfileParaUI, getContextoConcorrentesRegionais, CompetitorDetection, CompetitorProfile +1
- `extractContentService.ts` — extractContentService
- `feedbackRemoteStore.ts` — URL agora vem do apiConfig · sendFeedbackRemote, FeedbackType, RemoteFeedbackPayload
- `feedbackService.ts` — recordFeedback, MessageFeedback
- `geminiProxy.ts` — resolveGeminiApiEndpoint, proxyGenerateContent, proxyChatSendMessage, executeOpenWebSearchTool, proxyGeminiHealth, proxyGerarDossie, GeminiChatResponse
- `geminiService.ts` — parsePortaFeeds, cleanPortaFeedMarkers, parseMarkers, isMegaPromptRequest, generateLoadingCuriosities, generateContinuityQuestion, GeminiRequestOptions, SpotterExtractedData +2
- `investigationStore.ts` — services/investigationStore.ts · addInvestigation, getInvestigations, subscribe, Investigation
- `portaStateService.ts` — initPortaState, getPortaState, resetPortaState, setBaseScore, addFeedAdjustment, addFlagFeed, addSegmentFeed, generatePortaContextForDeepDive
- `radarService.ts` — services/radarService.ts · buildCategoryPrompt, generateAlertId, fetchRadarAlerts, RadarScanError, RadarScanErrorCode, RadarPartialFailure, RadarCategoryStat, RadarScanResult
- `ragService.ts` — buscarContextoPinecone, buscarContextoDocsPinecone, RagResult
- `revenueService.ts` — Revenue Intelligence Service · normalizarFamilia, inferirPorte, buildRevenueProfile, formatarMoeda, labelTipo
- `sessionRemoteStore.ts` — listRemoteSessions, getRemoteSession, saveRemoteSession
- `warRoomService.ts` — services/warRoomService.ts · queryWarRoom, WarRoomMode, WarRoomMessage, WarRoomResult, WarRoomQueryOptions

**tests/**
- `api-extract.test.ts`
- `api-gemini.test.ts`
- `App.layout.test.tsx`
- `App.loadingVariant.test.tsx`
- `App.portaRecovery.test.ts`
- `extraction.test.ts` — Mock global fetch
- `gemini-integration.test.ts`
- `setup.ts`

**tests-e2e/**
- `investigation-flow.spec.ts` — Skill: playwright-testing
- `smoke.chat-shell.spec.ts`
- `smoke.greeting.spec.ts`
- `smoke.investigation-shell.spec.ts`

**tests\components/**
- `ChatInterface.test.tsx`
- `ClienteSeniorScore.test.tsx`
- `ConfirmPopover.test.tsx` — tests/components/ConfirmPopover.test.tsx
- `EmptyStateHome.test.tsx`
- `ErrorBoundary.test.tsx` — tests/components/ErrorBoundary.test.tsx
- `ErrorToast.test.tsx` — QW-2 — ErrorToast test suite
- `FeatureGatingUI.test.tsx`
- `InlineTypingResponse.test.tsx`
- `InvestigationDashboard.test.tsx`
- `LoadingSmart.test.tsx`
- `MarkdownRenderer.security.test.tsx`
- `MarkdownRenderer.test.tsx`
- `MessageRow.test.tsx` — tests/components/MessageRow.test.tsx
- `ScorePorta.test.tsx`
- `SectionalBotMessage.mermaid.test.tsx`
- `SectionalBotMessage.test.tsx`
- `SessionsSidebar.test.tsx` — tests/components/SessionsSidebar.test.tsx
- `SmartOptions.test.tsx` — tests/components/SmartOptions.test.tsx
- `UxRegressionPhase5.test.tsx`
- `warRoomTargetExtract.test.ts` — Keep this extractor in sync with components/WarRoom.tsx.

**tests\contexts/**
- `AuthContext.test.tsx`
- `CRMContext.test.tsx`
- `ModeContext.test.tsx` — tests/contexts/ModeContext.test.tsx

**tests\hooks/**
- `useAdminMetrics.test.ts`
- `useAppInitialization.test.ts`
- `useChat.test.ts` — NOTA ARQUITETURAL (Carlos/Raquel):
- `useOffline.test.ts`
- `useRadar.test.ts` — tests/hooks/useRadar.test.ts
- `useSessionManager.test.ts` — Mock sessionRemoteStore
- `useSessionStorage.test.ts` — Mock idb-keyval
- `useTheme.test.ts`
- `useToast.test.ts`

**tests\prompts/**
- `constantsPromptRules.test.ts`
- `megaPrompts.test.ts`

**tests\services/**
- `brasilApiService.test.ts`
- `clientLookupService.test.ts`
- `competitorService.test.ts`
- `feedbackRemoteStore.test.ts`
- `geminiLookupGate.test.ts`
- `geminiProxy.test.ts`
- `geminiService.test.ts` — Testes para geminiService.ts
- `portaParser.test.ts`
- `portaStateService.test.ts`
- `radarService.test.ts` — tests/services/radarService.test.ts
- `ragService.test.ts`
- `revenueService.test.ts`
- `sessionRemoteStore.test.ts` — Mock do módulo retry para que os testes não dependam de timers reais
- `warRoomCanary.test.ts`
- `warRoomService.test.ts`

**tests\utils/**
- `auditableSources.test.ts`
- `chunkRetry.test.ts` — tests/utils/chunkRetry.test.ts
- `companyNameExtractor.test.ts`
- `constants.test.ts` — tests/utils/constants.test.ts
- `conversationHistory.test.ts` — tests/utils/conversationHistory.test.ts
- `diagnosticLog.test.ts` — tests/utils/diagnosticLog.test.ts
- `documentExtractor.test.ts`
- `downloadHelpers.test.ts` — tests/utils/downloadHelpers.test.ts
- `errorHelpers.test.ts`
- `featureAccess.test.ts`
- `idbStorage.test.ts` — tests/utils/idbStorage.test.ts
- `linkFixer.test.ts` — Mock apiConfig para controlar o comportamento de isFakeUrl e findSeniorProductUrl
- `linkValidation.test.ts` — tests/utils/linkValidation.test.ts
- `loadingCuriosities.test.ts`
- `loadingHelpers.test.ts` — tests/utils/loadingHelpers.test.ts
- `loadingStatus.test.ts`
- `loadingVariant.test.ts`
- `markdownLinks.test.ts` — tests/utils/markdownLinks.test.ts
- `markdownToHtml.test.ts`
- `mermaid.test.ts`
- `porta.test.ts`
- `reportUtils.test.ts`
- `retry.test.ts` — ─── Helpers ──────────────────────────────────────────────────────────────────
- `sectionParser.test.ts`
- `seniorEvidence.test.ts`
- `seniorLinks.test.ts` — tests/utils/seniorLinks.test.ts
- `textCleaners.test.ts`

**utils/**
- `chunkRetry.ts` — loadWithChunkRetry
- `companyNameExtractor.ts` — "dossiê completo da X", "análise completa da X" · extractCompanyName
- `conversationHistory.ts` — utils/conversationHistory.ts · saveConversation, getConversationHistory, searchHistory, clearHistory, deleteEntry, ConversationEntry
- `diagnosticLog.ts` — diagnosticLog.ts — Logs estruturados do Scout360 · isScoutDiagEnabled, scoutDiag
- `documentExtractor.ts` — isValidPublicUrl, extractHtml, extractPdf, extractDocx, performWebSearch, universalExtract, UniversalExtractResult
- `downloadHelpers.ts` — Helper robusto para forçar o download de arquivos no navegador. · downloadFile
- `errorHelpers.ts` — normalizeAppError, getFriendlyErrorMessage
- `featureAccess.ts` — isAdminUser, getFeatureAccessForUser, UserFeatureAccess
- `friendlyErrorMessage.ts` — QW-2 — Mensagens de erro amigáveis para o vendedor · getFriendlyErrorMessage, toastErrorMessage, ErrorContext
- `idbStorage.ts` — idbStorage — wrapper seguro sobre localStorage para persistência PWA. · storageSet, storageGet, storageRemove
- `linkFixer.ts` — linkFixer.ts - Intercepta e corrige links falsos gerados pelo Gemini · fixFakeLinks, fixFakeLinksHTML, cleanFakeSourcesBlock, extractValidLinks, extractAllSourceMentions, rewriteMarkdownLinksToGoogle, autoLinkSeniorTerms
- `linkValidation.ts` — fetchLinkStatuses, LinkValidationState, LinkValidationResult
- `loadingCuriosities.ts` — buildLoadingCuriositiesFallback, parseLoadingCuriosities
- `loadingHelpers.ts` — resetShownFacts, cleanFactPrefix, getNextFact, shuffleArray, getInsightPool, getLongWaitMessages, humanizeStage, getRandomInsight +2
- `loadingStatus.ts` — toRichStatus, isPhaseTimelineStatus, normalizeLoadingStatus, transitionLoadingProgress, finalizeLoadingProgress, startIncrementalLoadingProgress, statusKey, StatusPhaseKey +2
- `loadingVariant.ts` — resolveLoadingVariant, resolvePlaceholderLoadingVariant, resolveDeepDiveRequestKind, RequestKind, LoadingVariant
- `markdownLinks.ts` — rewriteMarkdownLinksToGoogle
- `markdownToHtml.ts` — convertMarkdownToHTML, simpleMarkdownToHtml
- `mermaid.ts` — normalizeInlineMermaidClasses, normalizeMermaidBlocks, sanitizeMermaidCode, getDisplayableMermaidCode, isMermaidRenderErrorOutput
- `PDFGenerator.ts` — PDFGenerator — renderização programática com jsPDF (sem html2canvas) · PDFGenerator
- `porta.ts` — stripVisiblePortaFeedSections, getPortaCompatibility, stripPortaMarkers, calculatePortaScoreBruto, calculatePortaFlagMultiplier, buildPortaScoreFromFeeds, resolvePortaScore, parsePortaMarkerV2 +2
- `react-dom-shim.d.ts`
- `reportUtils.ts` — collectFullReport, buildMainDossierExecutiveIntro, generateExecutiveSummary, detectInconsistencies
- `retry.ts` — withAutoRetry
- `sectionParser.ts` — parseMarkdownSections, ParsedSection
- `seniorEvidence.ts` — extractClienteSeniorData, buildSeniorEvidenceContext, appendSeniorEvidenceNote
- `seniorLinks.ts` — ============================================================================ · buildSeniorOrGAtecSearchUrl, findSeniorProductUrl, fixGoogleSearchLinks, fixGoogleSearchLinksHTML, autoLinkSeniorTerms, SENIOR_PRODUCT_URLS, seniorOfficialLinks
- `sessionExport.ts` — exportSessionsAsJSON, importSessionsFromJSON, isValidBackupFile, getSessionsSize, SessionBackup
- `textCleaners.ts` — textCleaners.ts - Utilitários para limpeza e formatação de texto · stripMarkdown, cleanTitle, cleanSuggestionText, cleanStatusMarkers, looksLikeInternalPromptText, detectPromptLeakIndicators, buildPromptLeakFallback, stripInternalMarkers +2
- `timeGreeting.ts` — Retorna a saudação adequada ao horário atual do dispositivo. · getTimeGreeting

## Config
- `.agent\skills\package.json`
- `.agent\skills\react-best-practices\metadata.json`
- `.agent\skills\skills_index.json`
- `.agent\skills\web-app\package.json`
- `.agents\skills\api-design\evals.json`
- `.agents\skills\clean-code\evals.json`
- `.agents\skills\codedocs\evals.json`
- `.agents\skills\debugging-tools\evals.json`
- `.agents\skills\frontend-developer\evals.json`
- `.agents\skills\observability\evals.json`
- `.agents\skills\playwright-testing\evals.json`
- `.agents\skills\skill-audit\evals.json`
- `.agents\skills\super-brainstorm\evals.json`
- `.agents\skills\superhuman\evals.json`
- `.agents\skills\test-strategy\evals.json`
- `.claude\settings.json`
- `.github\workflows\caliber.yml`
- `.github\workflows\ci.yml`
- `.github\workflows\preview-smoke.yml`
- `.idx\mcp.json`
- `.mcp.json`
- `docs\mcp\fetch.generic.example.json`
- `docs\mcp\playwright.generic.example.json`
- `metadata.json`
- `package.json`
- `public\manifest.json`
- `skills-lock.json`
- `tsconfig.json`
- `vercel_build_tag.json`
- `vercel.json`

## Docs
- `AGENTS.md`
- `ARQUITETURA.md`
- `CALIBER_LEARNINGS.md`
- `CLAUDE.md`
- `CODEBASE_INDEX.md`
- `docs\GUIA-INICIANTE.md`
- `docs\MCP-FETCH-SETUP.md`
- `docs\MCP-PLAYWRIGHT-SETUP.md`
- `docs\SEGURANCA-API.md`
- `docs\skills-audit-validation.md`
- `docs\skills-playbook.md`
- `docs\testing-strategy.md`
- `HANDOFF_AI.md`
- `PLAN.md`
- `README.md`

---
*Index: ~19.1k tokens · Full codebase: ~13.3M tokens · Saves ~100%*
