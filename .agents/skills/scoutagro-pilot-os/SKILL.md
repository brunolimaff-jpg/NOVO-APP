---
name: scoutagro-pilot-os
version: 0.1.0
description: >
  Operating system for Senior Scout 360. Use this skill for product, UX, scraping,
  investigation, reliability, and solo-operator execution decisions in the ScoutAgro
  pilot. It routes work to the most relevant repo skills automatically and enforces
  a premium, resilient, business-first product standard.
category: product
tags: [scoutagro, senior-scout, ux, scraping, reliability, pilot, solo-operator]
recommended_skills: [clean-code, codedocs, refactoring-patterns, clean-architecture, code-review-mastery]
platforms:
  - claude-code
  - openai-codex
license: MIT
maintainers:
  - github: brunolimaff-jpg
---

# ScoutAgro Pilot OS

This skill is the project-level router for Senior Scout 360. It exists to keep
the agent aligned with the current operating model of the product: a premium
commercial-intelligence app, run lean, with a deliberately small AI surface,
low tolerance for regressions, and strong emphasis on maintainability.

Use this skill as the default project layer when working in this repository.

## Mission

- Help the product look and feel like a serious, premium company from day one.
- Reduce operator load through good defaults, clear flows, and resilient
  automation.
- Protect trust: bad data, flaky scraping, and fragile UX are business risks,
  not just technical issues.
- Prefer shipping the smallest high-leverage improvement over sprawling
  platform work.

## When to Use

Trigger this skill when the task involves any of the following:

- UX/UI improvements, new screens, visual polish, flows, or conversion quality
- Refactors that change project boundaries, file organization, or orchestration
- Debugging runtime issues, failed user journeys, or regressions
- Documentation and handoff work that must survive across AI sessions
- Prioritizing work for a lean solo-operator workflow

## Routing Rules

### 1. Refactoring and file separation

When the task changes structure, boundaries, or ownership:

- Start with `clean-architecture` for dependency direction and module cuts.
- Use `refactoring-patterns` for safe structural transformations.
- Use `clean-code` to keep the resulting implementation small and readable.

### 2. Review and risk control

When the task affects important flows or introduces non-trivial diffs:

- Use `code-review-mastery` before treating the work as ready.
- Use `clean-code` to reduce accidental complexity before review.

### 3. Documentation and continuity

When the task needs to survive across AI sessions:

- Use `codedocs` for stable repo-facing documentation.
- Keep decisions visible in repo-tracked docs instead of chat memory.

### 4. Solo-operator prioritization

Always prefer work that improves one of these:

1. Seller trust in the output
2. Time-to-dossiê
3. Conversion support quality
4. Failure recovery and debuggability
5. Ease of operating the product alone

Push back on work that adds complexity without improving one of the five items
above.

## Product Standards for This Repo

### Premium UX

- Never leave the screen visually idle while AI or scraping is processing.
- Prefer progressive disclosure over dense dashboards.
- Every important state must have loading, success, empty, and failure behavior.
- Interfaces should feel decisive and trustworthy, not experimental.

### Scraping and data quality

- Always identify the target company correctly before enriching.
- Prefer explicit freshness markers when source recency is uncertain.
- Treat conflicts across sources as first-class signals, not noise.
- Avoid silent fallback to weak data.

### Reliability

- Every external dependency needs timeout, retry policy, and user-facing fallback.
- Every bug fix should leave behind stronger validation than before.
- No “works on my machine” closes: verify key flows.

### Solo-company discipline

- Prefer fewer systems with stronger defaults.
- Prefer reusable patterns over ad hoc patches.
- Prefer clear guardrails over broad toolchains.

## Default Deliverable Shape

For substantial work in this repo, aim to leave behind:

- the code change
- the validation path
- the failure-mode handling
- a short note on business impact

That combination is what makes the ScoutAgro pilot operable by one person.
