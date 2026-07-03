# SEMrush Authority Misrank Miner

A Codex Skill for mining high-authority misrank keyword opportunities from SEMrush Organic Positions.

It is designed for workflows where domains or subdomains such as `reddit.com`, `youtube.com`, `facebook.com`, `wikipedia.org`, `fandom.com`, `spotify.com`, or `gamefaqs.gamespot.com` rank for keywords even when the page shape is not a precise match for user intent.

The skill scrapes SEMrush through a logged-in Chrome CDP session, deduplicates keywords, screens keyword-only chunks with subagents, and outputs per-target P0/P1/P2 SERP-review reports. Subagents provide opportunity evidence; final priority is derived after canonical grouping and metric rehydration.

## Install

For local development, keep this repository as the source of truth and symlink it into Codex:

```bash
mkdir -p ~/.codex/skills
ln -s "$(pwd)" ~/.codex/skills/semrush-authority-misrank-miner
```

For a simple one-copy install directly under Codex:

```bash
git clone https://github.com/glassesmonkey/semrush-authority-misrank-miner.git \
  ~/.codex/skills/semrush-authority-misrank-miner
```

Then restart Codex or reload skills.

## What It Does

- Connects to Chrome CDP at `http://127.0.0.1:9222`
- Reuses the logged-in SEMrush browser session
- Scrapes Organic Positions one target at a time
- Auto-detects `domain` versus `subdomain` search scope, with `--search-type` available when explicit control is needed
- Applies default filters:
  - US database
  - desktop
  - top 5 positions
  - volume `10000+`
  - KD `0-40`
  - informational, commercial, and transactional intent
  - sorted by traffic
- Splits keywords into first-pass and second-pass screening chunks
- Keeps screening chunks keyword-only to reduce metric anchoring bias
- Rehydrates SEMrush metrics only after screening for final reporting
- Derives final route, caps, and priority from supply model, maintenance burden, natural winner, differentiation, and permutation inflation
- Writes Markdown report headings, labels, priority explanations, and built-in cluster descriptions in Chinese by default
- Produces per-domain P0/P1/P2 SERP-review keyword clusters

## Output

Each run creates a directory like:

```text
semrush-authority-runs/YYYYMMDD-HHMMSS/
  run-index.json
  example.com/
    raw-rows.jsonl
    unique-keywords.jsonl
    chunks-500/
    first-pass-results/
    first-pass-candidates.jsonl
    final-review-chunks/
    final-review-results/
    final-reviewed-candidates.jsonl
    serp-review-recommendations.md
    serp-review-recommendation-keywords.jsonl
    serp-review-recommendation-clusters.json
    opportunity-clusters.json
    opportunity-clusters.md
```

## Safety Notes

- The scraper does not persist cookies, API keys, authorization headers, or full SEMrush RPC templates.
- SEMrush scraping is intentionally sequential by domain.
- Page requests use random delay by default.
- V1 does not automatically scrape Google SERPs; it outputs a prioritized manual SERP-review pool.

## Validation

```bash
node scripts/validate-fixtures.mjs
```

The fixture validation checks JSONL parsing, keyword dedupe, keyword-only chunks, merge behavior, metric rehydration, canonical grouping, priority caps, P0/P1/P2 reporting, v1 compatibility, and run-index generation.
