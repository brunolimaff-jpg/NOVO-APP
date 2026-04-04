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
recommended_skills:
  [frontend-developer, debugging-tools, observability, playwright-testing, api-design]
platforms:
  - claude-code
  - openai-codex
license: MIT
maintainers:
  - github: brunolimaff-jpg
---

# ScoutAgro Pilot OS

This skill is the project-level router for Senior Scout 360. It exists to keep
the agent aligned with the real operating model of the product: a premium
commercial-intelligence app, run lean, by one operator, with strong UX,
reliable scraping, and low tolerance for regressions.

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
- Scraping, research, enrichment, source validation, or data freshness
- Debugging runtime issues, failed user journeys, or production regressions
- Hardening the product for pilot use: error prevention, fallback behavior,
  resilience, observability, QA, or review
- Prioritizing work for a solo founder/operator

## Routing Rules

### 1. UX, interface quality, and perceived trust

When the task changes how the product looks, feels, or guides the seller:

- Start with `ui-ux-pro-max` for interaction, hierarchy, layout, and visual
  product decisions.
- Use `ui-styling` when implementing concrete UI code, especially for Tailwind,
  component styling, and polished execution.
- Use `frontend-developer` for accessibility, structure, performance, and code
  quality.
- Use `vercel-react-best-practices` when the work touches React rendering,
  bundle size, async flow, or perceived performance.

### 2. Scraping, investigation, and commercial intelligence

When the task involves sourcing or enriching prospect data:

- Start with `data-scraper-agent` for scraper design, extraction logic, and
  operational robustness.
- Use `deep-research` when the answer depends on broader source synthesis or
  current web information.
- Use `search-first` before building a custom integration or pipeline from
  scratch.
- Use `api-design` when scraped or enriched data needs stable internal
  contracts.

### 3. Debugging, regressions, and error prevention

When the product is broken, flaky, slow, or risky:

- Start with `debugging-tools` for systematic diagnosis.
- Use `playwright-testing` or `browser-qa` for real flow validation in the UI.
- Use `verification-loop` before closing substantial changes.
- Use `tdd-workflow` when fixing bugs with a risk of regression.
- Use `security-review` and `security-scan` when the work touches secrets,
  uploads, external calls, auth, or user data.
- Use `gh-pr-review` before or during important merge decisions.

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
- Prefer guardrails and observability over heroic manual operation.

## Default Deliverable Shape

For substantial work in this repo, aim to leave behind:

- the code change
- the validation path
- the failure-mode handling
- a short note on business impact

That combination is what makes the ScoutAgro pilot operable by one person.
