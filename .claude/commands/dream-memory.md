# Dream Memory Consolidation

Consolidate and prune memory files using a four-phase process.

## Phase 1 — Orient
Review existing memory files: read the memory index, skim topic files to understand what's already stored, and check for session logs or subdirectories. Avoid duplicating content already captured.

## Phase 2 — Gather Signal
Prioritize daily logs and recent session transcripts. Identify drifted memories that contradict current codebase facts. Use narrow, targeted grep searches on transcripts rather than exhaustive full reads. Flag outdated or stale information.

## Phase 3 — Consolidate
Write or update memory files following the established conventions of this repository:
- Convert relative dates (e.g., "yesterday", "last week") to absolute dates
- Merge new information into existing topic files instead of creating duplicates
- Remove facts that have been contradicted by newer evidence
- Keep entries factual and actionable

## Phase 4 — Prune and Index
Maintain the memory index under its line/size limits:
- Entries must be concise (~150 chars max per line)
- Remove stale pointers to files or sections that no longer exist
- Shorten verbose entries
- Resolve contradictions between files — keep the most recent, evidence-backed version

## Completion
Summarize the changes made (files updated, entries added/removed/merged) or confirm that no updates were necessary.

$ARGUMENTS
