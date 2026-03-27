---
description: Scan and optimize docs for SEO — meta tags, readability, keywords, broken links, sitemap.
---

Run the SEO auditor on documentation files. Target path: `$ARGUMENTS` (default: all docs/ and root README.md).

If `$ARGUMENTS` is `--report-only`, scan without making changes.

Execute all 7 phases. Auto-fix non-destructive issues. Never change URLs. Preserve content on high-ranking pages.

## Phase 1: Discovery

Find all target markdown files: `docs/**/*.md`, `README.md` files in domain root directories. If `$ARGUMENTS` specifies a path, scope to that path only.

For each file, extract current state: `title:` frontmatter, `description:` frontmatter, H1, H2s, word count, link count. Store as baseline.

Identify recently changed files:
```bash
git log --oneline -2 --name-only -- docs/ README.md
```

## Phase 2: Meta Tags

For each file with YAML frontmatter:

**Title** (`title:` field): 50-60 characters, must contain primary keyword, must be unique. Auto-fix generic titles using domain context.

**Description** (`description:` field): 120-160 characters, must contain primary keyword, must be unique. Auto-fix from SKILL.md frontmatter or first paragraph.

```bash
python3 marketing-skill/seo-audit/scripts/seo_checker.py --file site/{path}/index.html
```

## Phase 3: Content Quality

**Heading structure:** One H1 per page, no skipped levels, keywords in headings.

**Readability:**
```bash
python3 marketing-skill/content-production/scripts/content_scorer.py {file}
```
Target: readability ≥ 70, structure ≥ 60.

**AI detection** (on non-generated files only):
```bash
python3 marketing-skill/content-humanizer/scripts/humanizer_scorer.py {file}
```
Flag pages < 50. Fix AI clichés: "delve", "leverage", "it's important to note", "comprehensive".

**Do NOT rewrite** pages ranking well — only fix critical issues on those.

## Phase 4: Keywords

Check each page has its primary keyword in: title, description, H1, first paragraph, at least one H2.

Keyword density: 1-2% for primary. Flag and reduce if > 3%.

**Never change existing URLs.** Only optimize content and meta tags.

## Phase 5: Links

**Internal links:** Verify all `[text](url)` targets exist. Fix broken links.

**Duplicate content:**
```bash
grep -rh '^description:' docs/**/*.md | sort | uniq -d
```
Make each duplicate unique.

**Orphan pages:** Find pages not in `mkdocs.yml` nav. Add them.

## Phase 6: Sitemap

```bash
mkdocs build
python3 marketing-skill/site-architecture/scripts/sitemap_analyzer.py site/sitemap.xml
```

Verify all pages appear, no duplicates, no broken URLs.

## Phase 7: Report

Present a summary: pages scanned, issues found, auto-fixes applied, manual review items, broken links fixed, orphans resolved, sitemap URL count. List preserved pages not modified.
