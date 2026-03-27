---
description: Run the full 8-phase plugin audit pipeline on a skill directory.
---

Run the comprehensive plugin audit pipeline on the skill at `$ARGUMENTS`. If no argument provided, ask the user for the skill path.

Execute all 8 phases sequentially. Auto-fix non-critical issues. Only prompt the user for critical decisions (external dependencies, security findings, breaking changes).

## Phase 1: Discovery

1. Verify `$ARGUMENTS` exists and contains `SKILL.md`. If not, error and stop.
2. Read `SKILL.md` frontmatter — extract `name`, `description`, `Category`, `Tier`.
3. Detect components: `scripts/*.py` → Python tools, `references/*.md` → reference docs, `assets/` → templates, `expected_outputs/` → test fixtures, `agents/*.md` → embedded agents, `skills/*/SKILL.md` → sub-skills, `.claude-plugin/plugin.json` → standalone plugin, `settings.json` → command registrations.
4. Detect domain from path.
5. Search `commands/` for a `.md` file matching the skill name.
6. Display discovery summary.

## Phase 2: Structure Validation

Run:
```bash
python3 engineering/skill-tester/scripts/skill_validator.py $ARGUMENTS --json
```

Parse JSON. If score < 75: auto-fix missing frontmatter fields, missing section headings, missing directories. Re-run. If still < 75, mark as FAIL but continue.

## Phase 3: Quality Scoring

Run:
```bash
python3 engineering/skill-tester/scripts/quality_scorer.py $ARGUMENTS --detailed --json
```

If score < 60, report improvement roadmap items.

## Phase 4: Script Testing

If `$ARGUMENTS/scripts/` contains `.py` files, run:
```bash
python3 engineering/skill-tester/scripts/script_tester.py $ARGUMENTS --json --verbose
```

All scripts must PASS. If any script uses external imports, **ask the user** whether the dependency is acceptable.

## Phase 5: Security Audit

Run:
```bash
python3 engineering/skill-security-auditor/scripts/skill_security_auditor.py $ARGUMENTS --strict --json
```

Zero CRITICAL or HIGH findings required. **Do NOT auto-fix security issues** — report them to the user with file, line, pattern, and recommended fix.

## Phase 6: Marketplace & Plugin Compliance

### 6a. plugin.json
If `$ARGUMENTS/.claude-plugin/plugin.json` exists: must be valid JSON, only allowed fields, version must be `2.1.2`. Auto-fix version mismatches and remove extra fields.

### 6b. settings.json
If `$ARGUMENTS/settings.json` exists: must be valid JSON, each command must have a matching `commands/*.md` file.

### 6c. Marketplace entry
Check `.claude-plugin/marketplace.json` for an entry with `source` matching `./$ARGUMENTS`. Verify version and name match.

### 6d. Domain plugin.json
Check the parent domain's `.claude-plugin/plugin.json` — verify skill count in description matches actual count. Auto-fix stale counts.

## Phase 7: Ecosystem Integration

### 7a. Cross-platform sync
Verify skill appears in `.codex/skills-index.json` and `.gemini/skills-index.json`. If missing, run sync scripts.

### 7b. Command integration
Verify command `.md` has valid frontmatter, references the correct skill, and is in `mkdocs.yml` nav. Auto-fix missing nav entries.

### 7c. Agent integration
Check for embedded agents in `$ARGUMENTS/agents/`. Verify references resolve.

### 7d. Cross-skill dependencies
Read SKILL.md for references to other skills. Verify each referenced skill exists.

## Phase 8: Domain Code Review

Apply the appropriate agent's review criteria based on domain:

| Domain | Agent | Focus |
|--------|-------|-------|
| `engineering/` or `engineering-team/` | cs-senior-engineer | Architecture, code quality, CI/CD |
| `product-team/` | cs-product-manager | PRD quality, user stories, RICE |
| `marketing-skill/` | cs-content-creator | Content quality, SEO, brand voice |
| `ra-qm-team/` | cs-quality-regulatory | Compliance, audit trail, regulatory |
| `business-growth/` | cs-growth-strategist | Growth metrics, revenue impact |
| `finance/` | cs-financial-analyst | Model accuracy, metric definitions |
| Other | cs-senior-engineer | General code review |

## Final Report

Present all results in a structured ASCII summary table with PASS/FAIL verdict per phase. Verdict rules: all pass → PASS | only warnings → PASS WITH WARNINGS | any blocker → FAIL.
