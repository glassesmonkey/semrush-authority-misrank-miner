---
name: semrush-authority-misrank-miner
description: Mine high-authority misrank keyword opportunities from SEMrush Organic Positions for domains like reddit.com, youtube.com, facebook.com, wikipedia.org, fandom.com, and spotify.com. Use this skill whenever the user mentions 高权重站误排挖词法, SEMrush 反查大站关键词, Reddit/Facebook/YouTube/Wiki/Fandom/Spotify keyword mining, or asks to find non-pure-content site opportunities from authority domains. It connects to the user's logged-in Chrome CDP 9222 session, scrapes one domain at a time with random delay, chunks keywords for subagent screening, and outputs per-domain P0/P1/P2 SERP-review clusters.
---

# SEMrush Authority Misrank Miner

Use this skill to run the user's "high-authority misrank keyword" workflow:

1. Scrape SEMrush Organic Positions for one or more authority domains.
2. Deduplicate keywords.
3. Split into 500-row keyword-only first-pass chunks.
4. Use subagents for strict non-pure-content opportunity screening.
5. Split first-pass candidates into 100-row keyword-only second-pass chunks.
6. Use subagents for stricter review.
7. Cluster the final candidates into P0/P1/P2 SERP-review reports.

V1 does not automatically scrape Google SERPs. It outputs a prioritized SERP-review pool.

## Default Inputs

Ask for only what is missing:

- Required: target domains, such as `reddit.com, facebook.com, youtube.com`.
- Optional: a SEMrush Organic Positions URL whose filters should be inherited.
- Optional: date, database, device, delay range, page limit, and subagent concurrency.

Defaults:

- Chrome CDP: `http://127.0.0.1:9222`
- SEMrush database: `us`
- Search type: `domain`
- Device: desktop
- Sort: traffic
- Position: top 5
- Volume: `10000+`
- KD: `0-40`
- Intent: informational, commercial, transactional
- Random page delay: `1200-4800ms`
- First-pass chunk size: `500`
- Second-pass chunk size: `100`
- Report shape: per-domain reports only, no cross-domain merge unless the user asks.
- Report language: Chinese explanatory prose by default.

## Output Contract

Create a run directory in the current workspace:

```text
semrush-authority-runs/YYYYMMDD-HHMMSS/
  run-index.json
  reddit.com/
    raw-rows.jsonl
    unique-keywords.jsonl
    chunks-500/chunk-00.jsonl        # keyword-only rows for model screening
    first-pass-results/chunk-00.jsonl
    first-pass-candidates.jsonl
    final-review-chunks/review-00.jsonl
    final-review-results/review-00.jsonl
    final-reviewed-candidates.jsonl
    serp-review-recommendations.md
    serp-review-recommendation-keywords.jsonl
    serp-review-recommendation-clusters.json
```

Every recommended keyword row must include:

```json
{"priority":"P0","cluster":"...","keyword":"...","type":"A|F","volume":12345,"kd":12,"cpc":1.23,"recommended_shape":"...","monetization":"...","risk":"low"}
```

## Scrape SEMrush

Use the bundled scraper. It captures the `organic.Positions` RPC request from the page and does not write cookies, API keys, or the captured RPC payload to disk.

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/cdp-scrape-semrush.mjs \
  --domain reddit.com \
  --out-dir semrush-authority-runs/20260702-120000/reddit.com
```

If the user provides a SEMrush URL, pass it with `--url`:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/cdp-scrape-semrush.mjs \
  --domain reddit.com \
  --url 'https://sem.3ue.co/analytics/organic/positions/?...' \
  --out-dir semrush-authority-runs/20260702-120000/reddit.com
```

Scrape domains one at a time. Do not parallelize SEMrush scraping across domains.

If scraping fails:

- CDP connection refused: tell the user to start Chrome with remote debugging on port 9222.
- Login/captcha/403: tell the user to fix the browser session and rerun the failed domain.
- RPC template not found: reload the SEMrush page, confirm Organic Positions is visible, then rerun.
- RPC schema changed: save the diagnostic summary without secrets and stop that domain.

## Prepare Chunks

After `raw-rows.jsonl` exists:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/prepare-keyword-chunks.mjs \
  --input semrush-authority-runs/20260702-120000/reddit.com/raw-rows.jsonl \
  --out-dir semrush-authority-runs/20260702-120000/reddit.com \
  --chunk-size 500
```

This writes `unique-keywords.jsonl` and `chunks-500/chunk-XX.jsonl`.

Important:

- `unique-keywords.jsonl` preserves metrics and source fields for deterministic reporting.
- Screening chunks are keyword-only by default. Do not expose `volume`, `traffic`, `kd`, `cpc`, `position`, or ranking URL to subagents during first-pass or second-pass review.
- Treat SEMrush metrics as reporting and ordering data after screening, not as evidence for whether a keyword is a non-pure-content opportunity.

## First-Pass Subagent Screening

Read `references/rubric.md` before spawning subagents.

For each `chunks-500/chunk-XX.jsonl`, spawn a worker subagent. Do not set model or reasoning overrides; let subagents inherit the current defaults.

Prompt template:

```text
Screen exactly one SEMrush keyword chunk for non-pure-content site opportunities.
Read rubric: /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/references/rubric.md.
Input: <domain-dir>/chunks-500/chunk-XX.jsonl.
The input rows are keyword-only. Do not read raw rows, unique-keywords.jsonl, reports, or any file that exposes volume, traffic, KD, CPC, position, or ranking URLs.
Output recommended SERP-verification keywords only as JSONL to <domain-dir>/first-pass-results/chunk-XX.jsonl.
Base the decision only on the keyword text and rubric. You may include type/reason/recommended_shape, but do not infer from SEMrush metrics.
Write explanatory fields such as `reason`, `recommended_shape`, `monetization`, and `supply_advantage` in Chinese.
Be strict; include no rejected keywords. Do not modify files outside this output file.
Final response: output path and count only.
```

Use a rolling queue of up to 6 worker subagents unless the user asks otherwise. Close completed agents before spawning replacements.

Then merge:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/merge-jsonl-results.mjs \
  --input-dir <domain-dir>/first-pass-results \
  --pattern '^chunk-[0-9]+\\.jsonl$' \
  --out <domain-dir>/first-pass-candidates.jsonl \
  --summary <domain-dir>/first-pass-summary.json
```

## Second-Pass Review

Split first-pass candidates into 100-row review chunks:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/prepare-keyword-chunks.mjs \
  --input <domain-dir>/first-pass-candidates.jsonl \
  --out-dir <domain-dir> \
  --chunk-size 100 \
  --chunks-dir final-review-chunks \
  --unique-out final-review-source.jsonl \
  --prefix review
```

For each `final-review-chunks/review-XX.jsonl`, spawn a worker subagent:

```text
Second-pass screen exactly one batch of first-pass SEMrush keyword candidates.
Read strict rubric: /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/references/rubric.md.
Input: <domain-dir>/final-review-chunks/review-XX.jsonl.
The input rows are keyword-only. Do not read raw rows, unique-keywords.jsonl, first-pass source files, reports, or any file that exposes volume, traffic, KD, CPC, position, ranking URLs, or first-pass rationale.
Output only truly SERP-verification-worthy keywords as JSONL to <domain-dir>/final-review-results/review-XX.jsonl.
Base the decision only on the keyword text and rubric. You may include type/reason/recommended_shape, but do not infer from SEMrush metrics.
Write explanatory fields such as `reason`, `recommended_shape`, `monetization`, and `supply_advantage` in Chinese.
Do not preserve recall for weak opportunities, but do not reject low-CPC or low-volume keywords merely for being small.
Reject only broad topics, pure content, YMYL, local service, brand navigation, IP/copyright-heavy, and article/list-shaped opportunities.
Do not modify files outside this output file.
Final response: output path and count only.
```

Merge:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/merge-jsonl-results.mjs \
  --input-dir <domain-dir>/final-review-results \
  --pattern '^review-[0-9]+\\.jsonl$' \
  --out <domain-dir>/final-reviewed-candidates.jsonl \
  --summary <domain-dir>/final-reviewed-summary.json
```

## Cluster and Report

Do not shrink the final list just to make it shorter. Cluster every second-pass candidate into P0/P1/P2 unless it is clearly invalid JSON or missing a keyword.
The cluster script rehydrates metrics from `unique-keywords.jsonl` after screening, so subagents do not need to see metrics.
Markdown reports use Chinese headings, labels, priority explanations, and built-in cluster descriptions by default.

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/cluster-recommendations.mjs \
  --input <domain-dir>/final-reviewed-candidates.jsonl \
  --out-dir <domain-dir>
```

Priority meanings:

- P0: verify first; strong non-content shape, clear monetization, clear user intent.
- P1: valid opportunity; verify after P0 or when the SERP looks weak.
- P2: valid long-tail or cluster-expansion checks; not rejected.

## Run Index

For multi-domain jobs, maintain `run-index.json` with:

- domain
- status: `completed`, `failed`, or `skipped`
- raw row count
- unique keyword count
- first-pass candidate count
- final reviewed candidate count
- P0/P1/P2 keyword counts
- output directory
- error message if any

Build or refresh it with:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/build-run-index.mjs \
  --run-dir semrush-authority-runs/20260702-120000
```

Run this after each domain finishes and again at the end of a multi-domain run.

## Fixture Validation

When editing this skill or diagnosing pipeline drift, run:

```bash
node /Users/yxgc/.codex/skills/semrush-authority-misrank-miner/scripts/validate-fixtures.mjs
```

This verifies JSONL parsing, keyword dedupe, chunking, merging, P0/P1/P2 clustering, required recommendation fields, and run-index generation against small local fixtures.

## Safety

- Never print or persist SEMrush API keys, cookies, authorization headers, or full RPC templates.
- Use random delay while scraping pages.
- Do not parallelize scraping across domains.
- Keep analysis parallelism to subagent screening, not browser scraping.
